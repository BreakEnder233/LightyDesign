# 策划表本地化（i18n）导出 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 LightyDesign 的策划表导出系统中增加 LocalString 类型支持，导出 YAML 本地化映射文件。

**Architecture:** 在 Core 层新增 `IsLocalString` 类型识别和 `I18nCodegenOptions` 配置；在 Generator 层新增 CRC32 键生成、YAML 映射收集和 `LocalString.cs` 运行时类型生成；在 Application 层将 YAML 写入分离到独立路径；在前端增加 I18n 配置 UI。

**Tech Stack:** C# .NET 9, xUnit, React 19 + TypeScript, YamlDotNet (运行时), ClosedXML (删除)

---

## 文件结构总览

### 新建文件
| 文件 | 职责 |
|------|------|
| `src/LightyDesign.Generator/LightyCrc32.cs` | CRC32 哈希工具，输出 8 位十六进制 |
| `src/LightyDesign.Generator/LightyGeneratedI18nMap.cs` | 本地化映射数据模型 |
| `src/LightyDesign.Generator/Lightyi18nOutputWriter.cs` | YAML 文件写入 + 差异更新逻辑 |

### 修改文件
| 文件 | 职责 |
|------|------|
| `src/LightyDesign.Core/Models/LightyColumnTypeDescriptor.cs` | 新增 `IsLocalString` |
| `src/LightyDesign.Core/Models/LightyWorkbookCodegenOptions.cs` | 新增 `I18nCodegenOptions` |
| `src/LightyDesign.Core/Protocol/LightyWorkbookCodegenOptionsSerializer.cs` | 序列化 i18n 配置 |
| `src/LightyDesign.Generator/LightyGeneratedWorkbookPackage.cs` | 新增可选 `I18nMap` |
| `src/LightyDesign.Generator/LightyWorkbookCodeGenerator.cs` | LocalString 类型映射、键生成、i18n 数据收集 |
| `src/LightyDesign.Application/Services/CodegenService.cs` | 写入 YAML 文件 |
| `src/LightyDesign.Application/Services/WorkspaceMutationService.cs` | 保存 i18n 配置 |
| `src/LightyDesign.Application/Dtos/WorkspaceResponseBuilder.cs` | API 返回 i18n 配置 |
| `src/LightyDesign.DesktopHost/Program.cs` | i18n 配置 API |
| `app/desktop/src/workbook-editor/components/CodegenDialog.tsx` | I18n UI |
| `app/desktop/src/workbook-editor/hooks/useWorkspaceEditor.ts` | i18n 配置保存 |
| `tests/LightyDesign.Tests/CodeGenerationTests.cs` | LocalString 测试 |

### 删除文件
| 文件 | 职责 |
|------|------|
| `src/LightyDesign.FileProcess/LightyWorkbookExcelExporter.cs` | 移除 |
| `src/LightyDesign.FileProcess/LightyWorkbookExcelImporter.cs` | 移除 |
| `src/LightyDesign.FileProcess/ExcelHeaderValueConverter.cs` | 移除 |
| `src/LightyDesign.FileProcess/LightyExcelProcessException.cs` | 移除 |
| `src/LightyDesign.FileProcess/LightyDesign.FileProcess.csproj` | 移除整个项目 |
| `tests/LightyDesign.Tests/FileProcessTests.cs` | 移除 |
| 前端 Excel 导入/导出 UI 代码 | 待定位后移除 |

---

### Task 1: CRC32 工具类

**Files:**
- Create: `src/LightyDesign.Generator/LightyCrc32.cs`

- [ ] **Step 1: 创建 LightyCrc32.cs**

```csharp
namespace LightyDesign.Generator;

using System.Text;

internal static class LightyCrc32
{
    private const uint Polynomial = 0xEDB88320u;
    private static readonly uint[] Table = BuildTable();

    private static uint[] BuildTable()
    {
        var table = new uint[256];
        for (uint i = 0; i < 256; i++)
        {
            var crc = i;
            for (var j = 0; j < 8; j++)
                crc = (crc & 1) != 0 ? (Polynomial ^ (crc >> 1)) : crc >> 1;
            table[i] = crc;
        }
        return table;
    }

    public static string Compute(string input)
    {
        var bytes = Encoding.UTF8.GetBytes(input ?? string.Empty);
        var crc = ~0u;
        foreach (var b in bytes)
            crc = Table[(crc ^ b) & 0xFF] ^ (crc >> 8);
        return (~crc).ToString("x8");
    }
}
```

- [ ] **Step 2: 构建确认**

```bash
dotnet build src/LightyDesign.Generator/LightyDesign.Generator.csproj
```
Expected: Build succeeds

- [ ] **Step 3: 提交**

```bash
git add src/LightyDesign.Generator/LightyCrc32.cs
git commit -m "feat(i18n): add CRC32 hash utility"
```

---

### Task 2: LightyColumnTypeDescriptor 增加 IsLocalString

**Files:**
- Modify: `src/LightyDesign.Core/Models/LightyColumnTypeDescriptor.cs`

- [ ] **Step 1: 加 `isLocalString` 参数到构造函数**

