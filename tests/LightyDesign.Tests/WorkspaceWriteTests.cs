using System.Text.Json;
using LightyDesign.Core;

namespace LightyDesign.Tests;

public class WorkspaceWriteTests
{
    [Fact]
    public void WorkbookWriter_ShouldSaveWorkbookAndAllowReload()
    {
        var workspaceRoot = CreateWorkspaceDirectory();

        try
        {
            Directory.CreateDirectory(workspaceRoot);
            File.WriteAllText(Path.Combine(workspaceRoot, "config.json"), "{}");
            File.WriteAllText(
                Path.Combine(workspaceRoot, "headers.json"),
                """
                {
                  "rows": [
                                        { "headerType": "fieldName", "configuration": {} },
                                        { "headerType": "displayName", "configuration": {} },
                                        { "headerType": "type", "configuration": {} },
                                        { "headerType": "validation", "configuration": {} },
                                        { "headerType": "exportscope", "configuration": {} }
                  ]
                }
                """);

            var workbook = new LightyWorkbook(
                "Item",
                Path.Combine(workspaceRoot, "Item"),
                new[]
                {
                    new LightySheet(
                        "Consumable",
                        Path.Combine(workspaceRoot, "Item", "Consumable.txt"),
                        Path.Combine(workspaceRoot, "Item", "Consumable_header.json"),
                        new LightySheetHeader(new[]
                        {
                            new ColumnDefine(
                                "Id",
                                "int",
                                "编号",
                                new Dictionary<string, JsonElement>
                                {
                                    [LightyHeaderTypes.ExportScope] = JsonSerializer.SerializeToElement("All")
                                }),
                            new ColumnDefine("Name", "string", "名称")
                        }),
                        new[]
                        {
                            new LightySheetRow(0, new[] { "1001", "Potion" }),
                            new LightySheetRow(1, new[] { "1002", "Ether" })
                        })
                });

            var headerLayout = WorkspaceHeaderLayoutSerializer.LoadFromFile(Path.Combine(workspaceRoot, "headers.json"));

            Directory.CreateDirectory(Path.Combine(workspaceRoot, "Item"));
            File.WriteAllText(Path.Combine(workspaceRoot, "Item", "Stale.txt"), "obsolete");
            File.WriteAllText(Path.Combine(workspaceRoot, "Item", "Stale_header.json"), "{}");

            LightyWorkbookWriter.Save(workspaceRoot, headerLayout, workbook);

            Assert.False(File.Exists(Path.Combine(workspaceRoot, "Item", "Stale.txt")));
            Assert.False(File.Exists(Path.Combine(workspaceRoot, "Item", "Stale_header.json")));

            var reloadedWorkspace = LightyWorkspaceLoader.Load(workspaceRoot);
            var reloadedWorkbook = Assert.Single(reloadedWorkspace.Workbooks);
            var reloadedSheet = Assert.Single(reloadedWorkbook.Sheets);

            Assert.Equal("编号", reloadedSheet.Header[0].DisplayName);
            Assert.True(reloadedSheet.Header[0].TryGetExportScope(out var exportScope));
            Assert.Equal(LightyExportScope.All, exportScope);
            Assert.Equal("Potion", reloadedSheet.Rows[0][1]);
            Assert.Equal("Ether", reloadedSheet.Rows[1][1]);
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
    public void WorkbookScaffolder_ShouldCreateDefaultWorkbookTemplate()
    {
        var workspaceRoot = CreateWorkspaceDirectory();

        try
        {
            var workspace = LightyWorkspaceScaffolder.Create(workspaceRoot);
            var workbook = LightyWorkbookScaffolder.CreateDefault(workspaceRoot, workspace.HeaderLayout, "Item");

            Assert.Equal("Item", workbook.Name);
            var defaultSheet = Assert.Single(workbook.Sheets);
            Assert.Equal(LightyWorkbookScaffolder.DefaultSheetName, defaultSheet.Name);
            Assert.Equal(2, defaultSheet.Header.Count);

            var idColumn = defaultSheet.Header[0];
            Assert.Equal("ID", idColumn.FieldName);
            Assert.Equal("int", idColumn.Type);
            Assert.Equal("序号", idColumn.DisplayName);
            Assert.True(idColumn.TryGetExportScope(out var idExportScope));
            Assert.Equal(LightyExportScope.All, idExportScope);
            Assert.False(idColumn.TryGetValidation(out _));

            var annotationColumn = defaultSheet.Header[1];
            Assert.Equal("Annotation", annotationColumn.FieldName);
            Assert.Equal("string", annotationColumn.Type);
            Assert.Equal("注释", annotationColumn.DisplayName);
            Assert.True(annotationColumn.TryGetExportScope(out var annotationExportScope));
            Assert.Equal(LightyExportScope.None, annotationExportScope);
            Assert.False(annotationColumn.TryGetValidation(out _));

            var reloadedWorkspace = LightyWorkspaceLoader.Load(workspaceRoot);
            var reloadedWorkbook = Assert.Single(reloadedWorkspace.Workbooks);
            var reloadedSheet = Assert.Single(reloadedWorkbook.Sheets);
            Assert.Equal(LightyWorkbookScaffolder.DefaultSheetName, reloadedSheet.Name);
            Assert.Equal(2, reloadedSheet.Header.Count);
            Assert.NotNull(reloadedWorkbook.CodegenOptions);
            Assert.Null(reloadedWorkbook.CodegenOptions.OutputRelativePath);
            Assert.True(File.Exists(Path.Combine(workspaceRoot, "Item", LightyWorkbookCodegenOptionsSerializer.DefaultFileName)));
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
    public void WorkbookScaffolder_ShouldDeleteWorkbookDirectory()
    {
        var workspaceRoot = CreateWorkspaceDirectory();

        try
        {
            var workspace = LightyWorkspaceScaffolder.Create(workspaceRoot);
            LightyWorkbookScaffolder.CreateDefault(workspaceRoot, workspace.HeaderLayout, "Item");

            LightyWorkbookScaffolder.Delete(workspaceRoot, "Item");

            Assert.False(Directory.Exists(Path.Combine(workspaceRoot, "Item")));
            var reloadedWorkspace = LightyWorkspaceLoader.Load(workspaceRoot);
            Assert.Empty(reloadedWorkspace.Workbooks);
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
    public void WorkbookScaffolder_ShouldCreateDefaultSheetTemplate()
    {
        var sheet = LightyWorkbookScaffolder.CreateDefaultSheet(@"D:\Workspace\Item", "Consumable");

        Assert.Equal("Consumable", sheet.Name);
        Assert.Equal(2, sheet.Header.Count);
        Assert.Equal("ID", sheet.Header[0].FieldName);
        Assert.Equal("Annotation", sheet.Header[1].FieldName);
        Assert.True(sheet.Header[0].TryGetExportScope(out var firstScope));
        Assert.Equal(LightyExportScope.All, firstScope);
        Assert.True(sheet.Header[1].TryGetExportScope(out var secondScope));
        Assert.Equal(LightyExportScope.None, secondScope);
    }

    [Fact]
    public void WorkbookWriter_ShouldDeleteOldFilesAfterSheetRename()
    {
        var workspaceRoot = CreateWorkspaceDirectory();

        try
        {
            var workspace = LightyWorkspaceScaffolder.Create(workspaceRoot);
            var workbook = new LightyWorkbook(
                "Item",
                Path.Combine(workspaceRoot, "Item"),
                new[] { LightyWorkbookScaffolder.CreateDefaultSheet(Path.Combine(workspaceRoot, "Item"), "Sheet1") });

            LightyWorkbookWriter.Save(workspaceRoot, workspace.HeaderLayout, workbook);

            var renamedWorkbook = new LightyWorkbook(
                "Item",
                Path.Combine(workspaceRoot, "Item"),
                new[] { LightyWorkbookScaffolder.CreateDefaultSheet(Path.Combine(workspaceRoot, "Item"), "RenamedSheet") });

            LightyWorkbookWriter.Save(workspaceRoot, workspace.HeaderLayout, renamedWorkbook);

            Assert.False(File.Exists(Path.Combine(workspaceRoot, "Item", "Sheet1.txt")));
            Assert.False(File.Exists(Path.Combine(workspaceRoot, "Item", "Sheet1_header.json")));
            Assert.True(File.Exists(Path.Combine(workspaceRoot, "Item", "RenamedSheet.txt")));
            Assert.True(File.Exists(Path.Combine(workspaceRoot, "Item", "RenamedSheet_header.json")));
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
    public void WorkbookWriter_ShouldPersistWorkbookCodegenOptions()
    {
        var workspaceRoot = CreateWorkspaceDirectory();

        try
        {
            var workspace = LightyWorkspaceScaffolder.Create(workspaceRoot);
            var workbookDirectory = Path.Combine(workspaceRoot, "Item");
            var workbook = new LightyWorkbook(
                "Item",
                workbookDirectory,
                new[] { LightyWorkbookScaffolder.CreateDefaultSheet(workbookDirectory, "Sheet1") },
                new LightyWorkbookCodegenOptions("Generated/Config"),
                Path.Combine(workbookDirectory, LightyWorkbookCodegenOptionsSerializer.DefaultFileName));

            LightyWorkbookWriter.Save(workspaceRoot, workspace.HeaderLayout, workbook);

            var reloadedWorkspace = LightyWorkspaceLoader.Load(workspaceRoot);
            var reloadedWorkbook = Assert.Single(reloadedWorkspace.Workbooks);

            Assert.Equal("Generated/Config", reloadedWorkbook.CodegenOptions.OutputRelativePath);
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