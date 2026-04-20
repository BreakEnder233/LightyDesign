namespace LightyDesign.Core;

public sealed class LightyValidationRulePropertySchema
{
    public LightyValidationRulePropertySchema(
        string name,
        string valueType,
        string description,
        bool required = false,
        object? defaultValue = null,
        object? example = null,
        bool deprecated = false,
        string? aliasOf = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentException.ThrowIfNullOrWhiteSpace(valueType);
        ArgumentException.ThrowIfNullOrWhiteSpace(description);

        Name = name;
        ValueType = valueType;
        Description = description;
        Required = required;
        DefaultValue = defaultValue;
        Example = example;
        Deprecated = deprecated;
        AliasOf = aliasOf;
    }

    public string Name { get; }

    public string ValueType { get; }

    public string Description { get; }

    public bool Required { get; }

    public object? DefaultValue { get; }

    public object? Example { get; }

    public bool Deprecated { get; }

    public string? AliasOf { get; }
}