namespace LightyDesign.Core;

public sealed class LightyColumnTypeDescriptor
{
    private const string RefPrefix = "Ref:";

    private LightyColumnTypeDescriptor(
        string rawType,
        string typeName,
        IReadOnlyList<string> genericArguments,
        string valueType,
        bool isList,
        bool isDictionary,
        LightyReferenceTarget? referenceTarget)
    {
        RawType = rawType;
        TypeName = typeName;
        GenericArguments = genericArguments;
        ValueType = valueType;
        IsList = isList;
        IsDictionary = isDictionary;
        ReferenceTarget = referenceTarget;
    }

    public string RawType { get; }

    public string TypeName { get; }

    public IReadOnlyList<string> GenericArguments { get; }

    public string ValueType { get; }

    public bool IsList { get; }

    public bool IsDictionary { get; }

    public bool IsReference => ReferenceTarget is not null;

    public string? DictionaryKeyType => IsDictionary ? GenericArguments[0] : null;

    public string? DictionaryValueType => IsDictionary ? GenericArguments[1] : null;

    public LightyReferenceTarget? ReferenceTarget { get; }

    public static LightyColumnTypeDescriptor Parse(string type)
    {
        if (string.IsNullOrWhiteSpace(type))
        {
            throw new ArgumentException("Type cannot be null or whitespace.", nameof(type));
        }

        var trimmedType = type.Trim();
        var (typeName, genericArguments) = ParseTypeShape(trimmedType);
        var isList = string.Equals(typeName, "List", StringComparison.Ordinal) && genericArguments.Count == 1;
        var isDictionary = string.Equals(typeName, "Dictionary", StringComparison.Ordinal) && genericArguments.Count == 2;
        var valueType = isList ? genericArguments[0] : trimmedType;
        var referenceTarget = TryParseReferenceTarget(valueType, out var target)
            ? target
            : null;

        return new LightyColumnTypeDescriptor(trimmedType, typeName, genericArguments, valueType, isList, isDictionary, referenceTarget);
    }

    private static (string TypeName, IReadOnlyList<string> GenericArguments) ParseTypeShape(string type)
    {
        var openBracketIndex = type.IndexOf('<');
        if (openBracketIndex < 0 || !type.EndsWith('>'))
        {
            return (type, Array.Empty<string>());
        }

        var typeName = type[..openBracketIndex].Trim();
        var argumentsText = type[(openBracketIndex + 1)..^1];
        var arguments = SplitTopLevel(argumentsText).ToList().AsReadOnly();

        return (typeName, arguments);
    }

    private static bool TryParseReferenceTarget(string valueType, out LightyReferenceTarget? target)
    {
        if (!valueType.StartsWith(RefPrefix, StringComparison.Ordinal))
        {
            target = null;
            return false;
        }

        var qualifiedName = valueType[RefPrefix.Length..].Trim();
        var separatorIndex = qualifiedName.IndexOf('.');
        if (separatorIndex <= 0 || separatorIndex >= qualifiedName.Length - 1)
        {
            target = null;
            return false;
        }

        var workbookName = qualifiedName[..separatorIndex].Trim();
        var sheetName = qualifiedName[(separatorIndex + 1)..].Trim();

        if (workbookName.Length == 0 || sheetName.Length == 0)
        {
            target = null;
            return false;
        }

        target = new LightyReferenceTarget(workbookName, sheetName);
        return true;
    }

    private static IEnumerable<string> SplitTopLevel(string text)
    {
        var depth = 0;
        var segmentStart = 0;

        for (var index = 0; index < text.Length; index++)
        {
            var character = text[index];
            if (character == '<')
            {
                depth++;
                continue;
            }

            if (character == '>')
            {
                depth--;
                continue;
            }

            if (character == ',' && depth == 0)
            {
                yield return text[segmentStart..index].Trim();
                segmentStart = index + 1;
            }
        }

        yield return text[segmentStart..].Trim();
    }
}