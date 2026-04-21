using System.Text.Json;
using LightyDesign.Core;

namespace LightyDesign.Tests;

public class FlowChartWorkspaceTests
{
    [Fact]
    public void WorkspaceLoader_ShouldLoadFlowChartAssetsFromWorkspaceRoots()
    {
        var workspaceRoot = CreateWorkspaceDirectory();

        try
        {
            LightyWorkspaceScaffolder.Create(workspaceRoot);

            var nodeDefinitionPath = LightyWorkspacePathLayout.GetFlowChartNodeDefinitionFilePath(workspaceRoot, "Event/Player/OnEnterScene");
            Directory.CreateDirectory(Path.GetDirectoryName(nodeDefinitionPath)!);
            File.WriteAllText(
                nodeDefinitionPath,
                """
                {
                  "formatVersion": "1.0",
                  "name": "OnEnterScene",
                  "alias": "进入场景",
                  "nodeKind": "event",
                  "properties": [],
                  "computePorts": [],
                  "flowPorts": []
                }
                """);

            var flowChartFilePath = LightyWorkspacePathLayout.GetFlowChartFilePath(workspaceRoot, "Main/LoginFlow");
            Directory.CreateDirectory(Path.GetDirectoryName(flowChartFilePath)!);
            File.WriteAllText(
                flowChartFilePath,
                """
                {
                  "formatVersion": "1.0",
                  "name": "LoginFlow",
                  "alias": "登录流程",
                  "nodes": [],
                  "flowConnections": [],
                  "computeConnections": []
                }
                """);

            var workspace = LightyWorkspaceLoader.Load(workspaceRoot);

            var nodeDefinition = Assert.Single(workspace.FlowChartNodeDefinitions);
            Assert.Equal("Event/Player/OnEnterScene", nodeDefinition.RelativePath);
            Assert.Equal("OnEnterScene", nodeDefinition.Name);

            var flowChartFile = Assert.Single(workspace.FlowChartFiles);
            Assert.Equal("Main/LoginFlow", flowChartFile.RelativePath);
            Assert.Equal("LoginFlow", flowChartFile.Name);
            Assert.True(workspace.TryGetFlowChartFile("Main/LoginFlow", out var loadedFlowChartFile));
            Assert.NotNull(loadedFlowChartFile);
        }
        finally
        {
            if (Directory.Exists(workspaceRoot))
            {
                Directory.Delete(workspaceRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void FlowChartAssetWriter_ShouldPersistNodeDefinitionsAndFlowChartFiles()
    {
        var workspaceRoot = CreateWorkspaceDirectory();

        try
        {
            LightyWorkspaceScaffolder.Create(workspaceRoot);

            using var nodeDefinitionDocument = JsonDocument.Parse(
                """
                {
                  "formatVersion": "1.0",
                  "name": "OnEnterScene",
                  "alias": "进入场景",
                  "nodeKind": "event",
                  "properties": [],
                  "computePorts": [],
                  "flowPorts": []
                }
                """);
            using var flowChartFileDocument = JsonDocument.Parse(
                """
                {
                  "formatVersion": "1.0",
                  "name": "LoginFlow",
                  "alias": "登录流程",
                  "nodes": [],
                  "flowConnections": [],
                  "computeConnections": []
                }
                """);

            var savedNodeDefinition = LightyFlowChartAssetWriter.SaveNodeDefinition(
                workspaceRoot,
                "Event/Player/OnEnterScene",
                nodeDefinitionDocument.RootElement);
            var savedFlowChartFile = LightyFlowChartAssetWriter.SaveFile(
                workspaceRoot,
                "Main/LoginFlow",
                flowChartFileDocument.RootElement);

            Assert.True(File.Exists(savedNodeDefinition.FilePath));
            Assert.True(File.Exists(savedFlowChartFile.FilePath));

            var reloadedWorkspace = LightyWorkspaceLoader.Load(workspaceRoot);
            var reloadedNodeDefinition = Assert.Single(reloadedWorkspace.FlowChartNodeDefinitions);
            var reloadedFlowChartFile = Assert.Single(reloadedWorkspace.FlowChartFiles);

            Assert.Equal("event", reloadedNodeDefinition.Document.GetProperty("nodeKind").GetString());
            Assert.Equal("LoginFlow", reloadedFlowChartFile.Document.GetProperty("name").GetString());
        }
        finally
        {
            if (Directory.Exists(workspaceRoot))
            {
                Directory.Delete(workspaceRoot, recursive: true);
            }
        }
    }

    private static string CreateWorkspaceDirectory()
    {
        var root = Path.Combine(Path.GetTempPath(), $"LightyDesign.Tests.{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        return root;
    }
}
