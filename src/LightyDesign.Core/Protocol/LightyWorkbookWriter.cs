namespace LightyDesign.Core;

public static class LightyWorkbookWriter
{
    public static void Save(string workspacePath, WorkspaceHeaderLayout headerLayout, LightyWorkbook workbook)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspacePath);
        ArgumentNullException.ThrowIfNull(headerLayout);
        ArgumentNullException.ThrowIfNull(workbook);

        Directory.CreateDirectory(workspacePath);

        var workbookDirectory = Path.Combine(workspacePath, workbook.Name);
        Directory.CreateDirectory(workbookDirectory);

        var codegenConfigFilePath = string.IsNullOrWhiteSpace(workbook.CodegenConfigFilePath)
            ? Path.Combine(workbookDirectory, LightyWorkbookCodegenOptionsSerializer.DefaultFileName)
            : workbook.CodegenConfigFilePath;
        LightyWorkbookCodegenOptionsSerializer.SaveToFile(codegenConfigFilePath, workbook.CodegenOptions);

        var expectedFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var sheet in workbook.Sheets)
        {
            var dataFilePath = Path.Combine(workbookDirectory, $"{sheet.Name}.txt");
            var headerFilePath = Path.Combine(workbookDirectory, $"{sheet.Name}_header.json");

            File.WriteAllText(dataFilePath, SerializeSheetRows(sheet.Rows));
            LightySheetHeaderSerializer.SaveToFile(headerFilePath, sheet.Header, headerLayout);

            expectedFiles.Add(dataFilePath);
            expectedFiles.Add(headerFilePath);
        }

        DeleteStaleSheetFiles(workbookDirectory, expectedFiles);
    }

    private static string SerializeSheetRows(IReadOnlyList<LightySheetRow> rows)
    {
        return string.Join(
            "\r\n",
            rows.Select(row => string.Join('\t', row.Cells.Select(LightyTextCodec.Encode))));
    }

    private static void DeleteStaleSheetFiles(string workbookDirectory, ISet<string> expectedFiles)
    {
        var candidateFiles = Directory
            .EnumerateFiles(workbookDirectory, "*", SearchOption.TopDirectoryOnly)
            .Where(path =>
                path.EndsWith(".txt", StringComparison.OrdinalIgnoreCase) ||
                path.EndsWith("_header.json", StringComparison.OrdinalIgnoreCase));

        foreach (var candidateFile in candidateFiles)
        {
            if (!expectedFiles.Contains(candidateFile))
            {
                File.Delete(candidateFile);
            }
        }
    }
}