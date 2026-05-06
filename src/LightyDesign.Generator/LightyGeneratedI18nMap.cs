namespace LightyDesign.Generator;

public sealed record LightyGeneratedI18nEntry(
    string Key,
    string SourceText,
    string SourceContext);

public sealed record LightyGeneratedI18nMap(
    string WorkbookName,
    IReadOnlyList<LightyGeneratedI18nEntry> Entries);
