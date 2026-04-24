using System.Text;
using LightyDesign.Core;

namespace LightyDesign.Generator;

public sealed class LightyFlowChartNodeCodeGenerator
{
    private const string RootNamespace = "LightyDesignData.FlowCharts";
    private static readonly HashSet<string> CSharpKeywords = new(StringComparer.Ordinal)
    {
        "abstract", "as", "base", "bool", "break", "byte", "case", "catch", "char", "checked",
        "class", "const", "continue", "decimal", "default", "delegate", "do", "double", "else", "enum",
        "event", "explicit", "extern", "false", "finally", "fixed", "float", "for", "foreach", "goto",
        "if", "implicit", "in", "int", "interface", "internal", "is", "lock", "long", "namespace",
        "new", "null", "object", "operator", "out", "override", "params", "private", "protected", "public",
        "readonly", "ref", "return", "sbyte", "sealed", "short", "sizeof", "stackalloc", "static", "string",
        "struct", "switch", "this", "throw", "true", "try", "typeof", "uint", "ulong", "unchecked", "unsafe",
        "ushort", "using", "virtual", "void", "volatile", "while",
    };

    private static readonly IReadOnlyDictionary<string, IReadOnlyList<OverloadSignature>> OverloadBindings =
        new Dictionary<string, IReadOnlyList<OverloadSignature>>(StringComparer.Ordinal)
        {
            ["Arithmetic.Add"] = new[]
            {
                new OverloadSignature("int"),
                new OverloadSignature("uint"),
                new OverloadSignature("long"),
                new OverloadSignature("ulong"),
                new OverloadSignature("float"),
                new OverloadSignature("double"),
            },
            ["Arithmetic.Subtract"] = new[]
            {
                new OverloadSignature("int"),
                new OverloadSignature("uint"),
                new OverloadSignature("long"),
                new OverloadSignature("ulong"),
                new OverloadSignature("float"),
                new OverloadSignature("double"),
            },
            ["Arithmetic.Multiply"] = new[]
            {
                new OverloadSignature("int"),
                new OverloadSignature("uint"),
                new OverloadSignature("long"),
                new OverloadSignature("ulong"),
                new OverloadSignature("float"),
                new OverloadSignature("double"),
            },
            ["Arithmetic.Divide"] = new[]
            {
                new OverloadSignature("int"),
                new OverloadSignature("uint"),
                new OverloadSignature("long"),
                new OverloadSignature("ulong"),
                new OverloadSignature("float"),
                new OverloadSignature("double"),
            },
            ["Comparison.Equal"] = new[]
            {
                new OverloadSignature("bool"),
                new OverloadSignature("int"),
                new OverloadSignature("uint"),
                new OverloadSignature("long"),
                new OverloadSignature("ulong"),
                new OverloadSignature("float"),
                new OverloadSignature("double"),
                new OverloadSignature("string"),
            },
            ["Comparison.NotEqual"] = new[]
            {
                new OverloadSignature("bool"),
                new OverloadSignature("int"),
                new OverloadSignature("uint"),
                new OverloadSignature("long"),
                new OverloadSignature("ulong"),
                new OverloadSignature("float"),
                new OverloadSignature("double"),
                new OverloadSignature("string"),
            },
            ["Comparison.GreaterThan"] = new[]
            {
                new OverloadSignature("int"),
                new OverloadSignature("uint"),
                new OverloadSignature("long"),
                new OverloadSignature("ulong"),
                new OverloadSignature("float"),
                new OverloadSignature("double"),
            },
            ["Comparison.LessThan"] = new[]
            {
                new OverloadSignature("int"),
                new OverloadSignature("uint"),
                new OverloadSignature("long"),
                new OverloadSignature("ulong"),
                new OverloadSignature("float"),
                new OverloadSignature("double"),
            },
        };

    public LightyGeneratedFlowChartPackage Generate(LightyWorkspace workspace)
    {
        ArgumentNullException.ThrowIfNull(workspace);

        if (string.IsNullOrWhiteSpace(workspace.CodegenOptions.OutputRelativePath))
        {
            throw new LightyCoreException("FlowChart node code generation output path is not configured. Please configure an output relative path first.");
        }

        var nodeDefinitions = workspace.FlowChartNodeDefinitions
            .Select(LightyFlowChartNodeDefinitionParser.Parse)
            .OrderBy(definition => definition.RelativePath, StringComparer.Ordinal)
            .ToList();

        var files = new List<LightyGeneratedCodeFile>
        {
            new("FlowCharts/FlowChartStandardNodeBindingHelper.cs", RenderStandardBindingHelperFile()),
        };

        foreach (var nodeDefinition in nodeDefinitions)
        {
            files.Add(new LightyGeneratedCodeFile(BuildNodeFileRelativePath(nodeDefinition), RenderNodeFile(nodeDefinition)));
        }

        return new LightyGeneratedFlowChartPackage(workspace.CodegenOptions.OutputRelativePath!, files);
    }