```csharp
// 原构造函数末尾加参数：
private LightyColumnTypeDescriptor(
    string rawType,
    string typeName,
    IReadOnlyList<string> genericArguments,
    string valueType,
    bool isList,
    bool isDictionary,
    LightyReferenceTarget? referenceTarget,
    bool isLocalString)  // ← 新增
{
    // ... 现有赋值 ...
    IsLocalString = isLocalString; // ← 新增
}
```

- [ ] **Step 2: 新增属性**

```csharp
// 在 IsReference 后面：
public bool IsLocalString { get; }
```

- [ ] **Step 3: 修改 MainTypeKey**

```csharp
public string MainTypeKey => IsList
    ? "List"
    : IsDictionary
        ? "Dictionary"
        : IsReference
            ? "Reference"
            : IsLocalString
                ? "LocalString"    // ← 新增
                : RawType;
```

- [ ] **Step 4: Parse 方法中识别 LocalString**

```csharp
// 在 var referenceTarget = ... 之后添加：
var isLocalString = !isList && !isDictionary && referenceTarget is null &&
    string.Equals(typeName, "LocalString", StringComparison.Ordinal);

// 修改 return 语句传入 isLocalString：
return new LightyColumnTypeDescriptor(
    trimmedType, typeName, genericArguments, valueType,
    isList, isDictionary, referenceTarget, isLocalString);
```

- [ ] **Step 5: 构建确认**

```bash
dotnet build src/LightyDesign.Core/LightyDesign.Core.csproj
```

- [ ] **Step 6: 提交**

```bash
git add src/LightyDesign.Core/Models/LightyColumnTypeDescriptor.cs
git commit -m "feat(i18n): add IsLocalString to type descriptor"
```

---

### Task 3: I18nCodegenOptions 配置模型

**Files:**
- Modify: `src/LightyDesign.Core/Models/LightyWorkbookCodegenOptions.cs`
- Modify: `src/LightyDesign.Core/Protocol/LightyWorkbookCodegenOptionsSerializer.cs`

- [ ] **Step 1: 修改配置模型**

```csharp
// LightyWorkbookCodegenOptions.cs — 整个文件替换为：
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
```

- [ ] **Step 2: 修改序列化器**

```csharp
// LightyWorkbookCodegenOptionsSerializer.cs — 替换 SerializableWorkbookCodegenOptions
private sealed record SerializableWorkbookCodegenOptions(
    string? OutputRelativePath,
    SerializableI18nCodegenOptions? I18n);

private sealed record SerializableI18nCodegenOptions(
    string? OutputRelativePath,
    string? SourceLanguage);

// 修改 Serialize：
public static string Serialize(LightyWorkbookCodegenOptions options)
{
    return JsonSerializer.Serialize(
        new SerializableWorkbookCodegenOptions(
            options.OutputRelativePath,
            new SerializableI18nCodegenOptions(
                options.I18n.OutputRelativePath,
                options.I18n.SourceLanguage)),
        new JsonSerializerOptions { WriteIndented = true });
}

// 修改 Deserialize：
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
```

- [ ] **Step 3: 构建确认**

```bash
dotnet build src/LightyDesign.Core/LightyDesign.Core.csproj
```

- [ ] **Step 4: 提交**

```bash
git add src/LightyDesign.Core/Models/LightyWorkbookCodegenOptions.cs src/LightyDesign.Core/Protocol/LightyWorkbookCodegenOptionsSerializer.cs
git commit -m "feat(i18n): add I18nCodegenOptions config"
```

---

### Task 4: i18n 数据模型 + 扩展 WorkbookPackage

**Files:**
- Create: `src/LightyDesign.Generator/LightyGeneratedI18nMap.cs`
- Modify: `src/LightyDesign.Generator/LightyGeneratedWorkbookPackage.cs`

- [ ] **Step 1: 创建数据模型**

```csharp
// LightyGeneratedI18nMap.cs
namespace LightyDesign.Generator;

public sealed record LightyGeneratedI18nEntry(
    string Key,
    string SourceText,
    string SourceContext);

public sealed record LightyGeneratedI18nMap(
    string WorkbookName,
    IReadOnlyList<LightyGeneratedI18nEntry> Entries);
```

- [ ] **Step 2: 扩展 Package**

```csharp
// LightyGeneratedWorkbookPackage.cs — 修改构造函数和新增属性
public sealed class LightyGeneratedWorkbookPackage
{
    public LightyGeneratedWorkbookPackage(
        string outputRelativePath,
        IReadOnlyList<LightyGeneratedCodeFile> files,
        LightyGeneratedI18nMap? i18nMap = null)   // ← 新增可选参数
    {
        // ... 原有验证 ...
        OutputRelativePath = outputRelativePath;
        Files = files;
        I18nMap = i18nMap;   // ← 新增
    }

    public string OutputRelativePath { get; }
    public IReadOnlyList<LightyGeneratedCodeFile> Files { get; }
    public LightyGeneratedI18nMap? I18nMap { get; }  // ← 新增
}
```

- [ ] **Step 3: 构建确认**

```bash
dotnet build src/LightyDesign.Generator/LightyDesign.Generator.csproj
```

- [ ] **Step 4: 提交**

```bash
git add src/LightyDesign.Generator/LightyGeneratedI18nMap.cs src/LightyDesign.Generator/LightyGeneratedWorkbookPackage.cs
git commit -m "feat(i18n): add I18nMap data model"
```

---

### Task 5: YAML 输出写入器

**Files:**
- Create: `src/LightyDesign.Generator/Lightyi18nOutputWriter.cs`

