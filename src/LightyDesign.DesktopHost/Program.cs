using System.Reflection;
using System.Text.Json;
using LightyDesign.Core;
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
        previewOnly,
        sheets = workbook.Sheets.Select(ToSheetResponse),
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
    var sheets = payload.Sheets.Select(sheet => MapToSheet(sheet, workbookDirectory)).ToList();
    return new LightyWorkbook(payload.Name, workbookDirectory, sheets);
}

static LightySheet MapToSheet(SheetPayload payload, string workbookDirectory)
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
