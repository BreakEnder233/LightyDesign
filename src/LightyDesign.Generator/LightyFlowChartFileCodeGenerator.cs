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
            ["Comparison.Equal"] = new HashSet<string>(new[] { "bool", "int32", "uint32", "int64", "uint64", "float", "double", "string" }, StringComparer.OrdinalIgnoreCase),
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
            files.Add(new LightyGeneratedCodeFile($"{chartDirectory}/{BuildFlowTypeName(flowChart.RelativePath)}.cs", RenderFlowFile(flowChart)));
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

        writer.AppendLine("private static readonly IReadOnlyList<FlowChartNodeDescriptor> NodeDescriptors = new[]");
        writer.AppendLine("{");
        writer.Indent();
        foreach (var resolvedNode in resolvedNodes)
        {
            writer.AppendLine($"new FlowChartNodeDescriptor({resolvedNode.Node.NodeId}u, {ToStringLiteral(resolvedNode.Node.NodeType)}, {ToStringLiteral(BuildNodeRuntimeTypeName(resolvedNode))}, {resolvedNode.Node.X.ToString(System.Globalization.CultureInfo.InvariantCulture)}, {resolvedNode.Node.Y.ToString(System.Globalization.CultureInfo.InvariantCulture)}),");
        }
        writer.Outdent();
        writer.AppendLine("};");
        writer.AppendLine();
        writer.AppendLine("private static readonly IReadOnlyList<FlowChartConnectionDescriptor> FlowConnectionDescriptors = new[]");
        writer.AppendLine("{");
        writer.Indent();
        foreach (var connection in flowChart.FlowConnections)
        {
            writer.AppendLine($"new FlowChartConnectionDescriptor({connection.SourceNodeId}u, {connection.SourcePortId}u, {connection.TargetNodeId}u, {connection.TargetPortId}u),");
        }
        writer.Outdent();
        writer.AppendLine("};");
        writer.AppendLine();
        writer.AppendLine("private static readonly IReadOnlyList<FlowChartConnectionDescriptor> ComputeConnectionDescriptors = new[]");
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

    private static string RenderFlowFile(LightyFlowChartFileDefinition flowChart)
    {
        var writer = new CodeWriter();
        writer.AppendLine("using System;");
        writer.AppendLine();
        writer.AppendLine($"namespace {BuildNamespace(flowChart.RelativePath)}");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine($"public sealed partial class {BuildFlowTypeName(flowChart.RelativePath)}<TContext>");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine($"public {BuildFlowTypeName(flowChart.RelativePath)}({BuildDefinitionTypeName(flowChart.RelativePath)} definition, TContext context)");
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
        writer.AppendLine("Context = context;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine($"private readonly {BuildDefinitionTypeName(flowChart.RelativePath)} _definition;");
        writer.AppendLine("public TContext Context { get; }");
        writer.AppendLine("public uint? CurrentNodeId { get; private set; }");
        writer.AppendLine("public bool IsPaused { get; private set; }");
        writer.AppendLine("public bool IsCompleted { get; private set; }");
        writer.AppendLine();
        writer.AppendLine("public void StepOnce()");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("throw new NotSupportedException(\"Generated FlowChart runtime stepping is not implemented yet.\");");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("public void RunToCompletion()");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("throw new NotSupportedException(\"Generated FlowChart runtime execution is not implemented yet.\");");
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        return writer.ToString();
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