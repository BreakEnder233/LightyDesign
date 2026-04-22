namespace LightyDesign.Core;

public static class LightyWorkspacePathLayout
{
    public const string WorkbooksDirectoryName = "Workbooks";
    public const string FlowChartsDirectoryName = "FlowCharts";
    public const string FlowChartNodesDirectoryName = "Nodes";
    public const string FlowChartFilesDirectoryName = "Files";

    public static string GetWorkbooksRootPath(string workspaceRootPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);
        return Path.Combine(workspaceRootPath, WorkbooksDirectoryName);
    }

    public static string GetWorkbookDirectoryPath(string workspaceRootPath, string workbookName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);
        ArgumentException.ThrowIfNullOrWhiteSpace(workbookName);
        return Path.Combine(GetWorkbooksRootPath(workspaceRootPath), workbookName.Trim());
    }

    public static string GetFlowChartsRootPath(string workspaceRootPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);
        return Path.Combine(workspaceRootPath, FlowChartsDirectoryName);
    }

    public static string GetFlowChartNodesRootPath(string workspaceRootPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);
        return Path.Combine(GetFlowChartsRootPath(workspaceRootPath), FlowChartNodesDirectoryName);
    }

    public static string GetFlowChartFilesRootPath(string workspaceRootPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);
        return Path.Combine(GetFlowChartsRootPath(workspaceRootPath), FlowChartFilesDirectoryName);
    }

    public static string GetFlowChartNodeDefinitionFilePath(string workspaceRootPath, string relativePath)
    {
        return BuildJsonAssetFilePath(GetFlowChartNodesRootPath(workspaceRootPath), relativePath);
    }

    public static string GetFlowChartFilePath(string workspaceRootPath, string relativePath)
    {
        return BuildJsonAssetFilePath(GetFlowChartFilesRootPath(workspaceRootPath), relativePath);
    }

    public static string NormalizeRelativeAssetPath(string relativePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(relativePath);

        var normalized = relativePath.Trim().Replace('\\', '/');
        if (normalized.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
        {
            normalized = normalized[..^5];
        }

        normalized = normalized.Trim('/');
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new LightyCoreException("Asset relative path cannot be empty.");
        }

        var segments = normalized.Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (segments.Length == 0)
        {
            throw new LightyCoreException("Asset relative path cannot be empty.");
        }

        foreach (var segment in segments)
        {
            if (segment is "." or "..")
            {
                throw new LightyCoreException($"Asset relative path '{relativePath}' contains an invalid traversal segment.");
            }

            if (segment.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
            {
                throw new LightyCoreException($"Asset relative path '{relativePath}' contains invalid path characters.");
            }
        }

        return string.Join('/', segments);
    }

    public static string GetRelativeAssetPath(string rootDirectoryPath, string filePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(rootDirectoryPath);
        ArgumentException.ThrowIfNullOrWhiteSpace(filePath);

        var relativeFilePath = Path.GetRelativePath(rootDirectoryPath, filePath);
        if (relativeFilePath.StartsWith("..", StringComparison.Ordinal))
        {
            throw new LightyCoreException($"Asset file '{filePath}' is outside the asset root '{rootDirectoryPath}'.");
        }

        var normalizedFilePath = relativeFilePath.Replace('\\', '/');
        if (!normalizedFilePath.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
        {
            throw new LightyCoreException($"Asset file '{filePath}' is not a json file.");
        }

        return NormalizeRelativeAssetPath(normalizedFilePath[..^5]);
    }

    private static string BuildJsonAssetFilePath(string rootDirectoryPath, string relativePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(rootDirectoryPath);

        var normalizedRelativePath = NormalizeRelativeAssetPath(relativePath);
        var segments = normalizedRelativePath.Split('/');
        var filePath = Path.Combine(new[] { rootDirectoryPath }.Concat(segments).ToArray());
        return $"{filePath}.json";
    }
}
