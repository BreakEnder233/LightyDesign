using System.Text.Json;

namespace LightyDesign.Core;

public static class WorkspaceHeaderLayoutSerializer
{
    public static void SaveToFile(string filePath, WorkspaceHeaderLayout headerLayout)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(filePath);
        ArgumentNullException.ThrowIfNull(headerLayout);

        File.WriteAllText(filePath, Serialize(headerLayout));
    }

    public static WorkspaceHeaderLayout LoadFromFile(string filePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(filePath);

        return Deserialize(File.ReadAllText(filePath));
    }

    public static string Serialize(WorkspaceHeaderLayout headerLayout)
    {
        ArgumentNullException.ThrowIfNull(headerLayout);

        var document = new
        {
            rows = headerLayout.Rows.Select(row => new
            {
                headerType = LightyHeaderTypes.ToWorkspaceLayoutName(row.HeaderType),
                configuration = JsonElementToObject(row.Configuration),
            }),
        };

        return JsonSerializer.Serialize(document, new JsonSerializerOptions
        {
            WriteIndented = true,
        });
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

    private static object? JsonElementToObject(JsonElement element)
    {
        return element.ValueKind switch
        {
            JsonValueKind.String => element.GetString(),
            JsonValueKind.Number => element.TryGetInt64(out var longValue)
                ? longValue
                : element.TryGetDouble(out var doubleValue)
                    ? doubleValue
                    : element.GetRawText(),
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Null => null,
            _ => JsonSerializer.Deserialize<object>(element.GetRawText()),
        };
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