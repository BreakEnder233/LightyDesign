using System.Text.Json;

namespace LightyDesign.Core;

public sealed class LightyFlowChartFileDefinition
{
    private readonly IReadOnlyList<LightyFlowChartFileNodeInstance> _nodes;
    private readonly IReadOnlyList<LightyFlowChartConnectionDefinition> _flowConnections;
    private readonly IReadOnlyList<LightyFlowChartConnectionDefinition> _computeConnections;

    public LightyFlowChartFileDefinition(
        string relativePath,
        string filePath,
        string formatVersion,
        string name,
        string? alias,
        IEnumerable<LightyFlowChartFileNodeInstance>? nodes,
        IEnumerable<LightyFlowChartConnectionDefinition>? flowConnections,
        IEnumerable<LightyFlowChartConnectionDefinition>? computeConnections)
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
            throw new ArgumentException("FlowChart name cannot be null or whitespace.", nameof(name));
        }

        FilePath = filePath;
        FormatVersion = formatVersion;
        Name = name.Trim();
        Alias = string.IsNullOrWhiteSpace(alias) ? null : alias.Trim();
        _nodes = (nodes ?? Array.Empty<LightyFlowChartFileNodeInstance>()).ToList().AsReadOnly();
        _flowConnections = (flowConnections ?? Array.Empty<LightyFlowChartConnectionDefinition>()).ToList().AsReadOnly();
        _computeConnections = (computeConnections ?? Array.Empty<LightyFlowChartConnectionDefinition>()).ToList().AsReadOnly();
    }

    public string RelativePath { get; }

    public string FilePath { get; }

    public string FormatVersion { get; }

    public string Name { get; }

    public string? Alias { get; }

    public IReadOnlyList<LightyFlowChartFileNodeInstance> Nodes => _nodes;

    public IReadOnlyList<LightyFlowChartConnectionDefinition> FlowConnections => _flowConnections;

    public IReadOnlyList<LightyFlowChartConnectionDefinition> ComputeConnections => _computeConnections;
}

public sealed class LightyFlowChartFileNodeInstance
{
    private readonly IReadOnlyList<LightyFlowChartTypeArgument> _typeArguments;
    private readonly IReadOnlyList<LightyFlowChartPropertyValue> _propertyValues;

    public LightyFlowChartFileNodeInstance(
        uint nodeId,
        string nodeType,
        double x,
        double y,
        IEnumerable<LightyFlowChartTypeArgument>? typeArguments,
        IEnumerable<LightyFlowChartPropertyValue>? propertyValues)
    {
        if (nodeId == 0)
        {
            throw new ArgumentOutOfRangeException(nameof(nodeId), "Node id must be greater than zero.");
        }

        if (string.IsNullOrWhiteSpace(nodeType))
        {
            throw new ArgumentException("Node type cannot be null or whitespace.", nameof(nodeType));
        }

        NodeId = nodeId;
        NodeType = LightyWorkspacePathLayout.NormalizeRelativeAssetPath(nodeType);
        X = x;
        Y = y;
        _typeArguments = (typeArguments ?? Array.Empty<LightyFlowChartTypeArgument>()).ToList().AsReadOnly();
        _propertyValues = (propertyValues ?? Array.Empty<LightyFlowChartPropertyValue>()).ToList().AsReadOnly();
    }

    public uint NodeId { get; }

    public string NodeType { get; }

    public double X { get; }

    public double Y { get; }

    public IReadOnlyList<LightyFlowChartTypeArgument> TypeArguments => _typeArguments;

    public IReadOnlyList<LightyFlowChartPropertyValue> PropertyValues => _propertyValues;
}

public sealed class LightyFlowChartTypeArgument
{
    public LightyFlowChartTypeArgument(string name, LightyFlowChartTypeRef type)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("Type argument name cannot be null or whitespace.", nameof(name));
        }

        ArgumentNullException.ThrowIfNull(type);

        Name = name.Trim();
        Type = type;
    }

    public string Name { get; }

    public LightyFlowChartTypeRef Type { get; }
}

public sealed class LightyFlowChartPropertyValue
{
    public LightyFlowChartPropertyValue(uint propertyId, JsonElement value)
    {
        if (propertyId == 0)
        {
            throw new ArgumentOutOfRangeException(nameof(propertyId), "Property id must be greater than zero.");
        }

        PropertyId = propertyId;
        Value = value.Clone();
    }

    public uint PropertyId { get; }

    public JsonElement Value { get; }
}

public sealed class LightyFlowChartConnectionDefinition
{
    public LightyFlowChartConnectionDefinition(uint sourceNodeId, uint sourcePortId, uint targetNodeId, uint targetPortId)
    {
        if (sourceNodeId == 0)
        {
            throw new ArgumentOutOfRangeException(nameof(sourceNodeId), "Source node id must be greater than zero.");
        }

        if (sourcePortId == 0)
        {
            throw new ArgumentOutOfRangeException(nameof(sourcePortId), "Source port id must be greater than zero.");
        }

        if (targetNodeId == 0)
        {
            throw new ArgumentOutOfRangeException(nameof(targetNodeId), "Target node id must be greater than zero.");
        }

        if (targetPortId == 0)
        {
            throw new ArgumentOutOfRangeException(nameof(targetPortId), "Target port id must be greater than zero.");
        }

        SourceNodeId = sourceNodeId;
        SourcePortId = sourcePortId;
        TargetNodeId = targetNodeId;
        TargetPortId = targetPortId;
    }

    public uint SourceNodeId { get; }

    public uint SourcePortId { get; }

    public uint TargetNodeId { get; }

    public uint TargetPortId { get; }
}