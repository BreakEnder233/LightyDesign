using LightyDesign.Application.Dtos;
using LightyDesign.Application.Exceptions;
using LightyDesign.Core;

namespace LightyDesign.Application.Services;

public sealed class WorkbookQueryService
{
    public object GetWorkbook(string workspacePath, string workbookName)
    {
        var workspace = LoadWorkspace(workspacePath);
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            throw new WorkbookNotFoundException(workbookName, workspacePath);
        }

        return WorkspaceResponseBuilder.ToWorkbookResponse(workbook, previewOnly: false);
    }

    public object GetSheet(string workspacePath, string workbookName, string sheetName)
    {
        var (workspace, workbook) = LoadWorkbook(workspacePath, workbookName);
        if (!workbook.TryGetSheet(sheetName, out var sheet) || sheet is null)
        {
            throw new SheetNotFoundException(sheetName, workbookName);
        }

        return WorkspaceResponseBuilder.ToSheetResponse(sheet, workbook.DirectoryPath, workbook.Name);
    }

    public object GetSheetMetadata(string workspacePath, string workbookName, string sheetName)
    {
        var (workspace, workbook) = LoadWorkbook(workspacePath, workbookName);
        if (!workbook.TryGetSheet(sheetName, out var sheet) || sheet is null)
        {
            throw new SheetNotFoundException(sheetName, workbookName);
        }

        return WorkspaceResponseBuilder.ToSheetMetadataResponse(workbook.Name, sheet);
    }

    public object ReadWorkbookAsset(string workspacePath, string workbookName)
    {
        var workspace = LoadWorkspace(workspacePath);
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            throw new WorkbookNotFoundException(workbookName, workspacePath);
        }

        return new
        {
            kind = "workbook",
            assetPath = workbookName,
            payload = WorkspaceResponseBuilder.ToWorkbookResponse(workbook, previewOnly: false),
        };
    }

    public object ReadSheetAsset(string workspacePath, string assetPath)
    {
        var segments = assetPath.Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (segments.Length != 2)
        {
            throw new Exceptions.ValidationException("Sheet assetPath must use 'WorkbookName/SheetName'.");
        }

        var workbookName = segments[0];
        var sheetName = segments[1];

        var workspace = LoadWorkspace(workspacePath);
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            throw new WorkbookNotFoundException(workbookName, workspacePath);
        }

        if (!workbook.TryGetSheet(sheetName, out var sheet) || sheet is null)
        {
            throw new SheetNotFoundException(sheetName, workbookName);
        }

        return new
        {
            kind = "sheet",
            assetPath,
            payload = WorkspaceResponseBuilder.ToSheetResponse(sheet, workbook.DirectoryPath, workbook.Name),
        };
    }

    private static LightyWorkspace LoadWorkspace(string workspacePath)
    {
        return LightyWorkspaceLoader.Load(workspacePath);
    }

    private static (LightyWorkspace Workspace, LightyWorkbook Workbook) LoadWorkbook(string workspacePath, string workbookName)
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            throw new WorkbookNotFoundException(workbookName, workspacePath);
        }

        return (workspace, workbook);
    }
}