- [ ] **Step 1: 创建 YAML 写入器**

```csharp
// Lightyi18nOutputWriter.cs
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
        else if (value.IndexOfAny([':', '#', '{', '}', '[', ']', ',']) >= 0)
        {
            sb.AppendLine($"{key}: \"{value.Replace("\\", "\\\\").Replace("\"", "\\\"")}\"");
        }
        else
        {
            sb.AppendLine($"{key}: {value}");
        }
    }
}
```

- [ ] **Step 2: 构建确认**

```bash
dotnet build src/LightyDesign.Generator/LightyDesign.Generator.csproj
```

- [ ] **Step 3: 提交**

```bash
git add src/LightyDesign.Generator/Lightyi18nOutputWriter.cs
git commit -m "feat(i18n): add YAML writer with diff-update"
```

---

### Task 6: 代码生成器 — 支持 LocalString 类型

**Files:**
- Modify: `src/LightyDesign.Generator/LightyWorkbookCodeGenerator.cs`

这是核心改动，分为多个子步骤。

- [ ] **Step 1: 在 `EnsureSupportedType` 中允许 LocalString**

在方法开头添加：
```csharp
if (descriptor.IsLocalString) return;
```

- [ ] **Step 2: 在 `MapToCSharpType` 中映射 LocalString → C# 类型**

在 `IsReference` 分支之后，`switch` 之前添加：
```csharp
if (descriptor.IsLocalString) return "LocalString";
```

- [ ] **Step 3: 添加辅助方法**

```csharp
private static string BuildLocalStringKey(string idString, string fieldName, string sourceText)
{
    return $"{LightyCrc32.Compute(idString)}_{LightyCrc32.Compute(fieldName)}_{LightyCrc32.Compute(sourceText ?? string.Empty)}";
}
```

- [ ] **Step 4: 修改 `AnalyzeSheet` 传递 primaryKeyFields 和 i18nEntries**

将当前 LINQ 查询：
```csharp
var rows = sheet.Rows
    .Select((row, rowIndex) => AnalyzeRow(workspace, sheet, row, rowIndex, exportedColumns))
    .ToList();
```
改为：
```csharp
var rows = sheet.Rows
    .Select((row, rowIndex) => AnalyzeRow(workspace, sheet, row, rowIndex, exportedColumns, primaryKeyFields, i18nEntries))
    .ToList();
```

同时修改 `AnalyzeSheet` 签名增加 `List<LightyGeneratedI18nEntry> i18nEntries` 参数。

- [ ] **Step 5: 修改 `AnalyzeRow` 签名和处理逻辑**

增加 `IReadOnlyList<GeneratedFieldModel> primaryKeyFields` 和 `List<LightyGeneratedI18nEntry> i18nEntries` 参数。

在方法开头计算 ID 字符串：
```csharp
var idString = string.Join("_",
    primaryKeyFields.Select(pkField => row[pkField.SourceIndex]));
```

在 foreach 的 `parseResult` 之后，添加 LocalString 分支：

```csharp
string valueLiteral;
if (field.TypeDescriptor.IsLocalString)
{
    var sourceText = parseResult.Value as string ?? string.Empty;
    var key = BuildLocalStringKey(idString, field.FieldName, sourceText);
    valueLiteral = $"new LocalString(\"{key}\")";
    i18nEntries?.Add(new LightyGeneratedI18nEntry(key, sourceText, $"{sheet.Name}.{field.FieldName}"));
}
else if (field.TypeDescriptor.IsList &&
         LightyColumnTypeDescriptor.Parse(field.TypeDescriptor.ValueType).IsLocalString)
{
    var elementDescriptor = LightyColumnTypeDescriptor.Parse(field.TypeDescriptor.ValueType);
    var values = (IReadOnlyList<object?>)(parseResult.Value ?? Array.Empty<object?>());
    var items = new List<string>();
    for (var i = 0; i < values.Count; i++)
    {
        var elementText = values[i] as string ?? string.Empty;
        var elementKey = BuildLocalStringKey(idString, $"{field.FieldName}[{i}]", elementText);
        items.Add($"new LocalString(\"{elementKey}\")");
        i18nEntries?.Add(new LightyGeneratedI18nEntry(elementKey, elementText, $"{sheet.Name}.{field.FieldName}[{i}]"));
    }
    valueLiteral = $"new List<LocalString> {{ {string.Join(", ", items)} }}";
}
else
{
    valueLiteral = BuildValueLiteral(workspace, field.TypeDescriptor, parseResult.Value);
}

assignments.Add(new GeneratedFieldAssignment(field, valueLiteral));
```

- [ ] **Step 6: 修改 `Generate` 方法**

在方法开头创建 i18n 列表：
```csharp
var i18nEntries = new List<LightyGeneratedI18nEntry>();
```

修改 LINQ Select：
```csharp
var generatedSheets = workbook.Sheets
    .Select(sheet => AnalyzeSheet(workspace, sheet, i18nEntries))
    .ToList();
```

在 `files.Add(new LightyGeneratedCodeFile("DesignDataReference.cs", ...))` 之后添加：
```csharp
files.Add(new LightyGeneratedCodeFile("LocalString.cs", RenderLocalStringFile()));
```

