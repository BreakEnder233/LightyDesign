namespace LightyDesign.Core;

public sealed class LightyWorkbookCodegenOptions
{
    public LightyWorkbookCodegenOptions(string? outputRelativePath = null, I18nCodegenOptions? i18n = null)
    {
        OutputRelativePath = string.IsNullOrWhiteSpace(outputRelativePath)
            ? null
            : outputRelativePath.Trim();
        I18n = i18n ?? new I18nCodegenOptions();
    }

    public string? OutputRelativePath { get; }
    public I18nCodegenOptions I18n { get; }
}

public sealed class I18nCodegenOptions
{
    public string OutputRelativePath { get; init; } = "../I18nMap";
    public string SourceLanguage { get; init; } = "zh-cn";
}
