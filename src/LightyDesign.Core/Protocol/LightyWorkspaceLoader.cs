namespace LightyDesign.Core;

public static class LightyWorkspaceLoader
{
    public static LightyWorkspace Load(string rootPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(rootPath);

        if (!Directory.Exists(rootPath))
        {
            throw new DirectoryNotFoundException($"Workspace root directory was not found: '{rootPath}'.");
        }

        var configFilePath = Path.Combine(rootPath, "config.json");
        var headersFilePath = Path.Combine(rootPath, "headers.json");

        if (!File.Exists(headersFilePath))
        {
            throw new FileNotFoundException("Workspace headers.json was not found.", headersFilePath);
        }

        var headerLayout = WorkspaceHeaderLayoutSerializer.LoadFromFile(headersFilePath);
        var workbooks = Directory
            .EnumerateDirectories(rootPath)
            .Select(LoadWorkbook)
            .OrderBy(workbook => workbook.Name, StringComparer.Ordinal)
            .ToList();

        return new LightyWorkspace(rootPath, configFilePath, headersFilePath, headerLayout, workbooks);
    }

    private static LightyWorkbook LoadWorkbook(string workbookDirectory)
    {
        var workbookName = Path.GetFileName(workbookDirectory);
        var sheets = Directory
            .EnumerateFiles(workbookDirectory, "*.txt", SearchOption.TopDirectoryOnly)
            .Select(dataFilePath => LoadSheet(workbookDirectory, dataFilePath))
            .OrderBy(sheet => sheet.Name, StringComparer.Ordinal)
            .ToList();

        return new LightyWorkbook(workbookName, workbookDirectory, sheets);
    }

    private static LightySheet LoadSheet(string workbookDirectory, string dataFilePath)
    {
        var sheetName = Path.GetFileNameWithoutExtension(dataFilePath);
        var headerFilePath = Path.Combine(workbookDirectory, $"{sheetName}_header.json");

        if (!File.Exists(headerFilePath))
        {
            throw new FileNotFoundException($"Header file for sheet '{sheetName}' was not found.", headerFilePath);
        }

        var header = LightySheetHeaderSerializer.LoadFromFile(headerFilePath);
        var rows = LoadRows(dataFilePath, header.Count);

        return new LightySheet(sheetName, dataFilePath, headerFilePath, header, rows);
    }

    private static IReadOnlyList<LightySheetRow> LoadRows(string dataFilePath, int expectedColumnCount)
    {
        var content = File.ReadAllText(dataFilePath);
        var lines = LightyTextCodec.SplitLines(content);
        var rows = new List<LightySheetRow>(lines.Count);

        for (var index = 0; index < lines.Count; index++)
        {
            var rawFields = LightyTextCodec.SplitFields(lines[index]);
            var decodedFields = rawFields.Select(LightyTextCodec.Decode).ToList();

            if (expectedColumnCount > 0 && decodedFields.Count != expectedColumnCount)
            {
                throw new LightyTextFormatException(
                    $"Sheet row {index} in '{dataFilePath}' has {decodedFields.Count} fields, expected {expectedColumnCount}.");
            }

            rows.Add(new LightySheetRow(index, decodedFields));
        }

        return rows.AsReadOnly();
    }
}