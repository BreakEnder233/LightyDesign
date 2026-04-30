using LightyDesign.Application;
using LightyDesign.Generator;

namespace LightyDesign.Tests;

public class GeneratedCodeOutputWriterTests
{
    [Fact]
    public void WriteGeneratedWorkbookPackage_ShouldCreateExtendedSubfolderAndPreserveSiblingFiles()
    {
        var workspaceRoot = CreateWorkspaceDirectory();

        try
        {
            var outputRootPath = Path.Combine(workspaceRoot, "Codegen");
            var preservedFilePath = Path.Combine(outputRootPath, "keep.txt");

            Directory.CreateDirectory(outputRootPath);
            File.WriteAllText(preservedFilePath, "keep");

            var package = new LightyGeneratedWorkbookPackage(
                "Codegen",
                new[]
                {
                    new LightyGeneratedCodeFile("DesignDataReference.cs", "support"),
                    new LightyGeneratedCodeFile("Item/ItemWorkbook.cs", "workbook"),
                    new LightyGeneratedCodeFile("Item/ConsumableTable.cs", "sheet"),
                });

            var generatedOutputPath = GeneratedCodeOutputWriter.WriteGeneratedWorkbookPackage(workspaceRoot, "Item", package);

            Assert.Equal(Path.Combine(outputRootPath, GeneratedCodeOutputWriter.GeneratedDirectoryName), generatedOutputPath);
            Assert.True(File.Exists(preservedFilePath));
            Assert.True(Directory.Exists(Path.Combine(outputRootPath, GeneratedCodeOutputWriter.ExtendedDirectoryName)));
            Assert.True(File.Exists(Path.Combine(generatedOutputPath, "DesignDataReference.cs")));
            Assert.True(File.Exists(Path.Combine(generatedOutputPath, "Workbooks", "Item", "ItemWorkbook.cs")));
            Assert.True(File.Exists(Path.Combine(generatedOutputPath, "Workbooks", "Item", "ConsumableTable.cs")));
            Assert.True(File.Exists(Path.Combine(generatedOutputPath, "LDD.cs")));
            Assert.False(File.Exists(Path.Combine(outputRootPath, "LDD.cs")));
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
    public void WriteGeneratedWorkbookPackage_ShouldReplaceOnlyTargetWorkbookAndKeepOtherGeneratedWorkbooks()
    {
        var workspaceRoot = CreateWorkspaceDirectory();

        try
        {
            var outputRootPath = Path.Combine(workspaceRoot, "Codegen");
            var generatedOutputPath = Path.Combine(outputRootPath, GeneratedCodeOutputWriter.GeneratedDirectoryName);
            var existingWorkbookDirectoryPath = Path.Combine(generatedOutputPath, "Workbooks", "Monster");
            var targetWorkbookDirectoryPath = Path.Combine(generatedOutputPath, "Workbooks", "Item");

            Directory.CreateDirectory(existingWorkbookDirectoryPath);
            Directory.CreateDirectory(targetWorkbookDirectoryPath);
            File.WriteAllText(Path.Combine(existingWorkbookDirectoryPath, "Monster.cs"), "existing");
            File.WriteAllText(Path.Combine(targetWorkbookDirectoryPath, "Old.cs"), "stale");

            var package = new LightyGeneratedWorkbookPackage(
                "Codegen",
                new[]
                {
                    new LightyGeneratedCodeFile("DesignDataReference.cs", "support"),
                    new LightyGeneratedCodeFile("Item/ItemWorkbook.cs", "workbook"),
                });

            GeneratedCodeOutputWriter.WriteGeneratedWorkbookPackage(workspaceRoot, "Item", package);

            var entryPointPath = Path.Combine(generatedOutputPath, "LDD.cs");
            var entryPointContent = File.ReadAllText(entryPointPath);

            Assert.Contains("public static ItemWorkbook Item", entryPointContent, StringComparison.Ordinal);
            Assert.Contains("public static MonsterWorkbook Monster", entryPointContent, StringComparison.Ordinal);
            Assert.True(File.Exists(Path.Combine(existingWorkbookDirectoryPath, "Monster.cs")));
            Assert.False(File.Exists(Path.Combine(targetWorkbookDirectoryPath, "Old.cs")));
            Assert.True(File.Exists(Path.Combine(targetWorkbookDirectoryPath, "ItemWorkbook.cs")));
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
    public void WriteGeneratedWorkspacePackages_ShouldRebuildGeneratedOutputAndPreserveExtendedFolder()
    {
        var workspaceRoot = CreateWorkspaceDirectory();

        try
        {
            var outputRootPath = Path.Combine(workspaceRoot, "Codegen");
            var generatedOutputPath = Path.Combine(outputRootPath, GeneratedCodeOutputWriter.GeneratedDirectoryName);
            var extendedOutputPath = Path.Combine(outputRootPath, GeneratedCodeOutputWriter.ExtendedDirectoryName);
            var legacyWorkbookDirectoryPath = Path.Combine(generatedOutputPath, "Workbooks", "Legacy");
            var extendedUserFilePath = Path.Combine(extendedOutputPath, "ItemExtensions.cs");

            Directory.CreateDirectory(legacyWorkbookDirectoryPath);
            Directory.CreateDirectory(extendedOutputPath);
            File.WriteAllText(Path.Combine(legacyWorkbookDirectoryPath, "Legacy.cs"), "legacy");
            File.WriteAllText(extendedUserFilePath, "partial class");

            var workbookPackages = new (string WorkbookName, LightyGeneratedWorkbookPackage Package)[]
            {
                (
                    "Item",
                    new LightyGeneratedWorkbookPackage(
                        "Codegen",
                        new[]
                        {
                            new LightyGeneratedCodeFile("DesignDataReference.cs", "support"),
                            new LightyGeneratedCodeFile("Item/ItemWorkbook.cs", "item"),
                        })),
                (
                    "Monster",
                    new LightyGeneratedWorkbookPackage(
                        "Codegen",
                        new[]
                        {
                            new LightyGeneratedCodeFile("DesignDataReference.cs", "support"),
                            new LightyGeneratedCodeFile("Monster/MonsterWorkbook.cs", "monster"),
                        })),
            };

            var writtenOutputPath = GeneratedCodeOutputWriter.WriteGeneratedWorkspacePackages(workspaceRoot, workbookPackages);
            var entryPointContent = File.ReadAllText(Path.Combine(writtenOutputPath, "LDD.cs"));

            Assert.Equal(generatedOutputPath, writtenOutputPath);
            Assert.False(Directory.Exists(legacyWorkbookDirectoryPath));
            Assert.True(File.Exists(Path.Combine(generatedOutputPath, "Workbooks", "Item", "ItemWorkbook.cs")));
            Assert.True(File.Exists(Path.Combine(generatedOutputPath, "Workbooks", "Monster", "MonsterWorkbook.cs")));
            Assert.True(File.Exists(extendedUserFilePath));
            Assert.Contains("public static ItemWorkbook Item", entryPointContent, StringComparison.Ordinal);
            Assert.Contains("public static MonsterWorkbook Monster", entryPointContent, StringComparison.Ordinal);
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
    public void ValidateWorkbookCodegenOutputRelativePath_ShouldAllowRelativePathOutsideWorkspaceRoot()
    {
        var workspaceRoot = Path.Combine(Path.GetTempPath(), "LightyDesign.Tests.Workspace");
        var outputPath = GeneratedCodeOutputWriter.ValidateWorkbookCodegenOutputRelativePath(workspaceRoot, "../Shared/Codegen", allowEmpty: false);

        Assert.Equal(Path.GetFullPath(Path.Combine(workspaceRoot, "../Shared/Codegen")), outputPath);
    }

    [Fact]
    public void WriteGeneratedWorkbookPackage_ShouldKeepExistingGeneratedFlowCharts()
    {
        var workspaceRoot = CreateWorkspaceDirectory();

        try
        {
            var outputRootPath = Path.Combine(workspaceRoot, "Codegen");
            var generatedOutputPath = Path.Combine(outputRootPath, GeneratedCodeOutputWriter.GeneratedDirectoryName);
            var existingFlowChartDirectoryPath = Path.Combine(generatedOutputPath, "FlowCharts", "Files", "Quest", "Intro");

            Directory.CreateDirectory(existingFlowChartDirectoryPath);
            File.WriteAllText(Path.Combine(existingFlowChartDirectoryPath, "IntroDefinition.cs"), "flowchart");
            File.WriteAllText(Path.Combine(existingFlowChartDirectoryPath, "IntroFlow.cs"), "flow");

            var package = new LightyGeneratedWorkbookPackage(
                "Codegen",
                new[]
                {
                    new LightyGeneratedCodeFile("DesignDataReference.cs", "support"),
                    new LightyGeneratedCodeFile("Item/ItemWorkbook.cs", "workbook"),
                });

            GeneratedCodeOutputWriter.WriteGeneratedWorkbookPackage(workspaceRoot, "Item", package);

            var entryPointContent = File.ReadAllText(Path.Combine(generatedOutputPath, "LDD.cs"));
            Assert.True(File.Exists(Path.Combine(existingFlowChartDirectoryPath, "IntroDefinition.cs")));
            Assert.Contains("public static ItemWorkbook Item", entryPointContent, StringComparison.Ordinal);
            Assert.Contains("public static FlowCharts.Files.Quest.Intro.IntroDefinition FlowChartQuestIntro", entryPointContent, StringComparison.Ordinal);
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
    public void WriteGeneratedFlowChartPackage_ShouldReplaceOnlyTargetFlowChartAndKeepGeneratedWorkbooks()
    {
        var workspaceRoot = CreateWorkspaceDirectory();

        try
        {
            var outputRootPath = Path.Combine(workspaceRoot, "Codegen");
            var generatedOutputPath = Path.Combine(outputRootPath, GeneratedCodeOutputWriter.GeneratedDirectoryName);
            var workbookDirectoryPath = Path.Combine(generatedOutputPath, "Workbooks", "Monster");
            var otherFlowChartDirectoryPath = Path.Combine(generatedOutputPath, "FlowCharts", "Files", "Combat", "Boss", "Opening");
            var targetFlowChartDirectoryPath = Path.Combine(generatedOutputPath, "FlowCharts", "Files", "Quest", "Intro");
            var oldNodeDirectoryPath = Path.Combine(generatedOutputPath, "FlowCharts", "Nodes", "Legacy");

            Directory.CreateDirectory(workbookDirectoryPath);
            Directory.CreateDirectory(otherFlowChartDirectoryPath);
            Directory.CreateDirectory(targetFlowChartDirectoryPath);
            Directory.CreateDirectory(oldNodeDirectoryPath);
            File.WriteAllText(Path.Combine(workbookDirectoryPath, "MonsterWorkbook.cs"), "monster");
            File.WriteAllText(Path.Combine(otherFlowChartDirectoryPath, "OpeningDefinition.cs"), "opening");
            File.WriteAllText(Path.Combine(otherFlowChartDirectoryPath, "OpeningFlow.cs"), "opening flow");
            File.WriteAllText(Path.Combine(targetFlowChartDirectoryPath, "Old.cs"), "stale");
            File.WriteAllText(Path.Combine(oldNodeDirectoryPath, "OldNode.cs"), "stale node");

            var package = new LightyGeneratedFlowChartPackage(
                "Codegen",
                new[]
                {
                    new LightyGeneratedCodeFile("FlowCharts/FlowChartRuntimeSupport.cs", "runtime"),
                    new LightyGeneratedCodeFile("FlowCharts/FlowChartStandardNodeBindingHelper.cs", "helper"),
                    new LightyGeneratedCodeFile("FlowCharts/Nodes/Builtin/List/AddNode.cs", "node"),
                    new LightyGeneratedCodeFile("FlowCharts/Files/Quest/Intro/IntroDefinition.cs", "definition"),
                    new LightyGeneratedCodeFile("FlowCharts/Files/Quest/Intro/IntroFlow.cs", "flow"),
                });

            GeneratedCodeOutputWriter.WriteGeneratedFlowChartPackage(workspaceRoot, "Quest/Intro", package);

            var entryPointContent = File.ReadAllText(Path.Combine(generatedOutputPath, "LDD.cs"));
            Assert.True(File.Exists(Path.Combine(workbookDirectoryPath, "MonsterWorkbook.cs")));
            Assert.True(File.Exists(Path.Combine(otherFlowChartDirectoryPath, "OpeningDefinition.cs")));
            Assert.False(File.Exists(Path.Combine(targetFlowChartDirectoryPath, "Old.cs")));
            Assert.False(File.Exists(Path.Combine(oldNodeDirectoryPath, "OldNode.cs")));
            Assert.True(File.Exists(Path.Combine(targetFlowChartDirectoryPath, "IntroDefinition.cs")));
            Assert.Contains("public static MonsterWorkbook Monster", entryPointContent, StringComparison.Ordinal);
            Assert.Contains("public static FlowCharts.Files.Quest.Intro.IntroDefinition FlowChartQuestIntro", entryPointContent, StringComparison.Ordinal);
            Assert.Contains("public static FlowCharts.Files.Combat.Boss.Opening.OpeningDefinition FlowChartCombatBossOpening", entryPointContent, StringComparison.Ordinal);
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
    public void WriteGeneratedWorkspacePackages_ShouldPreserveGeneratedFlowCharts()
    {
        var workspaceRoot = CreateWorkspaceDirectory();

        try
        {
            var outputRootPath = Path.Combine(workspaceRoot, "Codegen");
            var generatedOutputPath = Path.Combine(outputRootPath, GeneratedCodeOutputWriter.GeneratedDirectoryName);
            var flowChartDirectoryPath = Path.Combine(generatedOutputPath, "FlowCharts", "Files", "Quest", "Intro");
            var legacyWorkbookDirectoryPath = Path.Combine(generatedOutputPath, "Workbooks", "Legacy");

            Directory.CreateDirectory(flowChartDirectoryPath);
            Directory.CreateDirectory(legacyWorkbookDirectoryPath);
            File.WriteAllText(Path.Combine(flowChartDirectoryPath, "IntroDefinition.cs"), "flowchart");
            File.WriteAllText(Path.Combine(legacyWorkbookDirectoryPath, "LegacyWorkbook.cs"), "legacy");

            var workbookPackages = new (string WorkbookName, LightyGeneratedWorkbookPackage Package)[]
            {
                (
                    "Item",
                    new LightyGeneratedWorkbookPackage(
                        "Codegen",
                        new[]
                        {
                            new LightyGeneratedCodeFile("DesignDataReference.cs", "support"),
                            new LightyGeneratedCodeFile("Item/ItemWorkbook.cs", "item"),
                        })),
            };

            GeneratedCodeOutputWriter.WriteGeneratedWorkspacePackages(workspaceRoot, workbookPackages);

            var entryPointContent = File.ReadAllText(Path.Combine(generatedOutputPath, "LDD.cs"));
            Assert.False(Directory.Exists(legacyWorkbookDirectoryPath));
            Assert.True(File.Exists(Path.Combine(flowChartDirectoryPath, "IntroDefinition.cs")));
            Assert.True(File.Exists(Path.Combine(generatedOutputPath, "Workbooks", "Item", "ItemWorkbook.cs")));
            Assert.Contains("public static ItemWorkbook Item", entryPointContent, StringComparison.Ordinal);
            Assert.Contains("public static FlowCharts.Files.Quest.Intro.IntroDefinition FlowChartQuestIntro", entryPointContent, StringComparison.Ordinal);
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
    public void WriteGeneratedWorkspaceFlowChartPackage_ShouldRebuildFlowChartsAndPreserveGeneratedWorkbooks()
    {
        var workspaceRoot = CreateWorkspaceDirectory();

        try
        {
            var outputRootPath = Path.Combine(workspaceRoot, "Codegen");
            var generatedOutputPath = Path.Combine(outputRootPath, GeneratedCodeOutputWriter.GeneratedDirectoryName);
            var workbookDirectoryPath = Path.Combine(generatedOutputPath, "Workbooks", "Item");
            var legacyFlowChartDirectoryPath = Path.Combine(generatedOutputPath, "FlowCharts", "Files", "Legacy", "OldFlow");

            Directory.CreateDirectory(workbookDirectoryPath);
            Directory.CreateDirectory(legacyFlowChartDirectoryPath);
            File.WriteAllText(Path.Combine(workbookDirectoryPath, "ItemWorkbook.cs"), "item");
            File.WriteAllText(Path.Combine(legacyFlowChartDirectoryPath, "OldFlowDefinition.cs"), "legacy");

            var package = new LightyGeneratedFlowChartPackage(
                "Codegen",
                new[]
                {
                    new LightyGeneratedCodeFile("FlowCharts/FlowChartRuntimeSupport.cs", "runtime"),
                    new LightyGeneratedCodeFile("FlowCharts/FlowChartStandardNodeBindingHelper.cs", "helper"),
                    new LightyGeneratedCodeFile("FlowCharts/Nodes/Builtin/List/AddNode.cs", "node"),
                    new LightyGeneratedCodeFile("FlowCharts/Files/Quest/Intro/IntroDefinition.cs", "intro"),
                    new LightyGeneratedCodeFile("FlowCharts/Files/Quest/Intro/IntroFlow.cs", "intro-flow"),
                    new LightyGeneratedCodeFile("FlowCharts/Files/Combat/Boss/Opening/OpeningDefinition.cs", "opening"),
                    new LightyGeneratedCodeFile("FlowCharts/Files/Combat/Boss/Opening/OpeningFlow.cs", "opening-flow"),
                });

            GeneratedCodeOutputWriter.WriteGeneratedWorkspaceFlowChartPackage(workspaceRoot, package);

            var entryPointContent = File.ReadAllText(Path.Combine(generatedOutputPath, "LDD.cs"));
            Assert.True(File.Exists(Path.Combine(workbookDirectoryPath, "ItemWorkbook.cs")));
            Assert.False(Directory.Exists(legacyFlowChartDirectoryPath));
            Assert.True(File.Exists(Path.Combine(generatedOutputPath, "FlowCharts", "Files", "Quest", "Intro", "IntroDefinition.cs")));
            Assert.True(File.Exists(Path.Combine(generatedOutputPath, "FlowCharts", "Files", "Combat", "Boss", "Opening", "OpeningDefinition.cs")));
            Assert.Contains("public static ItemWorkbook Item", entryPointContent, StringComparison.Ordinal);
            Assert.Contains("public static FlowCharts.Files.Quest.Intro.IntroDefinition FlowChartQuestIntro", entryPointContent, StringComparison.Ordinal);
            Assert.Contains("public static FlowCharts.Files.Combat.Boss.Opening.OpeningDefinition FlowChartCombatBossOpening", entryPointContent, StringComparison.Ordinal);
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
