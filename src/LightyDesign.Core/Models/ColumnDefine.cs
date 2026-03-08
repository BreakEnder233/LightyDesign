using System.Collections.ObjectModel;
using System.Text.Json;

namespace LightyDesign.Core;

public sealed class ColumnDefine
{
    private readonly IReadOnlyDictionary<string, JsonElement> _attributes;
    private readonly Lazy<LightyColumnTypeDescriptor> _typeDescriptor;

    public ColumnDefine(
        string fieldName,
        string type,
        string? displayName = null,
        IReadOnlyDictionary<string, JsonElement>? attributes = null)
    {
        if (string.IsNullOrWhiteSpace(fieldName))
        {
            throw new ArgumentException("Field name cannot be null or whitespace.", nameof(fieldName));
        }

        if (string.IsNullOrWhiteSpace(type))
        {
            throw new ArgumentException("Type cannot be null or whitespace.", nameof(type));
        }

        FieldName = fieldName;
        Type = type;
        DisplayName = string.IsNullOrWhiteSpace(displayName) ? null : displayName;
        _attributes = CreateAttributes(attributes);
        _typeDescriptor = new Lazy<LightyColumnTypeDescriptor>(() => LightyColumnTypeDescriptor.Parse(Type));
    }

    public string FieldName { get; }

    public string Type { get; }

    public string? DisplayName { get; }

    public LightyColumnTypeDescriptor TypeDescriptor => _typeDescriptor.Value;

    public bool IsListType => TypeDescriptor.IsList;

    public bool IsReferenceType => TypeDescriptor.IsReference;

    public IReadOnlyDictionary<string, JsonElement> Attributes => _attributes;

    public bool TryGetAttribute(string key, out JsonElement value)
    {
        ArgumentException.ThrowIfNullOrEmpty(key);

        return _attributes.TryGetValue(key, out value);
    }

    public bool TryGetStringAttribute(string key, out string? value)
    {
        if (!TryGetAttribute(key, out var attributeValue))
        {
            value = null;
            return false;
        }

        value = attributeValue.ValueKind switch
        {
            JsonValueKind.String => attributeValue.GetString(),
            JsonValueKind.Null => null,
            _ => attributeValue.GetRawText()
        };

        return true;
    }

    public bool TryGetValidation(out JsonElement validation)
    {
        return TryGetAttribute(LightyHeaderTypes.Validation, out validation);
    }

    public bool TryGetExportScope(out LightyExportScope exportScope)
    {
        exportScope = default;

        if (!TryGetStringAttribute(LightyHeaderTypes.ExportScope, out var value) || string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        return Enum.TryParse(value, ignoreCase: true, out exportScope);
    }

    public bool TryGetReferenceTarget(out LightyReferenceTarget? referenceTarget)
    {
        referenceTarget = TypeDescriptor.ReferenceTarget;
        return referenceTarget is not null;
    }

    private static IReadOnlyDictionary<string, JsonElement> CreateAttributes(IReadOnlyDictionary<string, JsonElement>? attributes)
    {
        if (attributes is null || attributes.Count == 0)
        {
            return new ReadOnlyDictionary<string, JsonElement>(new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase));
        }

        var cloned = new Dictionary<string, JsonElement>(attributes.Count, StringComparer.OrdinalIgnoreCase);

        foreach (var pair in attributes)
        {
            cloned[pair.Key] = JsonSerializer.SerializeToElement(pair.Value);
        }

        return new ReadOnlyDictionary<string, JsonElement>(cloned);
    }
}