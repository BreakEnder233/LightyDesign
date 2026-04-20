using LightyDesign.Core;
using System.Text.Json;

namespace LightyDesign.Tests;

public class ValueParsingTests
{
    [Fact]
    public void GetCellValue_ShouldNotParseUntilExplicitlyRequested()
    {
        var row = new LightySheetRow(0, new[] { "1" });
        var column = new ColumnDefine("Id", "int");
        var parser = new CountingParser();

        var cell = row.GetCellValue(0, column, parser);

        Assert.Equal(LightyCellValueState.Unparsed, cell.State);
        Assert.Equal(0, parser.InvocationCount);

        var result = cell.Parse();

        Assert.True(result.IsSuccess);
        Assert.Equal(LightyCellValueState.Parsed, cell.State);
        Assert.Equal(1, parser.InvocationCount);
    }

    [Fact]
    public void ParseCell_ShouldReuseCacheUntilCellChanges()
    {
        var row = new LightySheetRow(2, new[] { "1" });
        var column = new ColumnDefine("Id", "int");
        var parser = new CountingParser();

        var firstCell = row.GetCellValue(0, column, parser);
        var firstResult = firstCell.Parse();
        var secondCell = row.GetCellValue(0, column, parser);
        var secondResult = secondCell.Parse();

        Assert.Same(firstCell, secondCell);
        Assert.Same(firstResult, secondResult);
        Assert.Equal(1, parser.InvocationCount);

        row.SetCell(0, "2");

        var updatedCell = row.GetCellValue(0, column, parser);
        Assert.NotSame(firstCell, updatedCell);
        Assert.Equal(LightyCellValueState.Unparsed, updatedCell.State);
        Assert.Equal(1, parser.InvocationCount);

        var updatedResult = updatedCell.Parse();

        Assert.True(updatedResult.IsSuccess);
        Assert.Equal(2, parser.InvocationCount);
        Assert.True(updatedResult.TryGetValue(out int parsedValue));
        Assert.Equal(2, parsedValue);
    }

    [Fact]
    public void DefaultParser_ShouldParseListOfStringsWithQuotedCommas()
    {
        var row = new LightySheetRow(0, new[] { "\"Hello, World\",\"it\"\"s\",plain" });
        var column = new ColumnDefine("Tags", "List<string>");

        var result = row.ParseCell(0, column);

        Assert.True(result.IsSuccess);
        Assert.True(result.TryGetValue(out IReadOnlyList<object?>? values));
        Assert.NotNull(values);
        Assert.Equal(new object?[] { "Hello, World", "it\"s", "plain" }, values);
    }

    [Fact]
    public void DefaultParser_ShouldParseDictionaryValues()
    {
        var row = new LightySheetRow(1, new[] { "{1, \"Hello\"}, {2, \"World\"}" });
        var column = new ColumnDefine("Texts", "Dictionary<int,string>");

        var result = row.ParseCell(0, column);

        Assert.True(result.IsSuccess);
        Assert.True(result.TryGetValue(out IReadOnlyDictionary<object, object?>? values));
        Assert.NotNull(values);
        Assert.Equal("Hello", values[1]!);
        Assert.Equal("World", values[2]!);
    }

    [Fact]
    public void DefaultParser_ShouldParseReferenceListsOnlyWhenRequested()
    {
        var row = new LightySheetRow(3, new[] { "[[1001]], [[1002,2002]]" });
        var column = new ColumnDefine("Rewards", "List<Ref:Item.Consumable>");
        var cell = row.GetCellValue(0, column);

        Assert.Equal(LightyCellValueState.Unparsed, cell.State);

        var result = cell.Parse();

        Assert.True(result.IsSuccess);
        Assert.True(result.TryGetValue(out IReadOnlyList<object?>? values));
        Assert.NotNull(values);
        Assert.Collection(
            values,
            item =>
            {
                var reference = Assert.IsType<LightyReferenceValue>(item);
                Assert.Equal(new[] { "1001" }, reference.Identifiers);
            },
            item =>
            {
                var reference = Assert.IsType<LightyReferenceValue>(item);
                Assert.Equal(new[] { "1002", "2002" }, reference.Identifiers);
            });
    }

    [Fact]
    public void DefaultParser_ShouldReturnFailureForInvalidValue()
    {
        var row = new LightySheetRow(4, new[] { "oops" });
        var column = new ColumnDefine("Id", "int");

        var result = row.ParseCell(0, column);

        Assert.False(result.IsSuccess);
        Assert.Null(result.Value);
        Assert.Contains("Row 4, Column 0 ('Id')", result.ErrorMessage);
    }

