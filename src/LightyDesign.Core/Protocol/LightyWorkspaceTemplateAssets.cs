using System.Reflection;

namespace LightyDesign.Core;

internal static class LightyWorkspaceTemplateAssets
{
    private const string ResourcePrefix = "LightyDesign.Core.WorkspaceTemplate/";

    public static void CopyStaticAssets(string workspaceRootPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);

        var assembly = typeof(LightyWorkspaceTemplateAssets).Assembly;
        var resourceNames = assembly
            .GetManifestResourceNames()
            .Where(static resourceName => resourceName.StartsWith(ResourcePrefix, StringComparison.Ordinal))
            .OrderBy(static resourceName => resourceName, StringComparer.Ordinal);

        foreach (var resourceName in resourceNames)
        {
            var relativePath = resourceName[ResourcePrefix.Length..]
                .Replace('\\', '/')
                .TrimStart('/');
            if (string.IsNullOrWhiteSpace(relativePath))
            {
                continue;
            }

            var targetPath = Path.Combine(new[] { workspaceRootPath }.Concat(relativePath.Split('/')).ToArray());
            Directory.CreateDirectory(Path.GetDirectoryName(targetPath)!);

            using var stream = assembly.GetManifestResourceStream(resourceName)
                ?? throw new LightyCoreException($"Workspace template asset '{resourceName}' could not be opened.");
            using var output = File.Create(targetPath);
            stream.CopyTo(output);
        }
    }
}