using System.Text.Json;

namespace LightyDesign.Core;

public enum LightyFlowChartNodeKind
{
    Event,
    Flow,
    Compute,
}

public enum LightyFlowChartPortDirection
{
    Input,
    Output,
}

public enum LightyFlowChartTypeKind
{
    Builtin,
    Custom,
    List,
    Dictionary,
    TypeParameter,
}

public enum LightyFlowChartCodegenResolutionMode
{
    Generic,
    Overload,
}

public sealed class LightyFlowChartNodeDefinition
{
    private readonly IReadOnlyList<LightyFlowChartTypeParameter> _typeParameters;
    private readonly IReadOnlyList<LightyFlowChartPropertyDefinition> _properties;
    private readonly IReadOnlyList<LightyFlowChartComputePortDefinition> _computePorts;
    private readonly IReadOnlyList<LightyFlowChartFlowPortDefinition> _flowPorts;

    public LightyFlowChartNodeDefinition(
        string relativePath,
        string filePath,
        string formatVersion,
        string name,
        string? alias,
        LightyFlowChartNodeKind nodeKind,
        IEnumerable<LightyFlowChartTypeParameter>? typeParameters,
        IEnumerable<LightyFlowChartPropertyDefinition>? properties,
        IEnumerable<LightyFlowChartComputePortDefinition>? computePorts,
        IEnumerable<LightyFlowChartFlowPortDefinition>? flowPorts,
        LightyFlowChartCodegenBinding? codegenBinding)
    {
        RelativePath = LightyWorkspacePathLayout.NormalizeRelativeAssetPath(relativePath);

        if (string.IsNullOrWhiteSpace(filePath))
        {
            throw new ArgumentException("File path cannot be null or whitespace.", nameof(filePath));
        }

        if (string.IsNullOrWhiteSpace(formatVersion))
        {
            throw new ArgumentException("Format version cannot be null or whitespace.", nameof(formatVersion));
        }

        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("Node definition name cannot be null or whitespace.", nameof(name));
        }

        FilePath = filePath;
        FormatVersion = formatVersion;
        Name = name;
        Alias = string.IsNullOrWhiteSpace(alias) ? null : alias.Trim();
        NodeKind = nodeKind;
        _typeParameters = (typeParameters ?? Array.Empty<LightyFlowChartTypeParameter>()).ToList().AsReadOnly();
        _properties = (properties ?? Array.Empty<LightyFlowChartPropertyDefinition>()).ToList().AsReadOnly();
        _computePorts = (computePorts ?? Array.Empty<LightyFlowChartComputePortDefinition>()).ToList().AsReadOnly();
        _flowPorts = (flowPorts ?? Array.Empty<LightyFlowChartFlowPortDefinition>()).ToList().AsReadOnly();
        CodegenBinding = codegenBinding;
    }

    public string RelativePath { get; }

    public string FilePath { get; }

    public string FormatVersion { get; }

    public string Name { get; }

    public string? Alias { get; }

    public LightyFlowChartNodeKind NodeKind { get; }

    public IReadOnlyList<LightyFlowChartTypeParameter> TypeParameters => _typeParameters;

    public IReadOnlyList<LightyFlowChartPropertyDefinition> Properties => _properties;

    public IReadOnlyList<LightyFlowChartComputePortDefinition> ComputePorts => _computePorts;

    public IReadOnlyList<LightyFlowChartFlowPortDefinition> FlowPorts => _flowPorts;

    public LightyFlowChartCodegenBinding? CodegenBinding { get; }
}

public sealed class LightyFlowChartTypeParameter
{
    public LightyFlowChartTypeParameter(string name, string? constraint)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("Type parameter name cannot be null or whitespace.", nameof(name));
        }

        Name = name;
        Constraint = string.IsNullOrWhiteSpace(constraint) ? null : constraint.Trim();
    }

    public string Name { get; }

    public string? Constraint { get; }
}

