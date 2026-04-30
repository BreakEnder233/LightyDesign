using LightyDesign.Application.Dtos;
using LightyDesign.Core;

namespace LightyDesign.Application.Services;

public sealed class WorkspaceQueryService
{
    public object GetNavigation(string workspacePath)
    {
        var workspace = LoadWorkspace(workspacePath);
        return WorkspaceResponseBuilder.ToWorkspaceNavigationResponse(workspace);
    }

    public object GetWorkspace(string workspacePath)
    {
        var workspace = LoadWorkspace(workspacePath);
        return WorkspaceResponseBuilder.ToWorkspaceResponse(workspace);
    }

    public object GetSummary(string repositoryRoot, string[] workspaceFolders)
    {
        return new
        {
            repositoryRoot,
            folders = workspaceFolders
                .Select(folder => new
                {
                    name = folder,
                    exists = Directory.Exists(Path.Combine(repositoryRoot, folder)),
                })
                .ToArray(),
        };
    }

    public object GetFlowChartCatalog(string workspacePath, bool includeDocument)
    {
        var workspace = LoadWorkspace(workspacePath);
        return FlowChartResponseBuilder.ToFlowChartCatalogResponse(workspace, includeDocument);
    }

    private static LightyWorkspace LoadWorkspace(string workspacePath)
    {
        return LightyWorkspaceLoader.Load(workspacePath);
    }
}
