using LightyDesign.Core;
using LightyDesign.Generator;

namespace LightyDesign.DesktopHost;

public static class GeneratedCodeOutputWriter
{
    public const string GeneratedDirectoryName = "Generated";
    public const string ExtendedDirectoryName = "Extended";
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
        WriteGeneratedFiles(generatedOutputRootPath, package.Files);

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
            WriteGeneratedFiles(generatedOutputRootPath, package.Files);
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

    public static int CountMaterializedFiles(IEnumerable<LightyGeneratedCodeFile> files)
    {
        return GetMaterializedRelativePaths(files).Count;
    }

    public static List<string> GetGeneratedWorkbookNames(string outputRootPath)
    {
        if (!Directory.Exists(outputRootPath))
        {
            return new List<string>();
        }

        return Directory.GetDirectories(outputRootPath)
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
        var workbookOutputPath = Path.Combine(generatedOutputRootPath, workbookName);
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
}
