using System.Reflection;
using System.Text.Json;
using LightyDesign.Core;
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
        LightyWorkbookScaffolder.CreateDefault(workspacePath, workspace.HeaderLayout, workbookName);
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
        LightyWorkbookWriter.Save(workspacePath, workspace.HeaderLayout, updatedWorkbook);

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
        LightyWorkbookWriter.Save(workspacePath, workspace.HeaderLayout, updatedWorkbook);

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
        LightyWorkbookWriter.Save(workspacePath, workspace.HeaderLayout, updatedWorkbook);

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

        var codegenOptions = new LightyWorkbookCodegenOptions(request.OutputRelativePath);
        ValidateWorkbookCodegenOutputRelativePath(workspace.RootPath, codegenOptions.OutputRelativePath, allowEmpty: true);

        var updatedWorkbook = new LightyWorkbook(
            workbook.Name,
            workbook.DirectoryPath,
            workbook.Sheets,
            codegenOptions,
            workbook.CodegenConfigFilePath);
        LightyWorkbookWriter.Save(workspacePath, workspace.HeaderLayout, updatedWorkbook);

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
        var outputDirectoryPath = WriteGeneratedWorkbookPackage(workspace.RootPath, workbook.Name, package);

        return Results.Ok(new
        {
            workbookName,
            outputDirectoryPath,
            fileCount = package.Files.Count,
            files = package.Files.Select(file => file.RelativePath).ToArray(),
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

        return Results.Ok(ToSheetResponse(sheet));
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
        var headerLayout = WorkspaceHeaderLayoutSerializer.LoadFromFile(headersFilePath);
        var workbook = MapToWorkbook(request.Workbook, request.WorkspacePath);
        LightyWorkbookWriter.Save(request.WorkspacePath, headerLayout, workbook);

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
        var workbook = importer.Import(stream, resolvedWorkbookName, headerLayout, Path.Combine(workspacePath, resolvedWorkbookName));

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
    };
}

static object ToWorkspaceNavigationResponse(LightyWorkspace workspace)
{
    return new
    {
        workspace.RootPath,
        workspace.ConfigFilePath,
        workspace.HeadersFilePath,
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
            codegen = ToWorkbookCodegenResponse(workbook),
            sheetCount = workbook.Sheets.Count,
            sheets = workbook.Sheets.Select(sheet => ToSheetNavigationResponse(workbook.Name, sheet)),
        }),
    };
}

static object ToWorkbookResponse(LightyWorkbook workbook, bool previewOnly)
{
    return new
    {
        workbook.Name,
        workbook.DirectoryPath,
        codegen = ToWorkbookCodegenResponse(workbook),
        previewOnly,
        sheets = workbook.Sheets.Select(ToSheetResponse),
    };
}

static object ToWorkbookCodegenResponse(LightyWorkbook workbook)
{
    return new
    {
        outputRelativePath = workbook.CodegenOptions.OutputRelativePath,
    };
}

static object ToSheetResponse(LightySheet sheet)
{
    return new
    {
        metadata = ToSheetMetadataResponse(workbookName: null, sheet),
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

static object ToSheetNavigationResponse(string workbookName, LightySheet sheet)
{
    return new
    {
        workbookName,
        sheet.Name,
        sheet.DataFilePath,
        sheet.HeaderFilePath,
        rowCount = sheet.RowCount,
        columnCount = sheet.Header.Count,
    };
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

bool ContainsSheetName(LightyWorkbook workbook, string candidateSheetName, string? excludedSheetName = null)
{
    return workbook.Sheets.Any(sheet =>
        string.Equals(sheet.Name, candidateSheetName, StringComparison.OrdinalIgnoreCase)
        && (excludedSheetName is null || !string.Equals(sheet.Name, excludedSheetName, StringComparison.OrdinalIgnoreCase)));
}

string WriteGeneratedWorkbookPackage(string workspaceRootPath, string workbookName, LightyGeneratedWorkbookPackage package)
{
    var outputRootPath = ValidateWorkbookCodegenOutputRelativePath(workspaceRootPath, package.OutputRelativePath, allowEmpty: false);
    var workbookOutputDirectoryPath = Path.Combine(outputRootPath, workbookName);
    if (Directory.Exists(workbookOutputDirectoryPath))
    {
        Directory.Delete(workbookOutputDirectoryPath, recursive: true);
    }

    Directory.CreateDirectory(outputRootPath);

    foreach (var file in package.Files)
    {
        var absolutePath = Path.Combine(outputRootPath, file.RelativePath.Replace('/', Path.DirectorySeparatorChar));
        var directoryPath = Path.GetDirectoryName(absolutePath);
        if (!string.IsNullOrWhiteSpace(directoryPath))
        {
            Directory.CreateDirectory(directoryPath);
        }

        File.WriteAllText(absolutePath, file.Content);
    }

    var generatedWorkbookNames = GetGeneratedWorkbookNames(outputRootPath);
    if (!generatedWorkbookNames.Contains(workbookName, StringComparer.OrdinalIgnoreCase))
    {
        generatedWorkbookNames.Add(workbookName);
    }

    var generator = new LightyWorkbookCodeGenerator();
    var entryPointContent = generator.GenerateEntryPointFile(generatedWorkbookNames);
    File.WriteAllText(Path.Combine(outputRootPath, "LDD.cs"), entryPointContent);

    return outputRootPath;
}

List<string> GetGeneratedWorkbookNames(string outputRootPath)
{
    if (!Directory.Exists(outputRootPath))
    {
        return new List<string>();
    }

    return Directory.GetDirectories(outputRootPath)
        .Select(directoryPath => new
        {
            DirectoryPath = directoryPath,
            WorkbookName = Path.GetFileName(directoryPath),
        })
        .Where(entry => !string.IsNullOrWhiteSpace(entry.WorkbookName))
        .Where(entry => File.Exists(Path.Combine(entry.DirectoryPath, $"{entry.WorkbookName}.cs")))
        .Select(entry => entry.WorkbookName)
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
        .ToList();
}

string ValidateWorkbookCodegenOutputRelativePath(string workspaceRootPath, string? outputRelativePath, bool allowEmpty)
{
    if (string.IsNullOrWhiteSpace(outputRelativePath))
    {
        if (allowEmpty)
        {
            return workspaceRootPath;
        }

        throw new LightyCoreException("Workbook code generation output path is not configured. Please configure an output relative path first.");
    }

    var trimmed = outputRelativePath.Trim();
    if (Path.IsPathRooted(trimmed))
    {
        throw new LightyCoreException("Workbook code generation output path must be relative to the workspace root.");
    }

    var workspaceRootFullPath = Path.GetFullPath(workspaceRootPath);
    var combinedFullPath = Path.GetFullPath(Path.Combine(workspaceRootFullPath, trimmed));

    if (!combinedFullPath.StartsWith(workspaceRootFullPath, StringComparison.OrdinalIgnoreCase))
    {
        throw new LightyCoreException("Workbook code generation output path cannot escape the workspace root.");
    }

    return combinedFullPath;
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

static LightyWorkbook MapToWorkbook(WorkbookPayload payload, string workspacePath)
{
    if (string.IsNullOrWhiteSpace(payload.Name))
    {
        throw new LightyCoreException("Workbook name cannot be empty.");
    }

    var workbookDirectory = Path.Combine(workspacePath, payload.Name);
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

    public string WorkbookName { get; set; } = string.Empty;

    public string? OutputRelativePath { get; set; }
}

sealed class ExportWorkbookCodegenRequest
{
    public string WorkspacePath { get; set; } = string.Empty;

    public string WorkbookName { get; set; } = string.Empty;
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
