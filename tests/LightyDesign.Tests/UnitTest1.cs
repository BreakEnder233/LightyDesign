using System.Text.Json;
using LightyDesign.Core;

namespace LightyDesign.Tests;

public class UnitTest1
{
    [Fact]
    public void EncodeAndDecode_ShouldRoundTripSpecialCharacters()
    {
        var original = "A&B\tC\r\nD\nE\rF";

        var encoded = LightyTextCodec.Encode(original);
        var decoded = LightyTextCodec.Decode(encoded);

        Assert.Equal("A&&a&&B&&t&&C&&n&&D&&n&&E&&n&&F", encoded);
        Assert.Equal("A&B\tC\nD\nE\nF", decoded);
    }

    [Fact]
    public void SplitLines_ShouldSupportCrLfLfAndCr()
    {
        var content = "row1\r\nrow2\nrow3\rrow4";

        var lines = LightyTextCodec.SplitLines(content);

        Assert.Equal(new[] { "row1", "row2", "row3", "row4" }, lines);
    }

    [Fact]
    public void ParseReference_ShouldSupportCompositeIds()
    {
        var reference = LightyReferenceValue.Parse("[[1, 2, 3]]");

        Assert.True(reference.IsComposite);
        Assert.Equal(new[] { "1", "2", "3" }, reference.Identifiers);
    }

    [Fact]
    public void TryGetColumn_ShouldFindColumnByFieldName()
    {
        var header = new LightySheetHeader(
            new[]
            {
                new ColumnDefine(
                    fieldName: "Id",
                    type: "int",
                    displayName: "ID",
                    attributes: new Dictionary<string, JsonElement>
                    {
                        [LightyHeaderTypes.ExportScope] = JsonSerializer.SerializeToElement("All")
                    }),
                new ColumnDefine("Name", "string", "名称")
            });

        var found = header.TryGetColumn("Name", out var column);

        Assert.True(found);
        Assert.NotNull(column);
        Assert.Equal("string", column.Type);
        Assert.Equal("名称", column.DisplayName);
    }

    [Fact]
    public void ColumnDefine_ShouldExposeTypedHeaderAccessors()
    {
        var column = new ColumnDefine(
            fieldName: "Rewards",
            type: "List<Ref:Item.Consumable>",
            attributes: new Dictionary<string, JsonElement>
            {
                [LightyHeaderTypes.ExportScope] = JsonSerializer.SerializeToElement("Client"),
                [LightyHeaderTypes.Validation] = JsonSerializer.SerializeToElement(new
                {
                    required = true,
                    minCount = 1
                })
            });

        Assert.True(column.IsListType);
        Assert.True(column.IsReferenceType);
        Assert.True(column.TryGetExportScope(out var exportScope));
        Assert.Equal(LightyExportScope.Client, exportScope);
        Assert.True(column.TryGetValidation(out var validation));
        Assert.Equal(JsonValueKind.Object, validation.ValueKind);
        Assert.True(column.TryGetReferenceTarget(out var referenceTarget));
        Assert.NotNull(referenceTarget);
        Assert.Equal("Item", referenceTarget.WorkbookName);
        Assert.Equal("Consumable", referenceTarget.SheetName);
    }

    [Fact]
    public void ColumnDefine_ShouldParseNoneExportScope()
    {
        var column = new ColumnDefine(
            fieldName: "InternalNote",
            type: "string",
            attributes: new Dictionary<string, JsonElement>
            {
                [LightyHeaderTypes.ExportScope] = JsonSerializer.SerializeToElement("None")
            });

        Assert.True(column.TryGetExportScope(out var exportScope));
        Assert.Equal(LightyExportScope.None, exportScope);
    }

    [Fact]
    public void SheetHeaderSerializer_ShouldReadColumnBasedHeader()
    {
        const string json = """
        {
            "columns": [
                {
                    "FieldName": "Id",
                    "Type": "int",
                    "DisplayName": "ID",
                    "ExportScope": "All"
                },
                {
                    "FieldName": "Name",
                    "Type": "string"
                }
            ]
        }
        """;

        var header = LightySheetHeaderSerializer.Deserialize(json);

        Assert.Equal(2, header.Count);
        Assert.Equal("Id", header[0].FieldName);
        Assert.True(header[0].TryGetAttribute(LightyHeaderTypes.ExportScope, out var exportScope));
        Assert.Equal("All", exportScope.GetString());
    }

