using System.Text;
using LightyDesign.Core;

namespace LightyDesign.Generator;

public sealed class LightyFlowChartFileCodeGenerator
{
    private const string RootNamespace = "LightyDesignData.FlowCharts";
    private static readonly IReadOnlyDictionary<string, IReadOnlySet<string>> SupportedOverloadTypes =
        new Dictionary<string, IReadOnlySet<string>>(StringComparer.Ordinal)
        {
            ["Arithmetic.Add"] = new HashSet<string>(new[] { "int32", "uint32", "int64", "uint64", "float", "double" }, StringComparer.OrdinalIgnoreCase),
            ["Arithmetic.Subtract"] = new HashSet<string>(new[] { "int32", "uint32", "int64", "uint64", "float", "double" }, StringComparer.OrdinalIgnoreCase),
            ["Arithmetic.Multiply"] = new HashSet<string>(new[] { "int32", "uint32", "int64", "uint64", "float", "double" }, StringComparer.OrdinalIgnoreCase),
            ["Arithmetic.Divide"] = new HashSet<string>(new[] { "int32", "uint32", "int64", "uint64", "float", "double" }, StringComparer.OrdinalIgnoreCase),
            ["Comparison.Equal"] = new HashSet<string>(new[] { "bool", "int32", "uint32", "int64", "uint64", "float", "double", "string" }, StringComparer.OrdinalIgnoreCase),
            ["Comparison.NotEqual"] = new HashSet<string>(new[] { "bool", "int32", "uint32", "int64", "uint64", "float", "double", "string" }, StringComparer.OrdinalIgnoreCase),
            ["Comparison.GreaterThan"] = new HashSet<string>(new[] { "int32", "uint32", "int64", "uint64", "float", "double" }, StringComparer.OrdinalIgnoreCase),
            ["Comparison.LessThan"] = new HashSet<string>(new[] { "int32", "uint32", "int64", "uint64", "float", "double" }, StringComparer.OrdinalIgnoreCase),
        };

    public LightyGeneratedFlowChartPackage Generate(LightyWorkspace workspace, string flowChartRelativePath)
    {
        ArgumentNullException.ThrowIfNull(workspace);
        ArgumentException.ThrowIfNullOrWhiteSpace(flowChartRelativePath);
        return Generate(workspace, new[] { flowChartRelativePath });
    }

    public LightyGeneratedFlowChartPackage Generate(LightyWorkspace workspace, IEnumerable<string> flowChartRelativePaths)
    {
        ArgumentNullException.ThrowIfNull(workspace);
        ArgumentNullException.ThrowIfNull(flowChartRelativePaths);

        if (string.IsNullOrWhiteSpace(workspace.CodegenOptions.OutputRelativePath))
        {
            throw new LightyCoreException("FlowChart code generation output path is not configured. Please configure an output relative path first.");
        }

        var normalizedRelativePaths = flowChartRelativePaths
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Select(LightyWorkspacePathLayout.NormalizeRelativeAssetPath)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (normalizedRelativePaths.Count == 0)
        {
            throw new ArgumentException("At least one FlowChart relative path is required.", nameof(flowChartRelativePaths));
        }

        var nodeDefinitionsByType = workspace.FlowChartNodeDefinitions
            .Select(LightyFlowChartNodeDefinitionParser.Parse)
            .ToDictionary(definition => definition.RelativePath, StringComparer.Ordinal);

        var nodePackage = new LightyFlowChartNodeCodeGenerator().Generate(workspace);
        var files = new List<LightyGeneratedCodeFile>(nodePackage.Files)
        {
            new("FlowCharts/FlowChartRuntimeSupport.cs", RenderRuntimeSupportFile()),
        };

        foreach (var relativePath in normalizedRelativePaths)
        {
            if (!workspace.TryGetFlowChartFile(relativePath, out var document) || document is null)
            {
                throw new LightyCoreException($"FlowChart file '{relativePath}' was not found in the workspace.");
            }

            var flowChart = LightyFlowChartFileDefinitionParser.Parse(document);
            var resolvedNodes = ResolveNodeInstances(flowChart, nodeDefinitionsByType);
            var chartDirectory = BuildFlowChartOutputDirectory(flowChart.RelativePath);
            files.Add(new LightyGeneratedCodeFile($"{chartDirectory}/{BuildDefinitionTypeName(flowChart.RelativePath)}.cs", RenderDefinitionFile(flowChart, resolvedNodes)));
            files.Add(new LightyGeneratedCodeFile($"{chartDirectory}/{BuildFlowTypeName(flowChart.RelativePath)}.cs", RenderFlowFile(flowChart, resolvedNodes)));
        }

        return new LightyGeneratedFlowChartPackage(workspace.CodegenOptions.OutputRelativePath!, files);
    }

    private static IReadOnlyList<ResolvedNodeInstance> ResolveNodeInstances(
        LightyFlowChartFileDefinition flowChart,
        IReadOnlyDictionary<string, LightyFlowChartNodeDefinition> nodeDefinitionsByType)
    {
        var resolvedNodes = flowChart.Nodes
            .Select(node =>
            {
                if (!nodeDefinitionsByType.TryGetValue(node.NodeType, out var definition))
                {
                    throw new LightyCoreException($"FlowChart '{flowChart.RelativePath}' references missing node definition '{node.NodeType}'.");
                }

                var explicitTypeArguments = new Dictionary<string, LightyFlowChartTypeRef>(StringComparer.Ordinal);
                foreach (var typeArgument in node.TypeArguments)
                {
                    explicitTypeArguments[typeArgument.Name] = typeArgument.Type;
                }

                return new ResolvedNodeInstance(node, definition, explicitTypeArguments);
            })
            .ToDictionary(node => node.Node.NodeId);

        var changed = true;
        while (changed)
        {
            changed = false;
            foreach (var connection in flowChart.ComputeConnections)
            {
                if (!resolvedNodes.TryGetValue(connection.SourceNodeId, out var sourceNode))
                {
                    throw new LightyCoreException($"FlowChart '{flowChart.RelativePath}' references missing source node id '{connection.SourceNodeId}'.");
                }

                if (!resolvedNodes.TryGetValue(connection.TargetNodeId, out var targetNode))
                {
                    throw new LightyCoreException($"FlowChart '{flowChart.RelativePath}' references missing target node id '{connection.TargetNodeId}'.");
                }

                var sourcePort = sourceNode.Definition.ComputePorts.FirstOrDefault(port => port.PortId == connection.SourcePortId)
                    ?? throw new LightyCoreException($"Node '{sourceNode.Node.NodeType}' does not contain compute output port '{connection.SourcePortId}'.");
                var targetPort = targetNode.Definition.ComputePorts.FirstOrDefault(port => port.PortId == connection.TargetPortId)
                    ?? throw new LightyCoreException($"Node '{targetNode.Node.NodeType}' does not contain compute input port '{connection.TargetPortId}'.");

                changed |= UnifyTypes(sourceNode, sourcePort.Type, targetNode, targetPort.Type);
            }
        }

        foreach (var resolvedNode in resolvedNodes.Values.OrderBy(node => node.Node.NodeId))
        {
            ValidateResolvedNode(flowChart.RelativePath, resolvedNode);
        }

        return resolvedNodes.Values.OrderBy(node => node.Node.NodeId).ToList().AsReadOnly();
    }

