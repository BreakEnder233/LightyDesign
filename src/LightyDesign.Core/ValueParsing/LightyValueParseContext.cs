namespace LightyDesign.Core;

public sealed class LightyValueParseContext
{
    public LightyValueParseContext(int rowIndex, int columnIndex, string fieldName)
    {
        if (rowIndex < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(rowIndex));
        }

        if (columnIndex < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(columnIndex));
        }

        ArgumentException.ThrowIfNullOrWhiteSpace(fieldName);

        RowIndex = rowIndex;
        ColumnIndex = columnIndex;
        FieldName = fieldName;
    }

    public int RowIndex { get; }

    public int ColumnIndex { get; }

    public string FieldName { get; }

    public string FormatPrefix()
    {
        return $"Row {RowIndex}, Column {ColumnIndex} ('{FieldName}')";
    }
}