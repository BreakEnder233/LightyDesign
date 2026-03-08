using System.Text.Json;

namespace LightyDesign.Core;

public static class WorkspaceHeaderLayoutSerializer
{
    public static WorkspaceHeaderLayout LoadFromFile(string filePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(filePath);

        return Deserialize(File.ReadAllText(filePath));
    }

    public static WorkspaceHeaderLayout Deserialize(string json)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(json);

        using var document = JsonDocument.Parse(json);
        var rowsElement = FindRowsElement(document.RootElement);
        var rows = new List<WorkspaceHeaderRowDefinition>();

        foreach (var rowElement in rowsElement.EnumerateArray())
        {
            if (rowElement.ValueKind != JsonValueKind.Object)
            {
                throw new LightyTextFormatException("Workspace headers.json rows must be JSON objects.");
            }

            var headerType = JsonElementHelper.GetRequiredString(rowElement, "headerType");
            var configuration = JsonElementHelper.GetOptionalProperty(rowElement, "configuration")
                ?? JsonElementHelper.GetOptionalProperty(rowElement, "value")
                ?? JsonSerializer.SerializeToElement(new { });

            rows.Add(new WorkspaceHeaderRowDefinition(headerType, configuration));
        }

        return new WorkspaceHeaderLayout(rows);
    }

    private static JsonElement FindRowsElement(JsonElement rootElement)
    {
        if (rootElement.ValueKind == JsonValueKind.Array)
        {
            return rootElement;
        }

        if (rootElement.ValueKind != JsonValueKind.Object)
        {
            throw new LightyTextFormatException("Workspace headers.json must be a JSON array or object.");
        }

        return JsonElementHelper.GetOptionalProperty(rootElement, "rows")
            ?? JsonElementHelper.GetOptionalProperty(rootElement, "headers")
            ?? throw new LightyTextFormatException("Workspace headers.json must contain a 'rows' array.");
    }
}