在创建 `LightyGeneratedWorkbookPackage` 之前，构建 i18n map：
```csharp
LightyGeneratedI18nMap? i18nMap = i18nEntries.Count > 0
    ? new LightyGeneratedI18nMap(workbook.Name, i18nEntries.AsReadOnly())
    : null;
```

修改 return 语句传入 i18nMap：
```csharp
return new LightyGeneratedWorkbookPackage(workspace.CodegenOptions.OutputRelativePath!, files, i18nMap);
```

- [ ] **Step 7: 添加 `RenderLocalStringFile` 方法**

```csharp
private static string RenderLocalStringFile()
{
    var writer = new CodeWriter();
    writer.AppendAutoGeneratedHeader();
    writer.AppendLine("using System.Collections.Generic;");
    writer.AppendLine();
    writer.AppendLine("namespace LightyDesignData;");
    writer.AppendLine();
    writer.AppendLine("/// <summary>本地化字符串，由 LightyDesign 生成。</summary>");
    writer.AppendLine("/// <remarks>游戏项目需引入 YamlDotNet NuGet 包。</remarks>");
    writer.AppendLine("public class LocalString");
    writer.AppendLine("{");
    writer.Indent();
    writer.AppendLine("private static Dictionary<string, string> _map = new();");
    writer.AppendLine("private static string _sourceLanguage = \"zh-cn\";");
    writer.AppendLine("private static string _basePath = \"\";");
    writer.AppendLine();
    writer.AppendLine("public static event System.Action? OnLanguageChanged;");
    writer.AppendLine();
    writer.AppendLine("private readonly string _key;");
    writer.AppendLine();
    writer.AppendLine("public LocalString(string key) => _key = key;");
    writer.AppendLine();
    writer.AppendLine("public override string ToString()");
    writer.AppendLine("{");
    writer.Indent();
    writer.AppendLine("if (string.IsNullOrEmpty(_key)) return \"\";");
    writer.AppendLine("return _map.TryGetValue(_key, out var value) ? value : _key;");
    writer.Outdent();
    writer.AppendLine("}");
    writer.AppendLine();
    writer.AppendLine("public static void Initialize(string basePath, string sourceLanguage, string language)");
    writer.AppendLine("{");
    writer.Indent();
    writer.AppendLine("_basePath = basePath;");
    writer.AppendLine("_sourceLanguage = sourceLanguage;");
    writer.AppendLine("LoadLanguage(language);");
    writer.Outdent();
    writer.AppendLine("}");
    writer.AppendLine();
    writer.AppendLine("public static void LoadLanguage(string language)");
    writer.AppendLine("{");
    writer.Indent();
    writer.AppendLine("_map.Clear();");
    writer.AppendLine("var manifestPath = System.IO.Path.Combine(_basePath, _sourceLanguage, \"i18n_manifest.yaml\");");
    writer.AppendLine("var manifest = System.IO.File.ReadAllText(manifestPath);");
    writer.AppendLine("var deserializer = new YamlDotNet.Serialization.DeserializerBuilder()");
    writer.AppendLine("    .Build();");
    writer.AppendLine("var manifestData = deserializer.Deserialize<ManifestData>(manifest);");
    writer.AppendLine("if (manifestData?.Workbooks == null) return;");
    writer.AppendLine("foreach (var wb in manifestData.Workbooks)");
    writer.AppendLine("{");
    writer.Indent();
    writer.AppendLine("var yamlPath = System.IO.Path.Combine(_basePath, language, wb.File);");
    writer.AppendLine("if (!System.IO.File.Exists(yamlPath))");
    writer.AppendLine("    throw new System.IO.FileNotFoundException($\"本地化文件缺失：语言 '{language}' 缺少工作簿 '{wb.Name}' 的映射文件，期望路径: {yamlPath}\");");
    writer.AppendLine("var yaml = System.IO.File.ReadAllText(yamlPath);");
    writer.AppendLine("var entries = deserializer.Deserialize<Dictionary<string, string>>(yaml);");
    writer.AppendLine("foreach (var kv in entries) _map[kv.Key] = kv.Value;");
    writer.Outdent();
    writer.AppendLine("}");
    writer.AppendLine("OnLanguageChanged?.Invoke();");
    writer.Outdent();
    writer.AppendLine("}");
    writer.AppendLine();
    writer.AppendLine("private sealed class ManifestData");
    writer.AppendLine("{");
    writer.Indent();
    writer.AppendLine("public int Version { get; set; }");
    writer.AppendLine("public List<ManifestWorkbook>? Workbooks { get; set; }");
    writer.Outdent();
    writer.AppendLine("}");
    writer.AppendLine();
    writer.AppendLine("private sealed class ManifestWorkbook");
    writer.AppendLine("{");
    writer.Indent();
    writer.AppendLine("public string Name { get; set; } = \"\";");
    writer.AppendLine("public string File { get; set; } = \"\";");
    writer.Outdent();
    writer.AppendLine("}");
    writer.Outdent();
    writer.AppendLine("}");
    return writer.ToString();
}
```

注意：`RenderLocalStringFile` 生成的代码依赖 YamlDotNet 运行时，需要游戏项目引入该包。

- [ ] **Step 8: 构建确认**

```bash
dotnet build src/LightyDesign.Generator/LightyDesign.Generator.csproj
```

- [ ] **Step 9: 提交**

