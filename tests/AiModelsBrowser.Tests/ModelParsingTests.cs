using System.Text.Json;
using AiModelsBrowser;
using Xunit;

namespace AiModelsBrowser.Tests;

public class ModelParsingTests
{
    private const string SampleJson = """
    {
      "data": [
        {
          "id": "openai/gpt-4o",
          "name": "GPT-4o",
          "created": 1715367049,
          "description": "Multimodal flagship model.",
          "context_length": 128000,
          "pricing": {
            "prompt": "0.0000025",
            "completion": "0.00001",
            "request": "0",
            "image": "0.004",
            "web_search": "0"
          },
          "top_provider": {
            "context_length": 128000,
            "max_completion_tokens": 16384,
            "is_moderated": false
          },
          "architecture": {
            "input_modalities": ["text", "image", "file"],
            "output_modalities": ["text"],
            "tokenizer": "GPT",
            "instruct_type": null
          },
          "per_request_limits": {
            "maximum_tokens": 16384,
            "maximum_context_tokens": 128000
          }
        }
      ]
    }
    """;

    [Fact]
    public void Разбирает_список_моделей()
    {
        var models = ModelMapper.ParseModels(SampleJson);
        Assert.Single(models);
        Assert.Equal("openai/gpt-4o", models[0].Id);
    }

    [Fact]
    public void Принимает_цены_строкой()
    {
        
        var models = ModelMapper.ParseModels(SampleJson);
        var pricing = models[0].Pricing;
        Assert.NotNull(pricing);
        Assert.Equal(0.0000025m, pricing!.Prompt);
        Assert.Equal(0.00001m, pricing.Completion);
    }

    [Fact]
    public void Принимает_числа_как_числа()
    {
        const string json = """
        {"data":[{"id":"a/b","context_length":"2048","pricing":{"prompt":0.5,"completion":1.5}}]}
        """;
        var models = ModelMapper.ParseModels(json);
        Assert.Equal(0.5m, models[0].Pricing!.Prompt);
        Assert.Equal(1.5m, models[0].Pricing!.Completion);
    }

    [Fact]
    public void Принимает_контекст_строкой()
    {
        const string json = """
        {"data":[{"id":"a/b","context_length":"2048"}]}
        """;
        var models = ModelMapper.ParseModels(json);
        Assert.Equal(2048, models[0].ContextLength);
    }

    [Fact]
    public void Отсутствующие_секции_дают_null()
    {
        const string json = """
        {"data":[{"id":"a/b"}]}
        """;
        var models = ModelMapper.ParseModels(json);
        Assert.Null(models[0].Pricing);
        Assert.Null(models[0].Architecture);
        Assert.Null(models[0].TopProvider);
        Assert.Null(models[0].Limits);
    }

    [Fact]
    public void Модели_без_цены_разбираются_как_нулевые()
    {
        var models = ModelMapper.ParseModels(SampleJson);
        var dto = ModelMapper.ToDto(models[0], _ => false, _ => 0d);
        Assert.Equal(0.0000025m, dto.InputPrice);
        Assert.Equal(0.00001m, dto.OutputPrice);
    }

    [Fact]
    public void Неверный_Json_даёт_исключение()
    {
        Assert.Throws<JsonException>(() => ModelMapper.ParseModels("{не json}"));
    }
}

public class ToDtoTests
{
    private static OpenRouterModel BuildModel() => new()
    {
        Id = "openai/gpt-4o",
        Name = "GPT-4o",
        Description = "Multimodal flagship model.",
        ContextLength = 128000,
        Created = 1715367049,
        Pricing = new ModelPricing { Prompt = 0.0000025m, Completion = 0.00001m, Image = 0.004m },
        TopProvider = new TopProvider { MaxCompletionTokens = 16384 },
        Architecture = new ModelArchitecture
        {
            InputModalities = new List<string> { "text", "image" },
            OutputModalities = new List<string> { "text" },
        },
        Limits = new PerRequestLimits { MaximumContextTokens = 128000 },
    };

    [Fact]
    public void Переносит_все_данные_в_dto()
    {
        var dto = ModelMapper.ToDto(BuildModel(), _ => false, _ => 0d);

        Assert.Equal("openai/gpt-4o", dto.Id);
        Assert.Equal("GPT-4o", dto.Name);
        Assert.Equal("openai", dto.Provider);
        Assert.Equal(128000, dto.ContextLength);
        Assert.Equal(1715367049, dto.Created);
        Assert.Equal(16384, dto.MaxOutputTokens);
        Assert.Equal(128000, dto.MaxRequestContext);
        Assert.Equal(new[] { "text", "image" }, dto.InputModalities);
        Assert.Equal(new[] { "text" }, dto.OutputModalities);
        Assert.Equal(0.004m, dto.ImagePrice);
    }

    [Fact]
    public void Подставляет_избранное_и_рейтинг()
    {
        var dto = ModelMapper.ToDto(BuildModel(), id => id == "openai/gpt-4o", _ => 4.5);
        Assert.True(dto.IsFavorite);
        Assert.Equal(4.5, dto.Rating);
    }

    [Fact]
    public void Без_имени_использует_id()
    {
        var m = BuildModel();
        m.Name = null;
        var dto = ModelMapper.ToDto(m, _ => false, _ => 0);
        Assert.Equal("openai/gpt-4o", dto.Name);
    }
}
