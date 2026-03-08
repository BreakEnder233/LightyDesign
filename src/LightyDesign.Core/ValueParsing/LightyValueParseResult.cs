namespace LightyDesign.Core;

public sealed class LightyValueParseResult
{
    private LightyValueParseResult(bool isSuccess, object? value, string rawText, string declaredType, string? errorMessage)
    {
        IsSuccess = isSuccess;
        Value = value;
        RawText = rawText;
        DeclaredType = declaredType;
        ErrorMessage = errorMessage;
    }

    public bool IsSuccess { get; }

    public object? Value { get; }

    public string RawText { get; }

    public string DeclaredType { get; }

    public string? ErrorMessage { get; }

    public static LightyValueParseResult Success(object? value, string rawText, string declaredType)
    {
        return new LightyValueParseResult(true, value, rawText, declaredType, null);
    }

    public static LightyValueParseResult Failure(string rawText, string declaredType, string errorMessage)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(errorMessage);
        return new LightyValueParseResult(false, null, rawText, declaredType, errorMessage);
    }

    public bool TryGetValue<T>(out T? value)
    {
        if (Value is T typedValue)
        {
            value = typedValue;
            return true;
        }

        value = default;
        return false;
    }
}