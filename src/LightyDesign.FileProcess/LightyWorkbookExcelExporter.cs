using ClosedXML.Excel;
using LightyDesign.Core;

namespace LightyDesign.FileProcess;

public sealed class LightyWorkbookExcelExporter
{
    public void Export(LightyWorkbook workbook, WorkspaceHeaderLayout headerLayout, Stream output)
    {
        ArgumentNullException.ThrowIfNull(workbook);
        ArgumentNullException.ThrowIfNull(headerLayout);
        ArgumentNullException.ThrowIfNull(output);

        using var excelWorkbook = new XLWorkbook();

        foreach (var sheet in workbook.Sheets)
        {
            ExportSheet(excelWorkbook, sheet, headerLayout);
        }

        excelWorkbook.SaveAs(output);
    }

    private static void ExportSheet(XLWorkbook workbook, LightySheet sheet, WorkspaceHeaderLayout headerLayout)
    {
        EnsureValidWorksheetName(sheet.Name);

        var worksheet = workbook.Worksheets.Add(sheet.Name);
        var headerRowCount = headerLayout.Count;

        for (var headerIndex = 0; headerIndex < headerLayout.Count; headerIndex++)
        {
            var headerType = headerLayout[headerIndex].HeaderType;
            var rowNumber = headerIndex + 1;

            for (var columnIndex = 0; columnIndex < sheet.Header.Count; columnIndex++)
            {
                var column = sheet.Header[columnIndex];
                worksheet.Cell(rowNumber, columnIndex + 1).Value = ExcelHeaderValueConverter.GetHeaderCellText(headerType, column);
            }
        }

        for (var rowIndex = 0; rowIndex < sheet.Rows.Count; rowIndex++)
        {
            var row = sheet.Rows[rowIndex];
            var targetRowNumber = headerRowCount + rowIndex + 1;

            for (var columnIndex = 0; columnIndex < row.Count; columnIndex++)
            {
                worksheet.Cell(targetRowNumber, columnIndex + 1).Value = row[columnIndex];
            }
        }

        if (headerRowCount > 0)
        {
            worksheet.SheetView.FreezeRows(headerRowCount);
            worksheet.Range(1, 1, headerRowCount, Math.Max(sheet.Header.Count, 1)).Style.Font.Bold = true;
            worksheet.Range(1, 1, headerRowCount, Math.Max(sheet.Header.Count, 1)).Style.Fill.BackgroundColor = XLColor.LightGray;
        }

        worksheet.Columns().AdjustToContents();
    }

    private static void EnsureValidWorksheetName(string worksheetName)
    {
        if (string.IsNullOrWhiteSpace(worksheetName))
        {
            throw new LightyExcelProcessException("Worksheet name cannot be empty.");
        }

        if (worksheetName.Length > 31)
        {
            throw new LightyExcelProcessException($"Worksheet name '{worksheetName}' exceeds Excel's 31 character limit.", worksheetName);
        }

        if (worksheetName.IndexOfAny(new[] { '[', ']', ':', '*', '?', '/', '\\' }) >= 0)
        {
            throw new LightyExcelProcessException($"Worksheet name '{worksheetName}' contains invalid Excel worksheet characters.", worksheetName);
        }
    }
}