```bash
git add src/LightyDesign.Generator/LightyWorkbookCodeGenerator.cs
git commit -m "feat(i18n): add LocalString code gen + key generation"
```

---

### Task 7: 后端 — 写入 YAML + 保存 i18n 配置

**Files:**
- Modify: `src/LightyDesign.Application/Services/CodegenService.cs`
- Modify: `src/LightyDesign.Application/Services/WorkspaceMutationService.cs`
- Modify: `src/LightyDesign.Application/Dtos/WorkspaceResponseBuilder.cs`
- Modify: `src/LightyDesign.DesktopHost/Program.cs`

- [ ] **Step 1: CodegenService — ExportWorkbook 写 YAML**

```csharp
// 在 ExportWorkbook 方法中，生成 package 之后添加：
if (package.I18nMap is not null)
{
    var options = workbook.CodegenOptions.I18n;
    var i18nRootPath = GeneratedCodeOutputWriter.ValidateWorkbookCodegenOutputRelativePath(
        workspace.RootPath, options.OutputRelativePath, allowEmpty: false);
    WriteI18nMap(i18nRootPath, options.SourceLanguage, package.I18nMap);
}
```

添加私有方法：
```csharp
private static void WriteI18nMap(string i18nRootPath, string sourceLanguage, LightyGeneratedI18nMap map)
{
    var langDir = Path.Combine(i18nRootPath, sourceLanguage);
    Directory.CreateDirectory(langDir);

    // 写 YAML 文件
    var yamlContent = Lightyi18nOutputWriter.RenderYamlContent(map.WorkbookName, map.Entries);
    File.WriteAllText(Path.Combine(langDir, $"{map.WorkbookName}.yaml"), yamlContent);

    // 更新 manifest
    RewriteManifest(langDir, I18nMapFileChanges.ForAdd(map.WorkbookName));
}
```

为简化，添加 `RewriteManifest` 和 `DeleteOrphanedYaml` 方法到 `CodegenService`（或提取到独立工具类）。但为避免过度设计，直接在 `CodegenService` 中添加这些逻辑。

实际上更好的做法：把 i18n 输出逻辑提取到 `GeneratedCodeOutputWriter` 中或一个独立的 `Lightyi18nMapFileManager` 类中。

推荐：在 `GeneratedCodeOutputWriter` 中添加静态方法来处理 i18n 输出。这样 `CodegenService` 只需调用一个方法。

```csharp
// 在 GeneratedCodeOutputWriter 中添加：
public static void WriteWorkbookI18nMap(
    string workspaceRootPath,
    string i18nOutputRelativePath,
    string sourceLanguage,
    LightyGeneratedI18nMap i18nMap)
{
    var i18nRootPath = ValidateWorkbookCodegenOutputRelativePath(
        workspaceRootPath, i18nOutputRelativePath, allowEmpty: false);
    var langDir = Path.Combine(i18nRootPath, sourceLanguage);
    Directory.CreateDirectory(langDir);

    // 写 YAML 文件（源语言全量覆盖）
    var yamlContent = Lightyi18nOutputWriter.RenderYamlContent(i18nMap.WorkbookName, i18nMap.Entries);
    File.WriteAllText(Path.Combine(langDir, $"{i18nMap.WorkbookName}.yaml"), yamlContent);

    // 更新 manifest
    var manifestPath = Path.Combine(langDir, "i18n_manifest.yaml");
    var existingWorkbookNames = File.Exists(manifestPath)
        ? Lightyi18nOutputWriter.ParseWorkbookNamesFromManifest(File.ReadAllText(manifestPath))
        : new HashSet<string>();
    existingWorkbookNames.Add(i18nMap.WorkbookName);
    var manifestContent = Lightyi18nOutputWriter.RenderManifest(existingWorkbookNames.OrderBy(n => n).ToList());
    File.WriteAllText(manifestPath, manifestContent);
}

public static void CleanupOrphanedI18nMaps(
    string workspaceRootPath,
    string i18nOutputRelativePath,
    string sourceLanguage,
    HashSet<string> activeWorkbookNames)
{
    var i18nRootPath = ValidateWorkbookCodegenOutputRelativePath(
        workspaceRootPath, i18nOutputRelativePath, allowEmpty: false);
    var langDir = Path.Combine(i18nRootPath, sourceLanguage);
    if (!Directory.Exists(langDir)) return;

    var manifestPath = Path.Combine(langDir, "i18n_manifest.yaml");
    if (!File.Exists(manifestPath)) return;

    var manifestWorkbookNames = Lightyi18nOutputWriter.ParseWorkbookNamesFromManifest(
        File.ReadAllText(manifestPath));

    var toRemove = manifestWorkbookNames.Where(n => !activeWorkbookNames.Contains(n)).ToList();
    foreach (var name in toRemove)
    {
        var yamlPath = Path.Combine(langDir, $"{name}.yaml");
        if (File.Exists(yamlPath)) File.Delete(yamlPath);
    }

    // 重写 manifest（仅保留活跃工作簿）
    var remainingNames = manifestWorkbookNames.Intersect(activeWorkbookNames).OrderBy(n => n).ToList();
    var manifestContent = Lightyi18nOutputWriter.RenderManifest(remainingNames);
    File.WriteAllText(manifestPath, manifestContent);
}
```

同时修改 `ExportAllWorkbooks` 在末尾写入所有 i18n 文件并清理孤儿文件。

