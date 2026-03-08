namespace LightyDesign.Core;

public static class LightyHeaderTypes
{
    public const string FieldName = "FieldName";
    public const string Type = "Type";
    public const string DisplayName = "DisplayName";
    public const string Validation = "Validation";
    public const string ExportScope = "ExportScope";

    public static IReadOnlyList<string> DefaultWorkspaceHeaderTypes { get; } = new[]
    {
        FieldName,
        DisplayName,
        Type,
        Validation,
        ExportScope,
    };

    public static string Normalize(string headerType)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(headerType);

        return headerType.Trim() switch
        {
            var value when string.Equals(value, FieldName, StringComparison.OrdinalIgnoreCase) => FieldName,
            var value when string.Equals(value, DisplayName, StringComparison.OrdinalIgnoreCase) => DisplayName,
            var value when string.Equals(value, Type, StringComparison.OrdinalIgnoreCase) => Type,
            var value when string.Equals(value, Validation, StringComparison.OrdinalIgnoreCase) => Validation,
            var value when string.Equals(value, ExportScope, StringComparison.OrdinalIgnoreCase) => ExportScope,
            var value => value,
        };
    }

    public static string ToWorkspaceLayoutName(string headerType)
    {
        var normalizedHeaderType = Normalize(headerType);

        return normalizedHeaderType switch
        {
            FieldName => "fieldName",
            DisplayName => "displayName",
            Type => "type",
            Validation => "validation",
            ExportScope => "exportscope",
            _ => normalizedHeaderType,
        };
    }
}