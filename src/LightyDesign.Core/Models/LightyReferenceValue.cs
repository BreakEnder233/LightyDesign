namespace LightyDesign.Core;

public sealed class LightyReferenceValue
{
    private const string Prefix = "[[";
    private const string Suffix = "]]";
    private readonly IReadOnlyList<string> _identifiers;

    private LightyReferenceValue(string rawText, IEnumerable<string> identifiers)
    {
        RawText = rawText;
        _identifiers = identifiers.ToList().AsReadOnly();
    }

    public string RawText { get; }

    public IReadOnlyList<string> Identifiers => _identifiers;

    public bool IsComposite => _identifiers.Count > 1;

    public static LightyReferenceValue Parse(string value)
    {
        if (!TryParse(value, out var referenceValue))
        {
            throw new LightyReferenceFormatException($"Invalid Lighty reference value: '{value}'.");
        }

        return referenceValue!;
    }

    public static bool TryParse(string? value, out LightyReferenceValue? referenceValue)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            referenceValue = null;
            return false;
        }

        var trimmed = value.Trim();

        if (!trimmed.StartsWith(Prefix, StringComparison.Ordinal) || !trimmed.EndsWith(Suffix, StringComparison.Ordinal))
        {
            referenceValue = null;
            return false;
        }

        var content = trimmed[Prefix.Length..^Suffix.Length].Trim();
        if (content.Length == 0)
        {
            referenceValue = null;
            return false;
        }

        var identifiers = content
            .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .ToList();

        if (identifiers.Count == 0)
        {
            referenceValue = null;
            return false;
        }

        referenceValue = new LightyReferenceValue(trimmed, identifiers);
        return true;
    }
}