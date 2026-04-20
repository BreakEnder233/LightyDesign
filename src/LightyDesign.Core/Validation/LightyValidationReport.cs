namespace LightyDesign.Core;

public sealed class LightyValidationReport
{
    private readonly IReadOnlyList<LightyValidationDiagnostic> _diagnostics;

    public LightyValidationReport(IEnumerable<LightyValidationDiagnostic> diagnostics)
    {
        ArgumentNullException.ThrowIfNull(diagnostics);

        _diagnostics = diagnostics.ToList().AsReadOnly();
    }

    public IReadOnlyList<LightyValidationDiagnostic> Diagnostics => _diagnostics;

    public int ErrorCount => _diagnostics.Count;

    public bool IsSuccess => _diagnostics.Count == 0;

    public string ToDisplayString()
    {
        if (IsSuccess)
        {
            return "Validation passed.";
        }

        return string.Join(Environment.NewLine, _diagnostics.Select(diagnostic => diagnostic.FormatMessage()));
    }
}