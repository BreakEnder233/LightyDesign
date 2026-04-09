using LightyDesign.DesktopHost;
using LightyDesign.Generator;

namespace LightyDesign.Tests;

public class GeneratedCodeOutputWriterTests
{
    [Fact]
    public void WriteGeneratedWorkbookPackage_ShouldUseGeneratedSubfolderAndPreserveSiblingFiles()
    {
        var workspaceRoot = CreateWorkspaceDirectory();

        try
        {
            var outputRootPath = Path.Combine(workspaceRoot, "Codegen");
            var preservedFilePath = Path.Combine(outputRootPath, "keep.txt");
            var staleGeneratedFilePath = Path.Combine(outputRootPath, GeneratedCodeOutputWriter.GeneratedDirectoryName, "stale.txt");

            Directory.CreateDirectory(outputRootPath);
            File.WriteAllText(preservedFilePath, "keep");
            Directory.CreateDirectory(Path.GetDirectoryName(staleGeneratedFilePath)!);
            File.WriteAllText(staleGeneratedFilePath, "stale");

            var package = new LightyGeneratedWorkbookPackage(
                "Codegen",
                new[]
                {
                    new LightyGeneratedCodeFile("DesignDataReference.cs", "support"),
                    new LightyGeneratedCodeFile("Item/Item.cs", "workbook"),
                    new LightyGeneratedCodeFile("Item/Consumable.cs", "sheet"),
                    new LightyGeneratedCodeFile("LDD.cs", "entry"),
                });

            var generatedOutputPath = GeneratedCodeOutputWriter.WriteGeneratedWorkbookPackage(workspaceRoot, "Item", package);

            Assert.Equal(Path.Combine(outputRootPath, GeneratedCodeOutputWriter.GeneratedDirectoryName), generatedOutputPath);
            Assert.True(File.Exists(preservedFilePath));
            Assert.False(File.Exists(staleGeneratedFilePath));
            Assert.True(File.Exists(Path.Combine(generatedOutputPath, "DesignDataReference.cs")));
            Assert.True(File.Exists(Path.Combine(generatedOutputPath, "Item", "Item.cs")));
            Assert.True(File.Exists(Path.Combine(generatedOutputPath, "Item", "Consumable.cs")));
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
    public void WriteGeneratedWorkbookPackage_ShouldClearExistingGeneratedSubfolderBeforeWriting()
    {
        var workspaceRoot = CreateWorkspaceDirectory();

        try
        {
            var outputRootPath = Path.Combine(workspaceRoot, "Codegen");
            var generatedOutputPath = Path.Combine(outputRootPath, GeneratedCodeOutputWriter.GeneratedDirectoryName);
            var existingWorkbookDirectoryPath = Path.Combine(generatedOutputPath, "Monster");

            Directory.CreateDirectory(existingWorkbookDirectoryPath);
            File.WriteAllText(Path.Combine(existingWorkbookDirectoryPath, "Monster.cs"), "existing");
            File.WriteAllText(Path.Combine(generatedOutputPath, "keep-me.txt"), "stale");

            var package = new LightyGeneratedWorkbookPackage(
                "Codegen",
                new[]
                {
                    new LightyGeneratedCodeFile("DesignDataReference.cs", "support"),
                    new LightyGeneratedCodeFile("Item/Item.cs", "workbook"),
                    new LightyGeneratedCodeFile("LDD.cs", "entry"),
                });

            GeneratedCodeOutputWriter.WriteGeneratedWorkbookPackage(workspaceRoot, "Item", package);

            var entryPointPath = Path.Combine(generatedOutputPath, "LDD.cs");
            var entryPointContent = File.ReadAllText(entryPointPath);

            Assert.Contains("public static ItemWorkbook Item", entryPointContent, StringComparison.Ordinal);
            Assert.DoesNotContain("public static MonsterWorkbook Monster", entryPointContent, StringComparison.Ordinal);
            Assert.False(File.Exists(Path.Combine(generatedOutputPath, "keep-me.txt")));
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
