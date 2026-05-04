namespace LightyDesign.Core;

public enum LightyFlowChartAssetScope
{
    Nodes,
    Files,
}

public static class LightyFlowChartAssetManager
{
    public static void CreateDirectory(string workspaceRootPath, LightyFlowChartAssetScope scope, string relativePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);

        var normalizedRelativePath = LightyWorkspacePathLayout.NormalizeRelativeAssetPath(relativePath);
        var directoryPath = GetDirectoryPath(workspaceRootPath, scope, normalizedRelativePath);
        if (Directory.Exists(directoryPath))
        {
            throw new LightyCoreException($"FlowChart directory '{normalizedRelativePath}' already exists.");
        }

        Directory.CreateDirectory(directoryPath);
    }

    public static void DeleteFile(string workspaceRootPath, LightyFlowChartAssetScope scope, string relativePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);

        var filePath = GetFilePath(workspaceRootPath, scope, relativePath);
        if (!File.Exists(filePath))
        {
            throw new FileNotFoundException("FlowChart asset file was not found.", filePath);
        }

        File.Delete(filePath);
        CleanupEmptyDirectories(GetRootPath(workspaceRootPath, scope), Path.GetDirectoryName(filePath));
    }

    public static void MoveFile(string workspaceRootPath, LightyFlowChartAssetScope scope, string relativePath, string newRelativePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);

        var normalizedRelativePath = LightyWorkspacePathLayout.NormalizeRelativeAssetPath(relativePath);
        var normalizedNewRelativePath = LightyWorkspacePathLayout.NormalizeRelativeAssetPath(newRelativePath);
        var rootPath = GetRootPath(workspaceRootPath, scope);
        var sourceFilePath = GetFilePath(workspaceRootPath, scope, normalizedRelativePath);
        var targetFilePath = GetFilePath(workspaceRootPath, scope, normalizedNewRelativePath);

        if (!File.Exists(sourceFilePath))
        {
            throw new FileNotFoundException("FlowChart asset file was not found.", sourceFilePath);
        }

        var normalizedSourcePath = NormalizeFullPath(sourceFilePath);
        var normalizedTargetPath = NormalizeFullPath(targetFilePath);
        if (string.Equals(normalizedSourcePath, normalizedTargetPath, StringComparison.OrdinalIgnoreCase))
        {
            throw new LightyCoreException("The new file path must be different from the current path.");
        }

        if (File.Exists(targetFilePath))
        {
            throw new LightyCoreException($"FlowChart asset file '{normalizedNewRelativePath}' already exists.");
        }

        Directory.CreateDirectory(Path.GetDirectoryName(targetFilePath)!);
        File.Move(sourceFilePath, targetFilePath);
        CleanupEmptyDirectories(rootPath, Path.GetDirectoryName(sourceFilePath));
    }

    public static void MoveDirectory(string workspaceRootPath, LightyFlowChartAssetScope scope, string relativePath, string newRelativePath)
    {
        RenameDirectory(workspaceRootPath, scope, relativePath, newRelativePath);
    }

    public static void RenameDirectory(string workspaceRootPath, LightyFlowChartAssetScope scope, string relativePath, string newRelativePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);

        var normalizedRelativePath = LightyWorkspacePathLayout.NormalizeRelativeAssetPath(relativePath);
        var normalizedNewRelativePath = LightyWorkspacePathLayout.NormalizeRelativeAssetPath(newRelativePath);
        var rootPath = GetRootPath(workspaceRootPath, scope);
        var sourceDirectoryPath = GetDirectoryPath(workspaceRootPath, scope, normalizedRelativePath);
        var targetDirectoryPath = GetDirectoryPath(workspaceRootPath, scope, normalizedNewRelativePath);

        if (!Directory.Exists(sourceDirectoryPath))
        {
            throw new DirectoryNotFoundException($"FlowChart directory '{normalizedRelativePath}' was not found.");
        }

        var normalizedSourceDirectoryPath = NormalizeFullPath(sourceDirectoryPath);
        var normalizedTargetDirectoryPath = NormalizeFullPath(targetDirectoryPath);
        if (string.Equals(normalizedSourceDirectoryPath, normalizedTargetDirectoryPath, StringComparison.OrdinalIgnoreCase))
        {
            throw new LightyCoreException("The new directory path must be different from the current path.");
        }

        var sourcePrefix = normalizedSourceDirectoryPath + Path.DirectorySeparatorChar;
        if (normalizedTargetDirectoryPath.StartsWith(sourcePrefix, StringComparison.OrdinalIgnoreCase))
        {
            throw new LightyCoreException("Cannot move a FlowChart directory into one of its own descendants.");
        }

        if (Directory.Exists(targetDirectoryPath))
        {
            throw new LightyCoreException($"FlowChart directory '{normalizedNewRelativePath}' already exists.");
        }

        Directory.CreateDirectory(Path.GetDirectoryName(targetDirectoryPath)!);
        Directory.Move(sourceDirectoryPath, targetDirectoryPath);
        CleanupEmptyDirectories(rootPath, Path.GetDirectoryName(sourceDirectoryPath));
    }

    public static void DeleteDirectory(string workspaceRootPath, LightyFlowChartAssetScope scope, string relativePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);

        var normalizedRelativePath = LightyWorkspacePathLayout.NormalizeRelativeAssetPath(relativePath);
        var rootPath = GetRootPath(workspaceRootPath, scope);
        var directoryPath = GetDirectoryPath(workspaceRootPath, scope, normalizedRelativePath);
        if (!Directory.Exists(directoryPath))
        {
            throw new DirectoryNotFoundException($"FlowChart directory '{normalizedRelativePath}' was not found.");
        }

        Directory.Delete(directoryPath, recursive: true);
        CleanupEmptyDirectories(rootPath, Path.GetDirectoryName(directoryPath));
    }

    private static string GetRootPath(string workspaceRootPath, LightyFlowChartAssetScope scope)
    {
        return scope switch
        {
            LightyFlowChartAssetScope.Nodes => LightyWorkspacePathLayout.GetFlowChartNodesRootPath(workspaceRootPath),
            LightyFlowChartAssetScope.Files => LightyWorkspacePathLayout.GetFlowChartFilesRootPath(workspaceRootPath),
            _ => throw new ArgumentOutOfRangeException(nameof(scope)),
        };
    }

    private static string GetFilePath(string workspaceRootPath, LightyFlowChartAssetScope scope, string relativePath)
    {
        return scope switch
        {
            LightyFlowChartAssetScope.Nodes => LightyWorkspacePathLayout.GetFlowChartNodeDefinitionFilePath(workspaceRootPath, relativePath),
            LightyFlowChartAssetScope.Files => LightyWorkspacePathLayout.GetFlowChartFilePath(workspaceRootPath, relativePath),
            _ => throw new ArgumentOutOfRangeException(nameof(scope)),
        };
    }

    private static string GetDirectoryPath(string workspaceRootPath, LightyFlowChartAssetScope scope, string relativePath)
    {
        var rootPath = GetRootPath(workspaceRootPath, scope);
        var normalizedRelativePath = LightyWorkspacePathLayout.NormalizeRelativeAssetPath(relativePath);
        var segments = normalizedRelativePath.Split('/');
        return Path.Combine(new[] { rootPath }.Concat(segments).ToArray());
    }

    private static void CleanupEmptyDirectories(string rootPath, string? startingDirectoryPath)
    {
        if (string.IsNullOrWhiteSpace(startingDirectoryPath) || !Directory.Exists(rootPath))
        {
            return;
        }

        var normalizedRootPath = NormalizeFullPath(rootPath);
        var currentDirectoryPath = startingDirectoryPath;

        while (!string.IsNullOrWhiteSpace(currentDirectoryPath) && Directory.Exists(currentDirectoryPath))
        {
            var normalizedCurrentDirectoryPath = NormalizeFullPath(currentDirectoryPath);
            if (string.Equals(normalizedCurrentDirectoryPath, normalizedRootPath, StringComparison.OrdinalIgnoreCase))
            {
                break;
            }

            if (Directory.EnumerateFileSystemEntries(currentDirectoryPath).Any())
            {
                break;
            }

            Directory.Delete(currentDirectoryPath, recursive: false);
            currentDirectoryPath = Path.GetDirectoryName(currentDirectoryPath);
        }
    }

    private static string NormalizeFullPath(string path)
    {
        return Path.TrimEndingDirectorySeparator(Path.GetFullPath(path));
    }
}