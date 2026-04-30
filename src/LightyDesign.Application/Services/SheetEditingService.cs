using System.Text.Json;
using LightyDesign.Application.Dtos;
using LightyDesign.Application.Exceptions;
using LightyDesign.Core;

namespace LightyDesign.Application.Services;

public sealed class SheetEditingService
{
    public object SaveWorkbook(string workspacePath, WorkbookPayloadDto payload)
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        var headerLayout = WorkspaceHeaderLayoutSerializer.LoadFromFile(Path.Combine(workspacePath, "headers.json"));
        var workbook = MapToWorkbook(payload, workspacePath);
        LightyWorkbookWriter.Save(workspacePath, headerLayout, workbook, workspace.CodegenOptions, workspace.CodegenConfigFilePath);
        return WorkspaceResponseBuilder.ToWorkbookResponse(workbook, previewOnly: false);
    }

    public object PatchSheetRows(PatchRowsRequestDto request)
    {
        var workspacePath = request.WorkspacePath;
        var workbookName = request.WorkbookName;
        var sheetName = request.SheetName;
        var dryRun = request.DryRun;
        var operations = request.Operations;

        // Load and clone the workbook
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            throw new WorkbookNotFoundException(workbookName, workspacePath);
        }

        if (!workbook.TryGetSheet(sheetName, out var sheet) || sheet is null)
        {
            throw new SheetNotFoundException(sheetName, workbookName);
        }

        // Clone sheet data for mutation
        var rows = sheet.Rows.Select(r => r.Cells.ToList()).ToList();
        var columns = sheet.Header.Columns.ToList();
        var affectedRowIndices = new List<int>();
        var insertedCount = 0;
        var updatedCount = 0;
        var deletedCount = 0;

        foreach (var operation in operations)
        {
            switch (operation.Kind)
            {
                case "insert":
                {
                    var rowIndex = Math.Max(0, Math.Min(rows.Count, operation.RowIndex ?? rows.Count));
                    var newRow = BuildRowFromOperation(operation, columns.Count);
                    rows.Insert(rowIndex, newRow);
                    insertedCount++;
                    affectedRowIndices.Add(rowIndex);
                    break;
                }
                case "update":
                {
                    var rowIndex = operation.RowIndex;
                    if (rowIndex is null || rowIndex < 0 || rowIndex >= rows.Count)
                    {
                        throw new Exceptions.ValidationException($"update operation references invalid rowIndex: {operation.RowIndex}.");
                    }

                    var existingRow = rows[rowIndex.Value];

                    if (operation.Cells is not null && operation.FieldValues is not null && operation.FieldValues.Count > 0)
                    {
                        throw new Exceptions.ValidationException("update operation cannot provide both cells and fieldValues.");
                    }

                    if (operation.Cells is not null)
                    {
                        rows[rowIndex.Value] = NormalizeCells(operation.Cells, columns.Count);
                    }
                    else if (operation.FieldValues is not null && operation.FieldValues.Count > 0)
                    {
                        rows[rowIndex.Value] = ApplyFieldValues(existingRow, columns, operation.FieldValues);
                    }

                    updatedCount++;
                    affectedRowIndices.Add(rowIndex.Value);
                    break;
                }
                case "delete":
                {
                    var rowIndex = operation.RowIndex;
                    if (rowIndex is null || rowIndex < 0 || rowIndex >= rows.Count)
                    {
                        throw new Exceptions.ValidationException($"delete operation references invalid rowIndex: {operation.RowIndex}.");
                    }

                    rows.RemoveAt(rowIndex.Value);
                    deletedCount++;
                    affectedRowIndices.Add(Math.Min(rowIndex.Value, Math.Max(0, rows.Count - 1)));
                    break;
                }
                default:
                    throw new Exceptions.ValidationException($"Unsupported row operation kind: {operation.Kind}.");
            }
        }

        // Build response
        var columnDefines = columns.Select(c => new ColumnDefine(c.FieldName, c.Type, c.DisplayName, c.Attributes)).ToList();
        var sheetRows = rows.Select((cells, index) => new LightySheetRow(index, cells)).ToList();
        var patchedSheet = new LightySheet(sheetName, sheet.DataFilePath, sheet.HeaderFilePath, new LightySheetHeader(columnDefines), sheetRows);

        if (dryRun)
        {
            return new
            {
                workspacePath,
                workbookName,
                sheetName,
                dryRun = true,
                summary = new { insertedCount, updatedCount, deletedCount, rowCount = rows.Count },
            };
        }

        // Save to disk
        var nextSheets = workbook.Sheets
            .Select(s => string.Equals(s.Name, sheetName, StringComparison.Ordinal) ? patchedSheet : s)
            .ToList();
        var updatedWorkbook = new LightyWorkbook(workbook.Name, workbook.DirectoryPath, nextSheets, workbook.CodegenOptions, workbook.CodegenConfigFilePath);
        var headerLayout = WorkspaceHeaderLayoutSerializer.LoadFromFile(Path.Combine(workspacePath, "headers.json"));
        LightyWorkbookWriter.Save(workspacePath, headerLayout, updatedWorkbook, workspace.CodegenOptions, workspace.CodegenConfigFilePath);

        return new
        {
            workspacePath,
            workbookName,
            sheetName,
            dryRun = false,
            summary = new { insertedCount, updatedCount, deletedCount, rowCount = rows.Count },
        };
    }

    public object PatchSheetColumns(PatchColumnsRequestDto request)
    {
        var workspacePath = request.WorkspacePath;
        var workbookName = request.WorkbookName;
        var sheetName = request.SheetName;
        var dryRun = request.DryRun;
        var operations = request.Operations;

        // Load and clone the workbook
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            throw new WorkbookNotFoundException(workbookName, workspacePath);
        }

        if (!workbook.TryGetSheet(sheetName, out var sheet) || sheet is null)
        {
            throw new SheetNotFoundException(sheetName, workbookName);
        }

        // Clone sheet data for mutation
        var rows = sheet.Rows.Select(r => r.Cells.ToList()).ToList();
        var columns = sheet.Header.Columns.ToList();
        var insertedCount = 0;
        var updatedCount = 0;
        var deletedCount = 0;
        var movedCount = 0;

        foreach (var operation in operations)
        {
            switch (operation.Kind)
            {
                case "insert":
                {
                    var (fieldName, type, displayName, attributes) = ParseColumnPayload(operation);
                    if (columns.Any(c => string.Equals(c.FieldName, fieldName, StringComparison.Ordinal)))
                    {
                        throw new Exceptions.ValidationException($"Column '{fieldName}' already exists.");
                    }

                    var insertIndex = Math.Max(0, Math.Min(columns.Count, operation.Index ?? columns.Count));
                    var newColumn = new ColumnDefine(fieldName, type, displayName, attributes);
                    columns.Insert(insertIndex, newColumn);

                    var defaultValue = operation.DefaultValue ?? "";
                    for (var i = 0; i < rows.Count; i++)
                    {
                        var normalizedRow = new List<string>(rows[i]);
                        while (normalizedRow.Count < columns.Count - 1) normalizedRow.Add("");
                        normalizedRow.Insert(insertIndex, defaultValue);
                        rows[i] = normalizedRow;
                    }

                    insertedCount++;
                    break;
                }
                case "update":
                {
                    var targetFieldName = operation.TargetFieldName ?? operation.FieldName;
                    if (string.IsNullOrWhiteSpace(targetFieldName))
                    {
                        throw new Exceptions.ValidationException("update column operation requires fieldName.");
                    }

                    var columnIndex = columns.FindIndex(c => string.Equals(c.FieldName, targetFieldName, StringComparison.Ordinal));
                    if (columnIndex < 0)
                    {
                        throw new Exceptions.ValidationException($"Column '{targetFieldName}' does not exist.");
                    }

                    var existing = columns[columnIndex];
                    var nextFieldName = operation.FieldName ?? existing.FieldName;
                    var nextType = operation.Type ?? existing.Type;
                    var nextDisplayName = operation.DisplayName ?? existing.DisplayName;

                    if (!string.Equals(nextFieldName, existing.FieldName, StringComparison.Ordinal)
                        && columns.Any(c => string.Equals(c.FieldName, nextFieldName, StringComparison.Ordinal)))
                    {
                        throw new Exceptions.ValidationException($"Column '{nextFieldName}' already exists.");
                    }

                    var nextAttributes = new Dictionary<string, JsonElement>(existing.Attributes, StringComparer.Ordinal);
                    if (operation.Attributes is not null)
                    {
                        foreach (var attr in operation.Attributes)
                        {
                            nextAttributes[attr.Key] = JsonSerializer.SerializeToElement(attr.Value);
                        }
                    }

                    columns[columnIndex] = new ColumnDefine(nextFieldName, nextType, nextDisplayName, nextAttributes);
                    updatedCount++;
                    break;
                }
                case "move":
                {
                    var sourceFieldName = operation.FieldName;
                    if (string.IsNullOrWhiteSpace(sourceFieldName))
                    {
                        throw new Exceptions.ValidationException("move column operation requires fieldName.");
                    }

                    var sourceIndex = columns.FindIndex(c => string.Equals(c.FieldName, sourceFieldName, StringComparison.Ordinal));
                    if (sourceIndex < 0)
                    {
                        throw new Exceptions.ValidationException($"Column '{sourceFieldName}' does not exist.");
                    }

                    var targetIndex = Math.Max(0, Math.Min(columns.Count - 1, operation.ToIndex ?? sourceIndex));
                    var movedColumn = columns[sourceIndex];
                    columns.RemoveAt(sourceIndex);
                    columns.Insert(targetIndex, movedColumn);

                    for (var i = 0; i < rows.Count; i++)
                    {
                        var normalizedRow = new List<string>(rows[i]);
                        while (normalizedRow.Count < columns.Count) normalizedRow.Add("");
                        var movedValue = normalizedRow[sourceIndex];
                        normalizedRow.RemoveAt(sourceIndex);
                        normalizedRow.Insert(targetIndex, movedValue);
                        rows[i] = normalizedRow;
                    }

                    movedCount++;
                    break;
                }
                case "delete":
                {
                    var targetFieldName = operation.TargetFieldName ?? operation.FieldName;
                    if (string.IsNullOrWhiteSpace(targetFieldName))
                    {
                        throw new Exceptions.ValidationException("delete column operation requires fieldName.");
                    }

                    var columnIndex = columns.FindIndex(c => string.Equals(c.FieldName, targetFieldName, StringComparison.Ordinal));
                    if (columnIndex < 0)
                    {
                        throw new Exceptions.ValidationException($"Column '{targetFieldName}' does not exist.");
                    }

                    columns.RemoveAt(columnIndex);
                    for (var i = 0; i < rows.Count; i++)
                    {
                        var normalizedRow = new List<string>(rows[i]);
                        if (columnIndex < normalizedRow.Count)
                        {
                            normalizedRow.RemoveAt(columnIndex);
                        }
                        rows[i] = normalizedRow;
                    }

                    deletedCount++;
                    break;
                }
                default:
                    throw new Exceptions.ValidationException($"Unsupported column operation kind: {operation.Kind}.");
            }
        }

        // Normalize all rows to match column count
        for (var i = 0; i < rows.Count; i++)
        {
            var normalized = new List<string>(rows[i]);
            while (normalized.Count < columns.Count) normalized.Add("");
            if (normalized.Count > columns.Count) normalized = normalized.Take(columns.Count).ToList();
            rows[i] = normalized;
        }

        // Build patched sheet
        var columnDefines = columns.Select(c => new ColumnDefine(c.FieldName, c.Type, c.DisplayName, c.Attributes)).ToList();
        var sheetRows = rows.Select((cells, index) => new LightySheetRow(index, cells)).ToList();
        var patchedSheet = new LightySheet(sheetName, sheet.DataFilePath, sheet.HeaderFilePath, new LightySheetHeader(columnDefines), sheetRows);

        if (dryRun)
        {
            return new
            {
                workspacePath,
                workbookName,
                sheetName,
                dryRun = true,
                summary = new { insertedCount, updatedCount, deletedCount, movedCount, columnCount = columns.Count },
            };
        }

        // Save to disk
        var nextSheets = workbook.Sheets
            .Select(s => string.Equals(s.Name, sheetName, StringComparison.Ordinal) ? patchedSheet : s)
            .ToList();
        var updatedWorkbook = new LightyWorkbook(workbook.Name, workbook.DirectoryPath, nextSheets, workbook.CodegenOptions, workbook.CodegenConfigFilePath);
        var headerLayout = WorkspaceHeaderLayoutSerializer.LoadFromFile(Path.Combine(workspacePath, "headers.json"));
        LightyWorkbookWriter.Save(workspacePath, headerLayout, updatedWorkbook, workspace.CodegenOptions, workspace.CodegenConfigFilePath);

        return new
        {
            workspacePath,
            workbookName,
            sheetName,
            dryRun = false,
            summary = new { insertedCount, updatedCount, deletedCount, movedCount, columnCount = columns.Count },
        };
    }

    // ── 内部辅助方法 ──

    private static List<string> BuildRowFromOperation(RowPatchOperationDto operation, int columnCount)
    {
        if (operation.Cells is not null && operation.FieldValues is not null && operation.FieldValues.Count > 0)
        {
            throw new Exceptions.ValidationException("insert operation cannot provide both cells and fieldValues.");
        }

        if (operation.Cells is not null)
        {
            return NormalizeCells(operation.Cells, columnCount);
        }

        if (operation.FieldValues is not null && operation.FieldValues.Count > 0)
        {
            return ApplyFieldValues(Enumerable.Repeat("", columnCount).ToList(), new List<ColumnDefine>(), operation.FieldValues);
        }

        return Enumerable.Repeat("", columnCount).ToList();
    }

    private static List<string> NormalizeCells(List<string> cells, int columnCount)
    {
        return Enumerable.Range(0, columnCount)
            .Select(i => i < cells.Count ? (cells[i] ?? "") : "")
            .ToList();
    }

    private static List<string> ApplyFieldValues(List<string> row, List<ColumnDefine> columns, Dictionary<string, string> fieldValues)
    {
        var nextRow = new List<string>(row);
        foreach (var (fieldName, value) in fieldValues)
        {
            var columnIndex = columns.FindIndex(c => string.Equals(c.FieldName, fieldName, StringComparison.Ordinal));
            if (columnIndex >= 0 && columnIndex < nextRow.Count)
            {
                nextRow[columnIndex] = value;
            }
            else if (columnIndex < 0)
            {
                throw new Exceptions.ValidationException($"Column '{fieldName}' does not exist.");
            }
        }

        return nextRow;
    }

    private static (string fieldName, string type, string? displayName, Dictionary<string, JsonElement> attributes) ParseColumnPayload(ColumnPatchOperationDto operation)
    {
        var column = operation.Column ?? new Dictionary<string, object>();
        var fieldName = operation.FieldName;
        var type = operation.Type;
        var displayName = operation.DisplayName;

        if (column.TryGetValue("fieldName", out var fn) && fn is string fnStr && !string.IsNullOrWhiteSpace(fnStr))
            fieldName = fnStr;
        if (column.TryGetValue("type", out var t) && t is string tStr && !string.IsNullOrWhiteSpace(tStr))
            type = tStr;
        if (column.TryGetValue("displayName", out var dn) && dn is string dnStr)
            displayName = dnStr;

        if (string.IsNullOrWhiteSpace(fieldName))
            throw new Exceptions.ValidationException("insert column operation requires fieldName.");
        if (string.IsNullOrWhiteSpace(type))
            throw new Exceptions.ValidationException($"Column '{fieldName}' requires type.");

        var attributes = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        if (operation.Attributes is not null)
        {
            foreach (var attr in operation.Attributes)
            {
                attributes[attr.Key] = JsonSerializer.SerializeToElement(attr.Value);
            }
        }
        if (column.TryGetValue("attributes", out var attrs) && attrs is Dictionary<string, object> attrsDict)
        {
            foreach (var attr in attrsDict)
            {
                attributes[attr.Key] = JsonSerializer.SerializeToElement(attr.Value);
            }
        }

        return (fieldName, type, displayName, attributes);
    }

    private static LightyWorkbook MapToWorkbook(WorkbookPayloadDto payload, string workspacePath)
    {
        if (string.IsNullOrWhiteSpace(payload.Name))
        {
            throw new Exceptions.ValidationException("Workbook name cannot be empty.");
        }

        var workbookDirectory = LightyWorkspacePathLayout.GetWorkbookDirectoryPath(workspacePath, payload.Name);
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        var sheets = payload.Sheets.Select(sheet => MapToSheet(sheet, workbookDirectory, workspace, payload.Name)).ToList();
        var existingWorkbook = workspace.TryGetWorkbook(payload.Name, out var loadedWorkbook) ? loadedWorkbook : null;
        return new LightyWorkbook(
            payload.Name,
            workbookDirectory,
            sheets,
            existingWorkbook?.CodegenOptions,
            existingWorkbook?.CodegenConfigFilePath);
    }

    private static LightySheet MapToSheet(SheetPayloadDto payload, string workbookDirectory, LightyWorkspace workspace, string workbookName)
    {
        if (string.IsNullOrWhiteSpace(payload.Name))
        {
            throw new Exceptions.ValidationException("Sheet name cannot be empty.");
        }

        var columns = payload.Columns.Select(column => new ColumnDefine(
            column.FieldName,
            column.Type,
            column.DisplayName,
            column.Attributes ?? new Dictionary<string, JsonElement>(StringComparer.Ordinal))).ToList();

        var rows = payload.Rows
            .Select((cells, index) => new LightySheetRow(index, cells))
            .ToList();

        LightySheetColumnValidator.Validate(columns, payload.Name, workspace, workbookName);

        return new LightySheet(
            payload.Name,
            Path.Combine(workbookDirectory, $"{payload.Name}.txt"),
            Path.Combine(workbookDirectory, $"{payload.Name}_header.json"),
            new LightySheetHeader(columns),
            rows);
    }
}
