using System.Text.Json;
using LightyDesign.Core;

namespace LightyDesign.Application.Dtos;

public static class FlowChartResponseBuilder
{
    // ── FlowChart 目录响应 ──

    public static object ToFlowChartCatalogResponse(LightyWorkspace workspace, bool includeDocument)
    {
        return new
        {
            workspace.FlowChartsRootPath,
            workspace.FlowChartNodesRootPath,
            workspace.FlowChartFilesRootPath,
            nodeDirectories = WorkspaceResponseBuilder.GetFlowChartDirectoryPaths(workspace.FlowChartNodesRootPath),
            fileDirectories = WorkspaceResponseBuilder.GetFlowChartDirectoryPaths(workspace.FlowChartFilesRootPath),
            nodeDefinitions = workspace.FlowChartNodeDefinitions.Select(document => ToFlowChartNodeDefinitionResponse(document, includeDocument)),
            files = workspace.FlowChartFiles.Select(document => ToFlowChartFileResponse(document, includeDocument)),
        };
    }

    // ── 节点定义响应 ──

    public static object ToFlowChartNodeDefinitionResponse(LightyFlowChartAssetDocument document, bool includeDocument)
    {
        return new
        {
            kind = "flowchart-node",
            document.RelativePath,
            document.FilePath,
            document.Name,
            alias = ReadJsonStringProperty(document.Document, "alias"),
            nodeKind = ReadJsonStringProperty(document.Document, "nodeKind"),
            description = ReadJsonStringProperty(document.Document, "description"),
            document = includeDocument ? document.Document : (JsonElement?)null,
        };
    }

    // ── 流程图文件响应 ──

    public static object ToFlowChartFileResponse(LightyFlowChartAssetDocument document, bool includeDocument)
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

    // ── 辅助方法 ──

    public static string? ReadJsonStringProperty(JsonElement element, string propertyName)
    {
        if (element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(propertyName, out var property)
            && property.ValueKind == JsonValueKind.String)
        {
            return property.GetString();
        }

        return null;
    }
}
