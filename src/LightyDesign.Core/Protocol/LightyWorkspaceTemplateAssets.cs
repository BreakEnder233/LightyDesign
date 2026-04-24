using System.Reflection;

namespace LightyDesign.Core;

internal static class LightyWorkspaceTemplateAssets
{
    private const string ResourcePrefix = "LightyDesign.Core.WorkspaceTemplate/";
    private const string NodeResourcePrefix = "LightyDesign.Core.WorkspaceTemplate/FlowCharts/Nodes/";

    public static void CopyStaticAssets(string workspaceRootPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);

        CopyAssets(workspaceRootPath, ResourcePrefix, overwriteExisting: true);
    }

    public static void CopyMissingNodeDefinitions(string workspaceRootPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);

        var nodesRootPath = LightyWorkspacePathLayout.GetFlowChartNodesRootPath(workspaceRootPath);
        Directory.CreateDirectory(nodesRootPath);
        CopyAssets(workspaceRootPath, NodeResourcePrefix, overwriteExisting: false, targetRootPath: nodesRootPath);
    }

    private static void CopyAssets(string workspaceRootPath, string resourcePrefix, bool overwriteExisting, string? targetRootPath = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);

        var assembly = typeof(LightyWorkspaceTemplateAssets).Assembly;
        var resourceNames = assembly
            .GetManifestResourceNames()
            .Where(resourceName => resourceName.StartsWith(resourcePrefix, StringComparison.Ordinal))
            .OrderBy(static resourceName => resourceName, StringComparer.Ordinal);

        foreach (var resourceName in resourceNames)
        {
            var relativePath = resourceName[resourcePrefix.Length..]
                .Replace('\\', '/')
                .TrimStart('/');
            if (string.IsNullOrWhiteSpace(relativePath))
            {
                continue;
            }

            var basePath = targetRootPath ?? workspaceRootPath;
            var targetPath = Path.Combine(new[] { basePath }.Concat(relativePath.Split('/')).ToArray());
            if (!overwriteExisting && File.Exists(targetPath))
            {
                continue;
            }

            Directory.CreateDirectory(Path.GetDirectoryName(targetPath)!);

            using var stream = assembly.GetManifestResourceStream(resourceName)
                ?? throw new LightyCoreException($"Workspace template asset '{resourceName}' could not be opened.");
            using var output = File.Create(targetPath);
            stream.CopyTo(output);
        }
    }
}