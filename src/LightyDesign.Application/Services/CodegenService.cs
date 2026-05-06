using LightyDesign.Application.Dtos;
using LightyDesign.Application.Exceptions;
using LightyDesign.Core;
using LightyDesign.Generator;

namespace LightyDesign.Application.Services;

public sealed class CodegenService
{
    public CodegenResultDto ExportWorkbook(string workspacePath, string workbookName)
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            throw new WorkbookNotFoundException(workbookName, workspacePath);
        }

        var generator = new LightyWorkbookCodeGenerator();
        var package = generator.Generate(workspace, workbook);
        var outputDirectoryPath = GeneratedCodeOutputWriter.WriteGeneratedWorkbookPackage(workspace.RootPath, workbook.Name, package);
        var materializedFiles = GeneratedCodeOutputWriter.GetMaterializedRelativePaths(package.Files);

        if (package.I18nMap is not null)
        {
            var options = workbook.CodegenOptions.I18n;
            GeneratedCodeOutputWriter.WriteWorkbookI18nMap(workspace.RootPath, options.OutputRelativePath, options.SourceLanguage, package.I18nMap);
        }

        return new CodegenResultDto
        {
            WorkbookName = workbookName,
            OutputDirectoryPath = outputDirectoryPath,
            FileCount = materializedFiles.Count,
            Files = materializedFiles.ToList(),
            ItemCount = 1,
        };
    }

    public CodegenResultDto ExportAllWorkbooks(string workspacePath)
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (workspace.Workbooks.Count == 0)
        {
            throw new Exceptions.ValidationException("The workspace does not contain any workbooks to export.");
        }

        LightyWorkbookValidationService.ValidateWorkbooksOrThrow(workspace, workspace.Workbooks);

        var generator = new LightyWorkbookCodeGenerator();
        var workbookPackages = workspace.Workbooks
            .Select(workbook => (workbook.Name, Package: generator.Generate(workspace, workbook)))
            .ToList();
        var outputDirectoryPath = GeneratedCodeOutputWriter.WriteGeneratedWorkspacePackages(workspace.RootPath, workbookPackages);
        var materializedFiles = GeneratedCodeOutputWriter.GetMaterializedRelativePaths(workbookPackages.SelectMany(entry => entry.Package.Files));

        // Write i18n maps for all workbooks
        foreach (var (name, pkg) in workbookPackages)
        {
            if (pkg.I18nMap is not null)
            {
                var workbook = workspace.Workbooks.First(w => string.Equals(w.Name, name, StringComparison.Ordinal));
                var options = workbook.CodegenOptions.I18n;
                GeneratedCodeOutputWriter.WriteWorkbookI18nMap(workspace.RootPath, options.OutputRelativePath, options.SourceLanguage, pkg.I18nMap);
            }
        }

        // Cleanup orphaned i18n YAML files
        var activeWorkbookNames = new HashSet<string>(workbookPackages.Select(entry => entry.Name), StringComparer.OrdinalIgnoreCase);
        var i18nConfig = workspace.Workbooks[0].CodegenOptions.I18n;
        GeneratedCodeOutputWriter.CleanupOrphanedI18nMaps(workspace.RootPath, i18nConfig.OutputRelativePath, i18nConfig.SourceLanguage, activeWorkbookNames);

        return new CodegenResultDto
        {
            WorkbookName = string.Empty,
            OutputDirectoryPath = outputDirectoryPath,
            FileCount = materializedFiles.Count,
            Files = materializedFiles.ToList(),
            ItemCount = workbookPackages.Count,
        };
    }

    public void ValidateWorkbook(string workspacePath, string workbookName)
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            throw new WorkbookNotFoundException(workbookName, workspacePath);
        }

        var report = LightyWorkbookValidationService.ValidateWorkbook(workspace, workbook);
        if (!report.IsSuccess)
        {
            throw new Exceptions.ValidationException(report.ToDisplayString());
        }
    }

    public CodegenResultDto ExportFlowChart(string workspacePath, string relativePath)
    {
        var normalizedPath = LightyWorkspacePathLayout.NormalizeRelativeAssetPath(relativePath);
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (!workspace.TryGetFlowChartFile(normalizedPath, out var flowChartDocument) || flowChartDocument is null)
        {
            throw new FlowChartNotFoundException(normalizedPath, workspacePath);
        }

        var generator = new LightyFlowChartFileCodeGenerator();
        var package = generator.Generate(workspace, normalizedPath);
        var outputDirectoryPath = GeneratedCodeOutputWriter.WriteGeneratedFlowChartPackage(workspace.RootPath, normalizedPath, package);
        var materializedFiles = GeneratedCodeOutputWriter.GetMaterializedRelativePaths(package.Files);

        return new CodegenResultDto
        {
            RelativePath = normalizedPath,
            OutputDirectoryPath = outputDirectoryPath,
            FileCount = materializedFiles.Count,
            Files = materializedFiles.ToList(),
            ItemCount = 1,
        };
    }

    public CodegenResultDto ExportBatchFlowCharts(string workspacePath, List<string> relativePaths)
    {
        var normalizedPaths = relativePaths
            .Select(LightyWorkspacePathLayout.NormalizeRelativeAssetPath)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(p => p, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        var missingPath = normalizedPaths.FirstOrDefault(path => !workspace.TryGetFlowChartFile(path, out _));
        if (missingPath is not null)
        {
            throw new FlowChartNotFoundException(missingPath, workspacePath);
        }

        var generator = new LightyFlowChartFileCodeGenerator();
        var package = generator.Generate(workspace, normalizedPaths);
        var outputDirectoryPath = GeneratedCodeOutputWriter.WriteGeneratedFlowChartPackages(workspace.RootPath, normalizedPaths, package);
        var materializedFiles = GeneratedCodeOutputWriter.GetMaterializedRelativePaths(package.Files);

        return new CodegenResultDto
        {
            RelativePath = string.Empty,
            OutputDirectoryPath = outputDirectoryPath,
            FileCount = materializedFiles.Count,
            Files = materializedFiles.ToList(),
            ItemCount = normalizedPaths.Count,
        };
    }

    public CodegenResultDto ExportAllFlowCharts(string workspacePath)
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        if (workspace.FlowChartFiles.Count == 0)
        {
            throw new Exceptions.ValidationException("The workspace does not contain any flowchart files to export.");
        }

        var relativePaths = workspace.FlowChartFiles
            .Select(document => document.RelativePath)
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var generator = new LightyFlowChartFileCodeGenerator();
        var package = generator.Generate(workspace, relativePaths);
        var outputDirectoryPath = GeneratedCodeOutputWriter.WriteGeneratedWorkspaceFlowChartPackage(workspace.RootPath, package);
        var materializedFiles = GeneratedCodeOutputWriter.GetMaterializedRelativePaths(package.Files);

        return new CodegenResultDto
        {
            RelativePath = string.Empty,
            OutputDirectoryPath = outputDirectoryPath,
            FileCount = materializedFiles.Count,
            Files = materializedFiles.ToList(),
            ItemCount = relativePaths.Count,
        };
    }
}
