using System.Text.Json;

namespace LightyDesign.Core;

public sealed class WorkspaceHeaderRowDefinition
{
    public WorkspaceHeaderRowDefinition(string headerType, JsonElement configuration)
    {
        if (string.IsNullOrWhiteSpace(headerType))
        {
            throw new ArgumentException("Header type cannot be null or whitespace.", nameof(headerType));
        }

        HeaderType = LightyHeaderTypes.Normalize(headerType);
        Configuration = Clone(configuration);
    }

    public string HeaderType { get; }

    public JsonElement Configuration { get; }

    private static JsonElement Clone(JsonElement element)
    {
        return JsonSerializer.SerializeToElement(element);
    }
}