using System.Text.Json;

namespace LightyDesign.Core;

public static class LightyWorkbookScaffolder
{
    public const string DefaultSheetName = "Sheet1";

    public static LightyWorkbook CreateDefault(string workspacePath, WorkspaceHeaderLayout headerLayout, string workbookName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspacePath);
        ArgumentNullException.ThrowIfNull(headerLayout);

        if (string.IsNullOrWhiteSpace(workbookName))
        {
            throw new LightyCoreException("Workbook name cannot be empty.");
        }

        var trimmedWorkbookName = workbookName.Trim();
        var workbookDirectoryPath = Path.Combine(workspacePath, trimmedWorkbookName);
        if (Directory.Exists(workbookDirectoryPath) || File.Exists(workbookDirectoryPath))
        {
            throw new LightyCoreException($"Workbook '{trimmedWorkbookName}' already exists.");
        }

        var sheetName = DefaultSheetName;
        var workbook = new LightyWorkbook(
            trimmedWorkbookName,
            workbookDirectoryPath,
            new[]
            {
                new LightySheet(
                    sheetName,
                    Path.Combine(workbookDirectoryPath, $"{sheetName}.txt"),
                    Path.Combine(workbookDirectoryPath, $"{sheetName}_header.json"),
                    new LightySheetHeader(new[]
                    {
                        new ColumnDefine(
                            fieldName: "ID",
                            type: "int",
                            displayName: "序号",
                            attributes: new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase)
                            {
                                [LightyHeaderTypes.ExportScope] = JsonSerializer.SerializeToElement("All"),
                            }),
                        new ColumnDefine(
                            fieldName: "Annotation",
                            type: "string",
                            displayName: "注释",
                            attributes: new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase)
                            {
                                [LightyHeaderTypes.ExportScope] = JsonSerializer.SerializeToElement("None"),
                            }),
                    }),
                    Array.Empty<LightySheetRow>())
            });

        LightyWorkbookWriter.Save(workspacePath, headerLayout, workbook);
        return workbook;
    }

    public static void Delete(string workspacePath, string workbookName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspacePath);

        if (string.IsNullOrWhiteSpace(workbookName))
        {
            throw new LightyCoreException("Workbook name cannot be empty.");
        }

        var workbookDirectoryPath = Path.Combine(workspacePath, workbookName.Trim());
        if (!Directory.Exists(workbookDirectoryPath))
        {
            throw new LightyCoreException($"Workbook '{workbookName.Trim()}' was not found.");
        }

        Directory.Delete(workbookDirectoryPath, recursive: true);
    }
}