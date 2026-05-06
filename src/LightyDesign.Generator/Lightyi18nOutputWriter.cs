using System.Text;

namespace LightyDesign.Generator;

public static class Lightyi18nOutputWriter
{
    private static readonly char[] YamlSpecialChars = new[] { ':', '#', '{', '}', '[', ']', ',' };

    /// <summary>渲染源语言 YAML（全量覆盖）</summary>
    public static string RenderYamlContent(
        string workbookName,
        IReadOnlyList<LightyGeneratedI18nEntry> entries)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workbookName);
        ArgumentNullException.ThrowIfNull(entries);

        var sb = new StringBuilder();
        sb.AppendLine($"# {workbookName}.yaml");
        sb.AppendLine("# 由 LightyDesign 自动生成");
        sb.AppendLine();
        foreach (var entry in entries)
        {
            sb.AppendLine($"# {entry.SourceContext}");
            AppendYamlValue(sb, entry.Key, entry.SourceText);
            sb.AppendLine();
        }
        return sb.ToString();
    }

    /// <summary>渲染翻译语言 YAML（差异更新）</summary>
    public static string RenderTranslatedYamlContent(
        string workbookName,
        IReadOnlyList<LightyGeneratedI18nEntry> newEntries,
        string existingYamlContent)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workbookName);
        ArgumentNullException.ThrowIfNull(newEntries);

        var existingKeys = ParseExistingKeys(existingYamlContent);
        var newKeySet = new HashSet<string>(newEntries.Select(e => e.Key));
        var sb = new StringBuilder();
        sb.AppendLine($"# {workbookName}.yaml");
        sb.AppendLine("# 由 LightyDesign 自动生成");
        sb.AppendLine();

        foreach (var entry in newEntries)
        {
            sb.AppendLine($"# {entry.SourceContext}");
            var finalValue = existingKeys.TryGetValue(entry.Key, out var tv)
                ? tv                 // 已有翻译，保留
                : entry.SourceText;  // 新键，用源文本作占位
            AppendYamlValue(sb, entry.Key, finalValue);
            sb.AppendLine();
        }

        return sb.ToString();
    }

    /// <summary>从源语言 YAML 解析已有键值对（正确处理多行块标量）</summary>
    private static Dictionary<string, string> ParseExistingKeys(string yamlContent)
    {
        var keys = new Dictionary<string, string>(StringComparer.Ordinal);
        if (string.IsNullOrEmpty(yamlContent))
            return keys;

        foreach (var rawLine in yamlContent.Split('\n'))
        {
            var line = rawLine.TrimEnd('\r');

            // 跳过空行、注释、以及多行块标量的延续行
            if (line.Length == 0 || line[0] == '#' || line[0] == ' ')
                continue;

            var ci = line.IndexOf(':');
            if (ci <= 0) continue;

            var key = line[..ci].Trim();
            var val = line[(ci + 1)..].Trim().Trim('"');
            keys[key] = val;
        }

        return keys;
    }

    /// <summary>渲染 i18n_manifest.yaml</summary>
    public static string RenderManifest(IReadOnlyList<string> workbookNames)
    {
        ArgumentNullException.ThrowIfNull(workbookNames);

        var sb = new StringBuilder();
        sb.AppendLine("version: 1");
        sb.AppendLine("workbooks:");
        foreach (var name in workbookNames.OrderBy(n => n, StringComparer.OrdinalIgnoreCase))
        {
            sb.AppendLine($"  - name: {name}");
            sb.AppendLine($"    file: {name}.yaml");
        }
        return sb.ToString();
    }

    /// <summary>解析 YAML 中具有 i18n 条目的工作簿名称列表</summary>
    public static HashSet<string> ParseWorkbookNamesFromManifest(string manifestContent)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(manifestContent);

        var names = new HashSet<string>();
        foreach (var rawLine in manifestContent.Split('\n'))
        {
            var line = rawLine.TrimEnd('\r').Trim();
            if (line.StartsWith("- name:"))
            {
                var name = line["- name:".Length..].Trim();
                if (name.Length > 0) names.Add(name);
            }
        }
        return names;
    }

    private static void AppendYamlValue(StringBuilder sb, string key, string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            sb.AppendLine($"{key}: \"\"");
            return;
        }
        if (value.Contains('\n'))
        {
            sb.AppendLine($"{key}: |");
            foreach (var line in value.Split('\n'))
                sb.AppendLine($"  {line.Replace("\r", "")}");
        }
        else if (value.IndexOfAny(YamlSpecialChars) >= 0)
        {
            sb.AppendLine($"{key}: \"{value.Replace("\\", "\\\\").Replace("\"", "\\\"")}\"");
        }
        else
        {
            sb.AppendLine($"{key}: {value}");
        }
    }
}
