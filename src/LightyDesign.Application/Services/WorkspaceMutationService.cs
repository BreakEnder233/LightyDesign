using LightyDesign.Application.Dtos;
using LightyDesign.Application.Exceptions;
using LightyDesign.Core;

namespace LightyDesign.Application.Services;

public sealed class WorkspaceMutationService
{
    public object CreateWorkspace(string parentDirectoryPath, string workspaceName)
    {
        if (!Directory.Exists(parentDirectoryPath))
        {
            throw new Exceptions.ValidationException("The specified parent directory was not found.");
        }

        if (workspaceName.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
        {
            throw new Exceptions.ValidationException("workspaceName contains invalid path characters.");
        }

        var workspaceRootPath = Path.Combine(parentDirectoryPath, workspaceName);
        var workspace = LightyWorkspaceScaffolder.Create(workspaceRootPath);
        return WorkspaceResponseBuilder.ToWorkspaceNavigationResponse(workspace);
    }

    public object RefreshBuiltinNodes(string workspacePath)
    {
        var workspace = LightyWorkspaceScaffolder.RefreshBuiltinNodeDefinitions(workspacePath);
        return new
        {
            workspacePath = workspace.RootPath,
            builtinNodeDefinitionCount = workspace.FlowChartNodeDefinitions.Count(
                document => document.RelativePath.StartsWith("Builtin/", StringComparison.Ordinal)),
        };
    }

    public object CreateWorkbook(string workspacePath, string workbookName)
    {
        if (workbookName.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
        {
            throw new Exceptions.ValidationException("workbookName contains invalid path characters.");
        }

        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        LightyWorkbookScaffolder.CreateDefault(
            workspacePath,
            workspace.HeaderLayout,
            workbookName,
            workspace.CodegenOptions,
            workspace.CodegenConfigFilePath);
        var reloadedWorkspace = LightyWorkspaceLoader.Load(workspacePath);
        return WorkspaceResponseBuilder.ToWorkspaceNavigationResponse(reloadedWorkspace);
    }

    public object DeleteWorkbook(string workspacePath, string workbookName)
    {
        LightyWorkspaceLoader.Load(workspacePath);
        LightyWorkbookScaffolder.Delete(workspacePath, workbookName);
        var reloadedWorkspace = LightyWorkspaceLoader.Load(workspacePath);
        return WorkspaceResponseBuilder.ToWorkspaceNavigationResponse(reloadedWorkspace);
    }

    public object CreateSheet(string workspacePath, string workbookName, string sheetName)
    {
        if (sheetName.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
        {
            throw new Exceptions.ValidationException("sheetName contains invalid path characters.");
        }

        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            throw new WorkbookNotFoundException(workbookName, workspacePath);
        }

        if (WorkspaceResponseBuilder.ContainsSheetName(workbook, sheetName))
        {
            throw new Exceptions.ValidationException($"Sheet '{sheetName}' already exists in workbook '{workbookName}'.");
        }

        var nextSheets = workbook.Sheets
            .Concat(new[] { LightyWorkbookScaffolder.CreateDefaultSheet(workbook.DirectoryPath, sheetName) })
            .ToList();
        var updatedWorkbook = new LightyWorkbook(
            workbook.Name,
            workbook.DirectoryPath,
            nextSheets,
            workbook.CodegenOptions,
            workbook.CodegenConfigFilePath);
        LightyWorkbookWriter.Save(workspacePath, workspace.HeaderLayout, updatedWorkbook, workspace.CodegenOptions, workspace.CodegenConfigFilePath);

        var reloadedWorkspace = LightyWorkspaceLoader.Load(workspacePath);
        return WorkspaceResponseBuilder.ToWorkspaceNavigationResponse(reloadedWorkspace);
    }

    public object DeleteSheet(string workspacePath, string workbookName, string sheetName)
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            throw new WorkbookNotFoundException(workbookName, workspacePath);
        }

        if (!workbook.TryGetSheet(sheetName, out _))
        {
            throw new SheetNotFoundException(sheetName, workbookName);
        }

        var nextSheets = workbook.Sheets
            .Where(sheet => !string.Equals(sheet.Name, sheetName, StringComparison.Ordinal))
            .ToList();
        var updatedWorkbook = new LightyWorkbook(
            workbook.Name,
            workbook.DirectoryPath,
            nextSheets,
            workbook.CodegenOptions,
            workbook.CodegenConfigFilePath);
        LightyWorkbookWriter.Save(workspacePath, workspace.HeaderLayout, updatedWorkbook, workspace.CodegenOptions, workspace.CodegenConfigFilePath);

        var reloadedWorkspace = LightyWorkspaceLoader.Load(workspacePath);
        return WorkspaceResponseBuilder.ToWorkspaceNavigationResponse(reloadedWorkspace);
    }