    private static string BuildNodeFileRelativePath(LightyFlowChartNodeDefinition nodeDefinition)
    {
        return $"FlowCharts/Nodes/{nodeDefinition.RelativePath}Node.cs";
    }

    private static string RenderStandardBindingHelperFile()
    {
        var writer = new CodeWriter();
        writer.AppendLine("using System;");
        writer.AppendLine("using System.Collections.Generic;");
        writer.AppendLine();
        writer.AppendLine($"namespace {RootNamespace}");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("public static partial class FlowChartStandardNodeBindingHelper");
        writer.AppendLine("{");
        writer.Indent();

        writer.AppendLine("public static List<TElement> ListAdd<TElement>(List<TElement> list, TElement item)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (list == null)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("throw new ArgumentNullException(nameof(list));");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("list.Add(item);");
        writer.AppendLine("return list;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();

        writer.AppendLine("public static int ListCount<TElement>(List<TElement> list)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (list == null)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("throw new ArgumentNullException(nameof(list));");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("return list.Count;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();

        writer.AppendLine("public static TElement ListGetAt<TElement>(List<TElement> list, int index)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (list == null)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("throw new ArgumentNullException(nameof(list));");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("return list[index];");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();

        writer.AppendLine("public static Dictionary<TKey, TValue> DictionarySet<TKey, TValue>(Dictionary<TKey, TValue> dictionary, TKey key, TValue value)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (dictionary == null)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("throw new ArgumentNullException(nameof(dictionary));");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("dictionary[key] = value;");
        writer.AppendLine("return dictionary;");
        writer.Outdent();
        writer.AppendLine("}");

        writer.AppendLine();
        writer.AppendLine("public static TValue DictionaryGet<TKey, TValue>(Dictionary<TKey, TValue> dictionary, TKey key)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (dictionary == null)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("throw new ArgumentNullException(nameof(dictionary));");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("return dictionary[key];");
        writer.Outdent();
        writer.AppendLine("}");

        writer.AppendLine();
        writer.AppendLine("public static bool DictionaryContainsKey<TKey, TValue>(Dictionary<TKey, TValue> dictionary, TKey key)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (dictionary == null)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("throw new ArgumentNullException(nameof(dictionary));");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("return dictionary.ContainsKey(key);");
        writer.Outdent();
        writer.AppendLine("}");

        foreach (var signature in OverloadBindings["Arithmetic.Add"])
        {
            writer.AppendLine();
            writer.AppendLine($"public static {signature.TypeName} ArithmeticAdd({signature.TypeName} left, {signature.TypeName} right)");
            writer.AppendLine("{");
            writer.Indent();
            writer.AppendLine("return left + right;");
            writer.Outdent();
            writer.AppendLine("}");
        }

        foreach (var signature in OverloadBindings["Arithmetic.Subtract"])
        {
            writer.AppendLine();
            writer.AppendLine($"public static {signature.TypeName} ArithmeticSubtract({signature.TypeName} left, {signature.TypeName} right)");
            writer.AppendLine("{");
            writer.Indent();
            writer.AppendLine("return left - right;");
            writer.Outdent();
            writer.AppendLine("}");
        }

        foreach (var signature in OverloadBindings["Arithmetic.Multiply"])
        {
            writer.AppendLine();
            writer.AppendLine($"public static {signature.TypeName} ArithmeticMultiply({signature.TypeName} left, {signature.TypeName} right)");
            writer.AppendLine("{");
            writer.Indent();
            writer.AppendLine("return left * right;");
            writer.Outdent();
            writer.AppendLine("}");
        }

        foreach (var signature in OverloadBindings["Arithmetic.Divide"])
        {
            writer.AppendLine();
            writer.AppendLine($"public static {signature.TypeName} ArithmeticDivide({signature.TypeName} left, {signature.TypeName} right)");
            writer.AppendLine("{");
            writer.Indent();
            writer.AppendLine("return left / right;");
            writer.Outdent();
            writer.AppendLine("}");
        }

        foreach (var signature in OverloadBindings["Comparison.Equal"])
        {
            writer.AppendLine();
            writer.AppendLine($"public static bool ComparisonEqual({signature.TypeName} left, {signature.TypeName} right)");
            writer.AppendLine("{");
            writer.Indent();
            if (string.Equals(signature.TypeName, "string", StringComparison.Ordinal))
            {
                writer.AppendLine("return string.Equals(left, right, StringComparison.Ordinal);");
            }
            else
            {
                writer.AppendLine("return left == right;");
            }
            writer.Outdent();
            writer.AppendLine("}");
        }

        foreach (var signature in OverloadBindings["Comparison.NotEqual"])
        {
            writer.AppendLine();
            writer.AppendLine($"public static bool ComparisonNotEqual({signature.TypeName} left, {signature.TypeName} right)");
            writer.AppendLine("{");
            writer.Indent();
            if (string.Equals(signature.TypeName, "string", StringComparison.Ordinal))
            {
                writer.AppendLine("return !string.Equals(left, right, StringComparison.Ordinal);");
            }
            else
            {
                writer.AppendLine("return left != right;");
            }
            writer.Outdent();
            writer.AppendLine("}");
        }

        foreach (var signature in OverloadBindings["Comparison.GreaterThan"])
        {
            writer.AppendLine();
            writer.AppendLine($"public static bool ComparisonGreaterThan({signature.TypeName} left, {signature.TypeName} right)");
            writer.AppendLine("{");
            writer.Indent();
            writer.AppendLine("return left > right;");
            writer.Outdent();
            writer.AppendLine("}");
        }

        foreach (var signature in OverloadBindings["Comparison.LessThan"])
        {
            writer.AppendLine();
            writer.AppendLine($"public static bool ComparisonLessThan({signature.TypeName} left, {signature.TypeName} right)");
            writer.AppendLine("{");
            writer.Indent();
            writer.AppendLine("return left < right;");
            writer.Outdent();
            writer.AppendLine("}");
        }

        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        return writer.ToString();
    }

    private static string RenderNodeFile(LightyFlowChartNodeDefinition nodeDefinition)
    {
        var writer = new CodeWriter();
        writer.AppendLine("using System.Collections.Generic;");
        writer.AppendLine($"using {RootNamespace};");
        writer.AppendLine();
        writer.AppendLine($"namespace {BuildNodeNamespace(nodeDefinition)}");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine($"public partial class {BuildClassName(nodeDefinition)}{BuildGenericParameterList(nodeDefinition)}");
        writer.AppendLine("{");
        writer.Indent();

        if (nodeDefinition.CodegenBinding is not null
            && string.Equals(nodeDefinition.CodegenBinding.Provider, "standard", StringComparison.OrdinalIgnoreCase))
        {
            AppendStandardBindingMembers(writer, nodeDefinition);
        }

        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        return writer.ToString();
    }

    private static void AppendStandardBindingMembers(CodeWriter writer, LightyFlowChartNodeDefinition nodeDefinition)
    {
        if (nodeDefinition.CodegenBinding is null)
        {
            return;
        }

        if (nodeDefinition.CodegenBinding.ResolutionMode == LightyFlowChartCodegenResolutionMode.Generic)
        {
            AppendGenericBindingMember(writer, nodeDefinition, nodeDefinition.CodegenBinding.Operation);
            return;
        }

        if (nodeDefinition.CodegenBinding.ResolutionMode == LightyFlowChartCodegenResolutionMode.Overload)
        {
            AppendOverloadBindingMembers(writer, nodeDefinition, nodeDefinition.CodegenBinding.Operation);
        }
    }

    private static void AppendGenericBindingMember(CodeWriter writer, LightyFlowChartNodeDefinition nodeDefinition, string operation)
    {
        var helperMethodName = ResolveHelperMethodName(operation);
        if (helperMethodName is null)
        {
            return;
        }

        var inputPorts = nodeDefinition.ComputePorts
            .Where(port => port.Direction == LightyFlowChartPortDirection.Input)
            .ToList();
        var outputPort = nodeDefinition.ComputePorts.FirstOrDefault(port => port.Direction == LightyFlowChartPortDirection.Output);
        var returnType = outputPort is null ? "void" : MapToCSharpType(outputPort.Type);
        var methodName = nodeDefinition.NodeKind == LightyFlowChartNodeKind.Compute ? "Evaluate" : "Execute";

        writer.AppendLine($"public {returnType} {methodName}({BuildParameterList(inputPorts)})");
        writer.AppendLine("{");
        writer.Indent();
        var invocation = $"FlowChartStandardNodeBindingHelper.{helperMethodName}({BuildArgumentList(inputPorts)})";
        if (string.Equals(returnType, "void", StringComparison.Ordinal))
        {
            writer.AppendLine(invocation + ";");
        }
        else
        {
            writer.AppendLine("return " + invocation + ";");
        }
        writer.Outdent();
        writer.AppendLine("}");
    }

    private static void AppendOverloadBindingMembers(CodeWriter writer, LightyFlowChartNodeDefinition nodeDefinition, string operation)
    {
        if (!OverloadBindings.TryGetValue(operation, out var signatures))
        {
            return;
        }

        var helperMethodName = ResolveHelperMethodName(operation);
        if (helperMethodName is null)
        {
            return;
        }

        var inputPorts = nodeDefinition.ComputePorts
            .Where(port => port.Direction == LightyFlowChartPortDirection.Input)
            .ToList();
        var outputPort = nodeDefinition.ComputePorts.FirstOrDefault(port => port.Direction == LightyFlowChartPortDirection.Output);
        var methodName = nodeDefinition.NodeKind == LightyFlowChartNodeKind.Compute ? "Evaluate" : "Execute";

        for (var index = 0; index < signatures.Count; index += 1)
        {
            var signature = signatures[index];
            var returnType = outputPort is null
                ? "void"
                : outputPort.Type.Kind == LightyFlowChartTypeKind.Builtin
                    && string.Equals(outputPort.Type.Name, "bool", StringComparison.OrdinalIgnoreCase)
                    ? "bool"
                    : signature.TypeName;

            writer.AppendLine($"public {returnType} {methodName}({BuildParameterList(inputPorts, signature.TypeName)})");
            writer.AppendLine("{");
            writer.Indent();
            var invocation = $"FlowChartStandardNodeBindingHelper.{helperMethodName}({BuildArgumentList(inputPorts)})";
            if (string.Equals(returnType, "void", StringComparison.Ordinal))
            {
                writer.AppendLine(invocation + ";");
            }
            else
            {
                writer.AppendLine("return " + invocation + ";");
            }
            writer.Outdent();
            writer.AppendLine("}");

            if (index < signatures.Count - 1)
            {
                writer.AppendLine();
            }
        }
    }

    private static string BuildNodeNamespace(LightyFlowChartNodeDefinition nodeDefinition)
    {
        var segments = nodeDefinition.RelativePath.Split('/');
        var namespaceSegments = segments.Take(Math.Max(segments.Length - 1, 0)).Select(ToTypeIdentifier);
        var suffix = string.Join('.', namespaceSegments);
        return string.IsNullOrWhiteSpace(suffix)
            ? $"{RootNamespace}.Nodes"
            : $"{RootNamespace}.Nodes.{suffix}";
    }

    private static string BuildClassName(LightyFlowChartNodeDefinition nodeDefinition)
    {
        return ToTypeIdentifier(nodeDefinition.Name) + "Node";
    }

    private static string BuildGenericParameterList(LightyFlowChartNodeDefinition nodeDefinition)
    {
        if (nodeDefinition.TypeParameters.Count == 0)
        {
            return string.Empty;
        }

        return "<" + string.Join(", ", nodeDefinition.TypeParameters.Select(parameter => parameter.Name)) + ">";
    }

    private static string BuildParameterList(IReadOnlyList<LightyFlowChartComputePortDefinition> inputPorts, string? overrideTypeName = null)
    {
        return string.Join(", ", inputPorts.Select(port => $"{overrideTypeName ?? MapToCSharpType(port.Type)} {ToParameterIdentifier(port.Name)}"));
    }

    private static string BuildArgumentList(IReadOnlyList<LightyFlowChartComputePortDefinition> inputPorts)
    {
        return string.Join(", ", inputPorts.Select(port => ToParameterIdentifier(port.Name)));
    }

    private static string? ResolveHelperMethodName(string operation)
    {
        return operation switch
        {
            "List.Add" => "ListAdd",
            "List.Count" => "ListCount",
            "List.GetAt" => "ListGetAt",
            "Dictionary.Set" => "DictionarySet",
            "Dictionary.Get" => "DictionaryGet",
            "Dictionary.ContainsKey" => "DictionaryContainsKey",
            "Arithmetic.Add" => "ArithmeticAdd",
            "Arithmetic.Subtract" => "ArithmeticSubtract",
            "Arithmetic.Multiply" => "ArithmeticMultiply",
            "Arithmetic.Divide" => "ArithmeticDivide",
            "Comparison.Equal" => "ComparisonEqual",
            "Comparison.NotEqual" => "ComparisonNotEqual",
            "Comparison.GreaterThan" => "ComparisonGreaterThan",
            "Comparison.LessThan" => "ComparisonLessThan",
            _ => null,
        };
    }

    private static string MapToCSharpType(LightyFlowChartTypeRef typeRef)
    {
        return typeRef.Kind switch
        {
            LightyFlowChartTypeKind.Builtin => typeRef.Name?.ToLowerInvariant() switch
            {
                "bool" => "bool",
                "int32" => "int",
                "uint32" => "uint",
                "int64" => "long",
                "uint64" => "ulong",
                "float" => "float",
                "double" => "double",
                "string" => "string",
                _ => throw new LightyCoreException($"Unsupported FlowChart builtin type '{typeRef.Name}'."),
            },
            LightyFlowChartTypeKind.Custom => !string.IsNullOrWhiteSpace(typeRef.FullName)
                ? typeRef.FullName!
                : typeRef.Name ?? throw new LightyCoreException("FlowChart custom type is missing its name."),
            LightyFlowChartTypeKind.List => $"List<{MapToCSharpType(typeRef.ElementType ?? throw new LightyCoreException("FlowChart list type is missing its element type."))}>",
            LightyFlowChartTypeKind.Dictionary => $"Dictionary<{MapToCSharpType(typeRef.KeyType ?? throw new LightyCoreException("FlowChart dictionary type is missing its key type."))}, {MapToCSharpType(typeRef.ValueType ?? throw new LightyCoreException("FlowChart dictionary type is missing its value type."))}>",
            LightyFlowChartTypeKind.TypeParameter => typeRef.Name ?? throw new LightyCoreException("FlowChart type parameter reference is missing its name."),
            _ => throw new ArgumentOutOfRangeException(nameof(typeRef.Kind)),
        };
    }

    private static string ToTypeIdentifier(string value)
    {
        if (IsSimpleIdentifier(value))
        {
            return CSharpKeywords.Contains(value) ? $"@{value}" : value;
        }

        var tokens = TokenizeIdentifier(value);
        if (tokens.Count == 0)
        {
            return "GeneratedType";
        }

        var builder = new StringBuilder();
        foreach (var token in tokens)
        {
            builder.Append(char.ToUpperInvariant(token[0]));
            if (token.Length > 1)
            {
                builder.Append(token[1..]);
            }
        }

        var candidate = builder.ToString();
        if (char.IsDigit(candidate[0]))
        {
            candidate = "_" + candidate;
        }

        return CSharpKeywords.Contains(candidate) ? $"@{candidate}" : candidate;
    }

    private static string ToParameterIdentifier(string value)
    {
        var propertyIdentifier = ToTypeIdentifier(value);
        var baseIdentifier = propertyIdentifier.StartsWith('@') ? propertyIdentifier[1..] : propertyIdentifier;
        var candidate = baseIdentifier.All(character => !char.IsLetter(character) || char.IsUpper(character))
            ? baseIdentifier.ToLowerInvariant()
            : char.ToLowerInvariant(baseIdentifier[0]) + baseIdentifier[1..];
        return CSharpKeywords.Contains(candidate) ? $"@{candidate}" : candidate;
    }

    private static IReadOnlyList<string> TokenizeIdentifier(string value)
    {
        var tokens = new List<string>();
        var current = new StringBuilder();

        foreach (var character in value)
        {
            if (char.IsLetterOrDigit(character) || character == '_')
            {
                current.Append(character);
                continue;
            }

            if (current.Length > 0)
            {
                tokens.Add(current.ToString());
                current.Clear();
            }
        }

        if (current.Length > 0)
        {
            tokens.Add(current.ToString());
        }

        return tokens;
    }

    private static bool IsSimpleIdentifier(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var trimmed = value.Trim();
        if (!(char.IsLetter(trimmed[0]) || trimmed[0] == '_'))
        {
            return false;
        }

        return trimmed.All(character => char.IsLetterOrDigit(character) || character == '_');
    }

    private sealed record OverloadSignature(string TypeName);

    private sealed class CodeWriter
    {
        private readonly StringBuilder _builder = new();
        private int _indentLevel;

        public void Indent()
        {
            _indentLevel += 1;
        }

        public void Outdent()
        {
            _indentLevel = Math.Max(0, _indentLevel - 1);
        }

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

        public override string ToString()
        {
            return _builder.ToString();
        }
    }
}