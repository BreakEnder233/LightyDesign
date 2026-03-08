namespace LightyDesign.Core;

public sealed class LightySheetHeader
{
    private readonly IReadOnlyList<ColumnDefine> _columns;

    public LightySheetHeader(IEnumerable<ColumnDefine> columns)
    {
        ArgumentNullException.ThrowIfNull(columns);

        _columns = columns.ToList().AsReadOnly();
    }

    public IReadOnlyList<ColumnDefine> Columns => _columns;

    public int Count => _columns.Count;

    public ColumnDefine this[int index] => _columns[index];

    public bool TryGetColumn(string fieldName, out ColumnDefine? column)
    {
        ArgumentException.ThrowIfNullOrEmpty(fieldName);

        column = _columns.FirstOrDefault(candidate => string.Equals(candidate.FieldName, fieldName, StringComparison.Ordinal));
        return column is not null;
    }
}