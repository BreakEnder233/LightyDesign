namespace LightyDesign.Core;

public sealed class LightyWorkspace
{
    private readonly IReadOnlyList<LightyWorkbook> _workbooks;
    private readonly IReadOnlyList<LightyFlowChartAssetDocument> _flowChartNodeDefinitions;
    private readonly IReadOnlyList<LightyFlowChartAssetDocument> _flowChartFiles;

    public LightyWorkspace(
        string rootPath,
        string configFilePath,
        string headersFilePath,
        WorkspaceHeaderLayout headerLayout,
        IEnumerable<LightyWorkbook> workbooks,
        LightyWorkbookCodegenOptions? codegenOptions = null,
        string? codegenConfigFilePath = null,
        IEnumerable<LightyFlowChartAssetDocument>? flowChartNodeDefinitions = null,
        IEnumerable<LightyFlowChartAssetDocument>? flowChartFiles = null)
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

        var resolvedWorkbooks = workbooks.ToList().AsReadOnly();
        var resolvedFlowChartNodeDefinitions = (flowChartNodeDefinitions ?? Array.Empty<LightyFlowChartAssetDocument>()).ToList().AsReadOnly();
        var resolvedFlowChartFiles = (flowChartFiles ?? Array.Empty<LightyFlowChartAssetDocument>()).ToList().AsReadOnly();

        RootPath = rootPath;
        ConfigFilePath = configFilePath;
        HeadersFilePath = headersFilePath;
        HeaderLayout = headerLayout;
        WorkbooksRootPath = LightyWorkspacePathLayout.GetWorkbooksRootPath(rootPath);
        FlowChartsRootPath = LightyWorkspacePathLayout.GetFlowChartsRootPath(rootPath);
        FlowChartNodesRootPath = LightyWorkspacePathLayout.GetFlowChartNodesRootPath(rootPath);
        FlowChartFilesRootPath = LightyWorkspacePathLayout.GetFlowChartFilesRootPath(rootPath);
        _workbooks = resolvedWorkbooks;
        _flowChartNodeDefinitions = resolvedFlowChartNodeDefinitions;
        _flowChartFiles = resolvedFlowChartFiles;
        CodegenOptions = codegenOptions ?? resolvedWorkbooks.FirstOrDefault()?.CodegenOptions ?? new LightyWorkbookCodegenOptions();
        CodegenConfigFilePath = string.IsNullOrWhiteSpace(codegenConfigFilePath)
            ? Path.Combine(rootPath, LightyWorkbookCodegenOptionsSerializer.DefaultFileName)
            : codegenConfigFilePath;
    }

    public string RootPath { get; }

    public string ConfigFilePath { get; }

    public string HeadersFilePath { get; }

    public WorkspaceHeaderLayout HeaderLayout { get; }

    public string WorkbooksRootPath { get; }

    public string FlowChartsRootPath { get; }

    public string FlowChartNodesRootPath { get; }

    public string FlowChartFilesRootPath { get; }

    public string CodegenConfigFilePath { get; }

    public LightyWorkbookCodegenOptions CodegenOptions { get; }

    public IReadOnlyList<LightyWorkbook> Workbooks => _workbooks;

    public IReadOnlyList<LightyFlowChartAssetDocument> FlowChartNodeDefinitions => _flowChartNodeDefinitions;

    public IReadOnlyList<LightyFlowChartAssetDocument> FlowChartFiles => _flowChartFiles;

    public bool TryGetWorkbook(string workbookName, out LightyWorkbook? workbook)
    {
        ArgumentException.ThrowIfNullOrEmpty(workbookName);

        workbook = _workbooks.FirstOrDefault(candidate => string.Equals(candidate.Name, workbookName, StringComparison.Ordinal));
        return workbook is not null;
    }

    public bool TryGetFlowChartNodeDefinition(string relativePath, out LightyFlowChartAssetDocument? document)
    {
        var normalizedRelativePath = LightyWorkspacePathLayout.NormalizeRelativeAssetPath(relativePath);
        document = _flowChartNodeDefinitions.FirstOrDefault(candidate => string.Equals(candidate.RelativePath, normalizedRelativePath, StringComparison.Ordinal));
        return document is not null;
    }

    public bool TryGetFlowChartFile(string relativePath, out LightyFlowChartAssetDocument? document)
    {
        var normalizedRelativePath = LightyWorkspacePathLayout.NormalizeRelativeAssetPath(relativePath);
        document = _flowChartFiles.FirstOrDefault(candidate => string.Equals(candidate.RelativePath, normalizedRelativePath, StringComparison.Ordinal));
        return document is not null;
    }
}
