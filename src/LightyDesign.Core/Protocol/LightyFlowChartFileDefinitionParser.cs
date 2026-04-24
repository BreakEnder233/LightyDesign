using System.Text.Json;

namespace LightyDesign.Core;

public static class LightyFlowChartFileDefinitionParser
{
    public static LightyFlowChartFileDefinition Parse(LightyFlowChartAssetDocument document)
    {
        ArgumentNullException.ThrowIfNull(document);
        return Parse(document.RelativePath, document.FilePath, document.Document);
    }

    public static LightyFlowChartFileDefinition Parse(string relativePath, string filePath, JsonElement document)
    {
        EnsureObject(document, "FlowChart file definition");

        return new LightyFlowChartFileDefinition(
            relativePath,
            filePath,
            JsonElementHelper.GetRequiredString(document, "formatVersion"),
            JsonElementHelper.GetRequiredString(document, "name"),
            JsonElementHelper.GetOptionalString(document, "alias"),
            ReadArray(document, "nodes", ParseNode),
            ReadArray(document, "flowConnections", ParseConnection),
            ReadArray(document, "computeConnections", ParseConnection));
    }

    private static IReadOnlyList<TItem> ReadArray<TItem>(JsonElement element, string propertyName, Func<JsonElement, TItem> parser)
    {
        var property = JsonElementHelper.GetOptionalProperty(element, propertyName);
        if (property is null || property.Value.ValueKind == JsonValueKind.Null)
        {
            return Array.Empty<TItem>();
        }

        if (property.Value.ValueKind != JsonValueKind.Array)
        {
            throw new LightyCoreException($"FlowChart file property '{propertyName}' must be a JSON array.");
        }

        return property.Value.EnumerateArray().Select(parser).ToList().AsReadOnly();
    }

    private static LightyFlowChartFileNodeInstance ParseNode(JsonElement element)
    {
        EnsureObject(element, "FlowChart node instance");

        var layout = JsonElementHelper.GetOptionalProperty(element, "layout")
            ?? throw new LightyCoreException("FlowChart node instance is missing required 'layout'.");
        EnsureObject(layout, "FlowChart node layout");

        return new LightyFlowChartFileNodeInstance(
            ReadRequiredUInt32(element, "nodeId"),
            JsonElementHelper.GetRequiredString(element, "nodeType"),
            ReadRequiredDouble(layout, "x"),
            ReadRequiredDouble(layout, "y"),
            ReadArray(element, "typeArguments", ParseTypeArgument),
            ReadArray(element, "propertyValues", ParsePropertyValue));
    }

    private static LightyFlowChartTypeArgument ParseTypeArgument(JsonElement element)
    {
        EnsureObject(element, "FlowChart type argument");
        var typeElement = JsonElementHelper.GetOptionalProperty(element, "type")
            ?? throw new LightyCoreException("FlowChart type argument is missing required 'type'.");
        return new LightyFlowChartTypeArgument(
            JsonElementHelper.GetRequiredString(element, "name"),
            ParseTypeRef(typeElement));
    }

    private static LightyFlowChartPropertyValue ParsePropertyValue(JsonElement element)
    {
        EnsureObject(element, "FlowChart property value");
        var value = JsonElementHelper.GetOptionalProperty(element, "value")
            ?? throw new LightyCoreException("FlowChart property value is missing required 'value'.");
        return new LightyFlowChartPropertyValue(ReadRequiredUInt32(element, "propertyId"), value);
    }

    private static LightyFlowChartConnectionDefinition ParseConnection(JsonElement element)
    {
        EnsureObject(element, "FlowChart connection");
        return new LightyFlowChartConnectionDefinition(
            ReadRequiredUInt32(element, "sourceNodeId"),
            ReadRequiredUInt32(element, "sourcePortId"),
            ReadRequiredUInt32(element, "targetNodeId"),
            ReadRequiredUInt32(element, "targetPortId"));
    }

    private static LightyFlowChartTypeRef ParseTypeRef(JsonElement element)
    {
        EnsureObject(element, "FlowChart type ref");
        var kind = ParseTypeKind(JsonElementHelper.GetRequiredString(element, "kind"));
        return kind switch
        {
            LightyFlowChartTypeKind.Builtin => new LightyFlowChartTypeRef(kind, name: JsonElementHelper.GetRequiredString(element, "name")),
            LightyFlowChartTypeKind.Custom => new LightyFlowChartTypeRef(
                kind,
                name: JsonElementHelper.GetRequiredString(element, "name"),
                fullName: JsonElementHelper.GetOptionalString(element, "fullName")),
            LightyFlowChartTypeKind.List => new LightyFlowChartTypeRef(
                kind,
                elementType: ParseTypeRef(JsonElementHelper.GetOptionalProperty(element, "elementType")
                    ?? throw new LightyCoreException("FlowChart list type argument is missing 'elementType'."))),
            LightyFlowChartTypeKind.Dictionary => new LightyFlowChartTypeRef(
                kind,
                keyType: ParseTypeRef(JsonElementHelper.GetOptionalProperty(element, "keyType")
                    ?? throw new LightyCoreException("FlowChart dictionary type argument is missing 'keyType'.")),
                valueType: ParseTypeRef(JsonElementHelper.GetOptionalProperty(element, "valueType")
                    ?? throw new LightyCoreException("FlowChart dictionary type argument is missing 'valueType'."))),
            LightyFlowChartTypeKind.TypeParameter => throw new LightyCoreException("FlowChart file type arguments must not contain unresolved typeParameter references."),
            _ => throw new ArgumentOutOfRangeException(nameof(kind)),
        };
    }

    private static LightyFlowChartTypeKind ParseTypeKind(string value)
    {
        return value.Trim().ToLowerInvariant() switch
        {
            "builtin" => LightyFlowChartTypeKind.Builtin,
            "custom" => LightyFlowChartTypeKind.Custom,
            "list" => LightyFlowChartTypeKind.List,
            "dictionary" => LightyFlowChartTypeKind.Dictionary,
            "typeparameter" => LightyFlowChartTypeKind.TypeParameter,
            _ => throw new LightyCoreException($"Unsupported FlowChart type kind '{value}'."),
        };
    }

    private static uint ReadRequiredUInt32(JsonElement element, string propertyName)
    {
        var property = JsonElementHelper.GetOptionalProperty(element, propertyName)
            ?? throw new LightyCoreException($"Required JSON property '{propertyName}' is missing.");

        if (property.ValueKind == JsonValueKind.Number && property.TryGetUInt32(out var value))
        {
            return value;
        }

        if (property.ValueKind == JsonValueKind.String && uint.TryParse(property.GetString(), out value))
        {
            return value;
        }

        throw new LightyCoreException($"JSON property '{propertyName}' must be an unsigned integer.");
    }

    private static double ReadRequiredDouble(JsonElement element, string propertyName)
    {
        var property = JsonElementHelper.GetOptionalProperty(element, propertyName)
            ?? throw new LightyCoreException($"Required JSON property '{propertyName}' is missing.");

        if (property.ValueKind == JsonValueKind.Number && property.TryGetDouble(out var value))
        {
            return value;
        }

        if (property.ValueKind == JsonValueKind.String && double.TryParse(property.GetString(), out value))
        {
            return value;
        }

        throw new LightyCoreException($"JSON property '{propertyName}' must be a number.");
    }

    private static void EnsureObject(JsonElement element, string label)
    {
        if (element.ValueKind != JsonValueKind.Object)
        {
            throw new LightyCoreException($"{label} must be a JSON object.");
        }
    }
}