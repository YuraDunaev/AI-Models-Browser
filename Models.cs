using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace AiModelsBrowser;

public sealed class OpenRouterModelsResponse
{
    [JsonPropertyName("data")]
    public List<OpenRouterModel> Data { get; set; } = new();
}

public sealed class FlexibleDecimalConverter : JsonConverter<decimal>
{
    public override decimal Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Number) return reader.GetDecimal();
        if (reader.TokenType == JsonTokenType.String) return ParseDecimal(reader.GetString());
        if (reader.TokenType == JsonTokenType.Null) return 0m;
        if (reader.TokenType == JsonTokenType.True) return 1m;
        if (reader.TokenType == JsonTokenType.False) return 0m;

        var doc = JsonDocument.ParseValue(ref reader);
        using (doc)
        {
            return ParseDecimal(doc.RootElement.ToString());
        }
    }

    private static decimal ParseDecimal(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return 0m;
        s = s.Trim();
        if (decimal.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var d)) return d;
        if (double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var db)) return (decimal)db;
        return 0m;
    }

    public override void Write(Utf8JsonWriter writer, decimal value, JsonSerializerOptions options)
        => writer.WriteNumberValue(value);
}

public sealed class FlexibleIntConverter : JsonConverter<int>
{
    public override int Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Number) return reader.GetInt32();
        if (reader.TokenType == JsonTokenType.String) return ParseInt(reader.GetString());
        if (reader.TokenType == JsonTokenType.Null) return 0;
        if (reader.TokenType == JsonTokenType.True) return 1;
        if (reader.TokenType == JsonTokenType.False) return 0;

        var doc = JsonDocument.ParseValue(ref reader);
        using (doc)
        {
            return ParseInt(doc.RootElement.ToString());
        }
    }

    private static int ParseInt(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return 0;
        s = s.Trim();
        if (int.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var i)) return i;
        if (long.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var l)) return (int)Math.Clamp(l, 0, int.MaxValue);
        if (double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var d)) return (int)Math.Max(0, d);
        return 0;
    }

    public override void Write(Utf8JsonWriter writer, int value, JsonSerializerOptions options)
        => writer.WriteNumberValue(value);
}

public sealed class FlexibleNullableIntConverter : JsonConverter<int?>
{
    public override int? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null) return null;
        if (reader.TokenType == JsonTokenType.Number) return reader.GetInt32();
        if (reader.TokenType == JsonTokenType.String) return ParseInt(reader.GetString());
        if (reader.TokenType == JsonTokenType.True) return 1;
        if (reader.TokenType == JsonTokenType.False) return 0;

        var doc = JsonDocument.ParseValue(ref reader);
        using (doc)
        {
            return ParseInt(doc.RootElement.ToString());
        }
    }

    private static int? ParseInt(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        s = s.Trim();
        if (int.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var i)) return i;
        if (long.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var l)) return (int)Math.Clamp(l, 0, int.MaxValue);
        if (double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var d)) return (int)Math.Max(0, d);
        return null;
    }

    public override void Write(Utf8JsonWriter writer, int? value, JsonSerializerOptions options)
    {
        if (value.HasValue) writer.WriteNumberValue(value.Value);
        else writer.WriteNullValue();
    }
}

public sealed class OpenRouterModel
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("created")]
    public long Created { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("context_length")]
    [JsonConverter(typeof(FlexibleIntConverter))]
    public int ContextLength { get; set; }

    [JsonPropertyName("pricing")]
    public ModelPricing? Pricing { get; set; }

    [JsonPropertyName("top_provider")]
    public TopProvider? TopProvider { get; set; }

    [JsonPropertyName("architecture")]
    public ModelArchitecture? Architecture { get; set; }

    [JsonPropertyName("per_request_limits")]
    public PerRequestLimits? Limits { get; set; }
}

public sealed class ModelPricing
{
    [JsonPropertyName("prompt")]
    [JsonConverter(typeof(FlexibleDecimalConverter))]
    public decimal Prompt { get; set; }

    [JsonPropertyName("completion")]
    [JsonConverter(typeof(FlexibleDecimalConverter))]
    public decimal Completion { get; set; }

    [JsonPropertyName("request")]
    [JsonConverter(typeof(FlexibleDecimalConverter))]
    public decimal Request { get; set; }

    [JsonPropertyName("image")]
    [JsonConverter(typeof(FlexibleDecimalConverter))]
    public decimal Image { get; set; }

    [JsonPropertyName("web_search")]
    [JsonConverter(typeof(FlexibleDecimalConverter))]
    public decimal WebSearch { get; set; }
}

public sealed class TopProvider
{
    [JsonPropertyName("context_length")]
    [JsonConverter(typeof(FlexibleIntConverter))]
    public int ContextLength { get; set; }

