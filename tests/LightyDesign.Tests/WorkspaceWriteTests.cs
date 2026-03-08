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
            Directory.Delete(workspaceRoot, recursive: true);
        }
    }

    private static string CreateWorkspaceDirectory()
    {
        var root = Path.Combine(Path.GetTempPath(), $"LightyDesign.Tests.{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        return root;
    }
}