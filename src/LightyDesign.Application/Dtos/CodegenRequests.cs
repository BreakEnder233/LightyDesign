namespace LightyDesign.Application.Dtos;

// ── 代码导出请求 ──

public sealed class ExportWorkbookCodegenRequestDto
{
    public string WorkspacePath { get; set; } = string.Empty;
    public string WorkbookName { get; set; } = string.Empty;
}

public sealed class ExportAllWorkbookCodegenRequestDto
{
    public string WorkspacePath { get; set; } = string.Empty;
}

public sealed class ExportFlowChartCodegenRequestDto
{
    public string WorkspacePath { get; set; } = string.Empty;
    public string RelativePath { get; set; } = string.Empty;
}

public sealed class ExportBatchFlowChartCodegenRequestDto
{
    public string WorkspacePath { get; set; } = string.Empty;
    public List<string> RelativePaths { get; set; } = new();
}

public sealed class ExportAllFlowChartCodegenRequestDto
{
    public string WorkspacePath { get; set; } = string.Empty;
}

// ── 代码导出结果 ──

public sealed class CodegenResultDto
{
    public string? WorkbookName { get; set; }
    public string? RelativePath { get; set; }
    public string OutputDirectoryPath { get; set; } = string.Empty;
    public int FileCount { get; set; }
    public List<string> Files { get; set; } = new();
    public int ItemCount { get; set; }
}
