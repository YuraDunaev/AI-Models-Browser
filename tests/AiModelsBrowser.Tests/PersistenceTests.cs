using System.Text.Json;
using AiModelsBrowser;
using Xunit;

namespace AiModelsBrowser.Tests;

public class PersistenceTests
{
    [Fact]
    public void Фильтры_Сохраняются_и_Читаются_Обратно()
    {
        var filters = new FilterState
        {
            Search = "gpt",
            FavOnly = true,
            FreeOnly = true,
            CtxMin = 128,
            PriceMax = 5m,
            SortKey = "cost",
            SortDir = -1,
            Modality = "image",
            OutputModality = "text",
            OnePerFamily = true,
        };

        var json = JsonSerializer.Serialize(filters, AppJsonContext.Default.FilterState);
        var restored = JsonSerializer.Deserialize(json, AppJsonContext.Default.FilterState);

        Assert.NotNull(restored);
        Assert.Equal("gpt", restored!.Search);
        Assert.True(restored.FavOnly);
        Assert.True(restored.FreeOnly);
        Assert.Equal(128, restored.CtxMin);
        Assert.Equal(5m, restored.PriceMax);
        Assert.Equal("cost", restored.SortKey);
        Assert.Equal(-1, restored.SortDir);
        Assert.Equal("image", restored.Modality);
        Assert.Equal("text", restored.OutputModality);
        
        Assert.True(restored.OnePerFamily);
    }

    [Fact]
    public void Избранное_И_Рейтинги_Сохраняются()
    {
        var data = new UserData
        {
            Favorites = new List<string> { "openai/gpt-4o" },
            Ratings = new Dictionary<string, double> { ["openai/gpt-4o"] = 4.5 },
            Filters = new FilterState { Search = "claude" },
        };

        var json = JsonSerializer.Serialize(data, AppJsonContext.Default.UserData);
        var restored = JsonSerializer.Deserialize(json, AppJsonContext.Default.UserData);

        Assert.NotNull(restored);
        Assert.Single(restored!.Favorites);
        Assert.Equal(4.5, restored.Ratings["openai/gpt-4o"]);
        Assert.Equal("claude", restored.Filters.Search);
    }

    [Fact]
    public void Настройки_Сохраняют_Список_Колонок()
    {
        var settings = new AppSettings
        {
            Theme = "light",
            FontSize = 15,
            TableFontSize = 14,
            Provider = "OpenRouter",
            Language = "ru",
            AutoRefreshMinutes = 10,
            VisibleColumns = "cost,modes",
        };

        var json = JsonSerializer.Serialize(settings, AppJsonContext.Default.AppSettings);
        var restored = JsonSerializer.Deserialize(json, AppJsonContext.Default.AppSettings);

        Assert.NotNull(restored);
        Assert.Equal("light", restored!.Theme);
        Assert.Equal(15, restored.FontSize);
        Assert.Equal("ru", restored.Language);
        Assert.Equal(10, restored.AutoRefreshMinutes);
        Assert.Equal("cost,modes", restored.VisibleColumns);
    }

    [Fact]
    public void Список_Моделей_Сериализуется_В_Json()
    {
        
        var models = new List<ModelDto>
        {
            new()
            {
                Id = "openai/gpt-4o",
                Name = "GPT-4o",
                Provider = "openai",
                ContextLength = 128000,
                InputPrice = 0.0000025m,
                OutputPrice = 0.00001m,
                InputModalities = new List<string> { "text", "image" },
            },
        };

        var json = JsonSerializer.Serialize(models, AppJsonContext.Default.ListModelDto);
        var restored = JsonSerializer.Deserialize(json, AppJsonContext.Default.ListModelDto);

        Assert.NotNull(restored);
        Assert.Single(restored!);
        Assert.Equal("openai/gpt-4o", restored[0].Id);
        Assert.Equal(new[] { "text", "image" }, restored[0].InputModalities);
    }
}

public class WebMessageTests
{
    [Fact]
    public void Сериализуется_В_CamelCase_Как_Ожидает_JS()
    {
        var msg = new WebMessage
        {
            Type = "models",
            Data = new List<ModelDto> { new() { Id = "a/b", ContextLength = 100 } },
            UpdatedAt = 12345,
            FromCache = true,
        };

        var json = JsonSerializer.Serialize(msg, AppJsonContext.Default.WebMessage);

        Assert.Contains("\"type\":\"models\"", json);
        Assert.Contains("\"contextLength\":100", json);
        Assert.Contains("\"updatedAt\":12345", json);
        Assert.Contains("\"fromCache\":true", json);
    }

    [Fact]
    public void Читается_Сообщение_От_JS()
    {
        const string json = """
        {"type":"rating","id":"openai/gpt-4o","rating":4.5}
        """;
        var msg = JsonSerializer.Deserialize(json, AppJsonContext.Default.WebMessageIn);
        Assert.NotNull(msg);
        Assert.Equal("rating", msg!.Type);
        Assert.Equal("openai/gpt-4o", msg.Id);
        Assert.Equal(4.5, msg.Rating);
    }
}
