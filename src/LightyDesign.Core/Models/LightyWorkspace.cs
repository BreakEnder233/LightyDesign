namespace LightyDesign.Core;

public sealed class LightyWorkspace
{
    private readonly IReadOnlyList<LightyWorkbook> _workbooks;

    public LightyWorkspace(
        string rootPath,
        string configFilePath,
        string headersFilePath,
        WorkspaceHeaderLayout headerLayout,
        IEnumerable<LightyWorkbook> workbooks)
    {
        if (string.IsNullOrWhiteSpace(rootPath))
        {
            throw new ArgumentException("Root path cannot be null or whitespace.", nameof(rootPath));
        }

        if (string.IsNullOrWhiteSpace(configFilePath))
        {
            throw new ArgumentException("Config file path cannot be null or whitespace.", nameof(configFilePath));
        }

        if (string.IsNullOrWhiteSpace(headersFilePath))
        {
            throw new ArgumentException("Headers file path cannot be null or whitespace.", nameof(headersFilePath));
        }

        ArgumentNullException.ThrowIfNull(headerLayout);
        ArgumentNullException.ThrowIfNull(workbooks);

        RootPath = rootPath;
        ConfigFilePath = configFilePath;
        HeadersFilePath = headersFilePath;
        HeaderLayout = headerLayout;
        _workbooks = workbooks.ToList().AsReadOnly();
    }

    public string RootPath { get; }

    public string ConfigFilePath { get; }

    public string HeadersFilePath { get; }

    public WorkspaceHeaderLayout HeaderLayout { get; }

    public IReadOnlyList<LightyWorkbook> Workbooks => _workbooks;

    public bool TryGetWorkbook(string workbookName, out LightyWorkbook? workbook)
    {
        ArgumentException.ThrowIfNullOrEmpty(workbookName);

        workbook = _workbooks.FirstOrDefault(candidate => string.Equals(candidate.Name, workbookName, StringComparison.Ordinal));
        return workbook is not null;
    }
}