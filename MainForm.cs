using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace AiModelsBrowser;

public sealed class MainForm : Form
{
    private static readonly string AppDataDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "AI Models Browser");
    private static readonly string LogPath = Path.Combine(AppDataDir, "error.log");
    private static readonly string SettingsPath = Path.Combine(AppDataDir, "settings.json");
    private static readonly string UserDataPath = Path.Combine(AppDataDir, "userdata.json");
    
    private static readonly string ModelsCachePath = Path.Combine(AppDataDir, "models_cache.json");

    private readonly WebView2 _webView = new();
    private readonly ApiService _api = new();
    private readonly List<ModelDto> _models = new();
    private readonly HashSet<string> _favorites = new(StringComparer.Ordinal);
    private readonly Dictionary<string, double> _ratings = new(StringComparer.Ordinal);
    
    private FilterState _filters = new();
    private CancellationTokenSource? _cts;
    private AppSettings _settings = new();
    private TaskCompletionSource<bool> _readyTcs =
        new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly List<WebMessage> _pending = new();
    private bool _pageReady;

    public MainForm()
    {
        Text = AppTitle("en");
        Size = new Size(1400, 850);
        MinimumSize = new Size(900, 600);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = System.Drawing.Color.FromArgb(26, 26, 30);

        _settings = LoadSettings();
        Text = AppTitle(_settings.Language);

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            BackColor = System.Drawing.Color.FromArgb(26, 26, 30),
        };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        _webView.Dock = DockStyle.Fill;
        root.Controls.Add(_webView, 0, 0);
        Controls.Add(root);

        Load += MainForm_Load;
        HandleCreated += (_, _) => ApplyDarkTitleBar();
        FormClosed += (_, _) =>
        {
            
            SaveUserData();
            _cts?.Cancel();
            _cts?.Dispose();
            _api.Dispose();
            _webView.Dispose();
        };
    }

    private static string NormalizeLanguage(string? language)
    {
        if (string.IsNullOrWhiteSpace(language)) return "en";
        var code = language.Trim().ToLowerInvariant().Split('-', '_')[0];
        return SupportedLanguages.Contains(code) ? code : "en";
    }

    private static readonly HashSet<string> SupportedLanguages =
        new(StringComparer.Ordinal) { "en", "ru", "de", "fr", "es", "zh" };

    private static string AppTitle(string? language)
    {
        var code = (language ?? "en").Trim().ToLowerInvariant();
        if (code.StartsWith("ru", StringComparison.Ordinal)) return "AI провайдеры и модели";
        if (code.StartsWith("de", StringComparison.Ordinal)) return "KI-Anbieter und Modelle";
        if (code.StartsWith("fr", StringComparison.Ordinal)) return "Fournisseurs et modèles d'IA";
        if (code.StartsWith("es", StringComparison.Ordinal)) return "Proveedores y modelos de IA";
        if (code.StartsWith("zh", StringComparison.Ordinal)) return "AI 提供商与模型";
        return "AI providers and models";
    }

    [DllImport("dwmapi.dll", PreserveSig = true)]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

    private void ApplyDarkTitleBar()
    {
        try
        {
            SetTitleBarDark(_settings.Theme != "light");
        }
        catch (Exception ex)
        {
            Log("Не удалось применить тёмный заголовок окна: " + ex.Message);
        }
    }

    private void SetTitleBarDark(bool dark)
    {
        var hwnd = Handle;
        int enabled = dark ? 1 : 0;
        
        if (DwmSetWindowAttribute(hwnd, 20, ref enabled, sizeof(int)) != 0)
        {
            DwmSetWindowAttribute(hwnd, 19, ref enabled, sizeof(int));
        }
    }

    private static void Log(string message)
    {
        try
        {
            Directory.CreateDirectory(AppDataDir);
            File.AppendAllText(LogPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}{Environment.NewLine}");
        }
        catch { }
    }

    private static AppSettings LoadSettings()
    {
        try
        {
            if (File.Exists(SettingsPath))
            {
                var json = File.ReadAllText(SettingsPath);
                var s = JsonSerializer.Deserialize(json, AppJsonContext.Default.AppSettings);
                if (s != null) return s;
            }
        }
        catch (Exception ex)
        {
            Log($"Не удалось прочитать настройки: {ex.Message}");
        }
        return new AppSettings();
    }

    private void SaveSettings()
    {
        try
        {
            Directory.CreateDirectory(AppDataDir);
            var json = JsonSerializer.Serialize(_settings, AppJsonContext.Default.AppSettings);
            File.WriteAllText(SettingsPath, json);
            Log($"Настройки сохранены: {json}");
        }
        catch (Exception ex)
        {
            Log($"Не удалось сохранить настройки: {ex.Message}");
        }
    }

    private void LoadUserData()
    {
        try
        {
            if (!File.Exists(UserDataPath)) return;
            var json = File.ReadAllText(UserDataPath);
            var data = JsonSerializer.Deserialize(json, AppJsonContext.Default.UserData);
            if (data == null) return;
            foreach (var id in data.Favorites)
            {
                if (!string.IsNullOrWhiteSpace(id)) _favorites.Add(id);
            }
            foreach (var pair in data.Ratings)
            {
                if (string.IsNullOrWhiteSpace(pair.Key)) continue;
                var value = pair.Value;
                
                value = Math.Round(value * 2, MidpointRounding.AwayFromZero) / 2.0;
                if (value < 0.5 || value > 5) continue;
                _ratings[pair.Key] = value;
            }
            if (data.Filters is not null) _filters = data.Filters;
            Log($"Пользовательские данные загружены: избранных {_favorites.Count}, рейтингов {_ratings.Count}");
        }
        catch (Exception ex)
        {
            Log($"Не удалось прочитать пользовательские данные: {ex.Message}");
        }
    }

    private void SaveUserData()
    {
        try
        {
            Directory.CreateDirectory(AppDataDir);
            var data = new UserData
            {
                Favorites = _favorites.ToList(),
                Ratings = new Dictionary<string, double>(_ratings),
                Filters = _filters,
            };
            var json = JsonSerializer.Serialize(data, AppJsonContext.Default.UserData);
            File.WriteAllText(UserDataPath, json);
        }
        catch (Exception ex)
        {
            Log($"Не удалось сохранить пользовательские данные: {ex.Message}");
        }
    }

    private void SaveModelsCache()
    {
        try
        {
            Directory.CreateDirectory(AppDataDir);
            var json = JsonSerializer.Serialize(_models, AppJsonContext.Default.ListModelDto);
            File.WriteAllText(ModelsCachePath, json);
            Log($"Кэш моделей сохранён: {_models.Count}");
        }
        catch (Exception ex)
        {
            Log($"Не удалось сохранить кэш моделей: {ex.Message}");
        }
    }

    private List<ModelDto>? LoadModelsCache()
    {
        try
        {
            if (!File.Exists(ModelsCachePath)) return null;
            var json = File.ReadAllText(ModelsCachePath);
            var list = JsonSerializer.Deserialize(json, AppJsonContext.Default.ListModelDto);
            if (list == null || list.Count == 0) return null;
            Log($"Кэш моделей прочитан: {list.Count}");
            return list;
        }
        catch (Exception ex)
        {
            Log($"Не удалось прочитать кэш моделей: {ex.Message}");
            return null;
        }
    }

    private async void MainForm_Load(object? sender, EventArgs e)
    {
        Log("=== Приложение запущено ===");
        Log($"Framework: {RuntimeInformation.FrameworkDescription}");
        try
        {
            await _webView.EnsureCoreWebView2Async(null);
            Log("WebView2 инициализирован.");

            var core = _webView.CoreWebView2!;
            core.WebMessageReceived += Core_WebMessageReceived;
            core.NavigationCompleted += (_, args) =>
            {
                Log($"NavigationCompleted: {args.IsSuccess} {args.WebErrorStatus}");
                if (!args.IsSuccess)
                {
                    SetStatus($"Ошибка загрузки страницы: {args.WebErrorStatus}");
                }
            };

            var html = BuildEmbeddedHtml();
            Log($"HTML: {html.Length} символов");
            _webView.NavigateToString(html);

            var completed = await Task.WhenAny(_readyTcs.Task, Task.Delay(TimeSpan.FromSeconds(20)));
            Log($"ready получен: {completed == _readyTcs.Task}");
            if (completed != _readyTcs.Task)
            {
                SetStatusKey("status.noResponse");
                SendToJs(new WebMessage { Type = "error", Key = "status.noResponse" });
                return;
            }

            SendToJs(new WebMessage { Type = "settings", Settings = _settings });
            SendToJs(new WebMessage { Type = "providers", Providers = KnownProviders });
            
            SendToJs(new WebMessage { Type = "filters", Filters = _filters });

            LoadUserData();

            var cached = LoadModelsCache();
            if (cached is not null)
            {
                _models.Clear();
                _models.AddRange(cached);
                var cachedProviders = KnownProviders
                    .Concat(cached.Select(m => m.Provider))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();
                SendToJs(new WebMessage { Type = "providers", Providers = cachedProviders });
                SendToJs(new WebMessage
                {
                    Type = "models",
                    Data = _models,
                    FromCache = true,
                    UpdatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                });
            }

            await LoadModelsAsync(CancellationToken.None);
        }
        catch (Exception ex)
        {
            Log($"КРИТИЧЕСКАЯ ОШИБКА: {ex}");
            MessageBox.Show(this,
                "Не удалось инициализировать WebView2:\n" + ex.Message +
                "\n\nПодробности: " + LogPath,
                "Ошибка", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static readonly List<string> KnownProviders = new() { "OpenRouter" };

    private static string GetWebView2Args()
    {
        var args = Environment.GetEnvironmentVariable("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS");
        if (string.IsNullOrWhiteSpace(args)) return string.Empty;
        if (!args.Contains("--remote-debugging-port", StringComparison.Ordinal))
        {
            args = args.Trim() + " --remote-debugging-port=9222";
        }
        return args;
    }

    private static string ResolveProvider(string modelId) => ModelMapper.ResolveProvider(modelId);

    private void Core_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        WebMessageIn? msg = null;
        try
        {
            msg = JsonSerializer.Deserialize(e.TryGetWebMessageAsString() ?? "{}", AppJsonContext.Default.WebMessageIn);
        }
        catch (Exception ex)
        {
            Log($"Ошибка разбора сообщения от JS: {ex.Message}");
            return;
        }
        if (msg?.Type is null) return;

        Log($"JS -> C#: {msg.Type}");
        switch (msg.Type)
        {
            case "ready":
                _readyTcs.TrySetResult(true);
                _pageReady = true;
                FlushPending();
                break;

            case "favorite":
                if (!string.IsNullOrEmpty(msg.Id))
                {
                    if (msg.IsFavorite) _favorites.Add(msg.Id);
                    else _favorites.Remove(msg.Id);
                    
                    SaveUserData();
                }
                break;

            case "rating":
                if (!string.IsNullOrEmpty(msg.Id) && msg.Rating is not null)
                {
                    var value = Math.Round(msg.Rating.Value * 2, MidpointRounding.AwayFromZero) / 2.0;
                    if (value <= 0) _ratings.Remove(msg.Id);
                    else _ratings[msg.Id] = Math.Min(5.0, value);
                    
                    SaveUserData();
                }
                break;

            case "settings":
                if (msg.Theme is not null) _settings.Theme = msg.Theme;
                if (msg.FontSize is > 0) _settings.FontSize = msg.FontSize.Value;
                if (msg.TableFontSize is > 0) _settings.TableFontSize = msg.TableFontSize.Value;
                if (!string.IsNullOrEmpty(msg.Provider)) _settings.Provider = msg.Provider!;
                if (!string.IsNullOrEmpty(msg.Language)) _settings.Language = NormalizeLanguage(msg.Language);
                if (msg.AutoRefreshMinutes is >= 0) _settings.AutoRefreshMinutes = msg.AutoRefreshMinutes.Value;
                if (msg.VisibleColumns is not null) _settings.VisibleColumns = msg.VisibleColumns;
                if (msg.ViewMode is "table" or "cards") _settings.ViewMode = msg.ViewMode;
                SaveSettings();
                
                Text = AppTitle(_settings.Language);
                try { SetTitleBarDark(_settings.Theme != "light"); } catch { }
                
                SendToJs(new WebMessage { Type = "settings", Settings = _settings });
                break;

            case "filters":
                
                if (msg.Filters is not null)
                {
                    _filters = msg.Filters;
                    SaveUserData();
                }
                break;

            case "openUrl":
                
                if (!string.IsNullOrWhiteSpace(msg.Url)) OpenInBrowser(msg.Url!);
                break;

            case "reload":
                SendToJs(new WebMessage { Type = "loading", Key = "status.loadingModels" });
                _cts?.Cancel();
                _cts?.Dispose();
                _cts = new CancellationTokenSource();
                _ = LoadModelsAsync(_cts.Token);
                break;

            case "refresh":
                
                _cts?.Cancel();
                _cts?.Dispose();
                _cts = new CancellationTokenSource();
                _ = LoadModelsAsync(_cts.Token, silent: true);
                break;

            default:
                Log($"Неизвестное сообщение: {msg.Type}");
                break;
        }
    }

    private async Task LoadModelsAsync(CancellationToken ct, bool silent = false)
    {
        try
        {
            if (!silent)
            {
                SetStatus("Загрузка моделей…");
                Log("Запрос моделей OpenRouter...");
            }
            var raw = await _api.FetchModelsAsync(ct);
            Log($"Получено моделей: {raw.Count}");

            _models.Clear();
            var seenProviders = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var m in raw)
            {
                var dto = ModelMapper.ToDto(
                    m,
                    id => _favorites.Contains(id),
                    id => _ratings.TryGetValue(id, out var r) ? r : 0d);
                seenProviders.Add(dto.Provider);
                _models.Add(dto);
            }

            var providerList = KnownProviders.Concat(seenProviders)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            SendToJs(new WebMessage { Type = "providers", Providers = providerList });

            SendToJs(new WebMessage
            {
                Type = "models",
                Data = _models,
                FromCache = false,
                UpdatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            });

            SaveModelsCache();

            SetStatusKey("status.loadedModels", $"{{\"n\":{_models.Count}}}");
            Log($"Модели отправлены в JS: {_models.Count}");
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            Log($"Ошибка загрузки: {ex}");
            
            if (silent) return;
            SendToJs(new WebMessage { Type = "error", Text = ex.Message });
            SetStatusKey("status.loadFailed", JsonSerializer.Serialize(new { n = ex.Message }));
        }
    }

    private void OpenInBrowser(string url)
    {
        try
        {
            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return;
            if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) return;
            Process.Start(new ProcessStartInfo(uri.ToString()) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            Log($"Не удалось открыть ссылку {url}: {ex.Message}");
        }
    }

    private void SendToJs(WebMessage msg)
    {
        try
        {
            
            if (!_pageReady)
            {
                _pending.Add(msg);
                Log($"C# -> JS (в очереди): {msg.Type}");
                return;
            }

            var json = JsonSerializer.Serialize(msg, AppJsonContext.Default.WebMessage);
            _webView.CoreWebView2?.PostWebMessageAsString(json);
            Log($"C# -> JS: {msg.Type} ({json.Length} байт)");
        }
        catch (Exception ex)
        {
            Log($"Ошибка отправки в JS: {ex}");
        }
    }

    private void FlushPending()
    {
        if (_pending.Count == 0) return;
        var list = new List<WebMessage>(_pending);
        _pending.Clear();
        foreach (var m in list) SendToJs(m);
    }

    private void SetStatus(string text)
    {
        SendToJs(new WebMessage { Type = "status", Text = text });
    }

    private void SetStatusKey(string key, string? varsJson = null)
    {
        SendToJs(new WebMessage { Type = "status", Key = key, Vars = varsJson });
    }

    private string BuildEmbeddedHtml()
    {
        var asm = Assembly.GetExecutingAssembly();
        string ReadResource(string name)
        {
            using var stream = asm.GetManifestResourceStream(name);
            if (stream == null)
            {
                var available = string.Join(", ", asm.GetManifestResourceNames());
                throw new FileNotFoundException($"Ресурс не найден: {name}. Доступно: {available}");
            }
            using var reader = new StreamReader(stream, Encoding.UTF8);
            return reader.ReadToEnd();
        }

        var html = ReadResource("AiModelsBrowser.wwwroot.index.html");
        var css = ReadResource("AiModelsBrowser.wwwroot.style.css");
        var glass = ReadResource("AiModelsBrowser.wwwroot.glass.css");
        var i18n = ReadResource("AiModelsBrowser.wwwroot.i18n.js");
        var js = ReadResource("AiModelsBrowser.wwwroot.app.js");

        var logoDataUri = ReadLogoDataUri(asm);

        var sb = new StringBuilder(html);
        sb.Replace("__LOGO_DATA_URI__", logoDataUri, 0, sb.Length);
        
        sb.Replace("</head>", $"<style>{css}</style><style>{glass}</style></head>", 0, sb.Length);
        
        var scripts = $"<script>{i18n}</script><script>{js}</script>";
        sb.Replace("<!--APP_SCRIPTS-->", scripts, 0, sb.Length);
        return sb.ToString();
    }

    private static string ReadLogoDataUri(Assembly asm)
    {
        const string resourceName = "AiModelsBrowser.wwwroot.assets.logo.png";
        using var stream = asm.GetManifestResourceStream(resourceName);
        if (stream == null)
        {
            
            return "data:image/svg+xml;base64," + Convert.ToBase64String(Encoding.UTF8.GetBytes(
                "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>" +
                "<rect width='64' height='64' rx='14' fill='#7c3aed'/></svg>"));
        }
        using var ms = new MemoryStream();
        stream.CopyTo(ms);
        return "data:image/png;base64," + Convert.ToBase64String(ms.ToArray());
    }
}
