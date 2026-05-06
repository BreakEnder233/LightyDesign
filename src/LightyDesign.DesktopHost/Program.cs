using System.Reflection;
using LightyDesign.Application;
using LightyDesign.Application.Dtos;
using LightyDesign.Application.Exceptions;
using LightyDesign.Application.Services;
using LightyDesign.Core;
using LightyDesign.DesktopHost;
using LightyDesign.FileProcess;

var builder = WebApplication.CreateBuilder(args);
const string CorsPolicyName = "DesktopShell";

builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicyName, policy =>
    {
        policy.AllowAnyOrigin()
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});
builder.Services.AddOpenApi();

// Register Application services
builder.Services.AddSingleton<WorkspaceQueryService>();
builder.Services.AddSingleton<WorkbookQueryService>();
builder.Services.AddSingleton<SchemaQueryService>();
builder.Services.AddSingleton<WorkspaceMutationService>();
builder.Services.AddSingleton<SheetEditingService>();
builder.Services.AddSingleton<CodegenService>();
builder.Services.AddSingleton<FlowChartService>();

var app = builder.Build();

app.UseMiddleware<ErrorHandlingMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors(CorsPolicyName);

var entryAssembly = Assembly.GetEntryAssembly();
var version = entryAssembly?.GetName().Version?.ToString() ?? "unknown";
var repositoryRoot = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "..", ".."));
var workspaceFolders = new[] { "app", "Spec", "src", "tests", "ShellFiles" };

// ─── Health ───
app.MapGet("/api/health", () => Results.Ok(new
{
    status = "ok",
    application = "LightyDesign.DesktopHost",
    environment = app.Environment.EnvironmentName,
    version,
    timestamp = DateTimeOffset.UtcNow,
    contentRoot = app.Environment.ContentRootPath,
    repositoryRoot,
}));

// ─── Workspace Summary ───
app.MapGet("/api/workspace/summary", (WorkspaceQueryService service) =>
{
    return Results.Ok(service.GetSummary(repositoryRoot, workspaceFolders));
});

// ─── Workspace ───
app.MapGet("/api/workspace", (string workspacePath, WorkspaceQueryService service) =>
{
    if (string.IsNullOrWhiteSpace(workspacePath)) throw new ValidationException("workspacePath is required.");
    return Results.Ok(service.GetWorkspace(workspacePath));
});

app.MapGet("/api/workspace/navigation", (string workspacePath, WorkspaceQueryService service) =>
{
    if (string.IsNullOrWhiteSpace(workspacePath)) throw new ValidationException("workspacePath is required.");
    return Results.Ok(service.GetNavigation(workspacePath));
});

app.MapGet("/api/workspace/flowcharts/navigation", (string workspacePath, WorkspaceQueryService service) =>
{
    if (string.IsNullOrWhiteSpace(workspacePath)) throw new ValidationException("workspacePath is required.");
    return Results.Ok(service.GetFlowChartCatalog(workspacePath, includeDocument: false));
});

// ─── FlowChart Nodes ───
app.MapGet("/api/workspace/flowcharts/nodes/{**relativePath}", (string relativePath, string workspacePath, FlowChartService service) =>
{
    if (string.IsNullOrWhiteSpace(workspacePath)) throw new ValidationException("workspacePath is required.");
    if (string.IsNullOrWhiteSpace(relativePath)) throw new ValidationException("relativePath is required.");
    return Results.Ok(service.GetNodeDefinition(workspacePath, relativePath));
});

app.MapPost("/api/workspace/flowcharts/nodes/save", (SaveFlowChartAssetRequestDto request, FlowChartService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    if (string.IsNullOrWhiteSpace(request.RelativePath)) throw new ValidationException("relativePath is required.");
    if (request.Document is null) throw new ValidationException("document is required.");
    return Results.Ok(service.SaveNode(request.WorkspacePath, request.RelativePath, request.Document.Value));
});

