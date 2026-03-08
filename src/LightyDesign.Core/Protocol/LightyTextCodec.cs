using System.Text;

namespace LightyDesign.Core;

public static class LightyTextCodec
{
    public const string AmpersandToken = "&&a&&";
    public const string TabToken = "&&t&&";
    public const string NewLineToken = "&&n&&";

    public static string Encode(string value)
    {
        ArgumentNullException.ThrowIfNull(value);

        var builder = new StringBuilder(value.Length);

        for (var index = 0; index < value.Length; index++)
        {
            var character = value[index];

            switch (character)
            {
                case '&':
                    builder.Append(AmpersandToken);
                    break;
                case '\t':
                    builder.Append(TabToken);
                    break;
                case '\r' when index + 1 < value.Length && value[index + 1] == '\n':
                    builder.Append(NewLineToken);
                    index++;
                    break;
                case '\r':
                case '\n':
                    builder.Append(NewLineToken);
                    break;
                default:
                    builder.Append(character);
                    break;
            }
        }

        return builder.ToString();
    }

    public static string Decode(string value)
    {
        ArgumentNullException.ThrowIfNull(value);

        var builder = new StringBuilder(value.Length);

        for (var index = 0; index < value.Length; index++)
        {
            if (TryReadToken(value, index, AmpersandToken, '&', out var consumedLength) ||
                TryReadToken(value, index, TabToken, '\t', out consumedLength) ||
                TryReadToken(value, index, NewLineToken, '\n', out consumedLength))
            {
                builder.Append(consumedLength.DecodedCharacter);
                index += consumedLength.Length - 1;
                continue;
            }

            builder.Append(value[index]);
        }

        return builder.ToString();
    }

    public static IReadOnlyList<string> SplitLines(string content)
    {
        ArgumentNullException.ThrowIfNull(content);

        if (content.Length == 0)
        {
            return Array.Empty<string>();
        }

        var lines = new List<string>();
        var lineStart = 0;

        for (var index = 0; index < content.Length; index++)
        {
            var character = content[index];

            if (character != '\r' && character != '\n')
            {
                continue;
            }

            lines.Add(content[lineStart..index]);

            if (character == '\r' && index + 1 < content.Length && content[index + 1] == '\n')
            {
                index++;
            }

            lineStart = index + 1;
        }

        if (lineStart < content.Length)
        {
            lines.Add(content[lineStart..]);
        }

        return lines.AsReadOnly();
    }

    public static IReadOnlyList<string> SplitFields(string line)
    {
        ArgumentNullException.ThrowIfNull(line);

        return line.Split('\t').ToList().AsReadOnly();
    }

    private static bool TryReadToken(string value, int index, string token, char decodedCharacter, out TokenReadResult result)
    {
        if (index + token.Length > value.Length)
        {
            result = default;
            return false;
        }

        if (!value.AsSpan(index, token.Length).SequenceEqual(token))
        {
            result = default;
            return false;
        }

        result = new TokenReadResult(token.Length, decodedCharacter);
        return true;
    }

    private readonly record struct TokenReadResult(int Length, char DecodedCharacter);
}