    [Fact]
    public void WorkbookValidationService_ShouldUseDefaultValidationValuesWhenRuleIsMissing()
    {
        var workspace = CreateValidationWorkspace(
            new ColumnDefine("ID", "int", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
            new ColumnDefine("Name", "string", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
            new[] { new[] { "1", "Potion" } });

        var workbook = Assert.Single(workspace.Workbooks);
        var report = LightyWorkbookValidationService.ValidateWorkbook(workspace, workbook);

        Assert.True(report.IsSuccess);
        Assert.Empty(report.Diagnostics);
    }

    [Fact]
    public void WorkbookValidationService_ShouldApplyNestedListElementValidation()
    {
        var workspace = CreateValidationWorkspace(
            new ColumnDefine(
                "Rewards",
                "List<int>",
                attributes: CreateAttributes(
                    LightyHeaderTypes.Validation,
                    new
                    {
                        minCount = 1,
                        elementValidation = new
                        {
                            range = new { min = 1, max = 10 }
                        }
                    },
                    (LightyHeaderTypes.ExportScope, "All"))),
            new[] { new[] { "0,1,2" } });

        var workbook = Assert.Single(workspace.Workbooks);
        var report = LightyWorkbookValidationService.ValidateWorkbook(workspace, workbook);

        Assert.False(report.IsSuccess);
        Assert.Contains(report.Diagnostics, diagnostic => diagnostic.Message.Contains("greater than or equal to 1", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void WorkbookValidationService_ShouldRejectMissingReferenceTargetValue()
    {
        var itemWorkbook = new LightyWorkbook(
            "Item",
            @"D:\Workspace\Item",
            new[]
            {
                new LightySheet(
                    "Consumable",
                    @"D:\Workspace\Item\Consumable.txt",
                    @"D:\Workspace\Item\Consumable_header.json",
                    new LightySheetHeader(new[]
                    {
                        new ColumnDefine("ID", "int", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                        new ColumnDefine("Name", "string", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                    }),
                    new[]
                    {
                        new LightySheetRow(0, new[] { "1001", "Potion" }),
                    }),
            });

        var configWorkbook = new LightyWorkbook(
            "Config",
            @"D:\Workspace\Config",
            new[]
            {
                new LightySheet(
                    "Feature",
                    @"D:\Workspace\Config\Feature.txt",
                    @"D:\Workspace\Config\Feature_header.json",
                    new LightySheetHeader(new[]
                    {
                        new ColumnDefine("ID", "int", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                        new ColumnDefine(
                            "Target",
                            "Ref:Item.Consumable",
                            attributes: CreateAttributes(
                                LightyHeaderTypes.Validation,
                                new { targetMustExist = true },
                                (LightyHeaderTypes.ExportScope, "All"))),
                    }),
                    new[]
                    {
                        new LightySheetRow(0, new[] { "1", "[[9999]]" }),
                    }),
            });

        var workspace = new LightyWorkspace(
            @"D:\Workspace",
            @"D:\Workspace\config.json",
            @"D:\Workspace\headers.json",
            WorkspaceHeaderLayout.CreateDefault(),
            new[] { itemWorkbook, configWorkbook });

        var report = LightyWorkbookValidationService.ValidateWorkbook(workspace, configWorkbook);

        Assert.False(report.IsSuccess);
        Assert.Contains(report.Diagnostics, diagnostic => diagnostic.Message.Contains("does not contain identifier", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void WorkbookValidationService_ShouldValidateDictionaryKeyAndValueRules()
    {
        var workspace = CreateValidationWorkspace(
            new ColumnDefine(
                "Rewards",
                "Dictionary<int,string>",
                attributes: CreateAttributes(
                    LightyHeaderTypes.Validation,
                    new
                    {
                        minCount = 1,
                        keyValidation = new
                        {
                            range = new { min = 1 }
                        },
                        valueValidation = new
                        {
                            minLength = 3
                        }
                    },
                    (LightyHeaderTypes.ExportScope, "All"))),
            new[] { new[] { "{0, \"ok\"}" } });

        var workbook = Assert.Single(workspace.Workbooks);
        var report = LightyWorkbookValidationService.ValidateWorkbook(workspace, workbook);

        Assert.False(report.IsSuccess);
        Assert.True(report.Diagnostics.Count >= 1);
    }

    [Fact]
    public void WorkbookValidationService_ShouldAcceptStringValueMatchingRegex()
    {
        var workspace = CreateValidationWorkspace(
            new ColumnDefine(
                "Code",
                "string",
                attributes: CreateAttributes(
                    LightyHeaderTypes.Validation,
                    new
                    {
                        regex = "^[A-Z]{3}-\\d{3}$"
                    },
                    (LightyHeaderTypes.ExportScope, "All"))),
            new[] { new[] { "ABC-123" } });

        var workbook = Assert.Single(workspace.Workbooks);
        var report = LightyWorkbookValidationService.ValidateWorkbook(workspace, workbook);

        Assert.True(report.IsSuccess);
    }

    [Fact]
    public void WorkbookValidationService_ShouldRejectStringValueWhenRegexDoesNotMatch()
    {
        var workspace = CreateValidationWorkspace(
            new ColumnDefine(
                "Code",
                "string",
                attributes: CreateAttributes(
                    LightyHeaderTypes.Validation,
                    new
                    {
                        regex = "^[A-Z]{3}-\\d{3}$"
                    },
                    (LightyHeaderTypes.ExportScope, "All"))),
            new[] { new[] { "abc-123" } });

        var workbook = Assert.Single(workspace.Workbooks);
        var report = LightyWorkbookValidationService.ValidateWorkbook(workspace, workbook);

        Assert.False(report.IsSuccess);
        Assert.Contains(report.Diagnostics, diagnostic => diagnostic.Message.Contains("validation regex", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void WorkbookValidationService_ShouldRejectDifferentRegexAndPatternValues()
    {
        var workspace = CreateValidationWorkspace(
            new ColumnDefine(
                "Code",
                "string",
                attributes: CreateAttributes(
                    LightyHeaderTypes.Validation,
                    new
                    {
                        regex = "^[A-Z]+$",
                        pattern = "^\\d+$"
                    },
                    (LightyHeaderTypes.ExportScope, "All"))),
            new[] { new[] { "ABC" } });

        var workbook = Assert.Single(workspace.Workbooks);
        var report = LightyWorkbookValidationService.ValidateWorkbook(workspace, workbook);

        Assert.False(report.IsSuccess);
        Assert.Contains(report.Diagnostics, diagnostic => diagnostic.Message.Contains("regex' and 'pattern'", StringComparison.OrdinalIgnoreCase));
    }

    private static LightyWorkspace CreateValidationWorkspace(ColumnDefine column, string[][] rows)
    {
        return CreateValidationWorkspace(new[] { column }, rows);
    }

    private static LightyWorkspace CreateValidationWorkspace(ColumnDefine firstColumn, ColumnDefine secondColumn, string[][] rows)
    {
        return CreateValidationWorkspace(new[] { firstColumn, secondColumn }, rows);
    }

    private static LightyWorkspace CreateValidationWorkspace(IReadOnlyList<ColumnDefine> columns, string[][] rows)
    {
        var sheet = new LightySheet(
            "Sheet1",
            @"D:\Workspace\Config\Sheet1.txt",
            @"D:\Workspace\Config\Sheet1_header.json",
            new LightySheetHeader(columns),
            rows.Select((row, index) => new LightySheetRow(index, row)).ToArray());

        var workbook = new LightyWorkbook("Config", @"D:\Workspace\Config", new[] { sheet });

        return new LightyWorkspace(
            @"D:\Workspace",
            @"D:\Workspace\config.json",
            @"D:\Workspace\headers.json",
            WorkspaceHeaderLayout.CreateDefault(),
            new[] { workbook });
    }

    private static IReadOnlyDictionary<string, JsonElement> CreateAttributes(string key, object value, params (string Key, object Value)[] additional)
    {
        var attributes = new Dictionary<string, JsonElement>
        {
            [key] = JsonSerializer.SerializeToElement(value),
        };

        foreach (var item in additional)
        {
            attributes[item.Key] = JsonSerializer.SerializeToElement(item.Value);
        }

        return attributes;
    }

    private sealed class CountingParser : ILightyValueParser
    {
        public int InvocationCount { get; private set; }

        public LightyValueParseResult Parse(ColumnDefine column, string rawText, LightyValueParseContext context)
        {
            InvocationCount++;
            return LightyValueParseResult.Success(int.Parse(rawText), rawText, column.Type);
        }
    }
}