// ─── FlowChart Files ───
app.MapGet("/api/workspace/flowcharts/files/{**relativePath}", (string relativePath, string workspacePath, FlowChartService service) =>
{
    if (string.IsNullOrWhiteSpace(workspacePath)) throw new ValidationException("workspacePath is required.");
    if (string.IsNullOrWhiteSpace(relativePath)) throw new ValidationException("relativePath is required.");
    return Results.Ok(service.GetFile(workspacePath, relativePath));
});

app.MapPost("/api/workspace/flowcharts/files/save", (SaveFlowChartAssetRequestDto request, FlowChartService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    if (string.IsNullOrWhiteSpace(request.RelativePath)) throw new ValidationException("relativePath is required.");
    if (request.Document is null) throw new ValidationException("document is required.");
    return Results.Ok(service.SaveFile(request.WorkspacePath, request.RelativePath, request.Document.Value));
});

// ─── Unified Asset Loading ───
app.MapGet("/api/workspace/assets/{assetKind}/{**assetPath}", (string assetKind, string assetPath, string workspacePath, FlowChartService flowChartService, WorkbookQueryService workbookQueryService) =>
{
    if (string.IsNullOrWhiteSpace(workspacePath)) throw new ValidationException("workspacePath is required.");
    if (string.IsNullOrWhiteSpace(assetPath)) throw new ValidationException("assetPath is required.");

    return assetKind switch
    {
        "workbook" => Results.Ok(workbookQueryService.ReadWorkbookAsset(workspacePath, assetPath)),
        "sheet" => Results.Ok(workbookQueryService.ReadSheetAsset(workspacePath, assetPath)),
        "flowchart-node" or "flowchart-file" => Results.Ok(flowChartService.ReadAsset(workspacePath, assetKind, assetPath)),
        _ => Results.BadRequest(new { error = $"Unsupported assetKind '{assetKind}'." }),
    };
});

// ─── Header Properties ───
app.MapGet("/api/workspace/header-properties", (string workspacePath, SchemaQueryService service) =>
{
    if (string.IsNullOrWhiteSpace(workspacePath)) throw new ValidationException("workspacePath is required.");
    return Results.Ok(service.GetHeaderProperties(workspacePath));
});

// ─── Type Validation ───
app.MapGet("/api/workspace/type-validation", (string type, string? workspacePath, string? workbookName, SchemaQueryService service) =>
{
    if (string.IsNullOrWhiteSpace(type)) throw new ValidationException("type is required.");
    return Results.Ok(service.ValidateType(type, workspacePath, workbookName));
});

// ─── Type Metadata ───
app.MapGet("/api/workspace/type-metadata", (string? workspacePath, SchemaQueryService service) =>
{
    return Results.Ok(service.GetTypeMetadata(workspacePath));
});

// ─── Validation Schema ───
app.MapGet("/api/workspace/validation-schema", (string type, string? workspacePath, SchemaQueryService service) =>
{
    if (string.IsNullOrWhiteSpace(type)) throw new ValidationException("type is required.");
    return Results.Ok(service.GetValidationSchema(type, workspacePath));
});

// ─── Validation Rules ───
app.MapPost("/api/workspace/validation-rules/validate", (ValidateValidationRuleRequestDto request, SchemaQueryService service) =>
{
    if (string.IsNullOrWhiteSpace(request.Type)) throw new ValidationException("type is required.");
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    service.ValidateValidationRule(request.Type, request.Validation, request.WorkspacePath);
    return Results.Ok(new { ok = true });
});

// ─── Create Workspace ───
app.MapPost("/api/workspace/create", (CreateWorkspaceRequestDto request, WorkspaceMutationService service) =>
{
    if (string.IsNullOrWhiteSpace(request.ParentDirectoryPath)) throw new ValidationException("parentDirectoryPath is required.");
    if (string.IsNullOrWhiteSpace(request.WorkspaceName)) throw new ValidationException("workspaceName is required.");
    return Results.Ok(service.CreateWorkspace(request.ParentDirectoryPath.Trim(), request.WorkspaceName.Trim()));
});

// ─── Refresh Builtin Nodes ───
app.MapPost("/api/workspace/template/builtin-nodes/refresh", (WorkspacePathRequestDto request, WorkspaceMutationService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    return Results.Ok(service.RefreshBuiltinNodes(request.WorkspacePath.Trim()));
});

