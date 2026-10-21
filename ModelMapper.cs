using System.Text.Json;

namespace AiModelsBrowser;

public static class ModelMapper
{
    
    public const string DefaultProvider = "OpenRouter";

    public static string ResolveProvider(string? modelId)
    {
        if (string.IsNullOrEmpty(modelId)) return DefaultProvider;
        var slash = modelId.IndexOf('/');
        if (slash <= 0) return DefaultProvider;
        return modelId[..slash].TrimStart('~');
    }

    public static ModelDto ToDto(OpenRouterModel m, Func<string, bool> isFavorite, Func<string, double> rating)
    {
        var arch = m.Architecture;
        var top = m.TopProvider;
        return new ModelDto
        {
            Id = m.Id,
            Name = m.Name ?? m.Id,
            Description = m.Description,
            Provider = ResolveProvider(m.Id),
            ContextLength = m.ContextLength,
            InputPrice = m.Pricing?.Prompt ?? 0m,
            OutputPrice = m.Pricing?.Completion ?? 0m,
            IsFavorite = isFavorite(m.Id),
            Rating = rating(m.Id),
            InputModalities = arch?.InputModalities,
            OutputModalities = arch?.OutputModalities,
            MaxOutputTokens = top?.MaxCompletionTokens,
            MaxRequestContext = m.Limits?.MaximumContextTokens,
            Created = m.Created,
            RequestPrice = m.Pricing?.Request ?? 0m,
            ImagePrice = m.Pricing?.Image ?? 0m,
            WebSearchPrice = m.Pricing?.WebSearch ?? 0m,
        };
    }

    public static decimal? RequestCost(ModelDto m, int inputTokens, int outputTokens)
    {
        var hasInput = m.InputPrice is >= 0;
        var hasOutput = m.OutputPrice is >= 0;
        if (!hasInput && !hasOutput) return null;
        var cost = 0m;
        if (hasInput) cost += m.InputPrice * Math.Max(0, inputTokens);
        if (hasOutput) cost += m.OutputPrice * Math.Max(0, outputTokens);
        return cost;
    }

    public static string FamilyOf(string? modelId)
    {
        if (string.IsNullOrEmpty(modelId)) return "";
        var slash = modelId.IndexOf('/');
        var name = slash > 0 ? modelId[(slash + 1)..] : modelId;
        var colon = name.IndexOf(':');
        if (colon > 0) name = name[..colon];
        return name.ToLowerInvariant();
    }

    public static bool IsSafeExternalUrl(string? url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return false;
        return uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps;
    }

    public static List<OpenRouterModel> ParseModels(string json)
    {
        var wrapper = JsonSerializer.Deserialize(json, AppJsonContext.Default.OpenRouterModelsResponse)
                      ?? throw new InvalidOperationException("Пустой ответ от OpenRouter");
        return wrapper.Data;
    }
}
