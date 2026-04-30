using System.Text.Json;
using LightyDesign.Application.Dtos;
using LightyDesign.Application.Exceptions;
using LightyDesign.Core;

namespace LightyDesign.Application.Services;

public sealed class FlowChartService
{
    public object GetNodeDefinition(string workspacePath, string relativePath)
    {
        var document = LightyFlowChartAssetLoader.LoadNodeDefinition(workspacePath, relativePath);
        return FlowChartResponseBuilder.ToFlowChartNodeDefinitionResponse(document, includeDocument: true);
    }

    public object GetFile(string workspacePath, string relativePath)
    {
        var document = LightyFlowChartAssetLoader.LoadFile(workspacePath, relativePath);
        return FlowChartResponseBuilder.ToFlowChartFileResponse(document, includeDocument: true);
    }

    public object SaveNode(string workspacePath, string relativePath, JsonElement document)
    {
        LightyWorkspaceLoader.Load(workspacePath);
        var savedDocument = LightyFlowChartAssetWriter.SaveNodeDefinition(workspacePath, relativePath, document);
        return FlowChartResponseBuilder.ToFlowChartNodeDefinitionResponse(savedDocument, includeDocument: true);
    }

    public object SaveFile(string workspacePath, string relativePath, JsonElement document)
    {
        LightyWorkspaceLoader.Load(workspacePath);
        var savedDocument = LightyFlowChartAssetWriter.SaveFile(workspacePath, relativePath, document);
        return FlowChartResponseBuilder.ToFlowChartFileResponse(savedDocument, includeDocument: true);
    }

    public object ReadAsset(string workspacePath, string assetKind, string assetPath)
    {
        return assetKind switch
        {
            "workbook" => ReadWorkbookAsset(workspacePath, assetPath),
            "sheet" => ReadSheetAsset(workspacePath, assetPath),
            "flowchart-node" => GetNodeDefinition(workspacePath, assetPath),
            "flowchart-file" => GetFile(workspacePath, assetPath),
            _ => throw new Exceptions.ValidationException($"Unsupported assetKind '{assetKind}'."),
        };
    }

    public object CreateDirectory(string workspacePath, string scope, string relativePath)
    {
        var parsedScope = ParseScope(scope);
        LightyFlowChartAssetManager.CreateDirectory(workspacePath, parsedScope, relativePath);
        return ReloadFlowChartCatalog(workspacePath);
    }

    public object RenameDirectory(string workspacePath, string scope, string relativePath, string newRelativePath)
    {
        var parsedScope = ParseScope(scope);
        LightyFlowChartAssetManager.RenameDirectory(workspacePath, parsedScope, relativePath, newRelativePath);
        return ReloadFlowChartCatalog(workspacePath);
    }

    public object DeleteDirectory(string workspacePath, string scope, string relativePath)
    {
        var parsedScope = ParseScope(scope);
        LightyFlowChartAssetManager.DeleteDirectory(workspacePath, parsedScope, relativePath);
        return ReloadFlowChartCatalog(workspacePath);
    }

    public object DeleteFile(string workspacePath, string scope, string relativePath)
    {
        var parsedScope = ParseScope(scope);
        LightyFlowChartAssetManager.DeleteFile(workspacePath, parsedScope, relativePath);
        return ReloadFlowChartCatalog(workspacePath);
    }

    // ── 内部辅助方法 ──

    private static object ReadWorkbookAsset(string workspacePath, string workbookName)
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
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

    private static object ReadSheetAsset(string workspacePath, string assetPath)
    {
        var segments = assetPath.Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (segments.Length != 2)
        {
            throw new Exceptions.ValidationException("Sheet assetPath must use 'WorkbookName/SheetName'.");
        }

        var workbookName = segments[0];
        var sheetName = segments[1];
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
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

    private static LightyFlowChartAssetScope ParseScope(string scope)
    {
        if (string.Equals(scope, "nodes", StringComparison.OrdinalIgnoreCase))
            return LightyFlowChartAssetScope.Nodes;
        if (string.Equals(scope, "files", StringComparison.OrdinalIgnoreCase))
            return LightyFlowChartAssetScope.Files;

        throw new Exceptions.ValidationException($"Unsupported flowchart asset scope '{scope}'.");
    }

    private static object ReloadFlowChartCatalog(string workspacePath)
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        return FlowChartResponseBuilder.ToFlowChartCatalogResponse(workspace, includeDocument: false);
    }
}