    private static bool UnifyTypes(ResolvedNodeInstance leftOwner, LightyFlowChartTypeRef leftType, ResolvedNodeInstance rightOwner, LightyFlowChartTypeRef rightType)
    {
        var substitutedLeft = ApplySubstitutions(leftOwner, leftType);
        var substitutedRight = ApplySubstitutions(rightOwner, rightType);

        if (substitutedLeft.Kind == LightyFlowChartTypeKind.TypeParameter)
        {
            return TryBindTypeParameter(leftOwner, substitutedLeft.Name!, substitutedRight);
        }

        if (substitutedRight.Kind == LightyFlowChartTypeKind.TypeParameter)
        {
            return TryBindTypeParameter(rightOwner, substitutedRight.Name!, substitutedLeft);
        }

        if (substitutedLeft.Kind != substitutedRight.Kind)
        {
            throw new LightyCoreException($"FlowChart type inference failed because '{RenderType(substitutedLeft)}' cannot connect to '{RenderType(substitutedRight)}'.");
        }

        return substitutedLeft.Kind switch
        {
            LightyFlowChartTypeKind.Builtin => EnsureSameBuiltin(substitutedLeft, substitutedRight),
            LightyFlowChartTypeKind.Custom => EnsureSameCustom(substitutedLeft, substitutedRight),
            LightyFlowChartTypeKind.List => UnifyTypes(leftOwner, substitutedLeft.ElementType!, rightOwner, substitutedRight.ElementType!),
            LightyFlowChartTypeKind.Dictionary => UnifyTypes(leftOwner, substitutedLeft.KeyType!, rightOwner, substitutedRight.KeyType!)
                | UnifyTypes(leftOwner, substitutedLeft.ValueType!, rightOwner, substitutedRight.ValueType!),
            _ => false,
        };
    }

    private static bool TryBindTypeParameter(ResolvedNodeInstance owner, string typeParameterName, LightyFlowChartTypeRef candidateType)
    {
        if (ContainsTypeParameter(candidateType))
        {
            return false;
        }

        if (owner.TypeArguments.TryGetValue(typeParameterName, out var existingType))
        {
            EnsureCompatible(existingType, candidateType);
            return false;
        }

        owner.TypeArguments[typeParameterName] = candidateType;
        return true;
    }

    private static LightyFlowChartTypeRef ApplySubstitutions(ResolvedNodeInstance owner, LightyFlowChartTypeRef type)
    {
        return type.Kind switch
        {
            LightyFlowChartTypeKind.TypeParameter when owner.TypeArguments.TryGetValue(type.Name!, out var concreteType) => concreteType,
            LightyFlowChartTypeKind.List => new LightyFlowChartTypeRef(type.Kind, elementType: ApplySubstitutions(owner, type.ElementType!)),
            LightyFlowChartTypeKind.Dictionary => new LightyFlowChartTypeRef(
                type.Kind,
                keyType: ApplySubstitutions(owner, type.KeyType!),
                valueType: ApplySubstitutions(owner, type.ValueType!)),
            _ => type,
        };
    }

    private static bool ContainsTypeParameter(LightyFlowChartTypeRef type)
    {
        return type.Kind switch
        {
            LightyFlowChartTypeKind.TypeParameter => true,
            LightyFlowChartTypeKind.List => ContainsTypeParameter(type.ElementType!),
            LightyFlowChartTypeKind.Dictionary => ContainsTypeParameter(type.KeyType!) || ContainsTypeParameter(type.ValueType!),
            _ => false,
        };
    }

    private static bool EnsureSameBuiltin(LightyFlowChartTypeRef left, LightyFlowChartTypeRef right)
    {
        if (!string.Equals(left.Name, right.Name, StringComparison.OrdinalIgnoreCase))
        {
            throw new LightyCoreException($"FlowChart type inference failed because '{RenderType(left)}' cannot connect to '{RenderType(right)}'.");
        }

        return false;
    }

    private static bool EnsureSameCustom(LightyFlowChartTypeRef left, LightyFlowChartTypeRef right)
    {
        var leftIdentity = !string.IsNullOrWhiteSpace(left.FullName) ? left.FullName : left.Name;
        var rightIdentity = !string.IsNullOrWhiteSpace(right.FullName) ? right.FullName : right.Name;
        if (!string.Equals(leftIdentity, rightIdentity, StringComparison.Ordinal))
        {
            throw new LightyCoreException($"FlowChart type inference failed because '{RenderType(left)}' cannot connect to '{RenderType(right)}'.");
        }

        return false;
    }

    private static void EnsureCompatible(LightyFlowChartTypeRef left, LightyFlowChartTypeRef right)
    {
        if (!string.Equals(RenderType(left), RenderType(right), StringComparison.Ordinal))
        {
            throw new LightyCoreException($"FlowChart type inference failed because '{RenderType(left)}' conflicts with '{RenderType(right)}'.");
        }
    }

    private static void ValidateResolvedNode(string flowChartRelativePath, ResolvedNodeInstance node)
    {
        foreach (var typeParameter in node.Definition.TypeParameters)
        {
            if (!node.TypeArguments.TryGetValue(typeParameter.Name, out var resolvedType) || ContainsTypeParameter(resolvedType))
            {
                throw new LightyCoreException($"FlowChart '{flowChartRelativePath}' node '{node.Node.NodeId}:{node.Node.NodeType}' could not resolve type parameter '{typeParameter.Name}'.");
            }

            ValidateConstraint(flowChartRelativePath, node, typeParameter, resolvedType);
        }

        if (node.Definition.CodegenBinding?.ResolutionMode == LightyFlowChartCodegenResolutionMode.Overload)
        {
            var typeParameter = node.Definition.TypeParameters.FirstOrDefault();
            if (typeParameter is not null && node.TypeArguments.TryGetValue(typeParameter.Name, out var resolvedType))
            {
                if (resolvedType.Kind != LightyFlowChartTypeKind.Builtin || string.IsNullOrWhiteSpace(resolvedType.Name))
                {
                    throw new LightyCoreException($"FlowChart '{flowChartRelativePath}' node '{node.Node.NodeId}:{node.Node.NodeType}' resolved to unsupported overload type '{RenderType(resolvedType)}'.");
                }

                if (!SupportedOverloadTypes.TryGetValue(node.Definition.CodegenBinding!.Operation, out var supportedTypes)
                    || !supportedTypes.Contains(resolvedType.Name))
                {
                    throw new LightyCoreException($"FlowChart '{flowChartRelativePath}' node '{node.Node.NodeId}:{node.Node.NodeType}' resolved to unsupported overload type '{RenderType(resolvedType)}'.");
                }
            }
        }
    }

