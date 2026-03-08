namespace LightyDesign.Core;

public sealed class LightySheet
{
    private readonly IReadOnlyList<LightySheetRow> _rows;

    public LightySheet(
        string name,
        string dataFilePath,
        string headerFilePath,
        LightySheetHeader header,
        IEnumerable<LightySheetRow> rows)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("Sheet name cannot be null or whitespace.", nameof(name));
        }

        if (string.IsNullOrWhiteSpace(dataFilePath))
        {
            throw new ArgumentException("Data file path cannot be null or whitespace.", nameof(dataFilePath));
        }

        if (string.IsNullOrWhiteSpace(headerFilePath))
        {
            throw new ArgumentException("Header file path cannot be null or whitespace.", nameof(headerFilePath));
        }

        ArgumentNullException.ThrowIfNull(header);
        ArgumentNullException.ThrowIfNull(rows);

        Name = name;
        DataFilePath = dataFilePath;
        HeaderFilePath = headerFilePath;
        Header = header;
        _rows = rows.ToList().AsReadOnly();
    }

    public string Name { get; }

    public string DataFilePath { get; }

    public string HeaderFilePath { get; }

    public LightySheetHeader Header { get; }

    public IReadOnlyList<LightySheetRow> Rows => _rows;

    public int RowCount => _rows.Count;
}