// ─── Create Workbook ───
app.MapPost("/api/workspace/workbooks/create", (CreateWorkbookRequestDto request, WorkspaceMutationService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    if (string.IsNullOrWhiteSpace(request.WorkbookName)) throw new ValidationException("workbookName is required.");
    return Results.Ok(service.CreateWorkbook(request.WorkspacePath.Trim(), request.WorkbookName.Trim()));
});

// ─── Delete Workbook ───
app.MapPost("/api/workspace/workbooks/delete", (DeleteWorkbookRequestDto request, WorkspaceMutationService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    if (string.IsNullOrWhiteSpace(request.WorkbookName)) throw new ValidationException("workbookName is required.");
    return Results.Ok(service.DeleteWorkbook(request.WorkspacePath.Trim(), request.WorkbookName.Trim()));
});

// ─── Create Sheet ───
app.MapPost("/api/workspace/workbooks/sheets/create", (CreateSheetRequestDto request, WorkspaceMutationService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    if (string.IsNullOrWhiteSpace(request.WorkbookName)) throw new ValidationException("workbookName is required.");
    if (string.IsNullOrWhiteSpace(request.SheetName)) throw new ValidationException("sheetName is required.");
    return Results.Ok(service.CreateSheet(request.WorkspacePath.Trim(), request.WorkbookName.Trim(), request.SheetName.Trim()));
});

// ─── Delete Sheet ───
app.MapPost("/api/workspace/workbooks/sheets/delete", (DeleteSheetRequestDto request, WorkspaceMutationService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    if (string.IsNullOrWhiteSpace(request.WorkbookName)) throw new ValidationException("workbookName is required.");
    if (string.IsNullOrWhiteSpace(request.SheetName)) throw new ValidationException("sheetName is required.");
    return Results.Ok(service.DeleteSheet(request.WorkspacePath.Trim(), request.WorkbookName.Trim(), request.SheetName.Trim()));
});

// ─── Rename Sheet ───
app.MapPost("/api/workspace/workbooks/sheets/rename", (RenameSheetRequestDto request, WorkspaceMutationService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    if (string.IsNullOrWhiteSpace(request.WorkbookName)) throw new ValidationException("workbookName is required.");
    if (string.IsNullOrWhiteSpace(request.SheetName)) throw new ValidationException("sheetName is required.");
    if (string.IsNullOrWhiteSpace(request.NewSheetName)) throw new ValidationException("newSheetName is required.");
    return Results.Ok(service.RenameSheet(request.WorkspacePath.Trim(), request.WorkbookName.Trim(), request.SheetName.Trim(), request.NewSheetName.Trim()));
});

// ─── Workbook Config ───
app.MapPost("/api/workspace/workbooks/{workbookName}/config", (string workbookName, SaveWorkbookConfigRequestDto request, WorkspaceMutationService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    return Results.Ok(service.SaveWorkbookConfig(request.WorkspacePath, workbookName, request.Alias));
});

// ─── Sheet Config ───
app.MapPost("/api/workspace/workbooks/{workbookName}/sheets/{sheetName}/config", (string workbookName, string sheetName, SaveSheetConfigRequestDto request, WorkspaceMutationService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    return Results.Ok(service.SaveSheetConfig(request.WorkspacePath, workbookName, sheetName, request.Alias));
});

// ─── Codegen Config ───
app.MapPost("/api/workspace/workbooks/codegen/config", (SaveWorkbookCodegenConfigRequestDto request, WorkspaceMutationService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    return Results.Ok(service.SaveCodegenConfig(
        request.WorkspacePath.Trim(),
        request.OutputRelativePath,
        request.I18nOutputRelativePath,
        request.I18nSourceLanguage));
});

// ─── Workbook Codegen Export ───
app.MapPost("/api/workspace/workbooks/codegen/export", (ExportWorkbookCodegenRequestDto request, CodegenService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    if (string.IsNullOrWhiteSpace(request.WorkbookName)) throw new ValidationException("workbookName is required.");
    var result = service.ExportWorkbook(request.WorkspacePath.Trim(), request.WorkbookName.Trim());
    return Results.Ok(new
    {
        workbookName = result.WorkbookName,
        outputDirectoryPath = result.OutputDirectoryPath,
        fileCount = result.FileCount,
        files = result.Files,
        workbookCount = result.ItemCount,
    });
});

