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

            var nodeDefinition = Assert.Single(workspace.FlowChartNodeDefinitions.Where(document => document.RelativePath == "Event/Player/OnEnterScene"));
            Assert.Equal("OnEnterScene", nodeDefinition.Name);
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/List/Add");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/List/Count");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/List/GetAt");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/List/ForEach");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/Dictionary/Set");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/Dictionary/Get");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/Dictionary/ContainsKey");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/Dictionary/ForEach");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/Arithmetic/Add");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/Arithmetic/Subtract");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/Arithmetic/Multiply");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/Arithmetic/Divide");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/Comparison/Equal");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/Comparison/NotEqual");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/Comparison/GreaterThan");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/Comparison/LessThan");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/Constant/Bool");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/Constant/Int32");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/Constant/String");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/Config/ListInt32");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/Config/DictionaryStringInt32");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/Control/If");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/Control/While");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/Control/Pause");

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
    public void WorkspaceLoader_ShouldAllowMissingFlowChartDirectories()
    {
        var workspaceRoot = CreateWorkspaceDirectory();

        try
        {
            LightyWorkspaceScaffolder.Create(workspaceRoot);
            Directory.Delete(LightyWorkspacePathLayout.GetFlowChartsRootPath(workspaceRoot), recursive: true);

            var workspace = LightyWorkspaceLoader.Load(workspaceRoot);

            Assert.NotEmpty(workspace.FlowChartNodeDefinitions);
            Assert.Empty(workspace.FlowChartFiles);
            Assert.Equal(LightyWorkspacePathLayout.GetFlowChartsRootPath(workspaceRoot), workspace.FlowChartsRootPath);
            Assert.Equal(LightyWorkspacePathLayout.GetFlowChartNodesRootPath(workspaceRoot), workspace.FlowChartNodesRootPath);
            Assert.Equal(LightyWorkspacePathLayout.GetFlowChartFilesRootPath(workspaceRoot), workspace.FlowChartFilesRootPath);
            Assert.True(File.Exists(LightyWorkspacePathLayout.GetFlowChartNodeDefinitionFilePath(workspaceRoot, "Builtin/Control/If")));
            Assert.True(File.Exists(LightyWorkspacePathLayout.GetFlowChartNodeDefinitionFilePath(workspaceRoot, "Builtin/Constant/Bool")));
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
    public void WorkspaceLoader_ShouldRestoreMissingDefaultNodeDefinitions()
    {
        var workspaceRoot = CreateWorkspaceDirectory();

        try
        {
            LightyWorkspaceScaffolder.Create(workspaceRoot);
            var boolConstantPath = LightyWorkspacePathLayout.GetFlowChartNodeDefinitionFilePath(workspaceRoot, "Builtin/Constant/Bool");
            var listConfigPath = LightyWorkspacePathLayout.GetFlowChartNodeDefinitionFilePath(workspaceRoot, "Builtin/Config/ListInt32");
            File.Delete(boolConstantPath);
            File.Delete(listConfigPath);

            var workspace = LightyWorkspaceLoader.Load(workspaceRoot);

            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/Constant/Bool");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/Config/ListInt32");
            Assert.True(File.Exists(boolConstantPath));
            Assert.True(File.Exists(listConfigPath));
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
            var reloadedNodeDefinition = Assert.Single(reloadedWorkspace.FlowChartNodeDefinitions.Where(document => document.RelativePath == "Event/Player/OnEnterScene"));
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

    [Fact]
    public void FlowChartAssetManager_ShouldManageFlowChartDirectoriesAndFiles()
    {
        var workspaceRoot = CreateWorkspaceDirectory();

        try
        {
            LightyWorkspaceScaffolder.Create(workspaceRoot);

            using var flowChartFileDocument = JsonDocument.Parse(
                """
                {
                  "formatVersion": "1.0",
                  "name": "IntroFlow",
                  "alias": "开场流程",
                  "nodes": [],
                  "flowConnections": [],
                  "computeConnections": []
                }
                """);

            LightyFlowChartAssetWriter.SaveFile(workspaceRoot, "Quest/Start/IntroFlow", flowChartFileDocument.RootElement);
            LightyFlowChartAssetManager.CreateDirectory(workspaceRoot, LightyFlowChartAssetScope.Files, "Quest/Optional");

            LightyFlowChartAssetManager.RenameDirectory(
                workspaceRoot,
                LightyFlowChartAssetScope.Files,
                "Quest",
                "Gameplay/Quest");

            var renamedFlowChart = LightyFlowChartAssetLoader.LoadFile(workspaceRoot, "Gameplay/Quest/Start/IntroFlow");
            Assert.Equal("Gameplay/Quest/Start/IntroFlow", renamedFlowChart.RelativePath);
            Assert.True(Directory.Exists(Path.Combine(LightyWorkspacePathLayout.GetFlowChartFilesRootPath(workspaceRoot), "Gameplay", "Quest", "Optional")));

            LightyFlowChartAssetManager.DeleteFile(workspaceRoot, LightyFlowChartAssetScope.Files, "Gameplay/Quest/Start/IntroFlow");
            LightyFlowChartAssetManager.DeleteDirectory(workspaceRoot, LightyFlowChartAssetScope.Files, "Gameplay/Quest/Optional");

            Assert.False(Directory.Exists(Path.Combine(LightyWorkspacePathLayout.GetFlowChartFilesRootPath(workspaceRoot), "Gameplay")));
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
        return Path.Combine(Path.GetTempPath(), $"LightyDesign.Tests.{Guid.NewGuid():N}");
    }
}
