namespace LightyDesign.Core;

public sealed class LightyColumnTypeDescriptor
{
    private const string ListPrefix = "List<";
    private const string RefPrefix = "Ref:";

    private LightyColumnTypeDescriptor(
        string rawType,
        string valueType,
        bool isList,
        LightyReferenceTarget? referenceTarget)
    {
        RawType = rawType;
        ValueType = valueType;
        IsList = isList;
        ReferenceTarget = referenceTarget;
    }

    public string RawType { get; }

    public string ValueType { get; }

    public bool IsList { get; }

    public bool IsReference => ReferenceTarget is not null;

    public LightyReferenceTarget? ReferenceTarget { get; }

    public static LightyColumnTypeDescriptor Parse(string type)
    {
        if (string.IsNullOrWhiteSpace(type))
        {
            throw new ArgumentException("Type cannot be null or whitespace.", nameof(type));
        }

        var trimmedType = type.Trim();
        var isList = TryUnwrapList(trimmedType, out var valueType);
        var referenceTarget = TryParseReferenceTarget(valueType, out var target)
            ? target
            : null;

        return new LightyColumnTypeDescriptor(trimmedType, valueType, isList, referenceTarget);
    }

    private static bool TryUnwrapList(string type, out string valueType)
    {
        if (type.StartsWith(ListPrefix, StringComparison.Ordinal) && type.EndsWith('>'))
        {
            valueType = type[ListPrefix.Length..^1].Trim();
            return true;
        }

        valueType = type;
        return false;
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
}