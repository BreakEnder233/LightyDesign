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

        var resolvedHeaderLayout = headerLayout ?? WorkspaceHeaderLayout.CreateDefault();
        Directory.CreateDirectory(workspaceRootPath);

        var configFilePath = Path.Combine(workspaceRootPath, "config.json");
        var headersFilePath = Path.Combine(workspaceRootPath, "headers.json");

        File.WriteAllText(configFilePath, "{}\n");
        WorkspaceHeaderLayoutSerializer.SaveToFile(headersFilePath, resolvedHeaderLayout);

        return LightyWorkspaceLoader.Load(workspaceRootPath);
    }
}