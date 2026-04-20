namespace LightyDesign.Core;

public sealed class LightyValidationRuleNestedSchema
{
    public LightyValidationRuleNestedSchema(
        string propertyName,
        string label,
        string description,
        LightyValidationRuleSchema schema)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(propertyName);
        ArgumentException.ThrowIfNullOrWhiteSpace(label);
        ArgumentException.ThrowIfNullOrWhiteSpace(description);
        ArgumentNullException.ThrowIfNull(schema);

        PropertyName = propertyName;
        Label = label;
        Description = description;
        Schema = schema;
    }

    public string PropertyName { get; }

    public string Label { get; }

    public string Description { get; }

    public LightyValidationRuleSchema Schema { get; }
}