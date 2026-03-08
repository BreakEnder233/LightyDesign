using System.Text.Json;

namespace LightyDesign.Core;

internal static class JsonElementHelper
{
    public static bool HasProperty(JsonElement element, params string[] propertyNames)
    {
        return GetOptionalProperty(element, propertyNames).HasValue;
    }

    public static JsonElement? GetOptionalProperty(JsonElement element, params string[] propertyNames)
    {
        if (element.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        foreach (var property in element.EnumerateObject())
        {
            foreach (var propertyName in propertyNames)
            {
                if (string.Equals(property.Name, propertyName, StringComparison.OrdinalIgnoreCase))
                {
                    return property.Value;
                }
            }
        }

        return null;
    }

    public static string GetRequiredString(JsonElement element, params string[] propertyNames)
    {
        var value = GetOptionalString(element, propertyNames);
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new LightyTextFormatException($"Required JSON property '{propertyNames[0]}' is missing or empty.");
        }

        return value;
    }

    public static string? GetOptionalString(JsonElement element, params string[] propertyNames)
    {
        var property = GetOptionalProperty(element, propertyNames);
        if (property is null)
        {
            return null;
        }

        return property.Value.ValueKind switch
        {
            JsonValueKind.String => property.Value.GetString(),
            JsonValueKind.Null => null,
            _ => property.Value.GetRawText()
        };
    }
}