    [JsonPropertyName("max_completion_tokens")]
    [JsonConverter(typeof(FlexibleNullableIntConverter))]
    public int? MaxCompletionTokens { get; set; }

    [JsonPropertyName("is_moderated")]
    public bool IsModerated { get; set; }
}

public sealed class ModelArchitecture
{
    [JsonPropertyName("input_modalities")]
    public List<string>? InputModalities { get; set; }

    [JsonPropertyName("output_modalities")]
    public List<string>? OutputModalities { get; set; }

    [JsonPropertyName("tokenizer")]
    public string? Tokenizer { get; set; }

    [JsonPropertyName("instruct_type")]
    public string? InstructType { get; set; }
}

public sealed class PerRequestLimits
{
    [JsonPropertyName("maximum_tokens")]
    [JsonConverter(typeof(FlexibleNullableIntConverter))]
    public int? MaximumTokens { get; set; }

    [JsonPropertyName("maximum_context_tokens")]
    [JsonConverter(typeof(FlexibleNullableIntConverter))]
    public int? MaximumContextTokens { get; set; }
}

public sealed class ModelDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Provider { get; set; } = string.Empty;
    public int ContextLength { get; set; }
    public decimal InputPrice { get; set; }
    public decimal OutputPrice { get; set; }
    public bool IsFavorite { get; set; }
    
    public double Rating { get; set; }
    
    public List<string>? InputModalities { get; set; }
    
    public List<string>? OutputModalities { get; set; }
    
    public int? MaxOutputTokens { get; set; }
    
    public int? MaxRequestContext { get; set; }
    
    public long Created { get; set; }
    
    public decimal RequestPrice { get; set; }
    
    public decimal ImagePrice { get; set; }
    
    public decimal WebSearchPrice { get; set; }
}

public sealed class UserData
{
    
    public List<string> Favorites { get; set; } = new();
    
    public Dictionary<string, double> Ratings { get; set; } = new();
    
    public FilterState Filters { get; set; } = new();
}

public sealed class FilterState
{
    public string Search { get; set; } = "";
    public bool FavOnly { get; set; }
    public bool FreeOnly { get; set; }
    public int CtxMin { get; set; }
    
    public decimal? PriceMax { get; set; } = 100m;
    
    public string SortKey { get; set; } = "";
    public int SortDir { get; set; } = 1;
    
    public string Modality { get; set; } = "";
    
    public string OutputModality { get; set; } = "";
    
    public bool OnePerFamily { get; set; }
}

public sealed class AppSettings
{
    public string Theme { get; set; } = "dark";
    public int FontSize { get; set; } = 13;
    public int TableFontSize { get; set; } = 13;
    public string Provider { get; set; } = "OpenRouter";
    
    public string Language { get; set; } = "en";
    
    public int AutoRefreshMinutes { get; set; }
    
    public string VisibleColumns { get; set; } = "";
    
    public string ViewMode { get; set; } = "table";
}

public sealed class WebMessage
{
    public string Type { get; set; } = string.Empty;
    public string? Id { get; set; }
    public bool IsFavorite { get; set; }
    
    public double? Rating { get; set; }
    public string? Query { get; set; }
    public int? CtxMin { get; set; }
    public decimal? PriceMax { get; set; }
    public List<ModelDto>? Data { get; set; }
    public List<string>? Providers { get; set; }
    public AppSettings? Settings { get; set; }
    
    public FilterState? Filters { get; set; }
    
    public long UpdatedAt { get; set; }
    
    public bool FromCache { get; set; }
    public string? Text { get; set; }
    
    public string? Key { get; set; }
    
    public string? Vars { get; set; }
}

public sealed class WebMessageIn
{
    public string Type { get; set; } = string.Empty;
    public string? Id { get; set; }
    public bool IsFavorite { get; set; }
    
    public double? Rating { get; set; }
    public string? Theme { get; set; }
    public int? FontSize { get; set; }
    public int? TableFontSize { get; set; }
    public string? Provider { get; set; }
    
    public string? Language { get; set; }
    
    public int? AutoRefreshMinutes { get; set; }
    
    public string? VisibleColumns { get; set; }
    
    public string? ViewMode { get; set; }
    
    public string? Url { get; set; }
    
    public FilterState? Filters { get; set; }
}

public static class Json
{
    
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
[JsonSerializable(typeof(WebMessage))]
[JsonSerializable(typeof(WebMessageIn))]
[JsonSerializable(typeof(ModelDto))]
[JsonSerializable(typeof(AppSettings))]
[JsonSerializable(typeof(OpenRouterModelsResponse))]
[JsonSerializable(typeof(OpenRouterModel))]
[JsonSerializable(typeof(UserData))]
[JsonSerializable(typeof(FilterState))]
[JsonSerializable(typeof(List<ModelDto>))]
[JsonSerializable(typeof(List<string>))]
public sealed partial class AppJsonContext : JsonSerializerContext
{
}
