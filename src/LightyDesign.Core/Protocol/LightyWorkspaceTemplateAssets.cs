using System.Reflection;

namespace LightyDesign.Core;

internal static class LightyWorkspaceTemplateAssets
{
    private const string ResourcePrefix = "LightyDesign.Core.WorkspaceTemplate/";
    private const string NodeResourcePrefix = "LightyDesign.Core.WorkspaceTemplate/FlowCharts/Nodes/";

    public static void CopyWorkspaceTemplate(string workspaceRootPath)
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

    public static bool TryCopyMissingNodeDefinitions(string workspaceRootPath)
    {
        try
        {
            CopyMissingNodeDefinitions(workspaceRootPath);
            return true;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            return false;
        }
    }

    public static void RefreshNodeDefinitions(string workspaceRootPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);

        var nodesRootPath = LightyWorkspacePathLayout.GetFlowChartNodesRootPath(workspaceRootPath);
        Directory.CreateDirectory(nodesRootPath);
        CopyAssets(workspaceRootPath, NodeResourcePrefix, overwriteExisting: true, targetRootPath: nodesRootPath);
    }

    private static void CopyAssets(string workspaceRootPath, string resourcePrefix, bool overwriteExisting, string? targetRootPath = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);

        var assembly = typeof(LightyWorkspaceTemplateAssets).Assembly;
        var resourceNames = assembly
            .GetManifestResourceNames()
            .Select(resourceName => new
            {
                ResourceName = resourceName,
                NormalizedResourceName = resourceName.Replace('\\', '/'),
            })
            .Where(resource => resource.NormalizedResourceName.StartsWith(resourcePrefix, StringComparison.Ordinal))
            .OrderBy(static resource => resource.NormalizedResourceName, StringComparer.Ordinal);

        foreach (var resource in resourceNames)
        {
            var relativePath = resource.NormalizedResourceName[resourcePrefix.Length..]
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

            using var stream = assembly.GetManifestResourceStream(resource.ResourceName)
                ?? throw new LightyCoreException($"Workspace template asset '{resource.ResourceName}' could not be opened.");
            using var output = File.Create(targetPath);
            stream.CopyTo(output);
        }
    }
}