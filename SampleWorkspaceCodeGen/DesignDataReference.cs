using System;
using System.Collections.Generic;
using System.Globalization;

namespace LightyDesignData;

public sealed class DesignDataReference<TTarget>
{
    private readonly IReadOnlyList<string> _identifiers;
    private readonly Func<IReadOnlyList<string>, TTarget> _resolver;

    public DesignDataReference(string workbookName, string sheetName, Func<IReadOnlyList<string>, TTarget> resolver, params string[] identifiers)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workbookName);
        ArgumentException.ThrowIfNullOrWhiteSpace(sheetName);
        ArgumentNullException.ThrowIfNull(resolver);
        ArgumentNullException.ThrowIfNull(identifiers);

        WorkbookName = workbookName;
        SheetName = sheetName;
        _resolver = resolver;
        _identifiers = Array.AsReadOnly(identifiers);
    }

    public string WorkbookName { get; }
    public string SheetName { get; }
    public IReadOnlyList<string> Identifiers => _identifiers;

    public TTarget GetValue() => _resolver(_identifiers);
}

internal static class DesignDataReferenceHelper
{
    public static int ParseInt32(string value) => int.Parse(value, NumberStyles.Integer, CultureInfo.InvariantCulture);
    public static long ParseInt64(string value) => long.Parse(value, NumberStyles.Integer, CultureInfo.InvariantCulture);
    public static float ParseSingle(string value) => float.Parse(value, NumberStyles.Float | NumberStyles.AllowThousands, CultureInfo.InvariantCulture);
    public static double ParseDouble(string value) => double.Parse(value, NumberStyles.Float | NumberStyles.AllowThousands, CultureInfo.InvariantCulture);
    public static bool ParseBoolean(string value)
    {
        return value.Trim() switch
        {
            "1" => true,
            "0" => false,
            _ => bool.Parse(value),
        };
    }
}