    private static void ValidateConstraint(
        string flowChartRelativePath,
        ResolvedNodeInstance node,
        LightyFlowChartTypeParameter typeParameter,
        LightyFlowChartTypeRef resolvedType)
    {
        var constraint = typeParameter.Constraint?.Trim();
        if (string.IsNullOrWhiteSpace(constraint) || string.Equals(constraint, "any", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        var isValid = constraint.ToLowerInvariant() switch
        {
            "numeric" => resolvedType.Kind == LightyFlowChartTypeKind.Builtin && SupportedOverloadTypes["Arithmetic.Add"].Contains(resolvedType.Name!),
            "comparable" => resolvedType.Kind == LightyFlowChartTypeKind.Builtin && SupportedOverloadTypes["Comparison.Equal"].Contains(resolvedType.Name!),
            "hashablekey" => resolvedType.Kind == LightyFlowChartTypeKind.Builtin
                && new[] { "bool", "int32", "uint32", "int64", "uint64", "string" }.Contains(resolvedType.Name!, StringComparer.OrdinalIgnoreCase),
            _ => true,
        };

        if (!isValid)
        {
            throw new LightyCoreException($"FlowChart '{flowChartRelativePath}' node '{node.Node.NodeId}:{node.Node.NodeType}' resolved type '{RenderType(resolvedType)}' does not satisfy constraint '{constraint}'.");
        }
    }

    private static string RenderRuntimeSupportFile()
    {
        var writer = new CodeWriter();
        writer.AppendLine("using System;");
        writer.AppendLine("using System.Collections.Generic;");
        writer.AppendLine();
        writer.AppendLine($"namespace {RootNamespace}");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("public sealed class FlowChartNodeDescriptor");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("public FlowChartNodeDescriptor(uint nodeId, string nodeType, string runtimeTypeName, double x, double y)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("NodeId = nodeId;");
        writer.AppendLine("NodeType = nodeType;");
        writer.AppendLine("RuntimeTypeName = runtimeTypeName;");
        writer.AppendLine("X = x;");
        writer.AppendLine("Y = y;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("public uint NodeId { get; }");
        writer.AppendLine("public string NodeType { get; }");
        writer.AppendLine("public string RuntimeTypeName { get; }");
        writer.AppendLine("public double X { get; }");
        writer.AppendLine("public double Y { get; }");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("public sealed class FlowChartConnectionDescriptor");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("public FlowChartConnectionDescriptor(uint sourceNodeId, uint sourcePortId, uint targetNodeId, uint targetPortId)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("SourceNodeId = sourceNodeId;");
        writer.AppendLine("SourcePortId = sourcePortId;");
        writer.AppendLine("TargetNodeId = targetNodeId;");
        writer.AppendLine("TargetPortId = targetPortId;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("public uint SourceNodeId { get; }");
        writer.AppendLine("public uint SourcePortId { get; }");
        writer.AppendLine("public uint TargetNodeId { get; }");
        writer.AppendLine("public uint TargetPortId { get; }");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("public interface IFlowChartTimeContext");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("DateTime UtcNow { get; }");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("public sealed class FlowChartNodeTransition");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("public FlowChartNodeTransition(uint? sourceNodeId, uint? sourcePortId, uint? targetNodeId, uint? targetPortId)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("SourceNodeId = sourceNodeId;");
        writer.AppendLine("SourcePortId = sourcePortId;");
        writer.AppendLine("TargetNodeId = targetNodeId;");
        writer.AppendLine("TargetPortId = targetPortId;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("public uint? SourceNodeId { get; }");
        writer.AppendLine("public uint? SourcePortId { get; }");
        writer.AppendLine("public uint? TargetNodeId { get; }");
        writer.AppendLine("public uint? TargetPortId { get; }");
        writer.AppendLine("public bool IsInitialEntry => !SourceNodeId.HasValue;");
        writer.AppendLine("public bool IsExit => !TargetNodeId.HasValue;");
        writer.AppendLine("public bool IsSelfTransition => SourceNodeId.HasValue && TargetNodeId.HasValue && SourceNodeId.Value == TargetNodeId.Value;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("public sealed class FlowChartNodeState");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("private readonly Dictionary<uint, object?> _outputValues = new Dictionary<uint, object?>();");
        writer.AppendLine();
        writer.AppendLine("public int IterationIndex { get; set; } = -1;");
        writer.AppendLine("public object? Payload { get; set; }");
        writer.AppendLine();
        writer.AppendLine("public void SetOutputValue(uint portId, object? value)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("_outputValues[portId] = value;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("public bool TryGetOutputValue(uint portId, out object? value)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("return _outputValues.TryGetValue(portId, out value);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("public void ClearOutputValues()");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("_outputValues.Clear();");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("public void Reset()");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("IterationIndex = -1;");
        writer.AppendLine("Payload = null;");
        writer.AppendLine("_outputValues.Clear();");
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        return writer.ToString();
    }

    private static string RenderDefinitionFile(LightyFlowChartFileDefinition flowChart, IReadOnlyList<ResolvedNodeInstance> resolvedNodes)
    {
        var writer = new CodeWriter();
        writer.AppendLine("using System.Collections.Generic;");
        writer.AppendLine($"using {RootNamespace};");
        writer.AppendLine();
        writer.AppendLine($"namespace {BuildNamespace(flowChart.RelativePath)}");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine($"public sealed partial class {BuildDefinitionTypeName(flowChart.RelativePath)}");
        writer.AppendLine("{");
        writer.Indent();

        foreach (var resolvedNode in resolvedNodes)
        {
            writer.AppendLine($"private static readonly {BuildNodeRuntimeTypeName(resolvedNode)} Node{resolvedNode.Node.NodeId} = new {BuildNodeRuntimeTypeName(resolvedNode)}();");
        }

        if (resolvedNodes.Count > 0)
        {
            writer.AppendLine();
        }

        writer.AppendLine("private static readonly IReadOnlyList<FlowChartNodeDescriptor> NodeDescriptors = new FlowChartNodeDescriptor[]");
        writer.AppendLine("{");
        writer.Indent();
        foreach (var resolvedNode in resolvedNodes)
        {
            writer.AppendLine($"new FlowChartNodeDescriptor({resolvedNode.Node.NodeId}u, {ToStringLiteral(resolvedNode.Node.NodeType)}, {ToStringLiteral(BuildNodeRuntimeTypeName(resolvedNode))}, {resolvedNode.Node.X.ToString(System.Globalization.CultureInfo.InvariantCulture)}, {resolvedNode.Node.Y.ToString(System.Globalization.CultureInfo.InvariantCulture)}),");
        }
        writer.Outdent();
        writer.AppendLine("};");
        writer.AppendLine();
        writer.AppendLine("private static readonly IReadOnlyList<FlowChartConnectionDescriptor> FlowConnectionDescriptors = new FlowChartConnectionDescriptor[]");
        writer.AppendLine("{");
        writer.Indent();
        foreach (var connection in flowChart.FlowConnections)
        {
            writer.AppendLine($"new FlowChartConnectionDescriptor({connection.SourceNodeId}u, {connection.SourcePortId}u, {connection.TargetNodeId}u, {connection.TargetPortId}u),");
        }
        writer.Outdent();
        writer.AppendLine("};");
        writer.AppendLine();
        writer.AppendLine("private static readonly IReadOnlyList<FlowChartConnectionDescriptor> ComputeConnectionDescriptors = new FlowChartConnectionDescriptor[]");
        writer.AppendLine("{");
        writer.Indent();
        foreach (var connection in flowChart.ComputeConnections)
        {
            writer.AppendLine($"new FlowChartConnectionDescriptor({connection.SourceNodeId}u, {connection.SourcePortId}u, {connection.TargetNodeId}u, {connection.TargetPortId}u),");
        }
        writer.Outdent();
        writer.AppendLine("};");
        writer.AppendLine();
        writer.AppendLine($"public static {BuildDefinitionTypeName(flowChart.RelativePath)} Create()");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine($"return new {BuildDefinitionTypeName(flowChart.RelativePath)}();");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine($"public {BuildFlowTypeName(flowChart.RelativePath)}<TContext> CreateFlow<TContext>(TContext context)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine($"return new {BuildFlowTypeName(flowChart.RelativePath)}<TContext>(this, context);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine($"public {BuildFlowTypeName(flowChart.RelativePath)}<TContext> CreateFlow<TContext>(uint entryNodeId, TContext context)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine($"return new {BuildFlowTypeName(flowChart.RelativePath)}<TContext>(this, context, entryNodeId);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine($"public string RelativePath => {ToStringLiteral(flowChart.RelativePath)};");
        writer.AppendLine($"public string Name => {ToStringLiteral(flowChart.Name)};");
        writer.AppendLine($"public string Alias => {ToStringLiteral(flowChart.Alias ?? string.Empty)};");
        writer.AppendLine("public IReadOnlyList<FlowChartNodeDescriptor> Nodes => NodeDescriptors;");
        writer.AppendLine("public IReadOnlyList<FlowChartConnectionDescriptor> FlowConnections => FlowConnectionDescriptors;");
        writer.AppendLine("public IReadOnlyList<FlowChartConnectionDescriptor> ComputeConnections => ComputeConnectionDescriptors;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        return writer.ToString();
    }

    private static string RenderFlowFile(LightyFlowChartFileDefinition flowChart, IReadOnlyList<ResolvedNodeInstance> resolvedNodes)
    {
        var defaultEntryNodeId = ResolveDefaultEntryNodeId(flowChart, resolvedNodes);
        var writer = new CodeWriter();
        writer.AppendLine("using System;");
        writer.AppendLine("using System.Collections.Generic;");
        writer.AppendLine("using System.Text.Json;");
        writer.AppendLine($"using {RootNamespace};");
        writer.AppendLine();
        writer.AppendLine($"namespace {BuildNamespace(flowChart.RelativePath)}");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine($"public sealed partial class {BuildFlowTypeName(flowChart.RelativePath)}<TContext>");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine($"public {BuildFlowTypeName(flowChart.RelativePath)}({BuildDefinitionTypeName(flowChart.RelativePath)} definition, TContext context)");
        writer.AppendLine($"    : this(definition, context, null)");
        writer.AppendLine("{");
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine($"public {BuildFlowTypeName(flowChart.RelativePath)}({BuildDefinitionTypeName(flowChart.RelativePath)} definition, TContext context, uint? entryNodeId)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (definition == null)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("throw new ArgumentNullException(nameof(definition));");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("_definition = definition;");
        writer.AppendLine("_entryNodeIdOverride = entryNodeId;");
        writer.AppendLine("Context = context;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine($"private readonly {BuildDefinitionTypeName(flowChart.RelativePath)} _definition;");
        writer.AppendLine("private readonly uint? _entryNodeIdOverride;");
        writer.AppendLine("private readonly Dictionary<uint, FlowChartNodeState> _nodeStates = new Dictionary<uint, FlowChartNodeState>();");
        writer.AppendLine("private readonly Dictionary<(uint NodeId, uint PortId), object?> _stepComputeCache = new Dictionary<(uint NodeId, uint PortId), object?>();");
        writer.AppendLine("private FlowChartNodeTransition? _currentEntryTransition;");
        writer.AppendLine("private bool _currentNodeEntryPending;");
        writer.AppendLine("private long _currentNodeEntryVersion;");
        writer.AppendLine("public TContext Context { get; }");
        writer.AppendLine("public uint? CurrentNodeId { get; private set; }");
        writer.AppendLine("public bool IsPaused { get; private set; }");
        writer.AppendLine("public bool IsCompleted { get; private set; }");
        writer.AppendLine();
        writer.AppendLine("public void Resume()");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (IsCompleted)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("return;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("IsPaused = false;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("public void StepOnce()");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("StepOnce(TimeSpan.Zero);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("public void StepOnce(TimeSpan deltaTime)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (deltaTime < TimeSpan.Zero)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("throw new ArgumentOutOfRangeException(nameof(deltaTime), \"Delta time cannot be negative.\");");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("if (IsCompleted || IsPaused)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("return;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("_stepComputeCache.Clear();");
        writer.AppendLine("if (CurrentNodeId is null)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("var initialNodeId = ResolveInitialNodeId();");
        writer.AppendLine("if (initialNodeId is null)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("CompleteFlow();");
        writer.AppendLine("return;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("EnterNode(null, null, initialNodeId.Value, null);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("var executingNodeId = CurrentNodeId.Value;");
        writer.AppendLine("var executingEntryVersion = _currentNodeEntryVersion;");
        writer.AppendLine("ExecuteCurrentNode(executingNodeId, deltaTime);");
        writer.AppendLine("if (CurrentNodeId == executingNodeId && _currentNodeEntryVersion == executingEntryVersion)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("_currentNodeEntryPending = false;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("public void Step(int maxSteps)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("Step(maxSteps, TimeSpan.Zero);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("public void Step(int maxSteps, TimeSpan deltaTime)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (maxSteps <= 0)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("throw new ArgumentOutOfRangeException(nameof(maxSteps), \"Step count must be greater than zero.\");");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("for (var index = 0; index < maxSteps; index += 1)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (IsPaused || IsCompleted)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("break;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("StepOnce(deltaTime);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("public void RunToCompletion()");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("RunToCompletion(TimeSpan.Zero);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("public void RunToCompletion(TimeSpan deltaTime)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("while (!IsPaused && !IsCompleted)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("StepOnce(deltaTime);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("public void RunUntilPaused()");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("RunUntilPaused(TimeSpan.Zero);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("public void RunUntilPaused(TimeSpan deltaTime)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("while (!IsPaused && !IsCompleted)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("StepOnce(deltaTime);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine($"public void RunUntil(Func<{BuildFlowTypeName(flowChart.RelativePath)}<TContext>, bool> predicate)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("RunUntil(predicate, TimeSpan.Zero);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine($"public void RunUntil(Func<{BuildFlowTypeName(flowChart.RelativePath)}<TContext>, bool> predicate, TimeSpan deltaTime)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (predicate == null)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("throw new ArgumentNullException(nameof(predicate));");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("while (!predicate(this) && !IsPaused && !IsCompleted)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("StepOnce(deltaTime);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("private uint? ResolveInitialNodeId()");
        writer.AppendLine("{");
        writer.Indent();
        if (defaultEntryNodeId.HasValue)
        {
            writer.AppendLine($"return _entryNodeIdOverride ?? {defaultEntryNodeId.Value}u;");
        }
        else
        {
            writer.AppendLine("return _entryNodeIdOverride;");
        }
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("private void CompleteFlow()");
        writer.AppendLine("{");
        writer.Indent();
            writer.AppendLine("CompleteFlow(null, null);");
            writer.Outdent();
            writer.AppendLine("}");
            writer.AppendLine();
            writer.AppendLine("private void CompleteFlow(uint? sourceNodeId, uint? sourcePortId)");
            writer.AppendLine("{");
            writer.Indent();
            writer.AppendLine("if (sourceNodeId.HasValue)");
            writer.AppendLine("{");
            writer.Indent();
            writer.AppendLine("var transition = new FlowChartNodeTransition(sourceNodeId, sourcePortId, null, null);");
            writer.AppendLine("NotifyNodeLeaving(sourceNodeId.Value, transition);");
            writer.Outdent();
            writer.AppendLine("}");
            writer.AppendLine();
        writer.AppendLine("CurrentNodeId = null;");
            writer.AppendLine("_currentEntryTransition = null;");
            writer.AppendLine("_currentNodeEntryPending = false;");
        writer.AppendLine("IsCompleted = true;");
        writer.AppendLine("IsPaused = false;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("private FlowChartNodeState GetNodeState(uint nodeId)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (_nodeStates.TryGetValue(nodeId, out var existingState))");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("return existingState;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("var state = new FlowChartNodeState();");
        writer.AppendLine("_nodeStates[nodeId] = state;");
        writer.AppendLine("return state;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("private bool TryGetStoredOutputValue(uint nodeId, uint portId, out object? value)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (_nodeStates.TryGetValue(nodeId, out var state) && state.TryGetOutputValue(portId, out value))");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("return true;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("value = null;");
        writer.AppendLine("return false;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("private FlowChartConnectionDescriptor? ResolveFlowTargetConnection(uint sourceNodeId, uint sourcePortId)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("foreach (var connection in _definition.FlowConnections)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (connection.SourceNodeId == sourceNodeId && connection.SourcePortId == sourcePortId)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("return connection;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("return null;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("private void TransitionToResolvedTarget(uint sourceNodeId, uint sourcePortId)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("var connection = ResolveFlowTargetConnection(sourceNodeId, sourcePortId);");
        writer.AppendLine("if (connection == null)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("CompleteFlow(sourceNodeId, sourcePortId);");
        writer.AppendLine("return;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("EnterNode(sourceNodeId, sourcePortId, connection.TargetNodeId, connection.TargetPortId);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("private void EnterNode(uint? sourceNodeId, uint? sourcePortId, uint targetNodeId, uint? targetPortId)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("var transition = new FlowChartNodeTransition(sourceNodeId, sourcePortId, targetNodeId, targetPortId);");
        writer.AppendLine("if (sourceNodeId.HasValue)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("NotifyNodeLeaving(sourceNodeId.Value, transition);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("CurrentNodeId = targetNodeId;");
        writer.AppendLine("_currentEntryTransition = transition;");
        writer.AppendLine("_currentNodeEntryPending = true;");
        writer.AppendLine("_currentNodeEntryVersion += 1;");
        writer.AppendLine("NotifyNodeEntered(targetNodeId, transition);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("private void NotifyNodeEntered(uint nodeId, FlowChartNodeTransition transition)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("switch (nodeId)");
        writer.AppendLine("{");
        writer.Indent();
        foreach (var flowNode in resolvedNodes.Where(node => node.Definition.NodeKind != LightyFlowChartNodeKind.Compute).OrderBy(node => node.Node.NodeId))
        {
            writer.AppendLine($"case {flowNode.Node.NodeId}u:");
            writer.Indent();
            writer.AppendLine($"OnNode{flowNode.Node.NodeId}Enter(transition);");
            writer.AppendLine("return;");
            writer.Outdent();
        }
        writer.AppendLine("default:");
        writer.Indent();
        writer.AppendLine("return;");
        writer.Outdent();
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("private void NotifyNodeLeaving(uint nodeId, FlowChartNodeTransition transition)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("switch (nodeId)");
        writer.AppendLine("{");
        writer.Indent();
        foreach (var flowNode in resolvedNodes.Where(node => node.Definition.NodeKind != LightyFlowChartNodeKind.Compute).OrderBy(node => node.Node.NodeId))
        {
            writer.AppendLine($"case {flowNode.Node.NodeId}u:");
            writer.Indent();
            writer.AppendLine($"OnNode{flowNode.Node.NodeId}Leave(transition);");
            writer.AppendLine("return;");
            writer.Outdent();
        }
        writer.AppendLine("default:");
        writer.Indent();
        writer.AppendLine("return;");
        writer.Outdent();
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        foreach (var flowNode in resolvedNodes.Where(node => node.Definition.NodeKind != LightyFlowChartNodeKind.Compute).OrderBy(node => node.Node.NodeId))
        {
            writer.AppendLine($"partial void OnNode{flowNode.Node.NodeId}Enter(FlowChartNodeTransition transition);");
            writer.AppendLine($"partial void OnNode{flowNode.Node.NodeId}Leave(FlowChartNodeTransition transition);");
            writer.AppendLine();
        }
        writer.AppendLine("private T ResolveComputeInput<T>(uint targetNodeId, uint targetPortId)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("foreach (var connection in _definition.ComputeConnections)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (connection.TargetNodeId == targetNodeId && connection.TargetPortId == targetPortId)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("return EvaluateNodeOutput<T>(connection.SourceNodeId, connection.SourcePortId);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("throw new InvalidOperationException($\"Compute input '{targetNodeId}:{targetPortId}' is not connected.\");");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("private T EvaluateNodeOutput<T>(uint sourceNodeId, uint sourcePortId)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("var value = EvaluateNodeOutputValue(sourceNodeId, sourcePortId);");
        writer.AppendLine("if (value is T typedValue)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("return typedValue;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("return (T)value!;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("private object? EvaluateNodeOutputValue(uint sourceNodeId, uint sourcePortId)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (TryGetStoredOutputValue(sourceNodeId, sourcePortId, out var storedValue))");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("return storedValue;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("if (_stepComputeCache.TryGetValue((sourceNodeId, sourcePortId), out var cachedValue))");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("return cachedValue;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("object? computedValue;");
        writer.AppendLine("switch (sourceNodeId)");
        writer.AppendLine("{");
        writer.Indent();
        foreach (var resolvedNode in resolvedNodes.OrderBy(node => node.Node.NodeId))
        {
            AppendEvaluateNodeOutputCase(writer, resolvedNode);
        }
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("throw new NotSupportedException($\"Runtime evaluation is not supported for output '{sourceNodeId}:{sourcePortId}'.\");");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("private void ExecuteCurrentNode(uint nodeId, TimeSpan deltaTime)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("switch (nodeId)");
        writer.AppendLine("{");
        writer.Indent();
        foreach (var resolvedNode in resolvedNodes.OrderBy(node => node.Node.NodeId))
        {
            AppendExecuteCurrentNodeCase(writer, resolvedNode);
        }
        writer.AppendLine("default:");
        writer.Indent();
        writer.AppendLine("throw new InvalidOperationException($\"Flow runtime encountered unknown node id '{nodeId}'.\");");
        writer.Outdent();
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        return writer.ToString();
    }

    private static void AppendEvaluateNodeOutputCase(CodeWriter writer, ResolvedNodeInstance resolvedNode)
    {
        writer.AppendLine($"case {resolvedNode.Node.NodeId}u:");
        writer.Indent();

        if (resolvedNode.Definition.NodeKind == LightyFlowChartNodeKind.Compute
            && resolvedNode.Definition.CodegenBinding is not null)
        {
            foreach (var outputPort in resolvedNode.Definition.ComputePorts.Where(port => port.Direction == LightyFlowChartPortDirection.Output))
            {
                writer.AppendLine($"if (sourcePortId == {outputPort.PortId}u)");
                writer.AppendLine("{");
                writer.Indent();
                writer.AppendLine($"computedValue = {BuildNodeInvocation(resolvedNode)};");
                writer.AppendLine("_stepComputeCache[(sourceNodeId, sourcePortId)] = computedValue;");
                writer.AppendLine("return computedValue;");
                writer.Outdent();
                writer.AppendLine("}");
            }
        }
        else if (resolvedNode.Definition.NodeKind == LightyFlowChartNodeKind.Compute
            && IsPropertyLiteralNode(resolvedNode))
        {
            var outputPort = resolvedNode.Definition.ComputePorts.Single(port => port.Direction == LightyFlowChartPortDirection.Output);
            writer.AppendLine($"if (sourcePortId == {outputPort.PortId}u)");
            writer.AppendLine("{");
            writer.Indent();
            writer.AppendLine($"computedValue = {BuildPropertyLiteralExpression(resolvedNode)};");
            writer.AppendLine("_stepComputeCache[(sourceNodeId, sourcePortId)] = computedValue;");
            writer.AppendLine("return computedValue;");
            writer.Outdent();
            writer.AppendLine("}");
        }

        writer.AppendLine("break;");
        writer.Outdent();
    }

    private static void AppendExecuteCurrentNodeCase(CodeWriter writer, ResolvedNodeInstance resolvedNode)
    {
        writer.AppendLine($"case {resolvedNode.Node.NodeId}u:");
        writer.Indent();

        if (resolvedNode.Definition.NodeKind == LightyFlowChartNodeKind.Event)
        {
            AppendEventExecution(writer, resolvedNode);
        }
        else if (resolvedNode.Definition.NodeKind == LightyFlowChartNodeKind.Flow)
        {
            if (string.Equals(resolvedNode.Definition.RelativePath, "Builtin/Control/If", StringComparison.Ordinal))
            {
                AppendIfExecution(writer, resolvedNode);
            }
            else if (string.Equals(resolvedNode.Definition.RelativePath, "Builtin/Control/While", StringComparison.Ordinal))
            {
                AppendWhileExecution(writer, resolvedNode);
            }
            else if (string.Equals(resolvedNode.Definition.RelativePath, "Builtin/Control/Pause", StringComparison.Ordinal))
            {
                AppendPauseExecution(writer, resolvedNode);
            }
            else if (string.Equals(resolvedNode.Definition.RelativePath, "Builtin/Control/WaitUntil", StringComparison.Ordinal))
            {
                AppendWaitUntilExecution(writer, resolvedNode);
            }
            else if (string.Equals(resolvedNode.Definition.RelativePath, "Builtin/Control/PauseSeconds", StringComparison.Ordinal))
            {
                AppendPauseSecondsExecution(writer, resolvedNode);
            }
            else if (string.Equals(resolvedNode.Definition.RelativePath, "Builtin/List/ForEach", StringComparison.Ordinal))
            {
                AppendListForEachExecution(writer, resolvedNode);
            }
            else if (string.Equals(resolvedNode.Definition.RelativePath, "Builtin/Dictionary/ForEach", StringComparison.Ordinal))
            {
                AppendDictionaryForEachExecution(writer, resolvedNode);
            }
            else if (resolvedNode.Definition.CodegenBinding is not null)
            {
                AppendStandardFlowExecution(writer, resolvedNode);
            }
            else
            {
                writer.AppendLine($"throw new NotSupportedException(\"Flow node '{resolvedNode.Definition.RelativePath}' does not have a generated runtime implementation.\");");
            }
        }
        else
        {
            writer.AppendLine("throw new InvalidOperationException(\"Compute nodes cannot be executed as flow steps.\");");
        }

        writer.Outdent();
    }

    private static void AppendEventExecution(CodeWriter writer, ResolvedNodeInstance resolvedNode)
    {
        var outputPort = resolvedNode.Definition.FlowPorts.FirstOrDefault(port => port.Direction == LightyFlowChartPortDirection.Output);
        if (outputPort is null)
        {
            writer.AppendLine($"CompleteFlow({resolvedNode.Node.NodeId}u, null);");
            writer.AppendLine("return;");
            return;
        }

        writer.AppendLine($"TransitionToResolvedTarget({resolvedNode.Node.NodeId}u, {outputPort.PortId}u);");
        writer.AppendLine("return;");
    }

    private static void AppendIfExecution(CodeWriter writer, ResolvedNodeInstance resolvedNode)
    {
        writer.AppendLine($"var condition = ResolveComputeInput<bool>({resolvedNode.Node.NodeId}u, 101u);");
        writer.AppendLine($"TransitionToResolvedTarget({resolvedNode.Node.NodeId}u, condition ? 251u : 252u);");
        writer.AppendLine("return;");
    }

    private static void AppendWhileExecution(CodeWriter writer, ResolvedNodeInstance resolvedNode)
    {
        writer.AppendLine($"var condition = ResolveComputeInput<bool>({resolvedNode.Node.NodeId}u, 101u);");
        writer.AppendLine($"TransitionToResolvedTarget({resolvedNode.Node.NodeId}u, condition ? 251u : 252u);");
        writer.AppendLine("return;");
    }

    private static void AppendPauseExecution(CodeWriter writer, ResolvedNodeInstance resolvedNode)
    {
        writer.AppendLine($"TransitionToResolvedTarget({resolvedNode.Node.NodeId}u, 251u);");
        writer.AppendLine("if (IsCompleted)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("return;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("IsPaused = true;");
        writer.AppendLine("return;");
    }

    private static void AppendWaitUntilExecution(CodeWriter writer, ResolvedNodeInstance resolvedNode)
    {
        writer.AppendLine($"var condition = ResolveComputeInput<bool>({resolvedNode.Node.NodeId}u, 101u);");
        writer.AppendLine("if (!condition)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("IsPaused = true;");
        writer.AppendLine("return;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine($"TransitionToResolvedTarget({resolvedNode.Node.NodeId}u, 251u);");
        writer.AppendLine("return;");
    }

    private static void AppendPauseSecondsExecution(CodeWriter writer, ResolvedNodeInstance resolvedNode)
    {
        writer.AppendLine($"var durationSeconds = {BuildPropertyLiteralExpression(resolvedNode)};");
        writer.AppendLine("if (durationSeconds < 0)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("throw new InvalidOperationException(\"PauseSeconds duration cannot be negative.\");");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine($"var state = GetNodeState({resolvedNode.Node.NodeId}u);");
        writer.AppendLine("if (_currentNodeEntryPending && (_currentEntryTransition == null || !_currentEntryTransition.IsSelfTransition))");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("state.Reset();");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("var elapsedSeconds = state.Payload is double storedElapsedSeconds ? storedElapsedSeconds : 0d;");
        writer.AppendLine("elapsedSeconds += deltaTime.TotalSeconds;");
        writer.AppendLine("if (elapsedSeconds < durationSeconds)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("state.Payload = elapsedSeconds;");
        writer.AppendLine("IsPaused = true;");
        writer.AppendLine("return;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("state.Reset();");
        writer.AppendLine($"TransitionToResolvedTarget({resolvedNode.Node.NodeId}u, 251u);");
        writer.AppendLine("return;");
    }

    private static void AppendListForEachExecution(CodeWriter writer, ResolvedNodeInstance resolvedNode)
    {
        var elementTypeName = MapToCSharpType(ResolveComputePortType(resolvedNode, 151u));
        writer.AppendLine($"var state = GetNodeState({resolvedNode.Node.NodeId}u);");
        writer.AppendLine($"var list = ResolveComputeInput<List<{elementTypeName}>>({resolvedNode.Node.NodeId}u, 101u);");
        writer.AppendLine("if (list == null)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("throw new ArgumentNullException(nameof(list));");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("var nextIndex = state.IterationIndex + 1;");
        writer.AppendLine("if (nextIndex < list.Count)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("state.IterationIndex = nextIndex;");
        writer.AppendLine("state.SetOutputValue(151u, list[nextIndex]);");
        writer.AppendLine("state.SetOutputValue(152u, nextIndex);");
        writer.AppendLine($"TransitionToResolvedTarget({resolvedNode.Node.NodeId}u, 251u);");
        writer.AppendLine("return;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("state.Reset();");
        writer.AppendLine($"TransitionToResolvedTarget({resolvedNode.Node.NodeId}u, 252u);");
        writer.AppendLine("return;");
    }

    private static void AppendDictionaryForEachExecution(CodeWriter writer, ResolvedNodeInstance resolvedNode)
    {
        var keyTypeName = MapToCSharpType(ResolveComputePortType(resolvedNode, 151u));
        var valueTypeName = MapToCSharpType(ResolveComputePortType(resolvedNode, 152u));
        var dictionaryTypeName = $"Dictionary<{keyTypeName}, {valueTypeName}>";
        var entryListTypeName = $"List<KeyValuePair<{keyTypeName}, {valueTypeName}>>";

        writer.AppendLine($"var state = GetNodeState({resolvedNode.Node.NodeId}u);");
        writer.AppendLine($"var dictionary = ResolveComputeInput<{dictionaryTypeName}>({resolvedNode.Node.NodeId}u, 101u);");
        writer.AppendLine("if (dictionary == null)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("throw new ArgumentNullException(nameof(dictionary));");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine($"var entries = state.Payload as {entryListTypeName};");
        writer.AppendLine("if (entries == null || state.IterationIndex < 0)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine($"entries = new {entryListTypeName}();");
        writer.AppendLine("foreach (var entry in dictionary)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("entries.Add(entry);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("state.Payload = entries;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("var nextIndex = state.IterationIndex + 1;");
        writer.AppendLine("if (nextIndex < entries.Count)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("var entry = entries[nextIndex];");
        writer.AppendLine("state.IterationIndex = nextIndex;");
        writer.AppendLine("state.SetOutputValue(151u, entry.Key);");
        writer.AppendLine("state.SetOutputValue(152u, entry.Value);");
        writer.AppendLine($"TransitionToResolvedTarget({resolvedNode.Node.NodeId}u, 251u);");
        writer.AppendLine("return;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("state.Reset();");
        writer.AppendLine($"TransitionToResolvedTarget({resolvedNode.Node.NodeId}u, 252u);");
        writer.AppendLine("return;");
    }

    private static void AppendStandardFlowExecution(CodeWriter writer, ResolvedNodeInstance resolvedNode)
    {
        var outputPort = resolvedNode.Definition.ComputePorts.FirstOrDefault(port => port.Direction == LightyFlowChartPortDirection.Output);
        var nextFlowPort = resolvedNode.Definition.FlowPorts.FirstOrDefault(port => port.Direction == LightyFlowChartPortDirection.Output);

        if (outputPort is not null)
        {
            writer.AppendLine($"var result = {BuildNodeInvocation(resolvedNode)};");
            writer.AppendLine($"var state = GetNodeState({resolvedNode.Node.NodeId}u);");
            writer.AppendLine("state.ClearOutputValues();");
            writer.AppendLine($"state.SetOutputValue({outputPort.PortId}u, result);");
        }
        else
        {
            writer.AppendLine(BuildNodeInvocation(resolvedNode) + ";");
        }

        if (nextFlowPort is null)
        {
            writer.AppendLine($"CompleteFlow({resolvedNode.Node.NodeId}u, null);");
            writer.AppendLine("return;");
            return;
        }

        writer.AppendLine($"TransitionToResolvedTarget({resolvedNode.Node.NodeId}u, {nextFlowPort.PortId}u);");
        writer.AppendLine("return;");
    }

    private static uint? ResolveDefaultEntryNodeId(LightyFlowChartFileDefinition flowChart, IReadOnlyList<ResolvedNodeInstance> resolvedNodes)
    {
        var eventNode = resolvedNodes
            .Where(node => node.Definition.NodeKind == LightyFlowChartNodeKind.Event)
            .OrderBy(node => node.Node.NodeId)
            .FirstOrDefault();
        if (eventNode is not null)
        {
            return eventNode.Node.NodeId;
        }

        var incomingTargets = flowChart.FlowConnections
            .Select(connection => connection.TargetNodeId)
            .ToHashSet();

        var rootFlowNode = resolvedNodes
            .Where(node => node.Definition.NodeKind == LightyFlowChartNodeKind.Flow && !incomingTargets.Contains(node.Node.NodeId))
            .OrderBy(node => node.Node.NodeId)
            .FirstOrDefault();
        if (rootFlowNode is not null)
        {
            return rootFlowNode.Node.NodeId;
        }

        return resolvedNodes
            .Where(node => node.Definition.NodeKind == LightyFlowChartNodeKind.Flow)
            .OrderBy(node => node.Node.NodeId)
            .Select(node => (uint?)node.Node.NodeId)
            .FirstOrDefault();
    }

    private static string BuildNodeInvocation(ResolvedNodeInstance resolvedNode)
    {
        var methodName = resolvedNode.Definition.NodeKind == LightyFlowChartNodeKind.Compute ? "Evaluate" : "Execute";
        var arguments = resolvedNode.Definition.ComputePorts
            .Where(port => port.Direction == LightyFlowChartPortDirection.Input)
            .Select(port => $"ResolveComputeInput<{MapToCSharpType(ResolveConcreteType(resolvedNode, port.Type))}>({resolvedNode.Node.NodeId}u, {port.PortId}u)")
            .ToList();

        return $"Node{resolvedNode.Node.NodeId}.{methodName}({string.Join(", ", arguments)})";
    }

    private static LightyFlowChartTypeRef ResolveConcreteType(ResolvedNodeInstance resolvedNode, LightyFlowChartTypeRef type)
    {
        return ApplySubstitutions(resolvedNode, type);
    }

    private static LightyFlowChartTypeRef ResolveComputePortType(ResolvedNodeInstance resolvedNode, uint portId)
    {
        var port = resolvedNode.Definition.ComputePorts.First(port => port.PortId == portId);
        return ResolveConcreteType(resolvedNode, port.Type);
    }

    private static bool IsPropertyLiteralNode(ResolvedNodeInstance resolvedNode)
    {
        if (resolvedNode.Definition.CodegenBinding is not null)
        {
            return false;
        }

        if (resolvedNode.Definition.NodeKind != LightyFlowChartNodeKind.Compute)
        {
            return false;
        }

        var inputPorts = resolvedNode.Definition.ComputePorts.Count(port => port.Direction == LightyFlowChartPortDirection.Input);
        var outputPorts = resolvedNode.Definition.ComputePorts.Where(port => port.Direction == LightyFlowChartPortDirection.Output).ToList();
        if (inputPorts != 0 || outputPorts.Count != 1 || resolvedNode.Definition.Properties.Count != 1)
        {
            return false;
        }

        var propertyType = ResolveConcreteType(resolvedNode, resolvedNode.Definition.Properties[0].Type);
        var outputType = ResolveConcreteType(resolvedNode, outputPorts[0].Type);
        return string.Equals(RenderType(propertyType), RenderType(outputType), StringComparison.Ordinal);
    }

    private static string BuildPropertyLiteralExpression(ResolvedNodeInstance resolvedNode)
    {
        var property = resolvedNode.Definition.Properties.Single();
        var propertyType = ResolveConcreteType(resolvedNode, property.Type);
        var propertyValue = resolvedNode.Node.PropertyValues.FirstOrDefault(value => value.PropertyId == property.PropertyId);
        var jsonValue = propertyValue is not null
            ? propertyValue.Value
            : property.DefaultValue ?? throw new LightyCoreException(
                $"FlowChart node '{resolvedNode.Node.NodeId}:{resolvedNode.Node.NodeType}' is missing property value '{property.PropertyId}:{property.Name}'.");

        return $"JsonSerializer.Deserialize<{MapToCSharpType(propertyType)}>({ToStringLiteral(jsonValue.GetRawText())})";
    }

    private static string BuildNamespace(string relativePath)
    {
        var segments = LightyWorkspacePathLayout.NormalizeRelativeAssetPath(relativePath)
            .Split('/')
            .Select(LightyFlowChartCodegenNaming.ToTypeIdentifier)
            .ToList();
        return $"LightyDesignData.FlowCharts.Files.{string.Join('.', segments)}";
    }

    private static string BuildFlowChartOutputDirectory(string relativePath)
    {
        return $"FlowCharts/Files/{LightyWorkspacePathLayout.NormalizeRelativeAssetPath(relativePath)}";
    }

    internal static string BuildDefinitionTypeName(string relativePath)
    {
        return LightyFlowChartCodegenNaming.GetFlowChartLeafTypeIdentifier(relativePath) + "Definition";
    }

    internal static string BuildFlowTypeName(string relativePath)
    {
        return LightyFlowChartCodegenNaming.GetFlowChartLeafTypeIdentifier(relativePath) + "Flow";
    }

    private static string BuildNodeRuntimeTypeName(ResolvedNodeInstance resolvedNode)
    {
        var namespaceSuffix = string.Join('.', resolvedNode.Definition.RelativePath.Split('/').Take(Math.Max(0, resolvedNode.Definition.RelativePath.Split('/').Length - 1)).Select(LightyFlowChartCodegenNaming.ToTypeIdentifier));
        var baseTypeName = $"LightyDesignData.FlowCharts.Nodes{(string.IsNullOrWhiteSpace(namespaceSuffix) ? string.Empty : "." + namespaceSuffix)}.{LightyFlowChartCodegenNaming.ToTypeIdentifier(resolvedNode.Definition.Name)}Node";
        if (resolvedNode.Definition.CodegenBinding?.ResolutionMode != LightyFlowChartCodegenResolutionMode.Generic || resolvedNode.Definition.TypeParameters.Count == 0)
        {
            return baseTypeName;
        }

        var typeArguments = resolvedNode.Definition.TypeParameters
            .Select(typeParameter => MapToCSharpType(resolvedNode.TypeArguments[typeParameter.Name]))
            .ToList();
        return $"{baseTypeName}<{string.Join(", ", typeArguments)}>";
    }

    private static string MapToCSharpType(LightyFlowChartTypeRef type)
    {
        return type.Kind switch
        {
            LightyFlowChartTypeKind.Builtin => type.Name?.ToLowerInvariant() switch
            {
                "bool" => "bool",
                "int32" => "int",
                "uint32" => "uint",
                "int64" => "long",
                "uint64" => "ulong",
                "float" => "float",
                "double" => "double",
                "string" => "string",
                _ => throw new LightyCoreException($"Unsupported FlowChart builtin type '{type.Name}'."),
            },
            LightyFlowChartTypeKind.Custom => !string.IsNullOrWhiteSpace(type.FullName) ? type.FullName! : type.Name ?? throw new LightyCoreException("FlowChart custom type is missing its name."),
            LightyFlowChartTypeKind.List => $"List<{MapToCSharpType(type.ElementType ?? throw new LightyCoreException("FlowChart list type is missing its element type."))}>",
            LightyFlowChartTypeKind.Dictionary => $"Dictionary<{MapToCSharpType(type.KeyType ?? throw new LightyCoreException("FlowChart dictionary type is missing its key type."))}, {MapToCSharpType(type.ValueType ?? throw new LightyCoreException("FlowChart dictionary type is missing its value type."))}>",
            _ => throw new LightyCoreException($"Unsupported FlowChart concrete type '{RenderType(type)}'."),
        };
    }

    private static string RenderType(LightyFlowChartTypeRef type)
    {
        return type.Kind switch
        {
            LightyFlowChartTypeKind.Builtin => type.Name ?? "builtin",
            LightyFlowChartTypeKind.Custom => !string.IsNullOrWhiteSpace(type.FullName) ? type.FullName! : type.Name ?? "custom",
            LightyFlowChartTypeKind.List => $"List<{RenderType(type.ElementType!)}>",
            LightyFlowChartTypeKind.Dictionary => $"Dictionary<{RenderType(type.KeyType!)}, {RenderType(type.ValueType!)}>",
            LightyFlowChartTypeKind.TypeParameter => type.Name ?? "typeParameter",
            _ => type.Kind.ToString(),
        };
    }

    private static string ToStringLiteral(string value)
    {
        return "\"" + value
            .Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("\"", "\\\"", StringComparison.Ordinal)
            .Replace("\r", "\\r", StringComparison.Ordinal)
            .Replace("\n", "\\n", StringComparison.Ordinal)
            .Replace("\t", "\\t", StringComparison.Ordinal) + "\"";
    }

    private sealed class ResolvedNodeInstance
    {
        public ResolvedNodeInstance(LightyFlowChartFileNodeInstance node, LightyFlowChartNodeDefinition definition, Dictionary<string, LightyFlowChartTypeRef> typeArguments)
        {
            Node = node;
            Definition = definition;
            TypeArguments = typeArguments;
        }

        public LightyFlowChartFileNodeInstance Node { get; }

        public LightyFlowChartNodeDefinition Definition { get; }

        public Dictionary<string, LightyFlowChartTypeRef> TypeArguments { get; }
    }

    private sealed class CodeWriter
    {
        private readonly StringBuilder _builder = new();
        private int _indentLevel;

        public void Indent() => _indentLevel += 1;

        public void Outdent() => _indentLevel = Math.Max(0, _indentLevel - 1);

        public void AppendLine(string value = "")
        {
            if (value.Length > 0)
            {
                _builder.Append(new string(' ', _indentLevel * 4));
                _builder.AppendLine(value);
                return;
            }

            _builder.AppendLine();
        }

        public override string ToString() => _builder.ToString();
    }
}