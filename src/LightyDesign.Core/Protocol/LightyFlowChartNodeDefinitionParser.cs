using System.Text.Json;

namespace LightyDesign.Core;

public static class LightyFlowChartNodeDefinitionParser
{
    public static LightyFlowChartNodeDefinition Parse(LightyFlowChartAssetDocument document)
    {
        ArgumentNullException.ThrowIfNull(document);

        return Parse(document.RelativePath, document.FilePath, document.Document);
    }

    public static LightyFlowChartNodeDefinition Parse(string relativePath, string filePath, JsonElement document)
    {
        if (document.ValueKind != JsonValueKind.Object)
        {
            throw new LightyCoreException($"FlowChart node definition '{relativePath}' must be a JSON object.");
        }

        var typeParameters = ReadArray(document, "typeParameters", ParseTypeParameter);
        var properties = ReadArray(document, "properties", ParseProperty);
        var computePorts = ReadArray(document, "computePorts", ParseComputePort);
        var flowPorts = ReadArray(document, "flowPorts", ParseFlowPort);
        var codegenBinding = ParseCodegenBinding(JsonElementHelper.GetOptionalProperty(document, "codegenBinding"));

        return new LightyFlowChartNodeDefinition(
            relativePath,
            filePath,
            JsonElementHelper.GetRequiredString(document, "formatVersion"),
            JsonElementHelper.GetRequiredString(document, "name"),
            JsonElementHelper.GetOptionalString(document, "alias"),
            ParseNodeKind(JsonElementHelper.GetRequiredString(document, "nodeKind")),
            typeParameters,
            properties,
            computePorts,
            flowPorts,
            codegenBinding);
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
            throw new LightyCoreException($"FlowChart node definition property '{propertyName}' must be a JSON array.");
        }

        return property.Value.EnumerateArray().Select(parser).ToList().AsReadOnly();
    }

    private static LightyFlowChartTypeParameter ParseTypeParameter(JsonElement element)
    {
        EnsureObject(element, "typeParameters item");
        return new LightyFlowChartTypeParameter(
            JsonElementHelper.GetRequiredString(element, "name"),
            JsonElementHelper.GetOptionalString(element, "constraint"));
    }

    private static LightyFlowChartPropertyDefinition ParseProperty(JsonElement element)
    {
        EnsureObject(element, "property item");

        return new LightyFlowChartPropertyDefinition(
            ReadRequiredUInt32(element, "propertyId"),
            JsonElementHelper.GetRequiredString(element, "name"),
            JsonElementHelper.GetOptionalString(element, "alias"),
            ParseTypeRef(JsonElementHelper.GetOptionalProperty(element, "type")
                ?? throw new LightyCoreException("FlowChart property definition is missing required 'type'.")),
            JsonElementHelper.GetOptionalProperty(element, "defaultValue"));
    }

    private static LightyFlowChartComputePortDefinition ParseComputePort(JsonElement element)
    {
        EnsureObject(element, "computePorts item");

        return new LightyFlowChartComputePortDefinition(
            ReadRequiredUInt32(element, "portId"),
            JsonElementHelper.GetRequiredString(element, "name"),
            JsonElementHelper.GetOptionalString(element, "alias"),
            ParsePortDirection(JsonElementHelper.GetRequiredString(element, "direction")),
            ParseTypeRef(JsonElementHelper.GetOptionalProperty(element, "type")
                ?? throw new LightyCoreException("FlowChart compute port definition is missing required 'type'.")));
    }

    private static LightyFlowChartFlowPortDefinition ParseFlowPort(JsonElement element)
    {
        EnsureObject(element, "flowPorts item");

        return new LightyFlowChartFlowPortDefinition(
            ReadRequiredUInt32(element, "portId"),
            JsonElementHelper.GetRequiredString(element, "name"),
            JsonElementHelper.GetOptionalString(element, "alias"),
            ParsePortDirection(JsonElementHelper.GetRequiredString(element, "direction")));
    }

    private static LightyFlowChartTypeRef ParseTypeRef(JsonElement element)
    {
        EnsureObject(element, "type ref");

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
                    ?? throw new LightyCoreException("FlowChart list type is missing required 'elementType'."))),
            LightyFlowChartTypeKind.Dictionary => new LightyFlowChartTypeRef(
                kind,
                keyType: ParseTypeRef(JsonElementHelper.GetOptionalProperty(element, "keyType")
                    ?? throw new LightyCoreException("FlowChart dictionary type is missing required 'keyType'.")),
                valueType: ParseTypeRef(JsonElementHelper.GetOptionalProperty(element, "valueType")
                    ?? throw new LightyCoreException("FlowChart dictionary type is missing required 'valueType'."))),
            LightyFlowChartTypeKind.TypeParameter => new LightyFlowChartTypeRef(kind, name: JsonElementHelper.GetRequiredString(element, "name")),
            _ => throw new ArgumentOutOfRangeException(nameof(kind)),
        };
    }

    private static LightyFlowChartCodegenBinding? ParseCodegenBinding(JsonElement? element)
    {
        if (element is null || element.Value.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        EnsureObject(element.Value, "codegenBinding");
        return new LightyFlowChartCodegenBinding(
            JsonElementHelper.GetRequiredString(element.Value, "provider"),
            JsonElementHelper.GetRequiredString(element.Value, "operation"),
            ParseResolutionMode(JsonElementHelper.GetRequiredString(element.Value, "resolutionMode")));
    }

    private static uint ReadRequiredUInt32(JsonElement element, string propertyName)
    {
        var property = JsonElementHelper.GetOptionalProperty(element, propertyName)
            ?? throw new LightyCoreException($"Required JSON property '{propertyName}' is missing.");

        if (property.ValueKind == JsonValueKind.Number && property.TryGetUInt32(out var uint32Value))
        {
            return uint32Value;
        }

        if (property.ValueKind == JsonValueKind.String && uint.TryParse(property.GetString(), out var parsedValue))
        {
            return parsedValue;
        }

        throw new LightyCoreException($"JSON property '{propertyName}' must be an unsigned integer.");
    }

    private static LightyFlowChartNodeKind ParseNodeKind(string value)
    {
        return value.Trim().ToLowerInvariant() switch
        {
            "event" => LightyFlowChartNodeKind.Event,
            "flow" => LightyFlowChartNodeKind.Flow,
            "compute" => LightyFlowChartNodeKind.Compute,
            _ => throw new LightyCoreException($"Unsupported FlowChart node kind '{value}'."),
        };
    }

    private static LightyFlowChartPortDirection ParsePortDirection(string value)
    {
        return value.Trim().ToLowerInvariant() switch
        {
            "input" => LightyFlowChartPortDirection.Input,
            "output" => LightyFlowChartPortDirection.Output,
            _ => throw new LightyCoreException($"Unsupported FlowChart port direction '{value}'."),
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

    private static LightyFlowChartCodegenResolutionMode ParseResolutionMode(string value)
    {
        return value.Trim().ToLowerInvariant() switch
        {
            "generic" => LightyFlowChartCodegenResolutionMode.Generic,
            "overload" => LightyFlowChartCodegenResolutionMode.Overload,
            _ => throw new LightyCoreException($"Unsupported FlowChart code generation resolution mode '{value}'."),
        };
    }

    private static void EnsureObject(JsonElement element, string label)
    {
        if (element.ValueKind != JsonValueKind.Object)
        {
            throw new LightyCoreException($"FlowChart {label} must be a JSON object.");
        }
    }
}