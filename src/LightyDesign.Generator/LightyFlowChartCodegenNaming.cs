using System.Text;

namespace LightyDesign.Generator;

internal static class LightyFlowChartCodegenNaming
{
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

    public static string ToTypeIdentifier(string value)
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
            candidate = $"_{candidate}";
        }

        return CSharpKeywords.Contains(candidate) ? $"@{candidate}" : candidate;
    }

    public static string GetFlowChartLeafTypeIdentifier(string relativePath)
    {
        var normalized = relativePath.Replace('\\', '/').Trim('/');
        var leaf = normalized.Split('/').LastOrDefault();
        return ToTypeIdentifier(string.IsNullOrWhiteSpace(leaf) ? normalized : leaf!);
    }

    public static string BuildLddFlowChartPropertyName(string relativePath)
    {
        var tokens = relativePath
            .Replace('\\', '/')
            .Split('/')
            .Where(segment => !string.IsNullOrWhiteSpace(segment))
            .Select(ToTypeIdentifier);
        return "FlowChart" + string.Join(string.Empty, tokens);
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
}