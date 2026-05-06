using System.Text;

namespace LightyDesign.Generator;

public static class Lightyi18nOutputWriter
{
    /// <summary>渲染源语言 YAML（全量覆盖）</summary>
    public static string RenderYamlContent(
        string workbookName,
        IReadOnlyList<LightyGeneratedI18nEntry> entries)
    {
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
        var existingKeys = new Dictionary<string, string>();
        var currentKey = "";
        foreach (var line in existingYamlContent.Split('\n'))
        {
            var t = line.TrimEnd('\r');
            if (t.StartsWith('#')) continue;
            var ci = t.IndexOf(':');
            if (ci <= 0) continue;
            currentKey = t[..ci].Trim();
            var val = t[(ci + 1)..].Trim().Trim('"');
            existingKeys[currentKey] = val;
        }

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

    /// <summary>渲染 i18n_manifest.yaml</summary>
    public static string RenderManifest(IReadOnlyList<string> workbookNames)
    {
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
        var names = new HashSet<string>();
        foreach (var line in manifestContent.Split('\n'))
        {
            var t = line.TrimEnd('\r').Trim();
            if (t.StartsWith("- name:"))
            {
                var name = t["- name:".Length..].Trim();
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
        else if (value.IndexOfAny(new[] { ':', '#', '{', '}', '[', ']', ',' }) >= 0)
        {
            sb.AppendLine($"{key}: \"{value.Replace("\\", "\\\\").Replace("\"", "\\\"")}\"");
        }
        else
        {
            sb.AppendLine($"{key}: {value}");
        }
    }
}