- [ ] **Step 2: 修改 WorkspaceMutationService.SaveCodegenConfig**

```csharp
// 修改 SaveCodegenConfig 方法签名，接受 i18n 参数
// 前端发送：{ outputRelativePath, i18n: { outputRelativePath, sourceLanguage } }
public object SaveCodegenConfig(string workspacePath, string? outputRelativePath,
    string? i18nOutputRelativePath, string? i18nSourceLanguage)
{
    var workspace = LightyWorkspaceLoader.Load(workspacePath);
    var i18n = new I18nCodegenOptions
    {
        OutputRelativePath = i18nOutputRelativePath ?? "../I18nMap",
        SourceLanguage = i18nSourceLanguage ?? "zh-cn",
    };
    var codegenOptions = new LightyWorkbookCodegenOptions(outputRelativePath, i18n);
    GeneratedCodeOutputWriter.ValidateWorkbookCodegenOutputRelativePath(
        workspace.RootPath, codegenOptions.OutputRelativePath, allowEmpty: true);
    LightyWorkbookCodegenOptionsSerializer.SaveToFile(workspace.CodegenConfigFilePath, codegenOptions);

    var reloadedWorkspace = LightyWorkspaceLoader.Load(workspacePath);
    return WorkspaceResponseBuilder.ToWorkspaceNavigationResponse(reloadedWorkspace);
}
```

- [ ] **Step 3: 修改 WorkspaceResponseBuilder**

```csharp
// ToWorkspaceCodegenResponse 增加 i18n 字段：
public static object ToWorkspaceCodegenResponse(LightyWorkspace workspace)
{
    return new
    {
        outputRelativePath = workspace.CodegenOptions.OutputRelativePath,
        i18n = new
        {
            outputRelativePath = workspace.CodegenOptions.I18n.OutputRelativePath,
            sourceLanguage = workspace.CodegenOptions.I18n.SourceLanguage,
        },
    };
}

// ToWorkbookCodegenResponse 同样增加：
public static object ToWorkbookCodegenResponse(LightyWorkbook workbook)
{
    return new
    {
        outputRelativePath = workbook.CodegenOptions.OutputRelativePath,
        i18n = new
        {
            outputRelativePath = workbook.CodegenOptions.I18n.OutputRelativePath,
            sourceLanguage = workbook.CodegenOptions.I18n.SourceLanguage,
        },
    };
}
```

- [ ] **Step 4: 修改 DesktopHost Program.cs**

更新 API 路由以接受 i18n 配置：

```csharp
// 修改 /api/workspace/workbooks/codegen/config 路由
app.MapPost("/api/workspace/workbooks/codegen/config",
    (SaveWorkbookCodegenConfigRequestDto request, WorkspaceMutationService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath))
        throw new ValidationException("workspacePath is required.");
    return Results.Ok(service.SaveCodegenConfig(
        request.WorkspacePath.Trim(),
        request.OutputRelativePath,
        request.I18nOutputRelativePath,
        request.I18nSourceLanguage));
});

// 添加 DTO
public sealed record SaveWorkbookCodegenConfigRequestDto(
    string WorkspacePath,
    string? OutputRelativePath,
    string? I18nOutputRelativePath,
    string? I18nSourceLanguage);
```

- [ ] **Step 5: 构建确认**

```bash
dotnet build src/LightyDesign.DesktopHost/LightyDesign.DesktopHost.csproj
```

- [ ] **Step 6: 提交**

```bash
git add src/LightyDesign.Application/ src/LightyDesign.DesktopHost/
git commit -m "feat(i18n): wire i18n config API and YAML output"
```

---

### Task 8: 前端 — CodegenDialog + useWorkspaceEditor

- [ ] **Step 1: 修改 CodegenDialog.tsx 增加 I18n 配置 UI**

在输出路径输入框下方，新增 I18n 配置区域：

```tsx
{/* I18n 本地化配置 */}
<hr className="codegen-dialog-divider" />
<p className="codegen-dialog-section-title">本地化导出</p>

<label className="search-field workspace-create-name-field">
  <span>启用本地化</span>
  <input
    type="checkbox"
    checked={enableI18n}
    onChange={(e) => onEnableI18nChange(e.target.checked)}
  />
</label>

{enableI18n && (
  <>
    <label className="search-field workspace-create-name-field">
      <span>I18nMap 路径</span>
      <input
        type="text"
        value={i18nOutputRelativePath}
        onChange={(e) => onI18nOutputPathChange(e.target.value)}
        placeholder="../I18nMap"
      />
    </label>

    <label className="search-field workspace-create-name-field">
      <span>源语言</span>
      <input
        type="text"
        value={i18nSourceLanguage}
        onChange={(e) => onI18nSourceLanguageChange(e.target.value)}
        placeholder="zh-cn"
      />
    </label>
  </>
)}
```

在 `CodegenDialogProps` 接口中增加：
```tsx
enableI18n: boolean;
i18nOutputRelativePath: string;
i18nSourceLanguage: string;
onEnableI18nChange: (value: boolean) => void;
onI18nOutputPathChange: (value: string) => void;
onI18nSourceLanguageChange: (value: string) => void;
```

- [ ] **Step 2: 修改 useWorkspaceEditor.ts — 接入 i18n 配置**