// ─── Workbook Codegen Validate ───
app.MapPost("/api/workspace/workbooks/codegen/validate", (ExportWorkbookCodegenRequestDto request, CodegenService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    if (string.IsNullOrWhiteSpace(request.WorkbookName)) throw new ValidationException("workbookName is required.");
    service.ValidateWorkbook(request.WorkspacePath.Trim(), request.WorkbookName.Trim());
    return Results.Ok(new { workbookName = request.WorkbookName, errorCount = 0 });
});

// ─── Export All Workbooks ───
app.MapPost("/api/workspace/workbooks/codegen/export-all", (ExportAllWorkbookCodegenRequestDto request, CodegenService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    var result = service.ExportAllWorkbooks(request.WorkspacePath.Trim());
    return Results.Ok(new
    {
        workbookName = string.Empty,
        outputDirectoryPath = result.OutputDirectoryPath,
        fileCount = result.FileCount,
        files = result.Files,
        workbookCount = result.ItemCount,
    });
});

// ─── FlowChart Codegen Export ───
app.MapPost("/api/workspace/flowcharts/codegen/export", (ExportFlowChartCodegenRequestDto request, CodegenService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    if (string.IsNullOrWhiteSpace(request.RelativePath)) throw new ValidationException("relativePath is required.");
    var result = service.ExportFlowChart(request.WorkspacePath.Trim(), request.RelativePath.Trim());
    return Results.Ok(new
    {
        relativePath = result.RelativePath,
        outputDirectoryPath = result.OutputDirectoryPath,
        fileCount = result.FileCount,
        files = result.Files,
        flowChartCount = result.ItemCount,
    });
});

// ─── FlowChart Batch Codegen Export ───
app.MapPost("/api/workspace/flowcharts/codegen/export-batch", (ExportBatchFlowChartCodegenRequestDto request, CodegenService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    if (request.RelativePaths is null || request.RelativePaths.Count == 0) throw new ValidationException("relativePaths is required.");
    var result = service.ExportBatchFlowCharts(request.WorkspacePath.Trim(), request.RelativePaths);
    return Results.Ok(new
    {
        relativePaths = request.RelativePaths,
        outputDirectoryPath = result.OutputDirectoryPath,
        fileCount = result.FileCount,
        files = result.Files,
        flowChartCount = result.ItemCount,
    });
});

// ─── FlowChart Export All ───
app.MapPost("/api/workspace/flowcharts/codegen/export-all", (ExportAllFlowChartCodegenRequestDto request, CodegenService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    var result = service.ExportAllFlowCharts(request.WorkspacePath.Trim());
    return Results.Ok(new
    {
        outputDirectoryPath = result.OutputDirectoryPath,
        fileCount = result.FileCount,
        files = result.Files,
        flowChartCount = result.ItemCount,
    });
});

// ─── Get Workbook ───
app.MapGet("/api/workspace/workbooks/{workbookName}", (string workbookName, string workspacePath, WorkbookQueryService service) =>
{
    if (string.IsNullOrWhiteSpace(workspacePath)) throw new ValidationException("workspacePath is required.");
    return Results.Ok(service.GetWorkbook(workspacePath, workbookName));
});

// ─── Get Sheet ───
app.MapGet("/api/workspace/workbooks/{workbookName}/sheets/{sheetName}", (string workbookName, string sheetName, string workspacePath, WorkbookQueryService service) =>
{
    if (string.IsNullOrWhiteSpace(workspacePath)) throw new ValidationException("workspacePath is required.");
    return Results.Ok(service.GetSheet(workspacePath, workbookName, sheetName));
});

