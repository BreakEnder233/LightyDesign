using System.Globalization;

namespace LightyDesign.Core;

public sealed class DefaultLightyValueParser : ILightyValueParser
{
    public static DefaultLightyValueParser Instance { get; } = new();

    private DefaultLightyValueParser()
    {
    }

    public LightyValueParseResult Parse(ColumnDefine column, string rawText, LightyValueParseContext context)
    {
        ArgumentNullException.ThrowIfNull(column);
        ArgumentNullException.ThrowIfNull(rawText);
        ArgumentNullException.ThrowIfNull(context);

        try
        {
            var value = ParseValue(column.TypeDescriptor, rawText);
            return LightyValueParseResult.Success(value, rawText, column.Type);
        }
        catch (Exception exception) when (exception is FormatException or InvalidOperationException or LightyCoreException)
        {
            return LightyValueParseResult.Failure(rawText, column.Type, $"{context.FormatPrefix()}: {exception.Message}");
        }
    }

    private static object? ParseValue(LightyColumnTypeDescriptor typeDescriptor, string rawText)
    {
        if (typeDescriptor.IsList)
        {
            return ParseList(typeDescriptor.ValueType, rawText);
        }

        if (typeDescriptor.IsDictionary)
        {
            return ParseDictionary(typeDescriptor.DictionaryKeyType!, typeDescriptor.DictionaryValueType!, rawText);
        }

        if (typeDescriptor.IsReference)
        {
            return LightyReferenceValue.Parse(rawText);
        }

        return ParseScalar(typeDescriptor.RawType, rawText);
    }

    private static IReadOnlyList<object?> ParseList(string elementType, string rawText)
    {
        var items = LightyValueTextTokenizer.SplitTopLevel(rawText);
        var results = new List<object?>(items.Count);

        foreach (var item in items)
        {
            results.Add(ParseValue(LightyColumnTypeDescriptor.Parse(elementType), item));
        }

        return results.AsReadOnly();
    }

    private static IReadOnlyDictionary<object, object?> ParseDictionary(string keyType, string valueType, string rawText)
    {
        var items = LightyValueTextTokenizer.SplitTopLevel(rawText);
        var results = new Dictionary<object, object?>();

        foreach (var item in items)
        {
            var content = LightyValueTextTokenizer.RemoveWrappingBraces(item);
            var pair = LightyValueTextTokenizer.SplitTopLevel(content);
            if (pair.Count != 2)
            {
                throw new FormatException($"Invalid dictionary entry: '{item}'.");
            }

            var parsedKey = ParseValue(LightyColumnTypeDescriptor.Parse(keyType), pair[0]);
                
            if (parsedKey is null)
            {
                throw new FormatException($"Dictionary key cannot be null: '{item}'.");
            }

            var parsedValue = ParseValue(LightyColumnTypeDescriptor.Parse(valueType), pair[1]);
            results[parsedKey] = parsedValue;
        }

        return results;
    }

    private static object ParseScalar(string typeName, string rawText)
    {
        return typeName switch
        {
            "string" or "LocalString" => LightyValueTextTokenizer.ParseStringLiteral(rawText),
            "int" => ParseInt32(rawText),
            "long" => ParseInt64(rawText),
            "float" => ParseSingle(rawText),
            "double" => ParseDouble(rawText),
            "bool" => ParseBoolean(rawText),
            _ => throw new FormatException($"Unsupported scalar type '{typeName}'.")
        };
    }

    private static int ParseInt32(string rawText)
    {
        if (int.TryParse(rawText.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var value))
        {
            return value;
        }

        throw new FormatException($"Value '{rawText}' is not a valid int.");
    }

    private static long ParseInt64(string rawText)
    {
        if (long.TryParse(rawText.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var value))
        {
            return value;
        }

        throw new FormatException($"Value '{rawText}' is not a valid long.");
    }

    private static float ParseSingle(string rawText)
    {
        if (float.TryParse(rawText.Trim(), NumberStyles.Float | NumberStyles.AllowThousands, CultureInfo.InvariantCulture, out var value))
        {
            return value;
        }

        throw new FormatException($"Value '{rawText}' is not a valid float.");
    }

    private static double ParseDouble(string rawText)
    {
        if (double.TryParse(rawText.Trim(), NumberStyles.Float | NumberStyles.AllowThousands, CultureInfo.InvariantCulture, out var value))
        {
            return value;
        }

        throw new FormatException($"Value '{rawText}' is not a valid double.");
    }

    private static bool ParseBoolean(string rawText)
    {
        var trimmed = rawText.Trim();
        if (bool.TryParse(trimmed, out var booleanValue))
        {
            return booleanValue;
        }

        return trimmed switch
        {
            "0" => false,
            "1" => true,
            _ => throw new FormatException($"Value '{rawText}' is not a valid bool.")
        };
    }
}