在代码gen相关状态中增加 i18n 字段，在 `saveWorkspaceCodegenOptions` 中发送 i18n 配置：

```typescript
async function saveWorkspaceCodegenOptions(
  outputRelativePath: string,
  enableI18n: boolean,
  i18nOutputRelativePath: string,
  i18nSourceLanguage: string
) {
  // ... existing validation ...
  const updatedWorkspace = await fetchJson<WorkspaceNavigationResponse>(
    `${hostInfo.desktopHostUrl}/api/workspace/workbooks/codegen/config`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspacePath,
        outputRelativePath: outputRelativePath.trim() || null,
        i18nOutputRelativePath: enableI18n ? (i18nOutputRelativePath.trim() || null) : null,
        i18nSourceLanguage: enableI18n ? (i18nSourceLanguage.trim() || null) : null,
      }),
    }
  );
  // ... existing toast and setWorkspace ...
}
```

- [ ] **Step 3: 提交**

```bash
git add app/desktop/src/workbook-editor/
git commit -m "feat(i18n): add i18n config UI to codegen dialog"
```

---

### Task 9: 移除 Excel 导入/导出

**Files:**
- Delete: `src/LightyDesign.FileProcess/LightyWorkbookExcelExporter.cs`
- Delete: `src/LightyDesign.FileProcess/LightyWorkbookExcelImporter.cs`
- Delete: `src/LightyDesign.FileProcess/ExcelHeaderValueConverter.cs`
- Delete: `src/LightyDesign.FileProcess/LightyExcelProcessException.cs`
- Delete: `tests/LightyDesign.Tests/FileProcessTests.cs`

- [ ] **Step 1: 删除后端文件**

```bash
rm src/LightyDesign.FileProcess/LightyWorkbookExcelExporter.cs
rm src/LightyDesign.FileProcess/LightyWorkbookExcelImporter.cs
rm src/LightyDesign.FileProcess/ExcelHeaderValueConverter.cs
rm src/LightyDesign.FileProcess/LightyExcelProcessException.cs
rm tests/LightyDesign.Tests/FileProcessTests.cs
```

- [ ] **Step 2: 解引用 FileProcess 项目**

从解决方案中移除 FileProcess 项目：

```bash
# 从 .sln 文件移除 LightyDesign.FileProcess 项目
# 从 tests csproj 移除 LightyDesign.FileProcess 项目引用
```

修改 `tests/LightyDesign.Tests/LightyDesign.Tests.csproj`，移除：
```xml
<!-- 删除这一行 -->
<ProjectReference Include="..\..\src\LightyDesign.FileProcess\LightyDesign.FileProcess.csproj" />
```

也删除 `src/LightyDesign.FileProcess/LightyDesign.FileProcess.csproj` 文件本身（整个项目目录）。

- [ ] **Step 3: 删除前端 Excel 导入/导出 UI**

搜索前端代码中引用 Excel 导入/导出功能的部分：
- 查找 `excel`、`Excel`、`xlsx`、`导入`、`导出` 等关键字
- 删除相关的 UI 组件和事件处理

- [ ] **Step 4: 构建确认**

```bash
dotnet build LightyDesign.sln
```

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: remove Excel import/export feature"
```

---

### Task 10: 编写 LocalString 测试

**Files:**
- Modify: `tests/LightyDesign.Tests/CodeGenerationTests.cs`

- [ ] **Step 1: 添加 LocalString 单列的测试方法**

```csharp
[Fact]
public void WorkbookCodeGenerator_ShouldGenerateLocalStringFields()
{
    var workspace = CreateWorkspaceWithLocalString(new LightyWorkbookCodegenOptions("Generated/Config"));
    var workbook = Assert.Single(workspace.Workbooks);
    var generator = new LightyWorkbookCodeGenerator();

    var package = generator.Generate(workspace, workbook);

    // 验证生成了 LocalString.cs
    Assert.Contains(package.Files, file => file.RelativePath == "LocalString.cs");

    // 验证 row 类型包含 LocalString 属性
    var rowFile = Assert.Single(package.Files, file => file.RelativePath == "Npc/NpcRow.cs");
    Assert.Contains("public LocalString Description", rowFile.Content, StringComparison.Ordinal);

    // 验证数据初始化使用 new LocalString("key")
    Assert.Contains("new LocalString(", rowFile.Content, StringComparison.Ordinal);

    // 验证 i18n map 不为空
    Assert.NotNull(package.I18nMap);
    Assert.NotEmpty(package.I18nMap.Entries);
}

[Fact]
public void WorkbookCodeGenerator_ShouldGenerateListLocalStringFields()
{
    var workspace = CreateWorkspaceWithListLocalString(new LightyWorkbookCodegenOptions("Generated/Config"));
    var workbook = Assert.Single(workspace.Workbooks);
    var generator = new LightyWorkbookCodeGenerator();

    var package = generator.Generate(workspace, workbook);

    var rowFile = Assert.Single(package.Files, file => file.RelativePath == "Npc/NpcRow.cs");
    Assert.Contains("public List<LocalString> Tags", rowFile.Content, StringComparison.Ordinal);
    Assert.Contains("new List<LocalString>", rowFile.Content, StringComparison.Ordinal);

    Assert.NotNull(package.I18nMap);
    Assert.Equal(3, package.I18nMap.Entries.Count); // "火", "水", "风" 三个元素
}