// ─── Get Sheet Metadata ───
app.MapGet("/api/workspace/workbooks/{workbookName}/sheets/{sheetName}/metadata", (string workbookName, string sheetName, string workspacePath, WorkbookQueryService service) =>
{
    if (string.IsNullOrWhiteSpace(workspacePath)) throw new ValidationException("workspacePath is required.");
    return Results.Ok(service.GetSheetMetadata(workspacePath, workbookName, sheetName));
});

// ─── Save Workbook ───
app.MapPost("/api/workspace/workbooks/save", (SaveWorkbookRequestDto request, SheetEditingService service) =>
{
    if (request.Workbook is null) throw new ValidationException("workbook is required.");
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    return Results.Ok(service.SaveWorkbook(request.WorkspacePath, request.Workbook));
});

// ─── Patch Sheet Rows ───
app.MapPost("/api/workspace/workbooks/{workbookName}/sheets/{sheetName}/rows/patch", (string workbookName, string sheetName, PatchRowsRequestDto request, SheetEditingService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    if (request.Operations is null || request.Operations.Count == 0) throw new ValidationException("operations is required.");
    request.WorkbookName = workbookName;
    request.SheetName = sheetName;
    return Results.Ok(service.PatchSheetRows(request));
});

// ─── Patch Sheet Columns ───
app.MapPost("/api/workspace/workbooks/{workbookName}/sheets/{sheetName}/columns/patch", (string workbookName, string sheetName, PatchColumnsRequestDto request, SheetEditingService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    if (request.Operations is null || request.Operations.Count == 0) throw new ValidationException("operations is required.");
    request.WorkbookName = workbookName;
    request.SheetName = sheetName;
    return Results.Ok(service.PatchSheetColumns(request));
});

// ─── FlowChart Asset Directories ───
app.MapPost("/api/workspace/flowcharts/assets/directories/create", (FlowChartAssetPathRequestDto request, FlowChartService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    if (string.IsNullOrWhiteSpace(request.Scope)) throw new ValidationException("scope is required.");
    if (string.IsNullOrWhiteSpace(request.RelativePath)) throw new ValidationException("relativePath is required.");
    return Results.Ok(service.CreateDirectory(request.WorkspacePath, request.Scope, request.RelativePath));
});

app.MapPost("/api/workspace/flowcharts/assets/directories/rename", (RenameFlowChartAssetPathRequestDto request, FlowChartService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    if (string.IsNullOrWhiteSpace(request.Scope)) throw new ValidationException("scope is required.");
    if (string.IsNullOrWhiteSpace(request.RelativePath)) throw new ValidationException("relativePath is required.");
    if (string.IsNullOrWhiteSpace(request.NewRelativePath)) throw new ValidationException("newRelativePath is required.");
    return Results.Ok(service.RenameDirectory(request.WorkspacePath, request.Scope, request.RelativePath, request.NewRelativePath));
});

app.MapPost("/api/workspace/flowcharts/assets/directories/delete", (FlowChartAssetPathRequestDto request, FlowChartService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    if (string.IsNullOrWhiteSpace(request.Scope)) throw new ValidationException("scope is required.");
    if (string.IsNullOrWhiteSpace(request.RelativePath)) throw new ValidationException("relativePath is required.");
    return Results.Ok(service.DeleteDirectory(request.WorkspacePath, request.Scope, request.RelativePath));
});

app.MapPost("/api/workspace/flowcharts/assets/files/delete", (FlowChartAssetPathRequestDto request, FlowChartService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    if (string.IsNullOrWhiteSpace(request.Scope)) throw new ValidationException("scope is required.");
    if (string.IsNullOrWhiteSpace(request.RelativePath)) throw new ValidationException("relativePath is required.");
    return Results.Ok(service.DeleteFile(request.WorkspacePath, request.Scope, request.RelativePath));
});

app.MapPost("/api/workspace/flowcharts/assets/files/move", (MoveFlowChartAssetPathRequestDto request, FlowChartService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    if (string.IsNullOrWhiteSpace(request.Scope)) throw new ValidationException("scope is required.");
    if (string.IsNullOrWhiteSpace(request.RelativePath)) throw new ValidationException("relativePath is required.");
    if (string.IsNullOrWhiteSpace(request.NewRelativePath)) throw new ValidationException("newRelativePath is required.");
    return Results.Ok(service.MoveFile(request.WorkspacePath, request.Scope, request.RelativePath, request.NewRelativePath));
});

