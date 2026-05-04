using System.Text.Json;

namespace LightyDesign.Application.Dtos;

// ── 流程图请求 ──

public sealed class SaveFlowChartAssetRequestDto
{
    public string WorkspacePath { get; set; } = string.Empty;
    public string RelativePath { get; set; } = string.Empty;
    public JsonElement? Document { get; set; }
}

public sealed class FlowChartAssetPathRequestDto
{
    public string WorkspacePath { get; set; } = string.Empty;
    public string Scope { get; set; } = string.Empty;
    public string RelativePath { get; set; } = string.Empty;
}

public sealed class RenameFlowChartAssetPathRequestDto
{
    public string WorkspacePath { get; set; } = string.Empty;
    public string Scope { get; set; } = string.Empty;
    public string RelativePath { get; set; } = string.Empty;
    public string NewRelativePath { get; set; } = string.Empty;
}

public sealed class MoveFlowChartAssetPathRequestDto
{
    public string WorkspacePath { get; set; } = string.Empty;
    public string Scope { get; set; } = string.Empty;
    public string RelativePath { get; set; } = string.Empty;
    public string NewRelativePath { get; set; } = string.Empty;
}
