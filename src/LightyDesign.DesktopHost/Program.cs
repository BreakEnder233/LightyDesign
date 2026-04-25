using System.Reflection;
using System.Text.Json;
using LightyDesign.Core;
using LightyDesign.DesktopHost;
using LightyDesign.FileProcess;
using LightyDesign.Generator;

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

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors(CorsPolicyName);

var entryAssembly = Assembly.GetEntryAssembly();
var version = entryAssembly?.GetName().Version?.ToString() ?? "unknown";
var repositoryRoot = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "..", ".."));
var workspaceFolders = new[]
{
    "app",
    "Spec",
    "src",
    "tests",
    "ShellFiles"
};

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

app.MapGet("/api/workspace/summary", () => Results.Ok(new
{
    repositoryRoot,
    folders = workspaceFolders
        .Select(folder => new
        {
            name = folder,
            exists = Directory.Exists(Path.Combine(repositoryRoot, folder)),
        })
        .ToArray(),
}));

app.MapGet("/api/workspace", (string workspacePath) =>
{
    if (string.IsNullOrWhiteSpace(workspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    try
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        return Results.Ok(ToWorkspaceResponse(workspace));
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (IOException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapGet("/api/workspace/navigation", (string workspacePath) =>
{
    if (string.IsNullOrWhiteSpace(workspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    try
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        return Results.Ok(ToWorkspaceNavigationResponse(workspace));
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (IOException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapGet("/api/workspace/flowcharts/navigation", (string workspacePath) =>
{
    if (string.IsNullOrWhiteSpace(workspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    try
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        return Results.Ok(ToFlowChartCatalogResponse(workspace, includeDocument: false));
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (IOException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapGet("/api/workspace/flowcharts/nodes/{**relativePath}", (string relativePath, string workspacePath) =>
{
    if (string.IsNullOrWhiteSpace(workspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    if (string.IsNullOrWhiteSpace(relativePath))
    {
        return Results.BadRequest(new
        {
            error = "relativePath is required.",
        });
    }

    try
    {
        var document = LightyFlowChartAssetLoader.LoadNodeDefinition(workspacePath, relativePath);
        return Results.Ok(ToFlowChartNodeDefinitionResponse(document, includeDocument: true));
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (IOException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapGet("/api/workspace/flowcharts/files/{**relativePath}", (string relativePath, string workspacePath) =>
{
    if (string.IsNullOrWhiteSpace(workspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    if (string.IsNullOrWhiteSpace(relativePath))
    {
        return Results.BadRequest(new
        {
            error = "relativePath is required.",
        });
    }

    try
    {
        var document = LightyFlowChartAssetLoader.LoadFile(workspacePath, relativePath);
        return Results.Ok(ToFlowChartFileResponse(document, includeDocument: true));
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (IOException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapGet("/api/workspace/assets/{assetKind}/{**assetPath}", (string assetKind, string assetPath, string workspacePath) =>
{
    if (string.IsNullOrWhiteSpace(workspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    if (string.IsNullOrWhiteSpace(assetPath))
    {
        return Results.BadRequest(new
        {
            error = "assetPath is required.",
        });
    }

    try
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        return assetKind switch
        {
            "workbook" => TryReadWorkbookAsset(workspace, assetPath),
            "sheet" => TryReadSheetAsset(workspace, assetPath),
            "flowchart-node" => Results.Ok(ToFlowChartNodeDefinitionResponse(LightyFlowChartAssetLoader.LoadNodeDefinition(workspacePath, assetPath), includeDocument: true)),
            "flowchart-file" => Results.Ok(ToFlowChartFileResponse(LightyFlowChartAssetLoader.LoadFile(workspacePath, assetPath), includeDocument: true)),
            _ => Results.BadRequest(new
            {
                error = $"Unsupported assetKind '{assetKind}'.",
            }),
        };
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (IOException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapGet("/api/workspace/header-properties", (string workspacePath) =>
{
    if (string.IsNullOrWhiteSpace(workspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    try
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        return Results.Ok(new
        {
            properties = LightyHeaderPropertySchemaProvider.GetSchemas(workspace.HeaderLayout)
                .Select(ToHeaderPropertySchemaResponse),
        });
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapGet("/api/workspace/type-validation", (string type, string? workspacePath, string? workbookName) =>
{
    if (string.IsNullOrWhiteSpace(type))
    {
        return Results.BadRequest(new
        {
            error = "type is required.",
        });
    }

    try
    {
        LightyWorkspace? workspace = null;
        if (!string.IsNullOrWhiteSpace(workspacePath))
        {
            workspace = LightyWorkspaceLoader.Load(workspacePath);
        }

        var descriptor = LightySheetColumnValidator.ValidateType(type, workspace, workbookName);
        return Results.Ok(new
        {
            ok = true,
            normalizedType = descriptor.RawType,
            descriptor.TypeName,
            descriptor.GenericArguments,
            descriptor.ValueType,
            descriptor.IsList,
            descriptor.IsDictionary,
            descriptor.IsReference,
            referenceTarget = descriptor.ReferenceTarget is null
                ? null
                : new
                {
                    descriptor.ReferenceTarget.WorkbookName,
                    descriptor.ReferenceTarget.SheetName,
                },
            descriptor = ToTypeDescriptorResponse(descriptor),
        });
    }
    catch (Exception exception) when (exception is ArgumentException or LightyCoreException)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
});

app.MapGet("/api/workspace/type-metadata", (string? workspacePath) =>
{
    try
    {
        LightyWorkspace? workspace = null;
        if (!string.IsNullOrWhiteSpace(workspacePath))
        {
            workspace = LightyWorkspaceLoader.Load(workspacePath);
        }

        return Results.Ok(ToTypeMetadataResponse(LightyTypeMetadataProvider.GetMetadata(workspace)));
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapGet("/api/workspace/validation-schema", (string type, string? workspacePath) =>
{
    if (string.IsNullOrWhiteSpace(type))
    {
        return Results.BadRequest(new
        {
            error = "type is required.",
        });
    }

    try
    {
        if (!string.IsNullOrWhiteSpace(workspacePath))
        {
            _ = LightyWorkspaceLoader.Load(workspacePath);
        }

        var descriptor = LightyColumnTypeDescriptor.Parse(type);
        var schema = LightyValidationSchemaProvider.GetSchema(descriptor);
        return Results.Ok(new
        {
            descriptor = ToTypeDescriptorResponse(descriptor),
            schema = ToValidationRuleSchemaResponse(schema),
        });
    }
    catch (Exception exception) when (exception is ArgumentException or LightyCoreException)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
});

app.MapPost("/api/workspace/validation-rules/validate", (ValidateValidationRuleRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.Type))
    {
        return Results.BadRequest(new
        {
            error = "type is required.",
        });
    }

    if (string.IsNullOrWhiteSpace(request.WorkspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    try
    {
        var workspace = LightyWorkspaceLoader.Load(request.WorkspacePath);
        LightyWorkbookValidationService.ValidateValidationRule(request.Type, request.Validation, workspace);

        return Results.Ok(new
        {
            ok = true,
        });
    }
    catch (Exception exception) when (exception is ArgumentException or LightyCoreException or JsonException)
    {
        return Results.BadRequest(new
        {
            ok = false,
            error = exception.Message,
        });
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            ok = false,
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            ok = false,
            error = exception.Message,
        });
    }
});

app.MapPost("/api/workspace/create", (CreateWorkspaceRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.ParentDirectoryPath))
    {
        return Results.BadRequest(new
        {
            error = "parentDirectoryPath is required.",
        });
    }

    if (string.IsNullOrWhiteSpace(request.WorkspaceName))
    {
        return Results.BadRequest(new
        {
            error = "workspaceName is required.",
        });
    }

    var parentDirectoryPath = request.ParentDirectoryPath.Trim();
    var workspaceName = request.WorkspaceName.Trim();

    if (!Directory.Exists(parentDirectoryPath))
    {
        return Results.NotFound(new
        {
            error = "The specified parent directory was not found.",
            parentDirectoryPath,
        });
    }

    if (workspaceName.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
    {
        return Results.BadRequest(new
        {
            error = "workspaceName contains invalid path characters.",
            workspaceName,
        });
    }

    try
    {
        var workspaceRootPath = Path.Combine(parentDirectoryPath, workspaceName);
        var workspace = LightyWorkspaceScaffolder.Create(workspaceRootPath);
        return Results.Ok(ToWorkspaceNavigationResponse(workspace));
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (IOException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapPost("/api/workspace/template/builtin-nodes/refresh", (WorkspacePathRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    var workspacePath = request.WorkspacePath.Trim();

    try
    {
        var workspace = LightyWorkspaceScaffolder.RefreshBuiltinNodeDefinitions(workspacePath);
        return Results.Ok(new
        {
            workspacePath = workspace.RootPath,
            builtinNodeDefinitionCount = workspace.FlowChartNodeDefinitions.Count(document => document.RelativePath.StartsWith("Builtin/", StringComparison.Ordinal)),
        });
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (IOException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapPost("/api/workspace/workbooks/create", (CreateWorkbookRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    if (string.IsNullOrWhiteSpace(request.WorkbookName))
    {
        return Results.BadRequest(new
        {
            error = "workbookName is required.",
        });
    }

    var workspacePath = request.WorkspacePath.Trim();
    var workbookName = request.WorkbookName.Trim();
    if (workbookName.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
    {
        return Results.BadRequest(new
        {
            error = "workbookName contains invalid path characters.",
            workbookName,
        });
    }

    try
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        LightyWorkbookScaffolder.CreateDefault(
            workspacePath,
            workspace.HeaderLayout,
            workbookName,
            workspace.CodegenOptions,
            workspace.CodegenConfigFilePath);
        var reloadedWorkspace = LightyWorkspaceLoader.Load(workspacePath);
        return Results.Ok(ToWorkspaceNavigationResponse(reloadedWorkspace));
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (IOException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapPost("/api/workspace/workbooks/delete", (DeleteWorkbookRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    if (string.IsNullOrWhiteSpace(request.WorkbookName))
    {
        return Results.BadRequest(new
        {
            error = "workbookName is required.",
        });
    }

    var workspacePath = request.WorkspacePath.Trim();
    var workbookName = request.WorkbookName.Trim();

    try
    {
        LightyWorkspaceLoader.Load(workspacePath);
        LightyWorkbookScaffolder.Delete(workspacePath, workbookName);
        var reloadedWorkspace = LightyWorkspaceLoader.Load(workspacePath);
        return Results.Ok(ToWorkspaceNavigationResponse(reloadedWorkspace));
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (IOException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapPost("/api/workspace/workbooks/sheets/create", (CreateSheetRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    if (string.IsNullOrWhiteSpace(request.WorkbookName))
    {
        return Results.BadRequest(new
        {
            error = "workbookName is required.",
        });
    }

    if (string.IsNullOrWhiteSpace(request.SheetName))
    {
        return Results.BadRequest(new
        {
            error = "sheetName is required.",
        });
    }

    var workspacePath = request.WorkspacePath.Trim();
    var workbookName = request.WorkbookName.Trim();
    var sheetName = request.SheetName.Trim();

    if (sheetName.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
    {
        return Results.BadRequest(new
        {
            error = "sheetName contains invalid path characters.",
            sheetName,
        });
    }

    try
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            return Results.NotFound(new
            {
                error = $"Workbook '{workbookName}' was not found.",
                workspacePath,
            });
        }

        if (ContainsSheetName(workbook, sheetName))
        {
            return Results.BadRequest(new
            {
                error = $"Sheet '{sheetName}' already exists in workbook '{workbookName}'.",
            });
        }

        var nextSheets = workbook.Sheets
            .Concat(new[] { LightyWorkbookScaffolder.CreateDefaultSheet(workbook.DirectoryPath, sheetName) })
            .ToList();
        var updatedWorkbook = new LightyWorkbook(
            workbook.Name,
            workbook.DirectoryPath,
            nextSheets,
            workbook.CodegenOptions,
            workbook.CodegenConfigFilePath);
        LightyWorkbookWriter.Save(workspacePath, workspace.HeaderLayout, updatedWorkbook, workspace.CodegenOptions, workspace.CodegenConfigFilePath);

        var reloadedWorkspace = LightyWorkspaceLoader.Load(workspacePath);
        return Results.Ok(ToWorkspaceNavigationResponse(reloadedWorkspace));
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (IOException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapPost("/api/workspace/workbooks/sheets/delete", (DeleteSheetRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    if (string.IsNullOrWhiteSpace(request.WorkbookName))
    {
        return Results.BadRequest(new
        {
            error = "workbookName is required.",
        });
    }

    if (string.IsNullOrWhiteSpace(request.SheetName))
    {
        return Results.BadRequest(new
        {
            error = "sheetName is required.",
        });
    }

    var workspacePath = request.WorkspacePath.Trim();
    var workbookName = request.WorkbookName.Trim();
    var sheetName = request.SheetName.Trim();

    try
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            return Results.NotFound(new
            {
                error = $"Workbook '{workbookName}' was not found.",
                workspacePath,
            });
        }

        if (!workbook.TryGetSheet(sheetName, out _))
        {
            return Results.NotFound(new
            {
                error = $"Sheet '{sheetName}' was not found in workbook '{workbookName}'.",
                workspacePath,
            });
        }

        var nextSheets = workbook.Sheets
            .Where(sheet => !string.Equals(sheet.Name, sheetName, StringComparison.Ordinal))
            .ToList();
        var updatedWorkbook = new LightyWorkbook(
            workbook.Name,
            workbook.DirectoryPath,
            nextSheets,
            workbook.CodegenOptions,
            workbook.CodegenConfigFilePath);
        LightyWorkbookWriter.Save(workspacePath, workspace.HeaderLayout, updatedWorkbook, workspace.CodegenOptions, workspace.CodegenConfigFilePath);

        var reloadedWorkspace = LightyWorkspaceLoader.Load(workspacePath);
        return Results.Ok(ToWorkspaceNavigationResponse(reloadedWorkspace));
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (IOException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapPost("/api/workspace/workbooks/sheets/rename", (RenameSheetRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    if (string.IsNullOrWhiteSpace(request.WorkbookName))
    {
        return Results.BadRequest(new
        {
            error = "workbookName is required.",
        });
    }

    if (string.IsNullOrWhiteSpace(request.SheetName))
    {
        return Results.BadRequest(new
        {
            error = "sheetName is required.",
        });
    }

    if (string.IsNullOrWhiteSpace(request.NewSheetName))
    {
        return Results.BadRequest(new
        {
            error = "newSheetName is required.",
        });
    }

    var workspacePath = request.WorkspacePath.Trim();
    var workbookName = request.WorkbookName.Trim();
    var sheetName = request.SheetName.Trim();
    var newSheetName = request.NewSheetName.Trim();

    if (newSheetName.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
    {
        return Results.BadRequest(new
        {
            error = "newSheetName contains invalid path characters.",
            newSheetName,
        });
    }

    if (string.Equals(sheetName, newSheetName, StringComparison.OrdinalIgnoreCase))
    {
        return Results.BadRequest(new
        {
            error = "The new sheet name must be different from the current name.",
        });
    }

    try
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            return Results.NotFound(new
            {
                error = $"Workbook '{workbookName}' was not found.",
                workspacePath,
            });
        }

        if (!workbook.TryGetSheet(sheetName, out var targetSheet) || targetSheet is null)
        {
            return Results.NotFound(new
            {
                error = $"Sheet '{sheetName}' was not found in workbook '{workbookName}'.",
                workspacePath,
            });
        }

        if (ContainsSheetName(workbook, newSheetName, excludedSheetName: sheetName))
        {
            return Results.BadRequest(new
            {
                error = $"Sheet '{newSheetName}' already exists in workbook '{workbookName}'.",
            });
        }

        var nextSheets = workbook.Sheets
            .Select(sheet => string.Equals(sheet.Name, sheetName, StringComparison.Ordinal)
                ? new LightySheet(
                    newSheetName,
                    Path.Combine(workbook.DirectoryPath, $"{newSheetName}.txt"),
                    Path.Combine(workbook.DirectoryPath, $"{newSheetName}_header.json"),
                    sheet.Header,
                    sheet.Rows)
                : sheet)
            .ToList();

        var updatedWorkbook = new LightyWorkbook(
            workbook.Name,
            workbook.DirectoryPath,
            nextSheets,
            workbook.CodegenOptions,
            workbook.CodegenConfigFilePath);
        LightyWorkbookWriter.Save(workspacePath, workspace.HeaderLayout, updatedWorkbook, workspace.CodegenOptions, workspace.CodegenConfigFilePath);

        var reloadedWorkspace = LightyWorkspaceLoader.Load(workspacePath);
        return Results.Ok(ToWorkspaceNavigationResponse(reloadedWorkspace));
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (IOException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapPost("/api/workspace/workbooks/codegen/config", (SaveWorkbookCodegenConfigRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    var workspacePath = request.WorkspacePath.Trim();

    try
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        var codegenOptions = new LightyWorkbookCodegenOptions(request.OutputRelativePath);
        GeneratedCodeOutputWriter.ValidateWorkbookCodegenOutputRelativePath(workspace.RootPath, codegenOptions.OutputRelativePath, allowEmpty: true);
        LightyWorkbookCodegenOptionsSerializer.SaveToFile(workspace.CodegenConfigFilePath, codegenOptions);

        var reloadedWorkspace = LightyWorkspaceLoader.Load(workspacePath);
        return Results.Ok(ToWorkspaceNavigationResponse(reloadedWorkspace));
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (IOException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapPost("/api/workspace/workbooks/{workbookName}/config", (string workbookName, SaveWorkbookConfigRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath))
    {
        return Results.BadRequest(new { error = "workspacePath is required." });
    }

    if (string.IsNullOrWhiteSpace(workbookName))
    {
        return Results.BadRequest(new { error = "workbookName is required." });
    }

    var workspacePath = request.WorkspacePath.Trim();
    var alias = request.Alias;

    try
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            return Results.NotFound(new { error = $"Workbook '{workbookName}' was not found.", workspacePath });
        }

        var configFilePath = Path.Combine(workbook.DirectoryPath, "config.json");

        // Read existing config if present
        Dictionary<string, object?> current = new();
        if (File.Exists(configFilePath))
        {
            try
            {
                var raw = File.ReadAllText(configFilePath);
                current = JsonSerializer.Deserialize<Dictionary<string, object?>>(raw) ?? new Dictionary<string, object?>();
            }
            catch
            {
                current = new Dictionary<string, object?>();
            }
        }

        if (string.IsNullOrWhiteSpace(alias))
        {
            if (current.ContainsKey("alias")) current.Remove("alias");
        }
        else
        {
            current["alias"] = alias;
        }

        var serialized = JsonSerializer.Serialize(current, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(configFilePath, serialized);

        var reloadedWorkspace = LightyWorkspaceLoader.Load(workspacePath);
        return Results.Ok(ToWorkspaceNavigationResponse(reloadedWorkspace));
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new { error = exception.Message, path = exception.FileName });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new { error = exception.Message });
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new { error = exception.Message });
    }
    catch (IOException exception)
    {
        return Results.BadRequest(new { error = exception.Message });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new { error = exception.Message });
    }
});

app.MapPost("/api/workspace/workbooks/{workbookName}/sheets/{sheetName}/config", (string workbookName, string sheetName, SaveSheetConfigRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath))
    {
        return Results.BadRequest(new { error = "workspacePath is required." });
    }

    if (string.IsNullOrWhiteSpace(workbookName) || string.IsNullOrWhiteSpace(sheetName))
    {
        return Results.BadRequest(new { error = "workbookName and sheetName are required." });
    }

    var workspacePath = request.WorkspacePath.Trim();
    var alias = request.Alias;

    try
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            return Results.NotFound(new { error = $"Workbook '{workbookName}' was not found.", workspacePath });
        }

        if (!workbook.TryGetSheet(sheetName, out var sheet) || sheet is null)
        {
            return Results.NotFound(new { error = $"Sheet '{sheetName}' was not found in '{workbookName}'.", workspacePath });
        }

        var configFilePath = Path.Combine(workbook.DirectoryPath, $"{sheetName}_config.json");

        Dictionary<string, object?> current = new();
        if (File.Exists(configFilePath))
        {
            try
            {
                var raw = File.ReadAllText(configFilePath);
                current = JsonSerializer.Deserialize<Dictionary<string, object?>>(raw) ?? new Dictionary<string, object?>();
            }
            catch
            {
                current = new Dictionary<string, object?>();
            }
        }

        if (string.IsNullOrWhiteSpace(alias))
        {
            if (current.ContainsKey("alias")) current.Remove("alias");
        }
        else
        {
            current["alias"] = alias;
        }

        var serialized = JsonSerializer.Serialize(current, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(configFilePath, serialized);

        var reloadedWorkspace = LightyWorkspaceLoader.Load(workspacePath);
        return Results.Ok(ToWorkspaceNavigationResponse(reloadedWorkspace));
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new { error = exception.Message, path = exception.FileName });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new { error = exception.Message });
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new { error = exception.Message });
    }
    catch (IOException exception)
    {
        return Results.BadRequest(new { error = exception.Message });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new { error = exception.Message });
    }
});

app.MapPost("/api/workspace/workbooks/codegen/export", (ExportWorkbookCodegenRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    if (string.IsNullOrWhiteSpace(request.WorkbookName))
    {
        return Results.BadRequest(new
        {
            error = "workbookName is required.",
        });
    }

    var workspacePath = request.WorkspacePath.Trim();
    var workbookName = request.WorkbookName.Trim();

    try
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            return Results.NotFound(new
            {
                error = $"Workbook '{workbookName}' was not found.",
                workspacePath,
            });
        }

        var generator = new LightyWorkbookCodeGenerator();
        var package = generator.Generate(workspace, workbook);
        var outputDirectoryPath = GeneratedCodeOutputWriter.WriteGeneratedWorkbookPackage(workspace.RootPath, workbook.Name, package);
        var materializedFiles = GeneratedCodeOutputWriter.GetMaterializedRelativePaths(package.Files);

        return Results.Ok(new
        {
            workbookName,
            outputDirectoryPath,
            fileCount = materializedFiles.Count,
            files = materializedFiles,
            workbookCount = 1,
        });
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (IOException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapPost("/api/workspace/workbooks/codegen/validate", (ExportWorkbookCodegenRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    if (string.IsNullOrWhiteSpace(request.WorkbookName))
    {
        return Results.BadRequest(new
        {
            error = "workbookName is required.",
        });
    }

    var workspacePath = request.WorkspacePath.Trim();
    var workbookName = request.WorkbookName.Trim();

    try
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            return Results.NotFound(new
            {
                error = $"Workbook '{workbookName}' was not found.",
                workspacePath,
            });
        }

        var report = LightyWorkbookValidationService.ValidateWorkbook(workspace, workbook);
        if (!report.IsSuccess)
        {
            return Results.BadRequest(new
            {
                error = report.ToDisplayString(),
                errorCount = report.ErrorCount,
                workbookName,
            });
        }

        return Results.Ok(new
        {
            workbookName,
            errorCount = 0,
        });
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapPost("/api/workspace/workbooks/codegen/export-all", (ExportAllWorkbookCodegenRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    var workspacePath = request.WorkspacePath.Trim();

    try
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (workspace.Workbooks.Count == 0)
        {
            return Results.BadRequest(new
            {
                error = "The workspace does not contain any workbooks to export.",
                workspacePath,
            });
        }

        LightyWorkbookValidationService.ValidateWorkbooksOrThrow(workspace, workspace.Workbooks);

        var generator = new LightyWorkbookCodeGenerator();
        var workbookPackages = workspace.Workbooks
            .Select(workbook => (workbook.Name, Package: generator.Generate(workspace, workbook)))
            .ToList();
        var outputDirectoryPath = GeneratedCodeOutputWriter.WriteGeneratedWorkspacePackages(workspace.RootPath, workbookPackages);
        var materializedFiles = GeneratedCodeOutputWriter.GetMaterializedRelativePaths(workbookPackages.SelectMany(entry => entry.Package.Files));

        return Results.Ok(new
        {
            workbookName = string.Empty,
            outputDirectoryPath,
            fileCount = materializedFiles.Count,
            files = materializedFiles,
            workbookCount = workbookPackages.Count,
        });
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (IOException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapPost("/api/workspace/flowcharts/codegen/export", (ExportFlowChartCodegenRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    if (string.IsNullOrWhiteSpace(request.RelativePath))
    {
        return Results.BadRequest(new
        {
            error = "relativePath is required.",
        });
    }

    var workspacePath = request.WorkspacePath.Trim();
    var relativePath = LightyWorkspacePathLayout.NormalizeRelativeAssetPath(request.RelativePath);

    try
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (!workspace.TryGetFlowChartFile(relativePath, out var flowChartDocument) || flowChartDocument is null)
        {
            return Results.NotFound(new
            {
                error = $"FlowChart file '{relativePath}' was not found.",
                workspacePath,
            });
        }

        var generator = new LightyFlowChartFileCodeGenerator();
        var package = generator.Generate(workspace, relativePath);
        var outputDirectoryPath = GeneratedCodeOutputWriter.WriteGeneratedFlowChartPackage(workspace.RootPath, relativePath, package);
        var materializedFiles = GeneratedCodeOutputWriter.GetMaterializedRelativePaths(package.Files);

        return Results.Ok(new
        {
            relativePath,
            outputDirectoryPath,
            fileCount = materializedFiles.Count,
            files = materializedFiles,
            flowChartCount = 1,
        });
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (IOException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapPost("/api/workspace/flowcharts/codegen/export-batch", (ExportBatchFlowChartCodegenRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    if (request.RelativePaths is null || request.RelativePaths.Count == 0)
    {
        return Results.BadRequest(new
        {
            error = "relativePaths is required.",
        });
    }

    var workspacePath = request.WorkspacePath.Trim();
    var relativePaths = request.RelativePaths
        .Where(path => !string.IsNullOrWhiteSpace(path))
        .Select(LightyWorkspacePathLayout.NormalizeRelativeAssetPath)
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
        .ToList();

    if (relativePaths.Count == 0)
    {
        return Results.BadRequest(new
        {
            error = "relativePaths is required.",
        });
    }

    try
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        var missingRelativePath = relativePaths.FirstOrDefault(path => !workspace.TryGetFlowChartFile(path, out _));
        if (!string.IsNullOrWhiteSpace(missingRelativePath))
        {
            return Results.NotFound(new
            {
                error = $"FlowChart file '{missingRelativePath}' was not found.",
                workspacePath,
            });
        }

        var generator = new LightyFlowChartFileCodeGenerator();
        var package = generator.Generate(workspace, relativePaths);
        var outputDirectoryPath = GeneratedCodeOutputWriter.WriteGeneratedFlowChartPackages(workspace.RootPath, relativePaths, package);
        var materializedFiles = GeneratedCodeOutputWriter.GetMaterializedRelativePaths(package.Files);

        return Results.Ok(new
        {
            relativePaths,
            outputDirectoryPath,
            fileCount = materializedFiles.Count,
            files = materializedFiles,
            flowChartCount = relativePaths.Count,
        });
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (IOException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapPost("/api/workspace/flowcharts/codegen/export-all", (ExportAllFlowChartCodegenRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    var workspacePath = request.WorkspacePath.Trim();

    try
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (workspace.FlowChartFiles.Count == 0)
        {
            return Results.BadRequest(new
            {
                error = "The workspace does not contain any flowchart files to export.",
                workspacePath,
            });
        }

        var relativePaths = workspace.FlowChartFiles
            .Select(document => document.RelativePath)
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var generator = new LightyFlowChartFileCodeGenerator();
        var package = generator.Generate(workspace, relativePaths);
        var outputDirectoryPath = GeneratedCodeOutputWriter.WriteGeneratedWorkspaceFlowChartPackage(workspace.RootPath, package);
        var materializedFiles = GeneratedCodeOutputWriter.GetMaterializedRelativePaths(package.Files);

        return Results.Ok(new
        {
            relativePaths,
            outputDirectoryPath,
            fileCount = materializedFiles.Count,
            files = materializedFiles,
            flowChartCount = relativePaths.Count,
        });
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (IOException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapGet("/api/workspace/workbooks/{workbookName}", (string workbookName, string workspacePath) =>
{
    if (string.IsNullOrWhiteSpace(workspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    try
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            return Results.NotFound(new
            {
                error = $"Workbook '{workbookName}' was not found.",
                workspacePath,
            });
        }

        return Results.Ok(ToWorkbookResponse(workbook, previewOnly: false));
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapGet("/api/workspace/workbooks/{workbookName}/sheets/{sheetName}", (string workbookName, string sheetName, string workspacePath) =>
{
    if (string.IsNullOrWhiteSpace(workspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    try
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            return Results.NotFound(new
            {
                error = $"Workbook '{workbookName}' was not found.",
                workspacePath,
            });
        }

        if (!workbook.TryGetSheet(sheetName, out var sheet) || sheet is null)
        {
            return Results.NotFound(new
            {
                error = $"Sheet '{sheetName}' was not found in workbook '{workbookName}'.",
                workspacePath,
            });
        }

        return Results.Ok(ToSheetResponse(sheet, workbook.DirectoryPath, workbook.Name));
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapGet("/api/workspace/workbooks/{workbookName}/sheets/{sheetName}/metadata", (string workbookName, string sheetName, string workspacePath) =>
{
    if (string.IsNullOrWhiteSpace(workspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    try
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            return Results.NotFound(new
            {
                error = $"Workbook '{workbookName}' was not found.",
                workspacePath,
            });
        }

        if (!workbook.TryGetSheet(sheetName, out var sheet) || sheet is null)
        {
            return Results.NotFound(new
            {
                error = $"Sheet '{sheetName}' was not found in workbook '{workbookName}'.",
                workspacePath,
            });
        }

        return Results.Ok(ToSheetMetadataResponse(workbook.Name, sheet));
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapPost("/api/workspace/workbooks/save", (SaveWorkbookRequest request) =>
{
    if (request.Workbook is null)
    {
        return Results.BadRequest(new
        {
            error = "workbook is required.",
        });
    }

    if (string.IsNullOrWhiteSpace(request.WorkspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    var headersFilePath = Path.Combine(request.WorkspacePath, "headers.json");
    if (!File.Exists(headersFilePath))
    {
        return Results.NotFound(new
        {
            error = "headers.json was not found for the specified workspacePath.",
            request.WorkspacePath,
            headersFilePath,
        });
    }

    try
    {
        var workspace = LightyWorkspaceLoader.Load(request.WorkspacePath);
        var headerLayout = WorkspaceHeaderLayoutSerializer.LoadFromFile(headersFilePath);
        var workbook = MapToWorkbook(request.Workbook, request.WorkspacePath);
        LightyWorkbookWriter.Save(request.WorkspacePath, headerLayout, workbook, workspace.CodegenOptions, workspace.CodegenConfigFilePath);

        return Results.Ok(ToWorkbookResponse(workbook, previewOnly: false));
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
});

app.MapPost("/api/workspace/flowcharts/nodes/save", (SaveFlowChartAssetRequest request) =>
{
    return SaveFlowChartAsset(
        request,
        (workspacePath, relativePath, document) => LightyFlowChartAssetWriter.SaveNodeDefinition(workspacePath, relativePath, document),
        ToFlowChartNodeDefinitionResponse);
});

app.MapPost("/api/workspace/flowcharts/files/save", (SaveFlowChartAssetRequest request) =>
{
    return SaveFlowChartAsset(
        request,
        (workspacePath, relativePath, document) => LightyFlowChartAssetWriter.SaveFile(workspacePath, relativePath, document),
        ToFlowChartFileResponse);
});

app.MapPost("/api/workspace/flowcharts/assets/directories/create", (FlowChartAssetPathRequest request) =>
{
    return MutateFlowChartCatalog(request, (workspacePath, scope, relativePath) =>
    {
        LightyFlowChartAssetManager.CreateDirectory(workspacePath, scope, relativePath);
    });
});

app.MapPost("/api/workspace/flowcharts/assets/directories/rename", (RenameFlowChartAssetPathRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.NewRelativePath))
    {
        return Results.BadRequest(new
        {
            error = "newRelativePath is required.",
        });
    }

    return MutateFlowChartCatalog(
        new FlowChartAssetPathRequest
        {
            WorkspacePath = request.WorkspacePath,
            Scope = request.Scope,
            RelativePath = request.RelativePath,
        },
        (workspacePath, scope, relativePath) =>
        {
            LightyFlowChartAssetManager.RenameDirectory(workspacePath, scope, relativePath, request.NewRelativePath);
        });
});

app.MapPost("/api/workspace/flowcharts/assets/directories/delete", (FlowChartAssetPathRequest request) =>
{
    return MutateFlowChartCatalog(request, (workspacePath, scope, relativePath) =>
    {
        LightyFlowChartAssetManager.DeleteDirectory(workspacePath, scope, relativePath);
    });
});

app.MapPost("/api/workspace/flowcharts/assets/files/delete", (FlowChartAssetPathRequest request) =>
{
    return MutateFlowChartCatalog(request, (workspacePath, scope, relativePath) =>
    {
        LightyFlowChartAssetManager.DeleteFile(workspacePath, scope, relativePath);
    });
});

app.MapPost("/api/file-process/workbooks/import-excel", async (HttpRequest request) =>
{
    if (!request.HasFormContentType)
    {
        return Results.BadRequest(new
        {
            error = "Request content type must be multipart/form-data.",
        });
    }

    var form = await request.ReadFormAsync();
    var workspacePath = form["workspacePath"].ToString();
    var workbookName = form["workbookName"].ToString();
    var file = form.Files.GetFile("file");

    if (string.IsNullOrWhiteSpace(workspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    if (file is null || file.Length == 0)
    {
        return Results.BadRequest(new
        {
            error = "An uploaded xlsx file is required.",
        });
    }

    var headersFilePath = Path.Combine(workspacePath, "headers.json");
    if (!File.Exists(headersFilePath))
    {
        return Results.NotFound(new
        {
            error = "headers.json was not found for the specified workspacePath.",
            workspacePath,
            headersFilePath,
        });
    }

    try
    {
        var headerLayout = WorkspaceHeaderLayoutSerializer.LoadFromFile(headersFilePath);
        var resolvedWorkbookName = ResolveWorkbookName(workbookName, file.FileName);
        var importer = new LightyWorkbookExcelImporter();

        await using var stream = file.OpenReadStream();
        var workbook = importer.Import(
            stream,
            resolvedWorkbookName,
            headerLayout,
            LightyWorkspacePathLayout.GetWorkbookDirectoryPath(workspacePath, resolvedWorkbookName));

        return Results.Ok(ToWorkbookResponse(workbook, previewOnly: true));
    }
    catch (LightyExcelProcessException exception)
    {
        return Results.BadRequest(ToExcelErrorResponse(exception));
    }
});

app.MapGet("/api/file-process/workbooks/{workbookName}/export-excel", (string workbookName, string workspacePath) =>
{
    if (string.IsNullOrWhiteSpace(workspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    try
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            return Results.NotFound(new
            {
                error = $"Workbook '{workbookName}' was not found.",
                workspacePath,
            });
        }

        var exporter = new LightyWorkbookExcelExporter();
        using var stream = new MemoryStream();
        exporter.Export(workbook, workspace.HeaderLayout, stream);

        return Results.File(
            stream.ToArray(),
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            fileDownloadName: $"{workbook.Name}.xlsx");
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (LightyExcelProcessException exception)
    {
        return Results.BadRequest(ToExcelErrorResponse(exception));
    }
});

app.Run();

static object ToWorkspaceResponse(LightyWorkspace workspace)
{
    return new
    {
        workspace.RootPath,
        workspace.ConfigFilePath,
        workspace.HeadersFilePath,
        workspace.WorkbooksRootPath,
        workspace.FlowChartsRootPath,
        workspace.FlowChartNodesRootPath,
        workspace.FlowChartFilesRootPath,
        codegen = ToWorkspaceCodegenResponse(workspace),
        headerLayout = new
        {
            count = workspace.HeaderLayout.Count,
            rows = workspace.HeaderLayout.Rows.Select(row => new
            {
                row.HeaderType,
                configuration = JsonElementToObject(row.Configuration),
            }),
        },
        workbooks = workspace.Workbooks.Select(workbook => ToWorkbookResponse(workbook, previewOnly: false)),
        flowCharts = ToFlowChartCatalogResponse(workspace, includeDocument: true),
    };
}

static object ToWorkspaceNavigationResponse(LightyWorkspace workspace)
{
    return new
    {
        workspace.RootPath,
        workspace.ConfigFilePath,
        workspace.HeadersFilePath,
        workspace.WorkbooksRootPath,
        workspace.FlowChartsRootPath,
        workspace.FlowChartNodesRootPath,
        workspace.FlowChartFilesRootPath,
        codegen = ToWorkspaceCodegenResponse(workspace),
        headerLayout = new
        {
            count = workspace.HeaderLayout.Count,
            rows = workspace.HeaderLayout.Rows.Select(row => new
            {
                row.HeaderType,
            }),
        },
        workbooks = workspace.Workbooks.Select(workbook => new
        {
            workbook.Name,
            workbook.DirectoryPath,
            alias = ReadAliasFromConfig(Path.Combine(workbook.DirectoryPath, "config.json")),
            codegen = ToWorkbookCodegenResponse(workbook),
            sheetCount = workbook.Sheets.Count,
            sheets = workbook.Sheets.Select(sheet => ToSheetNavigationResponse(workbook.Name, workbook.DirectoryPath, sheet)),
        }),
        flowCharts = ToFlowChartCatalogResponse(workspace, includeDocument: false),
    };
}

static object ToWorkbookResponse(LightyWorkbook workbook, bool previewOnly)
{
    return new
    {
        workbook.Name,
        workbook.DirectoryPath,
        alias = ReadAliasFromConfig(Path.Combine(workbook.DirectoryPath, "config.json")),
        codegen = ToWorkbookCodegenResponse(workbook),
        previewOnly,
        sheets = workbook.Sheets.Select(sheet => ToSheetResponse(sheet, workbook.DirectoryPath, workbook.Name)),
    };
}

static object ToWorkspaceCodegenResponse(LightyWorkspace workspace)
{
    return new
    {
        outputRelativePath = workspace.CodegenOptions.OutputRelativePath,
    };
}

static object ToWorkbookCodegenResponse(LightyWorkbook workbook)
{
    return new
    {
        outputRelativePath = workbook.CodegenOptions.OutputRelativePath,
    };
}

static object ToSheetResponse(LightySheet sheet, string? workbookDirectory = null, string? workbookName = null)
{
    return new
    {
        metadata = ToSheetMetadataResponse(workbookName, sheet),
        alias = workbookDirectory is null ? null : ReadAliasFromConfig(Path.Combine(workbookDirectory, $"{sheet.Name}_config.json")),
        rows = sheet.Rows.Select(row => row.Cells.ToArray()),
    };
}

static object ToSheetMetadataResponse(string? workbookName, LightySheet sheet)
{
    return new
    {
        workbookName,
        sheet.Name,
        sheet.DataFilePath,
        sheet.HeaderFilePath,
        rowCount = sheet.RowCount,
        columnCount = sheet.Header.Count,
        columns = sheet.Header.Columns.Select(column => new
        {
            column.FieldName,
            column.Type,
            column.DisplayName,
            column.IsListType,
            column.IsReferenceType,
            attributes = column.Attributes.ToDictionary(
                pair => pair.Key,
                pair => JsonElementToObject(pair.Value)),
        }),
    };
}

static object ToSheetNavigationResponse(string workbookName, string workbookDirectory, LightySheet sheet)
{
    return new
    {
        workbookName,
        sheet.Name,
        sheet.DataFilePath,
        sheet.HeaderFilePath,
        rowCount = sheet.RowCount,
        columnCount = sheet.Header.Count,
        alias = ReadAliasFromConfig(Path.Combine(workbookDirectory, $"{sheet.Name}_config.json")),
    };
}

static object ToFlowChartCatalogResponse(LightyWorkspace workspace, bool includeDocument)
{
    return new
    {
        workspace.FlowChartsRootPath,
        workspace.FlowChartNodesRootPath,
        workspace.FlowChartFilesRootPath,
        nodeDirectories = GetFlowChartDirectoryPaths(workspace.FlowChartNodesRootPath),
        fileDirectories = GetFlowChartDirectoryPaths(workspace.FlowChartFilesRootPath),
        nodeDefinitions = workspace.FlowChartNodeDefinitions.Select(document => ToFlowChartNodeDefinitionResponse(document, includeDocument)),
        files = workspace.FlowChartFiles.Select(document => ToFlowChartFileResponse(document, includeDocument)),
    };
}

static IReadOnlyList<string> GetFlowChartDirectoryPaths(string rootDirectoryPath)
{
    if (!Directory.Exists(rootDirectoryPath))
    {
        return Array.Empty<string>();
    }

    return Directory
        .EnumerateDirectories(rootDirectoryPath, "*", SearchOption.AllDirectories)
        .Select(directoryPath => Path.GetRelativePath(rootDirectoryPath, directoryPath).Replace('\\', '/'))
        .Where(relativePath => !string.IsNullOrWhiteSpace(relativePath))
        .OrderBy(relativePath => relativePath, StringComparer.Ordinal)
        .ToArray();
}

static object ToFlowChartNodeDefinitionResponse(LightyFlowChartAssetDocument document, bool includeDocument)
{
    return new
    {
        kind = "flowchart-node",
        document.RelativePath,
        document.FilePath,
        document.Name,
        alias = ReadJsonStringProperty(document.Document, "alias"),
        nodeKind = ReadJsonStringProperty(document.Document, "nodeKind"),
        document = includeDocument ? document.Document : (JsonElement?)null,
    };
}

static object ToFlowChartFileResponse(LightyFlowChartAssetDocument document, bool includeDocument)
{
    return new
    {
        kind = "flowchart-file",
        document.RelativePath,
        document.FilePath,
        name = ReadJsonStringProperty(document.Document, "name") ?? document.Name,
        alias = ReadJsonStringProperty(document.Document, "alias"),
        document = includeDocument ? document.Document : (JsonElement?)null,
    };
}

static string? ReadAliasFromConfig(string configFilePath)
{
    try
    {
        if (!File.Exists(configFilePath)) return null;
        var raw = File.ReadAllText(configFilePath);
        using var doc = JsonDocument.Parse(raw);
        if (doc.RootElement.ValueKind == JsonValueKind.Object && doc.RootElement.TryGetProperty("alias", out var aliasProp) && aliasProp.ValueKind == JsonValueKind.String)
        {
            return aliasProp.GetString();
        }
    }
    catch
    {
        // ignore and return null on parse/IO errors
    }

    return null;
}

static object ToExcelErrorResponse(LightyExcelProcessException exception)
{
    return new
    {
        error = exception.Message,
        exception.WorksheetName,
        exception.CellAddress,
    };
}

object ToHeaderPropertySchemaResponse(LightyHeaderPropertySchema schema)
{
    return new
    {
        schema.HeaderType,
        schema.BindingSource,
        schema.BindingKey,
        schema.FieldName,
        schema.Label,
        schema.EditorKind,
        schema.ValueType,
        schema.Required,
        schema.Placeholder,
        options = schema.Options,
    };
}

object ToTypeMetadataResponse(LightyTypeMetadata metadata)
{
    return new
    {
        scalarTypes = metadata.ScalarTypes,
        containerTypes = metadata.ContainerTypes.Select(container => new
        {
            container.TypeName,
            container.DisplayName,
            slots = container.Slots.Select(slot => new
            {
                slot.SlotName,
                allowedKinds = slot.AllowedKinds,
            }),
        }),
        referenceType = new
        {
            metadata.ReferenceType.Prefix,
            metadata.ReferenceType.Format,
            metadata.ReferenceType.Example,
        },
        referenceTargets = metadata.ReferenceTargets.Select(workbook => new
        {
            workbook.WorkbookName,
            sheetNames = workbook.SheetNames,
        }),
    };
}

object ToTypeDescriptorResponse(LightyColumnTypeDescriptor descriptor)
{
    return new
    {
        rawType = descriptor.RawType,
        descriptor.TypeName,
        descriptor.GenericArguments,
        descriptor.ValueType,
        descriptor.IsList,
        descriptor.IsDictionary,
        descriptor.IsReference,
        referenceTarget = descriptor.ReferenceTarget is null
            ? null
            : new
            {
                descriptor.ReferenceTarget.WorkbookName,
                descriptor.ReferenceTarget.SheetName,
            },
        children = descriptor.GenericArguments
            .Select(LightyColumnTypeDescriptor.Parse)
            .Select(ToTypeDescriptorResponse),
    };
}

object ToValidationRuleSchemaResponse(LightyValidationRuleSchema schema)
{
    return new
    {
        schema.MainTypeKey,
        schema.TypeDisplayName,
        schema.Description,
        properties = schema.Properties.Select(property => new
        {
            property.Name,
            property.ValueType,
            property.Description,
            property.Required,
            defaultValue = property.DefaultValue,
            example = property.Example,
            property.Deprecated,
            property.AliasOf,
        }),
        nestedSchemas = schema.NestedSchemas.Select(nested => new
        {
            nested.PropertyName,
            nested.Label,
            nested.Description,
            schema = ToValidationRuleSchemaResponse(nested.Schema),
        }),
    };
}

bool ContainsSheetName(LightyWorkbook workbook, string candidateSheetName, string? excludedSheetName = null)
{
    return workbook.Sheets.Any(sheet =>
        string.Equals(sheet.Name, candidateSheetName, StringComparison.OrdinalIgnoreCase)
        && (excludedSheetName is null || !string.Equals(sheet.Name, excludedSheetName, StringComparison.OrdinalIgnoreCase)));
}

static string ResolveWorkbookName(string workbookName, string fileName)
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

static object? JsonElementToObject(System.Text.Json.JsonElement element)
{
    return element.ValueKind switch
    {
        System.Text.Json.JsonValueKind.String => element.GetString(),
        System.Text.Json.JsonValueKind.Number => element.TryGetInt64(out var longValue)
            ? longValue
            : element.TryGetDouble(out var doubleValue)
                ? doubleValue
                : element.GetRawText(),
        System.Text.Json.JsonValueKind.True => true,
        System.Text.Json.JsonValueKind.False => false,
        System.Text.Json.JsonValueKind.Null => null,
        _ => element.GetRawText(),
    };
}

static string? ReadJsonStringProperty(JsonElement element, string propertyName)
{
    if (element.ValueKind == JsonValueKind.Object
        && element.TryGetProperty(propertyName, out var property)
        && property.ValueKind == JsonValueKind.String)
    {
        return property.GetString();
    }

    return null;
}

static IResult TryReadWorkbookAsset(LightyWorkspace workspace, string workbookName)
{
    if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
    {
        return Results.NotFound(new
        {
            error = $"Workbook '{workbookName}' was not found.",
            workspace.RootPath,
        });
    }

    return Results.Ok(new
    {
        kind = "workbook",
        assetPath = workbookName,
        payload = ToWorkbookResponse(workbook, previewOnly: false),
    });
}

static IResult TryReadSheetAsset(LightyWorkspace workspace, string assetPath)
{
    var segments = assetPath.Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    if (segments.Length != 2)
    {
        return Results.BadRequest(new
        {
            error = "Sheet assetPath must use 'WorkbookName/SheetName'.",
            assetPath,
        });
    }

    var workbookName = segments[0];
    var sheetName = segments[1];

    if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
    {
        return Results.NotFound(new
        {
            error = $"Workbook '{workbookName}' was not found.",
            workspace.RootPath,
        });
    }

    if (!workbook.TryGetSheet(sheetName, out var sheet) || sheet is null)
    {
        return Results.NotFound(new
        {
            error = $"Sheet '{sheetName}' was not found in workbook '{workbookName}'.",
            workspace.RootPath,
        });
    }

    return Results.Ok(new
    {
        kind = "sheet",
        assetPath,
        payload = ToSheetResponse(sheet, workbook.DirectoryPath, workbook.Name),
    });
}

static IResult SaveFlowChartAsset(
    SaveFlowChartAssetRequest request,
    Func<string, string, JsonElement, LightyFlowChartAssetDocument> saveAction,
    Func<LightyFlowChartAssetDocument, bool, object> responseFactory)
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    if (string.IsNullOrWhiteSpace(request.RelativePath))
    {
        return Results.BadRequest(new
        {
            error = "relativePath is required.",
        });
    }

    if (request.Document is null)
    {
        return Results.BadRequest(new
        {
            error = "document is required.",
        });
    }

    try
    {
        LightyWorkspaceLoader.Load(request.WorkspacePath);
        var savedDocument = saveAction(request.WorkspacePath, request.RelativePath, request.Document.Value);
        return Results.Ok(responseFactory(savedDocument, true));
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (IOException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
}

static IResult MutateFlowChartCatalog(
    FlowChartAssetPathRequest request,
    Action<string, LightyFlowChartAssetScope, string> mutation)
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath))
    {
        return Results.BadRequest(new
        {
            error = "workspacePath is required.",
        });
    }

    if (string.IsNullOrWhiteSpace(request.Scope))
    {
        return Results.BadRequest(new
        {
            error = "scope is required.",
        });
    }

    if (string.IsNullOrWhiteSpace(request.RelativePath))
    {
        return Results.BadRequest(new
        {
            error = "relativePath is required.",
        });
    }

    if (!TryParseFlowChartAssetScope(request.Scope, out var scope))
    {
        return Results.BadRequest(new
        {
            error = $"Unsupported flowchart asset scope '{request.Scope}'.",
        });
    }

    var workspacePath = request.WorkspacePath.Trim();
    var relativePath = request.RelativePath.Trim();

    try
    {
        mutation(workspacePath, scope, relativePath);

        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        return Results.Ok(ToFlowChartCatalogResponse(workspace, includeDocument: false));
    }
    catch (FileNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
            path = exception.FileName,
        });
    }
    catch (DirectoryNotFoundException exception)
    {
        return Results.NotFound(new
        {
            error = exception.Message,
        });
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (IOException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
    catch (LightyCoreException exception)
    {
        return Results.BadRequest(new
        {
            error = exception.Message,
        });
    }
}

static bool TryParseFlowChartAssetScope(string scope, out LightyFlowChartAssetScope result)
{
    if (string.Equals(scope, "nodes", StringComparison.OrdinalIgnoreCase))
    {
        result = LightyFlowChartAssetScope.Nodes;
        return true;
    }

    if (string.Equals(scope, "files", StringComparison.OrdinalIgnoreCase))
    {
        result = LightyFlowChartAssetScope.Files;
        return true;
    }

    result = default;
    return false;
}

static LightyWorkbook MapToWorkbook(WorkbookPayload payload, string workspacePath)
{
    if (string.IsNullOrWhiteSpace(payload.Name))
    {
        throw new LightyCoreException("Workbook name cannot be empty.");
    }

    var workbookDirectory = LightyWorkspacePathLayout.GetWorkbookDirectoryPath(workspacePath, payload.Name);
    var workspace = LightyWorkspaceLoader.Load(workspacePath);
    var sheets = payload.Sheets.Select(sheet => MapToSheet(sheet, workbookDirectory, workspace, payload.Name)).ToList();
    var existingWorkbook = workspace.TryGetWorkbook(payload.Name, out var loadedWorkbook) ? loadedWorkbook : null;
    return new LightyWorkbook(
        payload.Name,
        workbookDirectory,
        sheets,
        existingWorkbook?.CodegenOptions,
        existingWorkbook?.CodegenConfigFilePath);
}

static LightySheet MapToSheet(
    SheetPayload payload,
    string workbookDirectory,
    LightyWorkspace workspace,
    string workbookName)
{
    if (string.IsNullOrWhiteSpace(payload.Name))
    {
        throw new LightyCoreException("Sheet name cannot be empty.");
    }

    var columns = payload.Columns.Select(column => new ColumnDefine(
        column.FieldName,
        column.Type,
        column.DisplayName,
        column.Attributes ?? new Dictionary<string, JsonElement>(StringComparer.Ordinal))).ToList();

    var rows = payload.Rows
        .Select((cells, index) => new LightySheetRow(index, cells))
        .ToList();

    LightySheetColumnValidator.Validate(columns, payload.Name, workspace, workbookName);

    return new LightySheet(
        payload.Name,
        Path.Combine(workbookDirectory, $"{payload.Name}.txt"),
        Path.Combine(workbookDirectory, $"{payload.Name}_header.json"),
        new LightySheetHeader(columns),
        rows);
}

sealed class SaveWorkbookRequest
{
    public string WorkspacePath { get; set; } = string.Empty;

    public WorkbookPayload? Workbook { get; set; }
}

sealed class CreateWorkspaceRequest
{
    public string ParentDirectoryPath { get; set; } = string.Empty;

    public string WorkspaceName { get; set; } = string.Empty;
}

sealed class WorkspacePathRequest
{
    public string WorkspacePath { get; set; } = string.Empty;
}

sealed class CreateWorkbookRequest
{
    public string WorkspacePath { get; set; } = string.Empty;

    public string WorkbookName { get; set; } = string.Empty;
}

sealed class DeleteWorkbookRequest
{
    public string WorkspacePath { get; set; } = string.Empty;

    public string WorkbookName { get; set; } = string.Empty;
}

sealed class CreateSheetRequest
{
    public string WorkspacePath { get; set; } = string.Empty;

    public string WorkbookName { get; set; } = string.Empty;

    public string SheetName { get; set; } = string.Empty;
}

sealed class DeleteSheetRequest
{
    public string WorkspacePath { get; set; } = string.Empty;

    public string WorkbookName { get; set; } = string.Empty;

    public string SheetName { get; set; } = string.Empty;
}

sealed class RenameSheetRequest
{
    public string WorkspacePath { get; set; } = string.Empty;

    public string WorkbookName { get; set; } = string.Empty;

    public string SheetName { get; set; } = string.Empty;

    public string NewSheetName { get; set; } = string.Empty;
}

sealed class SaveWorkbookCodegenConfigRequest
{
    public string WorkspacePath { get; set; } = string.Empty;

    public string? OutputRelativePath { get; set; }
}

sealed class SaveWorkbookConfigRequest
{
    public string WorkspacePath { get; set; } = string.Empty;

    public string? Alias { get; set; }
}

sealed class SaveSheetConfigRequest
{
    public string WorkspacePath { get; set; } = string.Empty;

    public string? Alias { get; set; }
}

sealed class ExportWorkbookCodegenRequest
{
    public string WorkspacePath { get; set; } = string.Empty;

    public string WorkbookName { get; set; } = string.Empty;
}

sealed class ExportAllWorkbookCodegenRequest
{
    public string WorkspacePath { get; set; } = string.Empty;
}

sealed class ExportFlowChartCodegenRequest
{
    public string WorkspacePath { get; set; } = string.Empty;

    public string RelativePath { get; set; } = string.Empty;
}

sealed class ExportBatchFlowChartCodegenRequest
{
    public string WorkspacePath { get; set; } = string.Empty;

    public List<string> RelativePaths { get; set; } = new();
}

sealed class ExportAllFlowChartCodegenRequest
{
    public string WorkspacePath { get; set; } = string.Empty;
}

sealed class SaveFlowChartAssetRequest
{
    public string WorkspacePath { get; set; } = string.Empty;

    public string RelativePath { get; set; } = string.Empty;

    public JsonElement? Document { get; set; }
}

sealed class FlowChartAssetPathRequest
{
    public string WorkspacePath { get; set; } = string.Empty;

    public string Scope { get; set; } = string.Empty;

    public string RelativePath { get; set; } = string.Empty;
}

sealed class RenameFlowChartAssetPathRequest
{
    public string WorkspacePath { get; set; } = string.Empty;

    public string Scope { get; set; } = string.Empty;

    public string RelativePath { get; set; } = string.Empty;

    public string NewRelativePath { get; set; } = string.Empty;
}

sealed class ValidateValidationRuleRequest
{
    public string WorkspacePath { get; set; } = string.Empty;

    public string Type { get; set; } = string.Empty;

    public JsonElement? Validation { get; set; }
}

sealed class WorkbookPayload
{
    public string Name { get; set; } = string.Empty;

    public List<SheetPayload> Sheets { get; set; } = new();
}

sealed class SheetPayload
{
    public string Name { get; set; } = string.Empty;

    public List<ColumnPayload> Columns { get; set; } = new();

    public List<List<string>> Rows { get; set; } = new();
}

sealed class ColumnPayload
{
    public string FieldName { get; set; } = string.Empty;

    public string Type { get; set; } = string.Empty;

    public string? DisplayName { get; set; }

    public Dictionary<string, JsonElement>? Attributes { get; set; }
}
