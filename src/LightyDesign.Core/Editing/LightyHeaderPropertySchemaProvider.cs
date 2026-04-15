using System.Reflection;

namespace LightyDesign.Core;

[AttributeUsage(AttributeTargets.Class, Inherited = false)]
public sealed class LightyHeaderPropertyBindingAttribute : Attribute
{
    public LightyHeaderPropertyBindingAttribute(string headerType, string bindingSource, string bindingKey)
    {
        HeaderType = LightyHeaderTypes.Normalize(headerType);
        BindingSource = bindingSource;
        BindingKey = bindingKey;
    }

    public string HeaderType { get; }

    public string BindingSource { get; }

    public string BindingKey { get; }
}

[AttributeUsage(AttributeTargets.Property, Inherited = false)]
public sealed class LightyHeaderEditorFieldAttribute : Attribute
{
    public LightyHeaderEditorFieldAttribute(string label)
    {
        Label = label;
    }

    public string Label { get; }

    public string EditorKind { get; init; } = "text";

    public bool Required { get; init; }

    public string? Placeholder { get; init; }
}

public sealed class LightyHeaderPropertySchema
{
    public required string HeaderType { get; init; }

    public required string BindingSource { get; init; }

    public required string BindingKey { get; init; }

    public required string FieldName { get; init; }

    public required string Label { get; init; }

    public required string EditorKind { get; init; }

    public required string ValueType { get; init; }

    public bool Required { get; init; }

    public string? Placeholder { get; init; }

    public IReadOnlyList<string> Options { get; init; } = Array.Empty<string>();
}

public static class LightyHeaderPropertySchemaProvider
{
    private static readonly Lazy<IReadOnlyDictionary<string, Type>> Registry = new(BuildRegistry);

    public static IReadOnlyList<LightyHeaderPropertySchema> GetSchemas(WorkspaceHeaderLayout headerLayout)
    {
        ArgumentNullException.ThrowIfNull(headerLayout);

        var schemas = new List<LightyHeaderPropertySchema>();

        foreach (var row in headerLayout.Rows)
        {
            var headerType = LightyHeaderTypes.Normalize(row.HeaderType);
            if (Registry.Value.TryGetValue(headerType, out var modelType))
            {
                schemas.AddRange(BuildSchemasFromModel(headerType, modelType));
                continue;
            }

            schemas.Add(new LightyHeaderPropertySchema
            {
                HeaderType = headerType,
                BindingSource = "attribute",
                BindingKey = headerType,
                FieldName = "Value",
                Label = headerType,
                EditorKind = "json",
                ValueType = "json",
                Required = false,
                Placeholder = "输入 JSON 或纯文本值",
            });
        }

        return schemas.AsReadOnly();
    }

    private static IReadOnlyDictionary<string, Type> BuildRegistry()
    {
        var modelTypes = typeof(LightyHeaderPropertySchemaProvider).Assembly
            .GetTypes()
            .Where(type => type.IsClass && !type.IsAbstract)
            .Select(type => new
            {
                Type = type,
                Binding = type.GetCustomAttribute<LightyHeaderPropertyBindingAttribute>(),
            })
            .Where(entry => entry.Binding is not null)
            .ToDictionary(entry => entry.Binding!.HeaderType, entry => entry.Type, StringComparer.Ordinal);

        return modelTypes;
    }

    private static IEnumerable<LightyHeaderPropertySchema> BuildSchemasFromModel(string headerType, Type modelType)
    {
        var binding = modelType.GetCustomAttribute<LightyHeaderPropertyBindingAttribute>()
            ?? throw new InvalidOperationException($"Header property model '{modelType.Name}' is missing binding metadata.");

        foreach (var property in modelType.GetProperties(BindingFlags.Instance | BindingFlags.Public))
        {
            var editorField = property.GetCustomAttribute<LightyHeaderEditorFieldAttribute>();
            if (editorField is null)
            {
                continue;
            }

            var propertyType = Nullable.GetUnderlyingType(property.PropertyType) ?? property.PropertyType;
            var valueType = GetValueType(propertyType, editorField);
            var options = propertyType.IsEnum ? Enum.GetNames(propertyType) : Array.Empty<string>();

            yield return new LightyHeaderPropertySchema
            {
                HeaderType = headerType,
                BindingSource = binding.BindingSource,
                BindingKey = binding.BindingKey,
                FieldName = property.Name,
                Label = editorField.Label,
                EditorKind = editorField.EditorKind,
                ValueType = valueType,
                Required = editorField.Required,
                Placeholder = editorField.Placeholder,
                Options = options,
            };
        }
    }

    private static string GetValueType(Type propertyType, LightyHeaderEditorFieldAttribute editorField)
    {
        if (string.Equals(editorField.EditorKind, "json", StringComparison.OrdinalIgnoreCase))
        {
            return "json";
        }

        if (propertyType.IsEnum)
        {
            return "enum";
        }

        return propertyType == typeof(bool) ? "boolean" : "string";
    }
}

[LightyHeaderPropertyBinding(LightyHeaderTypes.FieldName, "field", "fieldName")]
internal sealed class FieldNameHeaderPropertyModel
{
    [LightyHeaderEditorField("字段名", Required = true, Placeholder = "ID")]
    public string FieldName { get; set; } = string.Empty;
}

[LightyHeaderPropertyBinding(LightyHeaderTypes.DisplayName, "field", "displayName")]
internal sealed class DisplayNameHeaderPropertyModel
{
    [LightyHeaderEditorField("显示名", Placeholder = "例如：序号")]
    public string? DisplayName { get; set; }
}

[LightyHeaderPropertyBinding(LightyHeaderTypes.Type, "field", "type")]
internal sealed class TypeHeaderPropertyModel
{
    [LightyHeaderEditorField("类型", Required = true, Placeholder = "int / string / List<int> / Ref:Workbook.Sheet")]
    public string Type { get; set; } = string.Empty;
}

[LightyHeaderPropertyBinding(LightyHeaderTypes.Validation, "attribute", LightyHeaderTypes.Validation)]
internal sealed class ValidationHeaderPropertyModel
{
    [LightyHeaderEditorField("校验规则", EditorKind = "json", Placeholder = "输入 JSON 规则，留空表示无校验")]
    public string? Validation { get; set; }
}

[LightyHeaderPropertyBinding(LightyHeaderTypes.ExportScope, "attribute", LightyHeaderTypes.ExportScope)]
internal sealed class ExportScopeHeaderPropertyModel
{
    [LightyHeaderEditorField("导出范围", EditorKind = "enum", Required = true)]
    public LightyExportScope ExportScope { get; set; } = LightyExportScope.All;
}
