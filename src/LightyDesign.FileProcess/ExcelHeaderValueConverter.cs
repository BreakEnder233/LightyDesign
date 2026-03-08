using System.Text.Json;
using LightyDesign.Core;

namespace LightyDesign.FileProcess;

internal static class ExcelHeaderValueConverter
{
    public static string GetHeaderCellText(string headerType, ColumnDefine column)
    {
        return headerType switch
        {
            var value when string.Equals(value, LightyHeaderTypes.FieldName, StringComparison.Ordinal) => column.FieldName,
            var value when string.Equals(value, LightyHeaderTypes.Type, StringComparison.Ordinal) => column.Type,
            var value when string.Equals(value, LightyHeaderTypes.DisplayName, StringComparison.Ordinal) => column.DisplayName ?? string.Empty,
            _ => TryGetAttributeText(column, headerType)
        };
    }

    public static JsonElement ParseHeaderCellValue(string text)
    {
        ArgumentNullException.ThrowIfNull(text);

        try
        {
            using var document = JsonDocument.Parse(text);
            return JsonSerializer.SerializeToElement(document.RootElement);
        }
        catch (JsonException)
        {
            return JsonSerializer.SerializeToElement(text);
        }
    }

    private static string TryGetAttributeText(ColumnDefine column, string headerType)
    {
        if (!column.TryGetAttribute(headerType, out var value))
        {
            return string.Empty;
        }

        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString() ?? string.Empty,
            JsonValueKind.Null => string.Empty,
            _ => value.GetRawText()
        };
    }
}