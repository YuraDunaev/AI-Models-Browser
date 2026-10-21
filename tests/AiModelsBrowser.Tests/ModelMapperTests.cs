using AiModelsBrowser;
using Xunit;

namespace AiModelsBrowser.Tests;

public class ResolveProviderTests
{
    [Theory]
    [InlineData("anthropic/claude-3.5", "anthropic")]
    [InlineData("openai/gpt-4o", "openai")]
    [InlineData("meta-llama/llama-3.3-70b", "meta-llama")]
    public void Возвращает_префикс_до_слеша(string id, string expected)
    {
        Assert.Equal(expected, ModelMapper.ResolveProvider(id));
    }

    [Fact]
    public void Отбрасывает_префикс_тильды()
    {
        
        Assert.Equal("anthropic", ModelMapper.ResolveProvider("~anthropic/claude-3.5"));
    }

    [Theory]
    [InlineData("")]
    [InlineData("gpt-4o")]      
    [InlineData("/gpt-4o")]     
    public void Без_префикса_возвращает_OpenRouter(string id)
    {
        Assert.Equal("OpenRouter", ModelMapper.ResolveProvider(id));
    }

    [Fact]
    public void Null_возвращает_OpenRouter()
    {
        Assert.Equal("OpenRouter", ModelMapper.ResolveProvider(null));
    }
}

public class FamilyOfTests
{
    [Theory]
    [InlineData("openai/gpt-4o", "gpt-4o")]
    [InlineData("anthropic/claude-sonnet-4", "claude-sonnet-4")]
    public void Убирает_префикс_провайдера(string id, string expected)
    {
        Assert.Equal(expected, ModelMapper.FamilyOf(id));
    }

    [Theory]
    [InlineData("openai/gpt-4o:free", "gpt-4o")]
    [InlineData("provider/model:extended", "model")]
    public void Убирает_тег_варианта(string id, string expected)
    {
        Assert.Equal(expected, ModelMapper.FamilyOf(id));
    }

    [Fact]
    public void Приводит_к_нижнему_регистру()
    {
        Assert.Equal("gpt-4o", ModelMapper.FamilyOf("openai/GPT-4O"));
    }

    [Fact]
    public void Одинаковое_семейство_у_разных_провайдеров()
    {
        
        Assert.Equal(ModelMapper.FamilyOf("openai/gpt-4o"),
                     ModelMapper.FamilyOf("azure/gpt-4o"));
    }
}

public class RequestCostTests
{
    [Fact]
    public void Считает_вход_и_выход_по_ценам_за_токен()
    {
        var m = new ModelDto { InputPrice = 0.0000025m, OutputPrice = 0.00001m };
        
        var cost = ModelMapper.RequestCost(m, 1000, 1000);
        Assert.NotNull(cost);
        Assert.Equal(0.0125m, cost!.Value, 8);
    }

    [Fact]
    public void Бесплатная_модель_даёт_нулевую_стоимость()
    {
        var m = new ModelDto { InputPrice = 0m, OutputPrice = 0m };
        Assert.Equal(0m, ModelMapper.RequestCost(m, 1000, 1000));
    }

    [Fact]
    public void Неизвестная_цена_даёт_null()
    {
        
        var m = new ModelDto { InputPrice = -1m, OutputPrice = -1m };
        Assert.Null(ModelMapper.RequestCost(m, 1000, 1000));
    }

    [Fact]
    public void Учитывает_только_известную_сторону()
    {
        var m = new ModelDto { InputPrice = -1m, OutputPrice = 0.00001m };
        var cost = ModelMapper.RequestCost(m, 1000, 1000);
        Assert.NotNull(cost);
        Assert.Equal(0.01m, cost!.Value, 8);
    }

    [Fact]
    public void Отрицательное_число_токенов_считается_как_ноль()
    {
        var m = new ModelDto { InputPrice = 0.0000025m, OutputPrice = 0.00001m };
        var cost = ModelMapper.RequestCost(m, -100, 1000);
        Assert.Equal(0.01m, cost!.Value, 8);
    }
}

public class ExternalUrlTests
{
    [Theory]
    [InlineData("https://openrouter.ai/openai/gpt-4o")]
    [InlineData("http://example.com")]
    public void Разрешает_http_и_https(string url)
    {
        Assert.True(ModelMapper.IsSafeExternalUrl(url));
    }

    [Theory]
    [InlineData("file:///C:/Windows/System32/cmd.exe")]
    [InlineData("javascript:alert(1)")]
    [InlineData("ms-settings:")]
    [InlineData("not a url")]
    [InlineData("")]
    [InlineData(null)]
    public void Отклоняет_опасные_схемы(string? url)
    {
        Assert.False(ModelMapper.IsSafeExternalUrl(url));
    }
}
