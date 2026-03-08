using System.Text.Json;
using ClosedXML.Excel;
using LightyDesign.Core;
using LightyDesign.FileProcess;

namespace LightyDesign.Tests;

public class FileProcessTests
{
    [Fact]
    public void ExportAndImport_ShouldRoundTripWorkbook()
    {
        var headerLayout = CreateHeaderLayout();
        var workbook = new LightyWorkbook(
            name: "Item",
            directoryPath: "Item",
            sheets: new[]
            {
                new LightySheet(
                    name: "Consumable",
                    dataFilePath: "Item\\Consumable.txt",
                    headerFilePath: "Item\\Consumable_header.json",
                    header: new LightySheetHeader(new[]
                    {
                        new ColumnDefine(
                            fieldName: "Id",
                            type: "int",
                            displayName: "编号",
                            attributes: new Dictionary<string, JsonElement>
                            {
                                [LightyHeaderTypes.ExportScope] = JsonSerializer.SerializeToElement("All")
                            }),
                        new ColumnDefine("Name", "string", "名称"),
                        new ColumnDefine("Tags", "List<string>", "标签")
                    }),
                    rows: new[]
                    {
                        new LightySheetRow(0, new[] { "1001", "Potion", "\"healing\",\"starter\"" }),
                        new LightySheetRow(1, new[] { "1002", "Ether", "\"mana\",\"rare\"" })
                    }),
                new LightySheet(
                    name: "Reward",
                    dataFilePath: "Item\\Reward.txt",
                    headerFilePath: "Item\\Reward_header.json",
                    header: new LightySheetHeader(new[]
                    {
                        new ColumnDefine("Id", "int", "编号"),
                        new ColumnDefine("Items", "List<Ref:Item.Consumable>", "奖励")
                    }),
                    rows: new[]
                    {
                        new LightySheetRow(0, new[] { "1", "[[1001]], [[1002]]" })
                    })
            });

        var exporter = new LightyWorkbookExcelExporter();
        var importer = new LightyWorkbookExcelImporter();
        using var stream = new MemoryStream();

        exporter.Export(workbook, headerLayout, stream);
        stream.Position = 0;

        var imported = importer.Import(stream, "Item", headerLayout, "Item");

        Assert.Equal("Item", imported.Name);
        Assert.Equal(2, imported.Sheets.Count);

        var consumable = Assert.Single(imported.Sheets, sheet => sheet.Name == "Consumable");
        Assert.Equal(3, consumable.Header.Count);
        Assert.Equal("编号", consumable.Header[0].DisplayName);
        Assert.True(consumable.Header[0].TryGetExportScope(out var exportScope));
        Assert.Equal(LightyExportScope.All, exportScope);
        Assert.Equal("\"healing\",\"starter\"", consumable.Rows[0][2]);

        var reward = Assert.Single(imported.Sheets, sheet => sheet.Name == "Reward");
        Assert.Equal("List<Ref:Item.Consumable>", reward.Header[1].Type);
        Assert.Equal("[[1001]], [[1002]]", reward.Rows[0][1]);
    }

    [Fact]
    public void Import_ShouldUseExcelHeaderRowsToBuildColumns()
    {
        var headerLayout = CreateHeaderLayout();
        using var stream = new MemoryStream();

        using (var workbook = new XLWorkbook())
        {
            var worksheet = workbook.Worksheets.Add("Consumable");
            worksheet.Cell("A1").Value = "Id";
            worksheet.Cell("B1").Value = "Name";
            worksheet.Cell("A2").Value = "编号";
            worksheet.Cell("B2").Value = "名称";
            worksheet.Cell("A3").Value = "int";
            worksheet.Cell("B3").Value = "string";
            worksheet.Cell("A4").Value = "All";
            worksheet.Cell("B4").Value = "Client";
            worksheet.Cell("A5").Value = "1001";
            worksheet.Cell("B5").Value = "Potion";
            workbook.SaveAs(stream);
        }

        stream.Position = 0;

        var importer = new LightyWorkbookExcelImporter();
        var workbookModel = importer.Import(stream, "Item", headerLayout, "Item");
        var sheet = Assert.Single(workbookModel.Sheets);

        Assert.Equal("编号", sheet.Header[0].DisplayName);
        Assert.True(sheet.Header[1].TryGetExportScope(out var exportScope));
        Assert.Equal(LightyExportScope.Client, exportScope);
        Assert.Equal("Potion", sheet.Rows[0][1]);
    }

    [Fact]
    public void Import_ShouldThrowWhenFieldNameIsMissing()
    {
        var headerLayout = CreateHeaderLayout();
        using var stream = new MemoryStream();

        using (var workbook = new XLWorkbook())
        {
            var worksheet = workbook.Worksheets.Add("Broken");
            worksheet.Cell("A1").Value = string.Empty;
            worksheet.Cell("A2").Value = "编号";
            worksheet.Cell("A3").Value = "int";
            worksheet.Cell("A4").Value = "All";
            workbook.SaveAs(stream);
        }

        stream.Position = 0;

        var importer = new LightyWorkbookExcelImporter();
        var exception = Assert.Throws<LightyExcelProcessException>(() => importer.Import(stream, "Item", headerLayout, "Item"));

        Assert.Equal("Broken", exception.WorksheetName);
        Assert.Equal("A1", exception.CellAddress);
    }

    private static WorkspaceHeaderLayout CreateHeaderLayout()
    {
        return new WorkspaceHeaderLayout(new[]
        {
            new WorkspaceHeaderRowDefinition(LightyHeaderTypes.FieldName, JsonSerializer.SerializeToElement(new { })),
            new WorkspaceHeaderRowDefinition(LightyHeaderTypes.DisplayName, JsonSerializer.SerializeToElement(new { })),
            new WorkspaceHeaderRowDefinition(LightyHeaderTypes.Type, JsonSerializer.SerializeToElement(new { })),
            new WorkspaceHeaderRowDefinition(LightyHeaderTypes.ExportScope, JsonSerializer.SerializeToElement(new { }))
        });
    }
}