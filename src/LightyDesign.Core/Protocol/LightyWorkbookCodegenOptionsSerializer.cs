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

        return JsonSerializer.Serialize(
            new SerializableWorkbookCodegenOptions(
                options.OutputRelativePath,
                new SerializableI18nCodegenOptions(
                    options.I18n.OutputRelativePath,
                    options.I18n.SourceLanguage)),
            new JsonSerializerOptions { WriteIndented = true });
    }

    public static LightyWorkbookCodegenOptions Deserialize(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return new LightyWorkbookCodegenOptions();

        var payload = JsonSerializer.Deserialize<SerializableWorkbookCodegenOptions>(json)
            ?? new SerializableWorkbookCodegenOptions(null, null);

        var i18n = payload.I18n is not null
            ? new I18nCodegenOptions
            {
                OutputRelativePath = payload.I18n.OutputRelativePath ?? "../I18nMap",
                SourceLanguage = payload.I18n.SourceLanguage ?? "zh-cn",
            }
            : new I18nCodegenOptions();

        return new LightyWorkbookCodegenOptions(payload.OutputRelativePath, i18n);
    }

    private sealed record SerializableWorkbookCodegenOptions(
        string? OutputRelativePath,
        SerializableI18nCodegenOptions? I18n);

    private sealed record SerializableI18nCodegenOptions(
        string? OutputRelativePath,
        string? SourceLanguage);
}