public sealed class LightyFlowChartTypeRef
{
    public LightyFlowChartTypeRef(
        LightyFlowChartTypeKind kind,
        string? name = null,
        string? fullName = null,
        LightyFlowChartTypeRef? elementType = null,
        LightyFlowChartTypeRef? keyType = null,
        LightyFlowChartTypeRef? valueType = null)
    {
        Kind = kind;
        Name = string.IsNullOrWhiteSpace(name) ? null : name.Trim();
        FullName = string.IsNullOrWhiteSpace(fullName) ? null : fullName.Trim();
        ElementType = elementType;
        KeyType = keyType;
        ValueType = valueType;
    }

    public LightyFlowChartTypeKind Kind { get; }

    public string? Name { get; }

    public string? FullName { get; }

    public LightyFlowChartTypeRef? ElementType { get; }

    public LightyFlowChartTypeRef? KeyType { get; }

    public LightyFlowChartTypeRef? ValueType { get; }
}

public sealed class LightyFlowChartPropertyDefinition
{
    public LightyFlowChartPropertyDefinition(uint propertyId, string name, string? alias, LightyFlowChartTypeRef type, JsonElement? defaultValue)
    {
        if (propertyId == 0)
        {
            throw new ArgumentOutOfRangeException(nameof(propertyId), "Property id must be greater than zero.");
        }

        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("Property name cannot be null or whitespace.", nameof(name));
        }

        ArgumentNullException.ThrowIfNull(type);

        PropertyId = propertyId;
        Name = name;
        Alias = string.IsNullOrWhiteSpace(alias) ? null : alias.Trim();
        Type = type;
        DefaultValue = defaultValue?.Clone();
    }

    public uint PropertyId { get; }

    public string Name { get; }

    public string? Alias { get; }

    public LightyFlowChartTypeRef Type { get; }

    public JsonElement? DefaultValue { get; }
}

public sealed class LightyFlowChartComputePortDefinition
{
    public LightyFlowChartComputePortDefinition(uint portId, string name, string? alias, LightyFlowChartPortDirection direction, LightyFlowChartTypeRef type)
    {
        if (portId == 0)
        {
            throw new ArgumentOutOfRangeException(nameof(portId), "Port id must be greater than zero.");
        }

        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("Port name cannot be null or whitespace.", nameof(name));
        }

        ArgumentNullException.ThrowIfNull(type);

        PortId = portId;
        Name = name;
        Alias = string.IsNullOrWhiteSpace(alias) ? null : alias.Trim();
        Direction = direction;
        Type = type;
    }

    public uint PortId { get; }

    public string Name { get; }

    public string? Alias { get; }

    public LightyFlowChartPortDirection Direction { get; }

    public LightyFlowChartTypeRef Type { get; }
}

public sealed class LightyFlowChartFlowPortDefinition
{
    public LightyFlowChartFlowPortDefinition(uint portId, string name, string? alias, LightyFlowChartPortDirection direction)
    {
        if (portId == 0)
        {
            throw new ArgumentOutOfRangeException(nameof(portId), "Port id must be greater than zero.");
        }

        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("Port name cannot be null or whitespace.", nameof(name));
        }

        PortId = portId;
        Name = name;
        Alias = string.IsNullOrWhiteSpace(alias) ? null : alias.Trim();
        Direction = direction;
    }

    public uint PortId { get; }

    public string Name { get; }

    public string? Alias { get; }

    public LightyFlowChartPortDirection Direction { get; }
}

public sealed class LightyFlowChartCodegenBinding
{
    public LightyFlowChartCodegenBinding(string provider, string operation, LightyFlowChartCodegenResolutionMode resolutionMode)
    {
        if (string.IsNullOrWhiteSpace(provider))
        {
            throw new ArgumentException("Code generation provider cannot be null or whitespace.", nameof(provider));
        }

        if (string.IsNullOrWhiteSpace(operation))
        {
            throw new ArgumentException("Code generation operation cannot be null or whitespace.", nameof(operation));
        }

        Provider = provider.Trim();
        Operation = operation.Trim();
        ResolutionMode = resolutionMode;
    }

    public string Provider { get; }

    public string Operation { get; }

    public LightyFlowChartCodegenResolutionMode ResolutionMode { get; }
}