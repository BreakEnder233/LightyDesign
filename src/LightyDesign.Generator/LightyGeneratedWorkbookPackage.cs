namespace LightyDesign.Generator;

public sealed class LightyGeneratedWorkbookPackage
{
    public LightyGeneratedWorkbookPackage(
        string outputRelativePath,
        IReadOnlyList<LightyGeneratedCodeFile> files,
        LightyGeneratedI18nMap? i18nMap = null)
    {
        if (string.IsNullOrWhiteSpace(outputRelativePath))
        {
            throw new ArgumentException("Output relative path cannot be null or whitespace.", nameof(outputRelativePath));
        }

        ArgumentNullException.ThrowIfNull(files);

        OutputRelativePath = outputRelativePath;
        Files = files;
        I18nMap = i18nMap;
    }

    public string OutputRelativePath { get; }

    public IReadOnlyList<LightyGeneratedCodeFile> Files { get; }

    public LightyGeneratedI18nMap? I18nMap { get; }
}