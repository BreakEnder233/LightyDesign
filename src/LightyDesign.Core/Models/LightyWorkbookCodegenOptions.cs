namespace LightyDesign.Core;

public sealed class LightyWorkbookCodegenOptions
{
    public LightyWorkbookCodegenOptions(string? outputRelativePath = null)
    {
        OutputRelativePath = string.IsNullOrWhiteSpace(outputRelativePath)
            ? null
            : outputRelativePath.Trim();
    }

    public string? OutputRelativePath { get; }
}