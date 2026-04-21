using System.Text.Json;

namespace LightyDesign.Core;

public static class LightyFlowChartAssetWriter
{
    public static LightyFlowChartAssetDocument SaveNodeDefinition(string workspaceRootPath, string relativePath, JsonElement document)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);
        return SaveDocument(
            LightyWorkspacePathLayout.GetFlowChartNodesRootPath(workspaceRootPath),
            LightyWorkspacePathLayout.GetFlowChartNodeDefinitionFilePath(workspaceRootPath, relativePath),
            document);
    }

    public static LightyFlowChartAssetDocument SaveFile(string workspaceRootPath, string relativePath, JsonElement document)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);
        return SaveDocument(
            LightyWorkspacePathLayout.GetFlowChartFilesRootPath(workspaceRootPath),
            LightyWorkspacePathLayout.GetFlowChartFilePath(workspaceRootPath, relativePath),
            document);
    }

    private static LightyFlowChartAssetDocument SaveDocument(string rootDirectoryPath, string filePath, JsonElement document)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(filePath)!);

        var options = new JsonSerializerOptions
        {
            WriteIndented = true,
        };

        File.WriteAllText(filePath, JsonSerializer.Serialize(document, options) + Environment.NewLine);
        return LightyFlowChartAssetLoader.LoadDocumentForSave(rootDirectoryPath, filePath);
    }
}
