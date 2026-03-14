using System.Text.Json;

namespace LightyDesign.Core;

public static class LightyWorkbookCodegenOptionsSerializer
{
    public const string DefaultFileName = "codegen.json";

    public static LightyWorkbookCodegenOptions LoadFromFile(string filePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(filePath);

        return Deserialize(File.ReadAllText(filePath));
    }

    public static void SaveToFile(string filePath, LightyWorkbookCodegenOptions options)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(filePath);
        ArgumentNullException.ThrowIfNull(options);

        File.WriteAllText(filePath, Serialize(options));
    }

    public static string Serialize(LightyWorkbookCodegenOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);

        return JsonSerializer.Serialize(new SerializableWorkbookCodegenOptions(options.OutputRelativePath), new JsonSerializerOptions
        {
            WriteIndented = true,
        });
    }

    public static LightyWorkbookCodegenOptions Deserialize(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return new LightyWorkbookCodegenOptions();
        }

        var payload = JsonSerializer.Deserialize<SerializableWorkbookCodegenOptions>(json) ?? new SerializableWorkbookCodegenOptions(null);
        return new LightyWorkbookCodegenOptions(payload.OutputRelativePath);
    }

    private sealed record SerializableWorkbookCodegenOptions(string? OutputRelativePath);
}