app.MapPost("/api/workspace/flowcharts/assets/directories/move", (MoveFlowChartAssetPathRequestDto request, FlowChartService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    if (string.IsNullOrWhiteSpace(request.Scope)) throw new ValidationException("scope is required.");
    if (string.IsNullOrWhiteSpace(request.RelativePath)) throw new ValidationException("relativePath is required.");
    if (string.IsNullOrWhiteSpace(request.NewRelativePath)) throw new ValidationException("newRelativePath is required.");
    return Results.Ok(service.MoveDirectory(request.WorkspacePath, request.Scope, request.RelativePath, request.NewRelativePath));
});

// ─── Import Excel ───
app.MapPost("/api/file-process/workbooks/import-excel", async (HttpRequest request) =>
{
    if (!request.HasFormContentType)
    {
        return Results.BadRequest(new { error = "Request content type must be multipart/form-data." });
    }

    var form = await request.ReadFormAsync();
    var workspacePath = form["workspacePath"].ToString();
    var workbookName = form["workbookName"].ToString();
    var file = form.Files.GetFile("file");

    if (string.IsNullOrWhiteSpace(workspacePath))
    {
        return Results.BadRequest(new { error = "workspacePath is required." });
    }

    if (file is null || file.Length == 0)
    {
        return Results.BadRequest(new { error = "An uploaded xlsx file is required." });
    }

    var headersFilePath = Path.Combine(workspacePath, "headers.json");
    if (!File.Exists(headersFilePath))
    {
        return Results.NotFound(new { error = "headers.json was not found for the specified workspacePath.", workspacePath, headersFilePath });
    }

    try
    {
        var headerLayout = WorkspaceHeaderLayoutSerializer.LoadFromFile(headersFilePath);
        var resolvedWorkbookName = ResolveWorkbookName(workbookName, file.FileName);
        var importer = new LightyWorkbookExcelImporter();

        await using var stream = file.OpenReadStream();
        var importedWorkbook = importer.Import(
            stream,
            resolvedWorkbookName,
            headerLayout,
            LightyWorkspacePathLayout.GetWorkbookDirectoryPath(workspacePath, resolvedWorkbookName));

        return Results.Ok(WorkspaceResponseBuilder.ToWorkbookResponse(importedWorkbook, previewOnly: true));
    }
    catch (LightyExcelProcessException exception)
    {
        return Results.BadRequest(WorkspaceResponseBuilder.ToExcelErrorResponse(exception));
    }
});

// ─── Export Excel ───
app.MapGet("/api/file-process/workbooks/{workbookName}/export-excel", (string workbookName, string workspacePath) =>
{
    if (string.IsNullOrWhiteSpace(workspacePath))
    {
        return Results.BadRequest(new { error = "workspacePath is required." });
    }

    try
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            return Results.NotFound(new { error = $"Workbook '{workbookName}' was not found.", workspacePath });
        }

        var exporter = new LightyWorkbookExcelExporter();
        using var stream = new MemoryStream();
        exporter.Export(workbook, workspace.HeaderLayout, stream);

        return Results.File(
            stream.ToArray(),
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            fileDownloadName: $"{workbook.Name}.xlsx");
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new { error = exception.Message });
    }
    catch (LightyExcelProcessException exception)
    {
        return Results.BadRequest(WorkspaceResponseBuilder.ToExcelErrorResponse(exception));
    }
});

app.Run();

// ─── Local helpers (kept minimal, only for endpoints with special handling) ───

static string ResolveWorkbookName(string? workbookName, string fileName)
{
    if (!string.IsNullOrWhiteSpace(workbookName))
    {
        return workbookName.Trim();
    }

    var resolvedName = Path.GetFileNameWithoutExtension(fileName);
    if (string.IsNullOrWhiteSpace(resolvedName))
    {
        throw new LightyExcelProcessException("Workbook name cannot be resolved from the uploaded file.");
    }

    return resolvedName;
}
