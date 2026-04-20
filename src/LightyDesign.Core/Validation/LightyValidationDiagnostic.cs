namespace LightyDesign.Core;

public sealed class LightyValidationDiagnostic
{
    public LightyValidationDiagnostic(
        string workbookName,
        string sheetName,
        string fieldName,
        string message,
        int? rowIndex = null,
        int? columnIndex = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workbookName);
        ArgumentException.ThrowIfNullOrWhiteSpace(sheetName);
        ArgumentException.ThrowIfNullOrWhiteSpace(fieldName);
        ArgumentException.ThrowIfNullOrWhiteSpace(message);

        WorkbookName = workbookName;
        SheetName = sheetName;
        FieldName = fieldName;
        Message = message;
        RowIndex = rowIndex;
        ColumnIndex = columnIndex;
    }

    public string WorkbookName { get; }

    public string SheetName { get; }

    public string FieldName { get; }

    public string Message { get; }

    public int? RowIndex { get; }

    public int? ColumnIndex { get; }

    public string FormatMessage()
    {
        var location = $"Workbook '{WorkbookName}', Sheet '{SheetName}'";
        if (RowIndex.HasValue && ColumnIndex.HasValue)
        {
            location += $", Row {RowIndex.Value}, Column {ColumnIndex.Value} ('{FieldName}')";
        }
        else
        {
            location += $", Column '{FieldName}'";
        }

        return $"{location}: {Message}";
    }

    public override string ToString()
    {
        return FormatMessage();
    }
}