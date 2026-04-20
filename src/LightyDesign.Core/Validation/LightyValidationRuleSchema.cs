namespace LightyDesign.Core;

public sealed class LightyValidationRuleSchema
{
    public LightyValidationRuleSchema(
        string mainTypeKey,
        string typeDisplayName,
        string description,
        IEnumerable<LightyValidationRulePropertySchema> properties,
        IEnumerable<LightyValidationRuleNestedSchema>? nestedSchemas = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(mainTypeKey);
        ArgumentException.ThrowIfNullOrWhiteSpace(typeDisplayName);
        ArgumentException.ThrowIfNullOrWhiteSpace(description);
        ArgumentNullException.ThrowIfNull(properties);

        MainTypeKey = mainTypeKey;
        TypeDisplayName = typeDisplayName;
        Description = description;
        Properties = properties.ToList().AsReadOnly();
        NestedSchemas = (nestedSchemas ?? Array.Empty<LightyValidationRuleNestedSchema>()).ToList().AsReadOnly();
    }

    public string MainTypeKey { get; }

    public string TypeDisplayName { get; }

    public string Description { get; }

    public IReadOnlyList<LightyValidationRulePropertySchema> Properties { get; }

    public IReadOnlyList<LightyValidationRuleNestedSchema> NestedSchemas { get; }
}