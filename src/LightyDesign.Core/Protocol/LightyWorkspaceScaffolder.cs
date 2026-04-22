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
        var codegenConfigFilePath = Path.Combine(workspaceRootPath, LightyWorkbookCodegenOptionsSerializer.DefaultFileName);
        Directory.CreateDirectory(LightyWorkspacePathLayout.GetWorkbooksRootPath(workspaceRootPath));
        Directory.CreateDirectory(LightyWorkspacePathLayout.GetFlowChartNodesRootPath(workspaceRootPath));
        Directory.CreateDirectory(LightyWorkspacePathLayout.GetFlowChartFilesRootPath(workspaceRootPath));

        File.WriteAllText(configFilePath, "{}\n");
        WorkspaceHeaderLayoutSerializer.SaveToFile(headersFilePath, resolvedHeaderLayout);
        LightyWorkbookCodegenOptionsSerializer.SaveToFile(codegenConfigFilePath, new LightyWorkbookCodegenOptions());

        return LightyWorkspaceLoader.Load(workspaceRootPath);
    }
}
