using LightyDesign.Core;
using LightyDesign.Generator;

namespace LightyDesign.DesktopHost;

public static class GeneratedCodeOutputWriter
{
    public const string GeneratedDirectoryName = "Generated";

    public static string WriteGeneratedWorkbookPackage(string workspaceRootPath, string workbookName, LightyGeneratedWorkbookPackage package)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);
        ArgumentException.ThrowIfNullOrWhiteSpace(workbookName);
        ArgumentNullException.ThrowIfNull(package);

        var outputRootPath = ValidateWorkbookCodegenOutputRelativePath(workspaceRootPath, package.OutputRelativePath, allowEmpty: false);
        var generatedOutputRootPath = Path.Combine(outputRootPath, GeneratedDirectoryName);

        if (Directory.Exists(generatedOutputRootPath))
        {
            Directory.Delete(generatedOutputRootPath, recursive: true);
        }

        Directory.CreateDirectory(generatedOutputRootPath);

        foreach (var file in package.Files)
        {
            var absolutePath = Path.Combine(generatedOutputRootPath, file.RelativePath.Replace('/', Path.DirectorySeparatorChar));
            var directoryPath = Path.GetDirectoryName(absolutePath);
            if (!string.IsNullOrWhiteSpace(directoryPath))
            {
                Directory.CreateDirectory(directoryPath);
            }

            File.WriteAllText(absolutePath, file.Content);
        }

        var generatedWorkbookNames = GetGeneratedWorkbookNames(generatedOutputRootPath);
        if (!generatedWorkbookNames.Contains(workbookName, StringComparer.OrdinalIgnoreCase))
        {
            generatedWorkbookNames.Add(workbookName);
        }

        var generator = new LightyWorkbookCodeGenerator();
        var entryPointContent = generator.GenerateEntryPointFile(generatedWorkbookNames);
        File.WriteAllText(Path.Combine(generatedOutputRootPath, "LDD.cs"), entryPointContent);

        return generatedOutputRootPath;
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
            .Where(entry => File.Exists(Path.Combine(entry.DirectoryPath, $"{entry.WorkbookName}.cs")))
            .Select(entry => entry.WorkbookName)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
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
        var combinedFullPath = Path.GetFullPath(Path.Combine(workspaceRootFullPath, trimmed));

        if (!combinedFullPath.StartsWith(workspaceRootFullPath, StringComparison.OrdinalIgnoreCase))
        {
            throw new LightyCoreException("Workbook code generation output path cannot escape the workspace root.");
        }

        return combinedFullPath;
    }
}