    public object RenameSheet(string workspacePath, string workbookName, string sheetName, string newSheetName)
    {
        if (newSheetName.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
        {
            throw new Exceptions.ValidationException("newSheetName contains invalid path characters.");
        }

        if (string.Equals(sheetName, newSheetName, StringComparison.OrdinalIgnoreCase))
        {
            throw new Exceptions.ValidationException("The new sheet name must be different from the current name.");
        }

        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            throw new WorkbookNotFoundException(workbookName, workspacePath);
        }

        if (!workbook.TryGetSheet(sheetName, out var targetSheet) || targetSheet is null)
        {
            throw new SheetNotFoundException(sheetName, workbookName);
        }

        if (WorkspaceResponseBuilder.ContainsSheetName(workbook, newSheetName, excludedSheetName: sheetName))
        {
            throw new Exceptions.ValidationException($"Sheet '{newSheetName}' already exists in workbook '{workbookName}'.");
        }

        var nextSheets = workbook.Sheets
            .Select(sheet => string.Equals(sheet.Name, sheetName, StringComparison.Ordinal)
                ? new LightySheet(
                    newSheetName,
                    Path.Combine(workbook.DirectoryPath, $"{newSheetName}.txt"),
                    Path.Combine(workbook.DirectoryPath, $"{newSheetName}_header.json"),
                    sheet.Header,
                    sheet.Rows)
                : sheet)
            .ToList();

        var updatedWorkbook = new LightyWorkbook(
            workbook.Name,
            workbook.DirectoryPath,
            nextSheets,
            workbook.CodegenOptions,
            workbook.CodegenConfigFilePath);
        LightyWorkbookWriter.Save(workspacePath, workspace.HeaderLayout, updatedWorkbook, workspace.CodegenOptions, workspace.CodegenConfigFilePath);

        var reloadedWorkspace = LightyWorkspaceLoader.Load(workspacePath);
        return WorkspaceResponseBuilder.ToWorkspaceNavigationResponse(reloadedWorkspace);
    }

    public object SaveWorkbookConfig(string workspacePath, string workbookName, string? alias)
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            throw new WorkbookNotFoundException(workbookName, workspacePath);
        }

        var configFilePath = Path.Combine(workbook.DirectoryPath, "config.json");
        UpdateAliasInConfig(configFilePath, alias);

        var reloadedWorkspace = LightyWorkspaceLoader.Load(workspacePath);
        return WorkspaceResponseBuilder.ToWorkspaceNavigationResponse(reloadedWorkspace);
    }

    public object SaveSheetConfig(string workspacePath, string workbookName, string sheetName, string? alias)
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            throw new WorkbookNotFoundException(workbookName, workspacePath);
        }

        if (!workbook.TryGetSheet(sheetName, out _))
        {
            throw new SheetNotFoundException(sheetName, workbookName);
        }

        var configFilePath = Path.Combine(workbook.DirectoryPath, $"{sheetName}_config.json");
        UpdateAliasInConfig(configFilePath, alias);

        var reloadedWorkspace = LightyWorkspaceLoader.Load(workspacePath);
        return WorkspaceResponseBuilder.ToWorkspaceNavigationResponse(reloadedWorkspace);
    }

    public object SaveCodegenConfig(string workspacePath, string? outputRelativePath,
        string? i18nOutputRelativePath, string? i18nSourceLanguage)
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        var i18n = new I18nCodegenOptions
        {
            OutputRelativePath = i18nOutputRelativePath ?? "../I18nMap",
            SourceLanguage = i18nSourceLanguage ?? "zh-cn",
        };
        var codegenOptions = new LightyWorkbookCodegenOptions(outputRelativePath, i18n);
        GeneratedCodeOutputWriter.ValidateWorkbookCodegenOutputRelativePath(workspace.RootPath, codegenOptions.OutputRelativePath, allowEmpty: true);
        LightyWorkbookCodegenOptionsSerializer.SaveToFile(workspace.CodegenConfigFilePath, codegenOptions);

        var reloadedWorkspace = LightyWorkspaceLoader.Load(workspacePath);
        return WorkspaceResponseBuilder.ToWorkspaceNavigationResponse(reloadedWorkspace);
    }

    private static void UpdateAliasInConfig(string configFilePath, string? alias)
    {
        Dictionary<string, object?> current = new();
        if (File.Exists(configFilePath))
        {
            try
            {
                var raw = File.ReadAllText(configFilePath);
                current = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, object?>>(raw) ?? new Dictionary<string, object?>();
            }
            catch
            {
                current = new Dictionary<string, object?>();
            }
        }

        if (string.IsNullOrWhiteSpace(alias))
        {
            if (current.ContainsKey("alias")) current.Remove("alias");
        }
        else
        {
            current["alias"] = alias;
        }

        var serialized = System.Text.Json.JsonSerializer.Serialize(current, new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(configFilePath, serialized);
    }
}
