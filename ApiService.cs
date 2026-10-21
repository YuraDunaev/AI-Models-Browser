using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace AiModelsBrowser;

public sealed class ApiService : IDisposable
{
    private static readonly string LogPath = Path.Combine(
        Path.GetTempPath(), "AIModelsBrowser_api.log");

    private readonly HttpClient _http;

    public ApiService()
    {
        var handler = new HttpClientHandler
        {
            AutomaticDecompression = DecompressionMethods.All,
            AllowAutoRedirect = true,
        };

        _http = new HttpClient(handler)
        {
            
            BaseAddress = new Uri("https://openrouter.ai/api/v1/"),
            Timeout = TimeSpan.FromSeconds(30)
        };

        _http.DefaultRequestVersion = HttpVersion.Version11;
        _http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        _http.DefaultRequestHeaders.UserAgent.ParseAdd(
            "Mozilla/5.0 (Windows NT 0.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        _http.DefaultRequestHeaders.Referrer = new Uri("https://openrouter.ai/models");
    }

    private static void Log(string message)
    {
        try
        {
            File.AppendAllText(LogPath, $"[{DateTime.Now:HH:mm:ss}] {message}{Environment.NewLine}");
        }
        catch { }
    }

    public async Task<List<OpenRouterModel>> FetchModelsAsync(CancellationToken ct = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "models")
        {
            Version = HttpVersion.Version11,
            VersionPolicy = HttpVersionPolicy.RequestVersionOrLower
        };
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        request.Headers.UserAgent.ParseAdd(
            "Mozilla/5.0 (Windows NT 0.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        request.Headers.Referrer = new Uri("https://openrouter.ai/models");

        using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseContentRead, ct);
        var content = await response.Content.ReadAsStringAsync(ct);

        Log($"GET {response.RequestMessage?.RequestUri} -> {(int)response.StatusCode} " +
            $"ver={response.Version} len={content.Length} ctype={response.Content.Headers.ContentType}");

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"OpenRouter API вернул {(int)response.StatusCode} {response.ReasonPhrase}.\n" +
                $"Ответ: {Trim(content, 400)}");
        }

        if (!content.TrimStart().StartsWith("{") && !content.TrimStart().StartsWith("["))
        {
            throw new InvalidOperationException(
                $"OpenRouter вернул не-JSON (HTTP {(int)response.StatusCode}, версия {response.Version}).\n" +
                $"Начало ответа: {Trim(content, 250)}");
        }

        try
        {
            var wrapper = JsonSerializer.Deserialize(content, AppJsonContext.Default.OpenRouterModelsResponse)
                          ?? throw new InvalidOperationException("Пустой ответ от OpenRouter");

            Log($"Распарсено моделей: {wrapper.Data.Count}");
            return wrapper.Data;
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException(
                $"Не удалось разобрать ответ OpenRouter как JSON.\n" +
                $"Начало ответа: {Trim(content, 250)}\n" +
                $"Ошибка: {ex.Message}");
        }
    }

    private static string Trim(string s, int max) => s.Length <= max ? s : s[..max];

    public void Dispose()
    {
        _http.Dispose();
        GC.SuppressFinalize(this);
    }
}
