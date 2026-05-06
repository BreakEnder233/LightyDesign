using LightyDesign.Core;
using LightyDesign.Generator;

namespace LightyDesign.Application;

/// <summary>
/// Handles writing generated code files to the workspace output directory.
/// Moved from DesktopHost to Application so both DesktopHost and future McpServer can use it.
/// </summary>
public static class GeneratedCodeOutputWriter
{
    public const string GeneratedDirectoryName = "Generated";
    public const string ExtendedDirectoryName = "Extended";
    private const string WorkbooksDirectoryName = "Workbooks";
    private const string FlowChartsDirectoryName = "FlowCharts";
    private const string FlowChartFilesDirectoryName = "Files";
    private const string FlowChartNodesDirectoryName = "Nodes";

    public static string WriteGeneratedWorkbookPackage(string workspaceRootPath, string workbookName, LightyGeneratedWorkbookPackage package)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);
        ArgumentException.ThrowIfNullOrWhiteSpace(workbookName);
        ArgumentNullException.ThrowIfNull(package);

        var generatedOutputRootPath = InitializeOutputDirectories(workspaceRootPath, package.OutputRelativePath, resetGeneratedRoot: false);
        DeleteWorkbookDirectory(generatedOutputRootPath, workbookName);
        WriteGeneratedFiles(generatedOutputRootPath, WithWorkbooksPrefix(package.Files, workbookName));

        var generatedWorkbookNames = GetGeneratedWorkbookNames(generatedOutputRootPath);
        if (!generatedWorkbookNames.Contains(workbookName, StringComparer.OrdinalIgnoreCase))
        {
            generatedWorkbookNames.Add(workbookName);
        }

        RewriteEntryPointFile(generatedOutputRootPath, generatedWorkbookNames);

        return generatedOutputRootPath;
    }

    public static string WriteGeneratedFlowChartPackage(string workspaceRootPath, string flowChartRelativePath, LightyGeneratedFlowChartPackage package)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);
        ArgumentException.ThrowIfNullOrWhiteSpace(flowChartRelativePath);
        ArgumentNullException.ThrowIfNull(package);

        var generatedOutputRootPath = InitializeOutputDirectories(workspaceRootPath, package.OutputRelativePath, resetGeneratedRoot: false);
        DeleteFlowChartNodesDirectory(generatedOutputRootPath);
        DeleteFlowChartDirectory(generatedOutputRootPath, flowChartRelativePath);
        WriteGeneratedFiles(generatedOutputRootPath, package.Files);
        RewriteEntryPointFile(generatedOutputRootPath);

        return generatedOutputRootPath;
    }

    public static string WriteGeneratedFlowChartPackages(
        string workspaceRootPath,
        IReadOnlyList<string> flowChartRelativePaths,
        LightyGeneratedFlowChartPackage package)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);
        ArgumentNullException.ThrowIfNull(flowChartRelativePaths);
        ArgumentNullException.ThrowIfNull(package);

        if (flowChartRelativePaths.Count == 0)
        {
            throw new ArgumentException("At least one FlowChart relative path is required.", nameof(flowChartRelativePaths));
        }

        var generatedOutputRootPath = InitializeOutputDirectories(workspaceRootPath, package.OutputRelativePath, resetGeneratedRoot: false);
        DeleteFlowChartNodesDirectory(generatedOutputRootPath);
        foreach (var flowChartRelativePath in flowChartRelativePaths.Where(path => !string.IsNullOrWhiteSpace(path)))
        {
            DeleteFlowChartDirectory(generatedOutputRootPath, flowChartRelativePath);
        }

        WriteGeneratedFiles(generatedOutputRootPath, package.Files);
        RewriteEntryPointFile(generatedOutputRootPath);

        return generatedOutputRootPath;
    }

    public static string WriteGeneratedWorkspaceFlowChartPackage(string workspaceRootPath, LightyGeneratedFlowChartPackage package)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);
        ArgumentNullException.ThrowIfNull(package);

        var generatedOutputRootPath = InitializeOutputDirectories(workspaceRootPath, package.OutputRelativePath, resetGeneratedRoot: false);
        DeleteFlowChartsDirectory(generatedOutputRootPath);
        WriteGeneratedFiles(generatedOutputRootPath, package.Files);
        RewriteEntryPointFile(generatedOutputRootPath);

        return generatedOutputRootPath;
    }

    public static string WriteGeneratedWorkspacePackages(
        string workspaceRootPath,
        IReadOnlyList<(string WorkbookName, LightyGeneratedWorkbookPackage Package)> workbookPackages)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);
        ArgumentNullException.ThrowIfNull(workbookPackages);

        if (workbookPackages.Count == 0)
        {
            throw new ArgumentException("At least one workbook package is required.", nameof(workbookPackages));
        }

        var outputRelativePath = workbookPackages[0].Package.OutputRelativePath;
        if (workbookPackages.Any(entry => !string.Equals(entry.Package.OutputRelativePath, outputRelativePath, StringComparison.Ordinal)))
        {
            throw new LightyCoreException("All workbook packages must target the same output relative path.");
        }

        var generatedOutputRootPath = InitializeOutputDirectories(workspaceRootPath, outputRelativePath, resetGeneratedRoot: false);

        foreach (var existingWorkbookName in GetGeneratedWorkbookNames(generatedOutputRootPath))
        {
            DeleteWorkbookDirectory(generatedOutputRootPath, existingWorkbookName);
        }

        foreach (var (workbookName, package) in workbookPackages)
        {
            DeleteWorkbookDirectory(generatedOutputRootPath, workbookName);
            WriteGeneratedFiles(generatedOutputRootPath, WithWorkbooksPrefix(package.Files, workbookName));
        }

        var generatedWorkbookNames = workbookPackages
            .Select(entry => entry.WorkbookName)
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        RewriteEntryPointFile(generatedOutputRootPath, generatedWorkbookNames);

        return generatedOutputRootPath;
    }

    public static IReadOnlyList<string> GetMaterializedRelativePaths(IEnumerable<LightyGeneratedCodeFile> files)
    {
        ArgumentNullException.ThrowIfNull(files);

        var materializedPaths = files
            .Where(file => !IsEntryPointFile(file.RelativePath))
            .Select(file => NormalizeRelativePath(file.RelativePath))
            .Append("LDD.cs")
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return materializedPaths;
    }

    public static void WriteWorkbookI18nMap(
        string workspaceRootPath,
        string i18nOutputRelativePath,
        string sourceLanguage,
        LightyGeneratedI18nMap i18nMap)
    {
        var i18nRootPath = ValidateWorkbookCodegenOutputRelativePath(
            workspaceRootPath, i18nOutputRelativePath, allowEmpty: false);
        var langDir = Path.Combine(i18nRootPath, sourceLanguage);
        Directory.CreateDirectory(langDir);

        // Write YAML file (source language full overwrite)
        var yamlContent = Lightyi18nOutputWriter.RenderYamlContent(i18nMap.WorkbookName, i18nMap.Entries);
        File.WriteAllText(Path.Combine(langDir, $"{i18nMap.WorkbookName}.yaml"), yamlContent);

        // Update manifest
        var manifestPath = Path.Combine(langDir, "i18n_manifest.yaml");
        var existingWorkbookNames = File.Exists(manifestPath)
            ? Lightyi18nOutputWriter.ParseWorkbookNamesFromManifest(File.ReadAllText(manifestPath))
            : new HashSet<string>();
        existingWorkbookNames.Add(i18nMap.WorkbookName);
        var manifestContent = Lightyi18nOutputWriter.RenderManifest(existingWorkbookNames.OrderBy(n => n).ToList());
        File.WriteAllText(manifestPath, manifestContent);
    }

    public static void CleanupOrphanedI18nMaps(
        string workspaceRootPath,
        string i18nOutputRelativePath,
        string sourceLanguage,
        HashSet<string> activeWorkbookNames)
    {
        var i18nRootPath = ValidateWorkbookCodegenOutputRelativePath(
            workspaceRootPath, i18nOutputRelativePath, allowEmpty: false);
        var langDir = Path.Combine(i18nRootPath, sourceLanguage);
        if (!Directory.Exists(langDir)) return;

        var manifestPath = Path.Combine(langDir, "i18n_manifest.yaml");
        if (!File.Exists(manifestPath)) return;

        var manifestWorkbookNames = Lightyi18nOutputWriter.ParseWorkbookNamesFromManifest(
            File.ReadAllText(manifestPath));

        var toRemove = manifestWorkbookNames.Where(n => !activeWorkbookNames.Contains(n)).ToList();
        foreach (var name in toRemove)
        {
            var yamlPath = Path.Combine(langDir, $"{name}.yaml");
            if (File.Exists(yamlPath)) File.Delete(yamlPath);
        }

        // Rewrite manifest (keep only active workbooks)
        var remainingNames = manifestWorkbookNames.Intersect(activeWorkbookNames).OrderBy(n => n).ToList();
        var manifestContent = Lightyi18nOutputWriter.RenderManifest(remainingNames);
        File.WriteAllText(manifestPath, manifestContent);
    }

    public static int CountMaterializedFiles(IEnumerable<LightyGeneratedCodeFile> files)
    {
        return GetMaterializedRelativePaths(files).Count;
    }

    public static List<string> GetGeneratedWorkbookNames(string outputRootPath)
    {
        var workbooksRootPath = Path.Combine(outputRootPath, WorkbooksDirectoryName);
        if (!Directory.Exists(workbooksRootPath))
        {
            return new List<string>();
        }

        return Directory.GetDirectories(workbooksRootPath)
            .Select(directoryPath => new
            {
                DirectoryPath = directoryPath,
                WorkbookName = Path.GetFileName(directoryPath),
            })
            .Where(entry => !string.IsNullOrWhiteSpace(entry.WorkbookName))
            .Where(entry => HasWorkbookDefinitionFile(entry.DirectoryPath, entry.WorkbookName))
            .Select(entry => entry.WorkbookName)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public static List<string> GetGeneratedFlowChartRelativePaths(string outputRootPath)
    {
        var flowChartFilesRootPath = Path.Combine(outputRootPath, FlowChartsDirectoryName, FlowChartFilesDirectoryName);
        if (!Directory.Exists(flowChartFilesRootPath))
        {
            return new List<string>();
        }

        return Directory.EnumerateFiles(flowChartFilesRootPath, "*Definition.cs", SearchOption.AllDirectories)
            .Select(filePath => Path.GetDirectoryName(filePath))
            .Where(directoryPath => !string.IsNullOrWhiteSpace(directoryPath))
            .Select(directoryPath => NormalizeRelativePath(Path.GetRelativePath(flowChartFilesRootPath, directoryPath!)))
            .Where(relativePath => !string.IsNullOrWhiteSpace(relativePath) && !string.Equals(relativePath, ".", StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public static string ValidateWorkbookCodegenOutputRelativePath(string workspaceRootPath, string? outputRelativePath, bool allowEmpty)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);

        if (string.IsNullOrWhiteSpace(outputRelativePath))
        {
            if (allowEmpty)
            {
                return workspaceRootPath;
            }

            throw new LightyCoreException("Workbook code generation output path is not configured. Please configure an output relative path first.");
        }

        var trimmed = outputRelativePath.Trim();
        if (Path.IsPathRooted(trimmed))
        {
            throw new LightyCoreException("Workbook code generation output path must be relative to the workspace root.");
        }

        var workspaceRootFullPath = Path.GetFullPath(workspaceRootPath);
        return Path.GetFullPath(Path.Combine(workspaceRootFullPath, trimmed));
    }

    private static string InitializeOutputDirectories(string workspaceRootPath, string outputRelativePath, bool resetGeneratedRoot)
    {
        var outputRootPath = ValidateWorkbookCodegenOutputRelativePath(workspaceRootPath, outputRelativePath, allowEmpty: false);
        Directory.CreateDirectory(outputRootPath);
        Directory.CreateDirectory(Path.Combine(outputRootPath, ExtendedDirectoryName));

        var generatedOutputRootPath = Path.Combine(outputRootPath, GeneratedDirectoryName);
        if (resetGeneratedRoot && Directory.Exists(generatedOutputRootPath))
        {
            Directory.Delete(generatedOutputRootPath, recursive: true);
        }

        Directory.CreateDirectory(generatedOutputRootPath);
        return generatedOutputRootPath;
    }

    private static void DeleteWorkbookDirectory(string generatedOutputRootPath, string workbookName)
    {
        var workbookOutputPath = Path.Combine(generatedOutputRootPath, WorkbooksDirectoryName, workbookName);
        if (Directory.Exists(workbookOutputPath))
        {
            Directory.Delete(workbookOutputPath, recursive: true);
        }
    }

    private static void WriteGeneratedFiles(string generatedOutputRootPath, IEnumerable<LightyGeneratedCodeFile> files)
    {
        foreach (var file in files.Where(file => !IsEntryPointFile(file.RelativePath)))
        {
            var absolutePath = Path.Combine(generatedOutputRootPath, file.RelativePath.Replace('/', Path.DirectorySeparatorChar));
            var directoryPath = Path.GetDirectoryName(absolutePath);
            if (!string.IsNullOrWhiteSpace(directoryPath))
            {
                Directory.CreateDirectory(directoryPath);
            }

            File.WriteAllText(absolutePath, file.Content);
        }
    }

    private static void WriteEntryPointFile(string generatedOutputRootPath, IEnumerable<string> workbookNames, IEnumerable<string> flowChartRelativePaths)
    {
        var generator = new LightyWorkbookCodeGenerator();
        var entryPointContent = generator.GenerateEntryPointFile(workbookNames, flowChartRelativePaths);
        File.WriteAllText(Path.Combine(generatedOutputRootPath, "LDD.cs"), entryPointContent);
    }

    private static void RewriteEntryPointFile(string generatedOutputRootPath)
    {
        WriteEntryPointFile(
            generatedOutputRootPath,
            GetGeneratedWorkbookNames(generatedOutputRootPath),
            GetGeneratedFlowChartRelativePaths(generatedOutputRootPath));
    }

    private static void RewriteEntryPointFile(string generatedOutputRootPath, IEnumerable<string> generatedWorkbookNames)
    {
        WriteEntryPointFile(
            generatedOutputRootPath,
            generatedWorkbookNames,
            GetGeneratedFlowChartRelativePaths(generatedOutputRootPath));
    }

    private static void DeleteFlowChartDirectory(string generatedOutputRootPath, string flowChartRelativePath)
    {
        var normalizedRelativePath = NormalizeRelativePath(flowChartRelativePath).Trim('/');
        if (string.IsNullOrWhiteSpace(normalizedRelativePath))
        {
            return;
        }

        var flowChartOutputPath = Path.Combine(
            generatedOutputRootPath,
            FlowChartsDirectoryName,
            FlowChartFilesDirectoryName,
            normalizedRelativePath.Replace('/', Path.DirectorySeparatorChar));
        if (Directory.Exists(flowChartOutputPath))
        {
            Directory.Delete(flowChartOutputPath, recursive: true);
        }
    }

    private static void DeleteFlowChartNodesDirectory(string generatedOutputRootPath)
    {
        var flowChartNodesOutputPath = Path.Combine(generatedOutputRootPath, FlowChartsDirectoryName, FlowChartNodesDirectoryName);
        if (Directory.Exists(flowChartNodesOutputPath))
        {
            Directory.Delete(flowChartNodesOutputPath, recursive: true);
        }
    }

    private static void DeleteFlowChartsDirectory(string generatedOutputRootPath)
    {
        var flowChartsOutputPath = Path.Combine(generatedOutputRootPath, FlowChartsDirectoryName);
        if (Directory.Exists(flowChartsOutputPath))
        {
            Directory.Delete(flowChartsOutputPath, recursive: true);
        }
    }

    private static bool HasWorkbookDefinitionFile(string directoryPath, string workbookName)
    {
        return File.Exists(Path.Combine(directoryPath, $"{workbookName}.cs"))
            || File.Exists(Path.Combine(directoryPath, $"{workbookName}Workbook.cs"));
    }

    private static bool IsEntryPointFile(string relativePath)
    {
        return string.Equals(NormalizeRelativePath(relativePath), "LDD.cs", StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizeRelativePath(string relativePath)
    {
        return relativePath.Replace('\\', '/');
    }

    /// <summary>
    /// Prepends "Workbooks/" to files that belong to a specific workbook
    /// (i.e., files whose relative path starts with the workbook name).
    /// Since the relative path already contains the workbook name (e.g. "Item/ItemWorkbook.cs"),
    /// the result becomes "Workbooks/Item/ItemWorkbook.cs".
    /// Shared support files (DesignDataReference.cs, LDD.cs) and FlowChart files remain at root level.
    /// </summary>
    private static IEnumerable<LightyGeneratedCodeFile> WithWorkbooksPrefix(IEnumerable<LightyGeneratedCodeFile> files, string workbookName)
    {
        var workbookPrefixPattern = $"{workbookName}/";
        return files.Select(file =>
        {
            if (IsEntryPointFile(file.RelativePath))
                return file;

            // Only prefix files that belong to this workbook (path starts with workbook name)
            if (file.RelativePath.StartsWith(workbookPrefixPattern, StringComparison.OrdinalIgnoreCase))
                return new LightyGeneratedCodeFile($"Workbooks/{file.RelativePath}", file.Content);

            // Shared support files (DesignDataReference.cs, FlowCharts/, etc.) stay at root
            return file;
        });
    }
}