[Fact]
public void WorkbbookCodeGenerator_ShouldGenerateI18nMapWithCorrectKeys()
{
    var workspace = CreateWorkspaceWithLocalString(new LightyWorkbookCodegenOptions("Generated/Config"));
    var workbook = Assert.Single(workspace.Workbooks);
    var generator = new LightyWorkbookCodeGenerator();

    var package = generator.Generate(workspace, workbook);

    Assert.NotNull(package.I18nMap);
    // 验证每个 entry 有 key、sourceText、sourceContext
    foreach (var entry in package.I18nMap.Entries)
    {
        Assert.False(string.IsNullOrWhiteSpace(entry.Key));
        Assert.False(string.IsNullOrWhiteSpace(entry.SourceText));
        Assert.False(string.IsNullOrWhiteSpace(entry.SourceContext));
        // key 格式: 3段 8 位十六进制，用 _ 连接
        var keyParts = entry.Key.Split('_');
        Assert.Equal(3, keyParts.Length);
        Assert.All(keyParts, part =>
        {
            Assert.Equal(8, part.Length);
            Assert.True(part.All(c => (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')));
        });
    }

    // 空字符串不产生 i18n 条目
    Assert.DoesNotContain(package.I18nMap.Entries, e => string.IsNullOrEmpty(e.SourceText));
}
```

- [ ] **Step 2: 添加测试辅助方法**

```csharp
private static LightyWorkspace CreateWorkspaceWithLocalString(LightyWorkbookCodegenOptions codegenOptions)
{
    var workbookDirectory = @"D:\Workspace\Npc";
    var workbook = new LightyWorkbook(
        "Npc",
        workbookDirectory,
        new[]
        {
            new LightySheet(
                "Npc",
                Path.Combine(workbookDirectory, "Npc.txt"),
                Path.Combine(workbookDirectory, "Npc_header.json"),
                new LightySheetHeader(new[]
                {
                    new ColumnDefine("ID", "int", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                    new ColumnDefine("Name", "string", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                    new ColumnDefine("Description", "LocalString", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                }),
                new[]
                {
                    new LightySheetRow(0, new[] { "1", "Guard", "守卫城镇大门的卫兵" }),
                    new LightySheetRow(1, new[] { "2", "Merchant", "出售各种商品的商人" }),
                }),
        },
        codegenOptions,
        Path.Combine(workbookDirectory, LightyWorkbookCodegenOptionsSerializer.DefaultFileName));

    return new LightyWorkspace(
        @"D:\Workspace",
        @"D:\Workspace\config.json",
        @"D:\Workspace\headers.json",
        WorkspaceHeaderLayout.CreateDefault(),
        new[] { workbook },
        codegenOptions,
        Path.Combine(@"D:\Workspace", LightyWorkbookCodegenOptionsSerializer.DefaultFileName));
}

private static LightyWorkspace CreateWorkspaceWithListLocalString(LightyWorkbookCodegenOptions codegenOptions)
{
    var workbookDirectory = @"D:\Workspace\Npc";
    var workbook = new LightyWorkbook(
        "Npc",
        workbookDirectory,
        new[]
        {
            new LightySheet(
                "Npc",
                Path.Combine(workbookDirectory, "Npc.txt"),
                Path.Combine(workbookDirectory, "Npc_header.json"),
                new LightySheetHeader(new[]
                {
                    new ColumnDefine("ID", "int", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                    new ColumnDefine("Name", "string", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                    new ColumnDefine("Tags", "List<LocalString>", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                }),
                new[]
                {
                    new LightySheetRow(0, new[] { "1", "Guard", "\"火\",\"水\",\"风\"" }),
                }),
        },
        codegenOptions,
        Path.Combine(workbookDirectory, LightyWorkbookCodegenOptionsSerializer.DefaultFileName));

    return new LightyWorkspace(
        @"D:\Workspace",
        @"D:\Workspace\config.json",
        @"D:\Workspace\headers.json",
        WorkspaceHeaderLayout.CreateDefault(),
        new[] { workbook },
        codegenOptions,
        Path.Combine(@"D:\Workspace", LightyWorkbookCodegenOptionsSerializer.DefaultFileName));
}
```

- [ ] **Step 3: 运行测试**

```bash
dotnet test tests/LightyDesign.Tests/LightyDesign.Tests.csproj --filter "FullyQualifiedName~LocalString"
```
Expected: All 3 tests pass

- [ ] **Step 4: 运行全部测试确认没有回归**

```bash
dotnet test tests/LightyDesign.Tests/LightyDesign.Tests.csproj
```
Expected: All tests pass

- [ ] **Step 5: 提交**

```bash
git add tests/LightyDesign.Tests/CodeGenerationTests.cs
git commit -m "test(i18n): add LocalString generation tests"
```

---

### Task 11: YAML 输出集成测试与验证

- [ ] **Step 1: 构建完整解决方案**

```bash
dotnet build LightyDesign.sln
```
Expected: Build succeeds

- [ ] **Step 2: 运行全部测试**

```bash
dotnet test tests/LightyDesign.Tests/LightyDesign.Tests.csproj
```
Expected: All tests pass (Excel tests have been removed, no regression)

- [ ] **Step 3: 最终提交（如果有修复）**

```bash
git add -A && git commit -m "fix: post-i18n cleanup and fixes"
```
