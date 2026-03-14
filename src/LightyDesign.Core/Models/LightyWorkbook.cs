namespace LightyDesign.Core;

public sealed class LightyWorkbook
{
    private readonly IReadOnlyList<LightySheet> _sheets;

    public LightyWorkbook(
        string name,
        string directoryPath,
        IEnumerable<LightySheet> sheets,
        LightyWorkbookCodegenOptions? codegenOptions = null,
        string? codegenConfigFilePath = null)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("Workbook name cannot be null or whitespace.", nameof(name));
        }

        if (string.IsNullOrWhiteSpace(directoryPath))
        {
            throw new ArgumentException("Directory path cannot be null or whitespace.", nameof(directoryPath));
        }

        ArgumentNullException.ThrowIfNull(sheets);

        Name = name;
        DirectoryPath = directoryPath;
        _sheets = sheets.ToList().AsReadOnly();
        CodegenOptions = codegenOptions ?? new LightyWorkbookCodegenOptions();
        CodegenConfigFilePath = string.IsNullOrWhiteSpace(codegenConfigFilePath)
            ? Path.Combine(directoryPath, LightyWorkbookCodegenOptionsSerializer.DefaultFileName)
            : codegenConfigFilePath;
    }

    public string Name { get; }

    public string DirectoryPath { get; }

    public string CodegenConfigFilePath { get; }

    public LightyWorkbookCodegenOptions CodegenOptions { get; }

    public IReadOnlyList<LightySheet> Sheets => _sheets;

    public bool TryGetSheet(string sheetName, out LightySheet? sheet)
    {
        ArgumentException.ThrowIfNullOrEmpty(sheetName);

        sheet = _sheets.FirstOrDefault(candidate => string.Equals(candidate.Name, sheetName, StringComparison.Ordinal));
        return sheet is not null;
    }
}