    [Fact]
    public void SheetHeaderSerializer_ShouldReadRowBasedHeader()
    {
        const string json = """
        {
            "rows": [
                {
                    "headerType": "fieldName",
                    "value": ["Id", "Name"]
                },
                {
                    "headerType": "type",
                    "value": ["int", "string"]
                },
                {
                    "headerType": "displayName",
                    "value": ["编号", "名称"]
                },
                {
                    "headerType": "exportscope",
                    "value": ["All", "Client"]
                }
            ]
        }
        """;

        var header = LightySheetHeaderSerializer.Deserialize(json);

        Assert.Equal(2, header.Count);
        Assert.Equal("编号", header[0].DisplayName);
        Assert.True(header[1].TryGetAttribute(LightyHeaderTypes.ExportScope, out var exportScope));
        Assert.Equal("Client", exportScope.GetString());
    }

    [Fact]
    public void WorkspaceHeaderLayoutSerializer_ShouldRoundTripDefaultLayoutUsingWorkspaceNames()
    {
        var layout = WorkspaceHeaderLayout.CreateDefault();

        var json = WorkspaceHeaderLayoutSerializer.Serialize(layout);
        var reloaded = WorkspaceHeaderLayoutSerializer.Deserialize(json);

        Assert.Contains("\"headerType\": \"fieldName\"", json, StringComparison.Ordinal);
        Assert.Contains("\"headerType\": \"displayName\"", json, StringComparison.Ordinal);
        Assert.Contains("\"headerType\": \"type\"", json, StringComparison.Ordinal);
        Assert.Contains("\"headerType\": \"validation\"", json, StringComparison.Ordinal);
        Assert.Contains("\"headerType\": \"exportscope\"", json, StringComparison.Ordinal);
        Assert.Equal(LightyHeaderTypes.DefaultWorkspaceHeaderTypes, reloaded.Rows.Select(row => row.HeaderType).ToArray());
    }

    [Fact]
    public void WorkspaceScaffolder_ShouldCreateWorkspaceWithDefaultHeaders()
    {
        var workspaceRoot = Path.Combine(Path.GetTempPath(), $"LightyDesign.Tests.{Guid.NewGuid():N}");

        try
        {
            var workspace = LightyWorkspaceScaffolder.Create(workspaceRoot);

            Assert.True(Directory.Exists(workspaceRoot));
            Assert.True(File.Exists(Path.Combine(workspaceRoot, "config.json")));
            Assert.True(File.Exists(Path.Combine(workspaceRoot, "headers.json")));
            Assert.True(Directory.Exists(Path.Combine(workspaceRoot, LightyWorkspacePathLayout.WorkbooksDirectoryName)));
            Assert.True(Directory.Exists(Path.Combine(workspaceRoot, LightyWorkspacePathLayout.FlowChartsDirectoryName, LightyWorkspacePathLayout.FlowChartNodesDirectoryName)));
            Assert.True(Directory.Exists(Path.Combine(workspaceRoot, LightyWorkspacePathLayout.FlowChartsDirectoryName, LightyWorkspacePathLayout.FlowChartFilesDirectoryName)));
            Assert.Empty(workspace.Workbooks);
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/List/Add");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/Dictionary/Set");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/Arithmetic/Add");
            Assert.Contains(workspace.FlowChartNodeDefinitions, document => document.RelativePath == "Builtin/Comparison/Equal");
            Assert.Empty(workspace.FlowChartFiles);
            Assert.Equal(LightyHeaderTypes.DefaultWorkspaceHeaderTypes, workspace.HeaderLayout.Rows.Select(row => row.HeaderType).ToArray());
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
    public void WorkspaceLoader_ShouldLoadWorkbooksSheetsAndDecodedRows()
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
                        { "headerType": "type", "configuration": {} }
                    ]
                }
                """);

            var workbookPath = LightyWorkspacePathLayout.GetWorkbookDirectoryPath(workspaceRoot, "Item");
            Directory.CreateDirectory(workbookPath);

            File.WriteAllText(
                Path.Combine(workbookPath, "Consumable_header.json"),
                """
                {
                    "columns": [
                        { "FieldName": "Id", "Type": "int", "DisplayName": "编号" },
                        { "FieldName": "Name", "Type": "string", "DisplayName": "名称" },
                        { "FieldName": "Desc", "Type": "string" }
                    ]
                }
                """);

            File.WriteAllText(
                Path.Combine(workbookPath, "Consumable.txt"),
                $"1001\tPotion\t{LightyTextCodec.Encode("Line1\nLine2")}");

            var workspace = LightyWorkspaceLoader.Load(workspaceRoot);

            Assert.True(workspace.TryGetWorkbook("Item", out var workbook));
            Assert.NotNull(workbook);
            Assert.True(workbook.TryGetSheet("Consumable", out var sheet));
            Assert.NotNull(sheet);
            Assert.Equal(3, sheet.Header.Count);
            Assert.Single(sheet.Rows);
            Assert.Equal("Line1\nLine2", sheet.Rows[0][2]);
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
