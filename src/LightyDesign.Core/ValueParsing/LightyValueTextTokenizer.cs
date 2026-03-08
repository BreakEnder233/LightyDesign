using System.Text;

namespace LightyDesign.Core;

internal static class LightyValueTextTokenizer
{
    public static IReadOnlyList<string> SplitTopLevel(string text, char separator = ',')
    {
        ArgumentNullException.ThrowIfNull(text);

        if (string.IsNullOrWhiteSpace(text))
        {
            return Array.Empty<string>();
        }

        var items = new List<string>();
        var startIndex = 0;
        var inQuotes = false;
        var braceDepth = 0;
        var referenceDepth = 0;

        for (var index = 0; index < text.Length; index++)
        {
            var character = text[index];

            if (character == '"')
            {
                if (inQuotes && index + 1 < text.Length && text[index + 1] == '"')
                {
                    index++;
                    continue;
                }

                inQuotes = !inQuotes;
                continue;
            }

            if (inQuotes)
            {
                continue;
            }

            if (character == '{')
            {
                braceDepth++;
                continue;
            }

            if (character == '}')
            {
                braceDepth--;
                continue;
            }

            if (character == '[' && index + 1 < text.Length && text[index + 1] == '[')
            {
                referenceDepth++;
                index++;
                continue;
            }

            if (character == ']' && index + 1 < text.Length && text[index + 1] == ']')
            {
                referenceDepth--;
                index++;
                continue;
            }

            if (character == separator && braceDepth == 0 && referenceDepth == 0)
            {
                items.Add(text[startIndex..index].Trim());
                startIndex = index + 1;
            }
        }

        items.Add(text[startIndex..].Trim());
        return items.Where(item => item.Length > 0).ToList().AsReadOnly();
    }

    public static string ParseStringLiteral(string text)
    {
        ArgumentNullException.ThrowIfNull(text);

        var trimmed = text.Trim();
        if (trimmed.Length >= 2 && trimmed[0] == '"' && trimmed[^1] == '"')
        {
            var inner = trimmed[1..^1];
            return inner.Replace("\"\"", "\"");
        }

        return trimmed;
    }

    public static string RemoveWrappingBraces(string text)
    {
        ArgumentNullException.ThrowIfNull(text);

        var trimmed = text.Trim();
        if (trimmed.Length >= 2 && trimmed[0] == '{' && trimmed[^1] == '}')
        {
            return trimmed[1..^1].Trim();
        }

        throw new LightyTextFormatException($"Dictionary entry must be wrapped in braces: '{text}'.");
    }
}