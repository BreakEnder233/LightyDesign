using ClosedXML.Excel;
using LightyDesign.Core;

namespace LightyDesign.FileProcess;

public sealed class LightyWorkbookExcelImporter
{
    public LightyWorkbook Import(Stream input, string workbookName, WorkspaceHeaderLayout headerLayout, string? directoryPath = null)
    {
        ArgumentNullException.ThrowIfNull(input);
        ArgumentException.ThrowIfNullOrWhiteSpace(workbookName);
        ArgumentNullException.ThrowIfNull(headerLayout);

        using var excelWorkbook = new XLWorkbook(input);
        var sheets = new List<LightySheet>();
        var sheetNames = new HashSet<string>(StringComparer.Ordinal);

        foreach (var worksheet in excelWorkbook.Worksheets)
        {
            if (!sheetNames.Add(worksheet.Name))
            {
                throw new LightyExcelProcessException($"Duplicate worksheet name '{worksheet.Name}' was found.", worksheet.Name);
            }

            sheets.Add(ImportSheet(worksheet, headerLayout, directoryPath ?? workbookName));
        }

        return new LightyWorkbook(workbookName, directoryPath ?? workbookName, sheets);
    }

    private static LightySheet ImportSheet(IXLWorksheet worksheet, WorkspaceHeaderLayout headerLayout, string workbookDirectory)
    {
        var usedRange = worksheet.RangeUsed();
        if (usedRange is null)
        {
            throw new LightyExcelProcessException("Worksheet is empty.", worksheet.Name);
        }

        var headerRowCount = headerLayout.Count;
        var lastRowNumber = usedRange.LastRow().RowNumber();
        var lastColumnNumber = usedRange.LastColumn().ColumnNumber();

        if (headerRowCount == 0)
        {
            throw new LightyExcelProcessException("Workspace header layout must contain at least one row.", worksheet.Name);
        }

        if (lastRowNumber < headerRowCount)
        {
            throw new LightyExcelProcessException("Worksheet does not contain enough rows for the configured header layout.", worksheet.Name);
        }

        var headerRows = ReadHeaderRows(worksheet, headerLayout, lastColumnNumber);
        var header = BuildHeader(worksheet, headerRows, lastColumnNumber);
        var rows = ReadDataRows(worksheet, headerRowCount, lastRowNumber, header.Count);
        var dataFilePath = Path.Combine(workbookDirectory, $"{worksheet.Name}.txt");
        var headerFilePath = Path.Combine(workbookDirectory, $"{worksheet.Name}_header.json");

        return new LightySheet(worksheet.Name, dataFilePath, headerFilePath, header, rows);
    }

    private static IReadOnlyDictionary<string, IReadOnlyList<string>> ReadHeaderRows(IXLWorksheet worksheet, WorkspaceHeaderLayout headerLayout, int lastColumnNumber)
    {
        var rows = new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal);

        for (var headerIndex = 0; headerIndex < headerLayout.Count; headerIndex++)
        {
            var rowNumber = headerIndex + 1;
            var values = new List<string>(lastColumnNumber);

            for (var columnNumber = 1; columnNumber <= lastColumnNumber; columnNumber++)
            {
                values.Add(worksheet.Cell(rowNumber, columnNumber).GetString());
            }

            rows[headerLayout[headerIndex].HeaderType] = values.AsReadOnly();
        }

        return rows;
    }

    private static LightySheetHeader BuildHeader(IXLWorksheet worksheet, IReadOnlyDictionary<string, IReadOnlyList<string>> headerRows, int lastColumnNumber)
    {
        if (!headerRows.TryGetValue(LightyHeaderTypes.FieldName, out var fieldNames))
        {
            throw new LightyExcelProcessException("Worksheet is missing the required FieldName header row.", worksheet.Name);
        }

        if (!headerRows.TryGetValue(LightyHeaderTypes.Type, out var types))
        {
            throw new LightyExcelProcessException("Worksheet is missing the required Type header row.", worksheet.Name);
        }

        if (fieldNames.Count == 0)
        {
            throw new LightyExcelProcessException("Worksheet contains no columns in the FieldName row.", worksheet.Name);
        }

        if (fieldNames.Count != types.Count)
        {
            throw new LightyExcelProcessException("FieldName row and Type row have different column counts.", worksheet.Name);
        }

        var displayNames = headerRows.TryGetValue(LightyHeaderTypes.DisplayName, out var displayNameRow)
            ? displayNameRow
            : Array.Empty<string>();

        var columns = new List<ColumnDefine>(fieldNames.Count);

        for (var columnIndex = 0; columnIndex < fieldNames.Count; columnIndex++)
        {
            var fieldName = fieldNames[columnIndex];
            var type = types[columnIndex];
            var cellAddress = worksheet.Cell(1, columnIndex + 1).Address.ToString();

            if (string.IsNullOrWhiteSpace(fieldName))
            {
                throw new LightyExcelProcessException("FieldName cannot be empty.", worksheet.Name, cellAddress);
            }

            if (string.IsNullOrWhiteSpace(type))
            {
                throw new LightyExcelProcessException($"Type for field '{fieldName}' cannot be empty.", worksheet.Name, worksheet.Cell(2, columnIndex + 1).Address.ToString());
            }

            var attributes = new Dictionary<string, System.Text.Json.JsonElement>(StringComparer.Ordinal);

            foreach (var pair in headerRows)
            {
                if (string.Equals(pair.Key, LightyHeaderTypes.FieldName, StringComparison.Ordinal) ||
                    string.Equals(pair.Key, LightyHeaderTypes.Type, StringComparison.Ordinal) ||
                    string.Equals(pair.Key, LightyHeaderTypes.DisplayName, StringComparison.Ordinal))
                {
                    continue;
                }

                var valueText = columnIndex < pair.Value.Count ? pair.Value[columnIndex] : string.Empty;
                if (string.IsNullOrWhiteSpace(valueText))
                {
                    continue;
                }

                attributes[pair.Key] = ExcelHeaderValueConverter.ParseHeaderCellValue(valueText);
            }

            var displayName = columnIndex < displayNames.Count && !string.IsNullOrWhiteSpace(displayNames[columnIndex])
                ? displayNames[columnIndex]
                : null;

            columns.Add(new ColumnDefine(fieldName, type, displayName, attributes));
        }

        return new LightySheetHeader(columns);
    }

    private static IReadOnlyList<LightySheetRow> ReadDataRows(IXLWorksheet worksheet, int headerRowCount, int lastRowNumber, int columnCount)
    {
        var rows = new List<LightySheetRow>();

        for (var rowNumber = headerRowCount + 1; rowNumber <= lastRowNumber; rowNumber++)
        {
            var values = new string[columnCount];

            for (var columnNumber = 1; columnNumber <= columnCount; columnNumber++)
            {
                values[columnNumber - 1] = worksheet.Cell(rowNumber, columnNumber).GetString();
            }

            rows.Add(new LightySheetRow(rowNumber - (headerRowCount + 1), values));
        }

        return rows.AsReadOnly();
    }
}