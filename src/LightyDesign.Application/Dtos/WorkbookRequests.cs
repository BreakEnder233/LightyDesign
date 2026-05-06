using System.Text.Json;

namespace LightyDesign.Application.Dtos;

// ── Workbook / Sheet 请求 ──

public sealed class SaveWorkbookRequestDto
{
    public string WorkspacePath { get; set; } = string.Empty;
    public WorkbookPayloadDto? Workbook { get; set; }
}

public sealed class WorkbookPayloadDto
{
    public string Name { get; set; } = string.Empty;
    public List<SheetPayloadDto> Sheets { get; set; } = new();
}

public sealed class SheetPayloadDto
{
    public string Name { get; set; } = string.Empty;
    public List<ColumnPayloadDto> Columns { get; set; } = new();
    public List<List<string>> Rows { get; set; } = new();
}

public sealed class ColumnPayloadDto
{
    public string FieldName { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public Dictionary<string, JsonElement>? Attributes { get; set; }
}

// ── 工作区请求 ──

public sealed class CreateWorkspaceRequestDto
{
    public string ParentDirectoryPath { get; set; } = string.Empty;
    public string WorkspaceName { get; set; } = string.Empty;
}

public sealed class WorkspacePathRequestDto
{
    public string WorkspacePath { get; set; } = string.Empty;
}

// ── 工作簿 CRUD 请求 ──

public sealed class CreateWorkbookRequestDto
{
    public string WorkspacePath { get; set; } = string.Empty;
    public string WorkbookName { get; set; } = string.Empty;
}

public sealed class DeleteWorkbookRequestDto
{
    public string WorkspacePath { get; set; } = string.Empty;
    public string WorkbookName { get; set; } = string.Empty;
}

// ── Sheet CRUD 请求 ──

public sealed class CreateSheetRequestDto
{
    public string WorkspacePath { get; set; } = string.Empty;
    public string WorkbookName { get; set; } = string.Empty;
    public string SheetName { get; set; } = string.Empty;
}

public sealed class DeleteSheetRequestDto
{
    public string WorkspacePath { get; set; } = string.Empty;
    public string WorkbookName { get; set; } = string.Empty;
    public string SheetName { get; set; } = string.Empty;
}

public sealed class RenameSheetRequestDto
{
    public string WorkspacePath { get; set; } = string.Empty;
    public string WorkbookName { get; set; } = string.Empty;
    public string SheetName { get; set; } = string.Empty;
    public string NewSheetName { get; set; } = string.Empty;
}

// ── 配置请求 ──

public sealed class SaveWorkbookCodegenConfigRequestDto
{
    public string WorkspacePath { get; set; } = string.Empty;
    public string? OutputRelativePath { get; set; }
    public string? I18nOutputRelativePath { get; set; }
    public string? I18nSourceLanguage { get; set; }
}

public sealed class SaveWorkbookConfigRequestDto
{
    public string WorkspacePath { get; set; } = string.Empty;
    public string? Alias { get; set; }
}

public sealed class SaveSheetConfigRequestDto
{
    public string WorkspacePath { get; set; } = string.Empty;
    public string? Alias { get; set; }
}

// ── Validation 请求 ──

public sealed class ValidateValidationRuleRequestDto
{
    public string WorkspacePath { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public JsonElement? Validation { get; set; }
}

// ── MCP Patch 行请求 ──

public sealed class PatchRowsRequestDto
{
    public string WorkspacePath { get; set; } = string.Empty;
    public string WorkbookName { get; set; } = string.Empty;
    public string SheetName { get; set; } = string.Empty;
    public bool DryRun { get; set; }
    public List<RowPatchOperationDto> Operations { get; set; } = new();
}

public sealed class RowPatchOperationDto
{
    public string Kind { get; set; } = string.Empty;
    public int? RowIndex { get; set; }
    public List<string>? Cells { get; set; }
    public Dictionary<string, string>? FieldValues { get; set; }
}

// ── MCP Patch 列请求 ──

public sealed class PatchColumnsRequestDto
{
    public string WorkspacePath { get; set; } = string.Empty;
    public string WorkbookName { get; set; } = string.Empty;
    public string SheetName { get; set; } = string.Empty;
    public bool DryRun { get; set; }
    public List<ColumnPatchOperationDto> Operations { get; set; } = new();
}

public sealed class ColumnPatchOperationDto
{
    public string Kind { get; set; } = string.Empty;
    public int? Index { get; set; }
    public string? FieldName { get; set; }
    public string? TargetFieldName { get; set; }
    public int? ToIndex { get; set; }
    public string? DisplayName { get; set; }
    public string? Type { get; set; }
    public string? DefaultValue { get; set; }
    public Dictionary<string, string>? Attributes { get; set; }
    public Dictionary<string, object>? Column { get; set; }
}
