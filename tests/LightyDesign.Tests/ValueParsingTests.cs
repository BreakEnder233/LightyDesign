using LightyDesign.Core;

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