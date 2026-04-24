namespace LightyDesign.Generator;

public sealed class LightyGeneratedFlowChartPackage
{
    public LightyGeneratedFlowChartPackage(string outputRelativePath, IReadOnlyList<LightyGeneratedCodeFile> files)
    {
        if (string.IsNullOrWhiteSpace(outputRelativePath))
        {
            throw new ArgumentException("Output relative path cannot be null or whitespace.", nameof(outputRelativePath));
        }

        ArgumentNullException.ThrowIfNull(files);

        OutputRelativePath = outputRelativePath;
        Files = files;
    }

    public string OutputRelativePath { get; }

    public IReadOnlyList<LightyGeneratedCodeFile> Files { get; }
}