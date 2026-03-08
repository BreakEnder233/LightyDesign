namespace LightyDesign.Core;

public sealed class LightySheetRow
{
    private readonly IReadOnlyList<string> _cells;

    public LightySheetRow(int rowIndex, IEnumerable<string> cells)
    {
        if (rowIndex < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(rowIndex));
        }

        ArgumentNullException.ThrowIfNull(cells);

        RowIndex = rowIndex;
        _cells = cells.ToList().AsReadOnly();
    }

    public int RowIndex { get; }

    public IReadOnlyList<string> Cells => _cells;

    public int Count => _cells.Count;

    public string this[int index] => _cells[index];
}