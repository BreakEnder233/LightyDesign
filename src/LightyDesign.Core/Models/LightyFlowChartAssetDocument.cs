using System.Text.Json;

namespace LightyDesign.Core;

public sealed class LightyFlowChartAssetDocument
{
    public LightyFlowChartAssetDocument(string relativePath, string filePath, JsonElement document)
    {
        RelativePath = LightyWorkspacePathLayout.NormalizeRelativeAssetPath(relativePath);

        if (string.IsNullOrWhiteSpace(filePath))
        {
            throw new ArgumentException("File path cannot be null or whitespace.", nameof(filePath));
        }

        FilePath = filePath;
        Document = document.Clone();
    }

    public string RelativePath { get; }

    public string FilePath { get; }

    public string Name => Path.GetFileName(RelativePath);

    public JsonElement Document { get; }
}
