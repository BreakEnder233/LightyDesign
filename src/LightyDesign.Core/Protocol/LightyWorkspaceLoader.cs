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

        LightyWorkspaceTemplateAssets.TryCopyMissingNodeDefinitions(rootPath);

        var configFilePath = Path.Combine(rootPath, "config.json");
        var headersFilePath = Path.Combine(rootPath, "headers.json");
        var codegenConfigFilePath = Path.Combine(rootPath, LightyWorkbookCodegenOptionsSerializer.DefaultFileName);

        if (!File.Exists(headersFilePath))
        {
            throw new FileNotFoundException("Workspace headers.json was not found.", headersFilePath);
        }

        var headerLayout = WorkspaceHeaderLayoutSerializer.LoadFromFile(headersFilePath);
        var codegenOptions = File.Exists(codegenConfigFilePath)
            ? LightyWorkbookCodegenOptionsSerializer.LoadFromFile(codegenConfigFilePath)
            : new LightyWorkbookCodegenOptions();
        var workbooksRootPath = LightyWorkspacePathLayout.GetWorkbooksRootPath(rootPath);
        var workbooks = Directory.Exists(workbooksRootPath)
            ? Directory
                .EnumerateDirectories(workbooksRootPath)
                .Select(workbookDirectory => LoadWorkbook(workbookDirectory, codegenOptions, codegenConfigFilePath))
                .OrderBy(workbook => workbook.Name, StringComparer.Ordinal)
                .ToList()
            : new List<LightyWorkbook>();
        var flowChartNodeDefinitions = LightyFlowChartAssetLoader.LoadNodeDefinitions(rootPath);
        var flowChartFiles = LightyFlowChartAssetLoader.LoadFiles(rootPath);

        return new LightyWorkspace(
            rootPath,
            configFilePath,
            headersFilePath,
            headerLayout,
            workbooks,
            codegenOptions,
            codegenConfigFilePath,
            flowChartNodeDefinitions,
            flowChartFiles);
    }

    private static LightyWorkbook LoadWorkbook(
        string workbookDirectory,
        LightyWorkbookCodegenOptions codegenOptions,
        string codegenConfigFilePath)
    {
        var workbookName = Path.GetFileName(workbookDirectory);
        var sheets = Directory
            .EnumerateFiles(workbookDirectory, "*.txt", SearchOption.TopDirectoryOnly)
            .Select(dataFilePath => LoadSheet(workbookDirectory, dataFilePath))
            .OrderBy(sheet => sheet.Name, StringComparer.Ordinal)
            .ToList();

        return new LightyWorkbook(workbookName, workbookDirectory, sheets, codegenOptions, codegenConfigFilePath);
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
