namespace LightyDesign.Core;

public static class LightyWorkspaceScaffolder
{
    public static LightyWorkspace Create(string workspaceRootPath, WorkspaceHeaderLayout? headerLayout = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);

        if (Directory.Exists(workspaceRootPath) || File.Exists(workspaceRootPath))
        {
            throw new LightyCoreException($"Workspace target already exists: '{workspaceRootPath}'.");
        }

        Directory.CreateDirectory(workspaceRootPath);
        LightyWorkspaceTemplateAssets.CopyWorkspaceTemplate(workspaceRootPath);

        if (headerLayout is not null)
        {
            var headersFilePath = Path.Combine(workspaceRootPath, "headers.json");
            WorkspaceHeaderLayoutSerializer.SaveToFile(headersFilePath, headerLayout);
        }

        return LightyWorkspaceLoader.Load(workspaceRootPath);
    }

    public static LightyWorkspace RefreshBuiltinNodeDefinitions(string workspaceRootPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);

        if (!Directory.Exists(workspaceRootPath))
        {
            throw new DirectoryNotFoundException($"Workspace root directory was not found: '{workspaceRootPath}'.");
        }

        LightyWorkspaceTemplateAssets.RefreshNodeDefinitions(workspaceRootPath);
        return LightyWorkspaceLoader.Load(workspaceRootPath);
    }
}
