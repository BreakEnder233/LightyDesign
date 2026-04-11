using LightyDesign.DesktopHost;
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
            Assert.True(File.Exists(Path.Combine(generatedOutputPath, "Item", "ItemWorkbook.cs")));
            Assert.True(File.Exists(Path.Combine(generatedOutputPath, "Item", "ConsumableTable.cs")));
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
            var existingWorkbookDirectoryPath = Path.Combine(generatedOutputPath, "Monster");
            var targetWorkbookDirectoryPath = Path.Combine(generatedOutputPath, "Item");

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
            var legacyWorkbookDirectoryPath = Path.Combine(generatedOutputPath, "Legacy");
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
            Assert.True(File.Exists(Path.Combine(generatedOutputPath, "Item", "ItemWorkbook.cs")));
            Assert.True(File.Exists(Path.Combine(generatedOutputPath, "Monster", "MonsterWorkbook.cs")));
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

    private static string CreateWorkspaceDirectory()
    {
        return Path.Combine(Path.GetTempPath(), $"LightyDesign.Tests.{Guid.NewGuid():N}");
    }
}
