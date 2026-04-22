using System.Text.Json;

namespace LightyDesign.Core;

public static class LightyFlowChartAssetLoader
{
    public static IReadOnlyList<LightyFlowChartAssetDocument> LoadNodeDefinitions(string workspaceRootPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);
        return LoadDocuments(LightyWorkspacePathLayout.GetFlowChartNodesRootPath(workspaceRootPath));
    }

    public static IReadOnlyList<LightyFlowChartAssetDocument> LoadFiles(string workspaceRootPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);
        return LoadDocuments(LightyWorkspacePathLayout.GetFlowChartFilesRootPath(workspaceRootPath));
    }

    public static LightyFlowChartAssetDocument LoadNodeDefinition(string workspaceRootPath, string relativePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);
        return LoadDocument(
            LightyWorkspacePathLayout.GetFlowChartNodesRootPath(workspaceRootPath),
            LightyWorkspacePathLayout.GetFlowChartNodeDefinitionFilePath(workspaceRootPath, relativePath));
    }

    public static LightyFlowChartAssetDocument LoadFile(string workspaceRootPath, string relativePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);
        return LoadDocument(
            LightyWorkspacePathLayout.GetFlowChartFilesRootPath(workspaceRootPath),
            LightyWorkspacePathLayout.GetFlowChartFilePath(workspaceRootPath, relativePath));
    }

    private static IReadOnlyList<LightyFlowChartAssetDocument> LoadDocuments(string rootDirectoryPath)
    {
        if (!Directory.Exists(rootDirectoryPath))
        {
            return Array.Empty<LightyFlowChartAssetDocument>();
        }

        return Directory
            .EnumerateFiles(rootDirectoryPath, "*.json", SearchOption.AllDirectories)
            .Select(filePath => LoadDocument(rootDirectoryPath, filePath))
            .OrderBy(document => document.RelativePath, StringComparer.Ordinal)
            .ToList();
    }

    internal static LightyFlowChartAssetDocument LoadDocumentForSave(string rootDirectoryPath, string filePath)
    {
        return LoadDocument(rootDirectoryPath, filePath);
    }

    private static LightyFlowChartAssetDocument LoadDocument(string rootDirectoryPath, string filePath)
    {
        if (!File.Exists(filePath))
        {
            throw new FileNotFoundException("FlowChart asset file was not found.", filePath);
        }

        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(filePath));
            return new LightyFlowChartAssetDocument(
                LightyWorkspacePathLayout.GetRelativeAssetPath(rootDirectoryPath, filePath),
                filePath,
                document.RootElement);
        }
        catch (JsonException exception)
        {
            throw new LightyCoreException($"FlowChart asset file '{filePath}' contains invalid json.", exception);
        }
    }
}
