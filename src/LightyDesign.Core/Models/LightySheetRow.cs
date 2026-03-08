namespace LightyDesign.Core;

public sealed class LightySheetRow
{
    private readonly string[] _cells;
    private readonly IReadOnlyList<string> _cellsView;
    private readonly CachedCellValueEntry?[] _cellValueCache;

    public LightySheetRow(int rowIndex, IEnumerable<string> cells)
    {
        if (rowIndex < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(rowIndex));
        }

        ArgumentNullException.ThrowIfNull(cells);

        RowIndex = rowIndex;
        _cells = cells.ToArray();
        _cellsView = Array.AsReadOnly(_cells);
        _cellValueCache = new CachedCellValueEntry[_cells.Length];
    }

    public int RowIndex { get; }

    public IReadOnlyList<string> Cells => _cellsView;

    public int Count => _cells.Length;

    public string this[int index] => _cells[index];

    public void SetCell(int index, string value)
    {
        ArgumentNullException.ThrowIfNull(value);

        ValidateIndex(index);

        _cells[index] = value;
        _cellValueCache[index] = null;
    }

    public LightyCellValue GetCellValue(int index, ColumnDefine column, ILightyValueParser? parser = null)
    {
        ArgumentNullException.ThrowIfNull(column);

        ValidateIndex(index);

        var resolvedParser = parser ?? DefaultLightyValueParser.Instance;
        var cachedEntry = _cellValueCache[index];
        var currentRawText = _cells[index];

        if (cachedEntry is not null &&
            string.Equals(cachedEntry.FieldName, column.FieldName, StringComparison.Ordinal) &&
            string.Equals(cachedEntry.DeclaredType, column.Type, StringComparison.Ordinal) &&
            string.Equals(cachedEntry.RawText, currentRawText, StringComparison.Ordinal) &&
            ReferenceEquals(cachedEntry.Parser, resolvedParser))
        {
            return cachedEntry.CellValue;
        }

        var context = new LightyValueParseContext(RowIndex, index, column.FieldName);
        var cellValue = new LightyCellValue(column, currentRawText, resolvedParser, context);
        _cellValueCache[index] = new CachedCellValueEntry(column.FieldName, column.Type, currentRawText, resolvedParser, cellValue);

        return cellValue;
    }

    public LightyValueParseResult ParseCell(int index, ColumnDefine column, ILightyValueParser? parser = null)
    {
        return GetCellValue(index, column, parser).Parse();
    }

    private void ValidateIndex(int index)
    {
        if (index < 0 || index >= _cells.Length)
        {
            throw new ArgumentOutOfRangeException(nameof(index));
        }
    }

    private sealed record CachedCellValueEntry(
        string FieldName,
        string DeclaredType,
        string RawText,
        ILightyValueParser Parser,
        LightyCellValue CellValue);
}