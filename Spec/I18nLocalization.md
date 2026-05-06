# 策划表本地化（i18n）导出设计

> 版本: 1.0
> 日期: 2026-05-06

## 概述

为 LightyDesign 策划表导出系统增加本地化支持。核心思路是将导出文本与运行时翻译解耦，通过键值映射实现多语言切换。

### 数据流

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      LightyDesign 导出阶段                               │
│                                                                         │
│  策划表 (JSON 文本文件)                                                   │
│    └── 类型为 LocalString 的列                                            │
│          │                                                                │
│          ├──▶ C# 代码导出                                                 │
│          │     生成: new LocalString("a1b2c3_d4e5f6_g7h8i9")             │
│          │                                                                │
│          └──▶ YAML 映射导出                                               │
│                 └── I18nMap/zh-cn/                                        │
│                      ├── Monster.yaml                                    │
│                      ├── Item.yaml                                       │
│                      └── i18n_manifest.yaml                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      游戏项目 (Unity) 运行阶段                            │
│                                                                         │
│  ┌──────────────┐    ┌─────────────────────────┐                        │
│  │ 导出的 C#     │───▶│ LocalString.cs           │                       │
│  │ 数据代码      │    │  - 静态字典 Dictionary    │                       │
│  │              │    │  - LoadLanguage(code)     │                       │
│  └──────────────┘    │  - ToString() → 查表      │                       │
│                       │  - OnLanguageChanged 事件 │                       │
│                       └─────────────────────────┘                       │
│                                ▲                                         │
│                                │ 加载                                     │
│                          ┌─────┴──────────────┐                         │
│                          │ I18nMap/zh-cn/      │                         │
│                          │  ├─ Monster.yaml    │                         │
│                          │  ├─ Item.yaml       │                         │
│                          │  └─ i18n_manifest   │                         │
│                          └────────────────────┘                         │
│                                                                         │
│  主菜单切换语言 → LocalString.LoadLanguage("en-us")                      │
│                 → 加载 I18nMap/en-us/ 目录下对应 YAML                    │
│                 → 触发 OnLanguageChanged → UI 刷新                       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. 类型系统

### 1.1 LocalString 类型

LocalString 是**特殊类型**，不是基本类型。在 `LightyColumnTypeDescriptor` 中新增分类：

| 属性 | 说明 |
|------|------|
| `IsLocalString` | 列为 LocalString 类型时为 true |
| 基本类型 | 不可作为 Dictionary 的 Key |
| 值语义 | 数据层面值 = 字符串，导出时特殊处理 |

### 1.2 支持形式

- `LocalString` — 单列
- `List<LocalString>` — 列表中的每个元素导出独立键值对
- 不支持 `Dictionary<K, LocalString>`（键值场景用不上，且 LocalString 不适合做 Value 类型用于运算）

各语言从 i18n_manifest.yaml（仅存在于源语言目录）获取文件列表，然后到当前语言目录下加载对应 YAML 文件。

### 1.3 值解析

LocalString 的解析与 `string` 完全相同。解析结果存储为普通字符串，导出时才生成键和映射。

### 1.4 Excel 导入导出

**移除整个 Excel 导入/导出功能**（`LightyWorkbookExcelExporter.cs`、`LightyWorkbookExcelImporter.cs`、`ExcelHeaderValueConverter.cs` 等关联文件）。

---

## 2. 键生成

### 2.1 键格式

```
{idHash}_{fieldHash}_{textHash}
```

各部分由 `_` 拼接，每部分为 CRC32 哈希的 8 位十六进制小写字符串。

### 2.2 各组成部分

| 部分 | 输入 | 处理方式 |
|------|------|---------|
| `idHash` | 复合 ID 的拼接 | 所有 ID 列按定义顺序 `.ToString()`，用 `_` 拼接，再 CRC32 |
| `fieldHash` | 字段名 | 直接 CRC32 |
| `textHash` | 源文本 | 直接 CRC32 |

### 2.3 示例

```
复合 ID: Id1=10012, Id2=13, Id3=1
字段名:   itemName
源文本:   钢铁长剑

ID 字符串:     "10012_13_1"     → CRC32 → "a1b2c3d4"
字段名字符串:  "itemName"       → CRC32 → "e5f6g7h8"
源文本字符串:  "钢铁长剑"        → CRC32 → "i9j0k1l2"

最终键: "a1b2c3d4_e5f6g7h8_i9j0k1l2"
```

### 2.4 边界情况

| 场景 | 处理 |
|------|------|
| 无 ID 列表 | ID 拼接为空字符串 `""` → CRC32("") |
| 空文本 | 生成 `new LocalString("")`，YAML 不导出该条目 |
| 空单元格 | 同上 |

### 2.5 键的稳定性

- 键仅依赖：ID、字段名、源文本
- 增删行不改变已有行的 ID → 已有键稳定
- 源文本变化 → 新哈希 → 新键 → 旧键自动被下一轮其他语言导出时清理

---

## 3. YAML 映射文件

### 3.1 文件格式

运行时使用 **YamlDotNet** 解析。仅包含一层平铺键值对：

```yaml
# Item.yaml
# 由 LightyDesign 自动生成
# 源语言: zh-cn

# Item.Name
a1b2c3_d4e5f6_g7h8i9: 钢铁长剑

# Item.Description
j4k5l6_m7n8o9_p1q2r3: |
  一把普通的铁质长剑，
  新手装备。

# Item.Tags[0]
s7t8u9_v0w1x2_y3z4a5: 武器
# Item.Tags[1]
b6c7d8_e9f0g1_h2i3j4: 可锻造
```

生成规则：
- 每行键值前加 `# 工作表名.字段名` 注释，标明来源
- 多行文本用 `|` 保留换行
- 含特殊字符（`:`, `#`, `[]`, `{}`, `,`）的值自动用引号包裹
- 注释不会让翻译人员意外改坏结构（只需要关注 `key: value` 行）

### 3.2 目录结构

```
{输出目录}/
├── Generated/
│   ├── MonsterTable.cs
│   ├── ItemTable.cs
│   ├── LocalString.cs          ← 运行时类型（生成到代码目录）
│   └── ...
└── I18nMap/                    ← 路径可独立配置
    └── zh-cn/                  ← 源语言
        ├── Monster.yaml
        ├── Item.yaml
        ├── Skill.yaml
        └── i18n_manifest.yaml  ← 清单文件

    ├── en-us/                  ← 翻译语言（翻译团队提供）
    │   ├── Monster.yaml
    │   ├── Item.yaml
    │   └── Skill.yaml
    └── ja-jp/
        ├── Monster.yaml
        └── ...
```

### 3.3 索引清单文件（i18n_manifest.yaml）

仅存在于**源语言目录**中，运行时用它获取文件列表：

```yaml
version: 1
workbooks:
  - name: Monster
    file: Monster.yaml
  - name: Item
    file: Item.yaml
  - name: Skill
    file: Skill.yaml
```

运行时加载流程：
1. 读取当前语言目录的上级目录中，源语言目录的 `i18n_manifest.yaml`
2. 获取工作簿文件列表
3. 遍历到当前语言目录下加载每个 YAML 文件
4. 如某文件缺失 → 报错，告知哪个语言缺少哪个工作簿的本地化文件

### 3.4 导出更新策略

#### 源语言（zh-cn）

- **每次全量覆盖** YAML 内容（策划表即为源文本，表中的值就是最终值）
- manifest 同步更新

#### 其他语言（en-us, ja-jp 等）

差异更新算法：

```
输入: 新导出的键值对集合 (newKeys)
      当前语言目录下已有的 YAML 文件 (existingYaml)

处理:
  for each key in newKeys:
    if key 已在 existingYaml 中:
      保留 existingYaml 中的值（翻译已有，保留）
    else:
      追加 key + 空值或占位（待翻译）

  for each key in existingYaml:
    if key 不在 newKeys 中:
      从 YAML 中删除该条目（源文本已删除）

输出: 更新后的 YAML 文件
```

### 3.5 工作簿无 LocalString 列的处理

当一个工作簿不再有 LocalString 列（或工作簿被删除）：
- 下一次该工作簿导出代码或导出 YAML 时
- 自动删除其 YAML 文件
- 更新 manifest 移除该记录

---

## 4. C# 代码生成

### 4.1 数据代码改动

生成的 Row 类型中，LocalString 列使用 `LocalString` 类型而非 `string`：

```csharp
public partial class MonsterTable
{
    public class Row
    {
        public int Id;
        public string Name;              // 普通 string 不变
        public LocalString Description;  // LocalString 列
        public List<LocalString> Tags;   // List<LocalString> 列
    }

    public static readonly MonsterTable Instance = new MonsterTable
    {
        Rows = new List<Row>
        {
            new Row
            {
                Id = 1001,
                Name = "Slime",
                Description = new LocalString("a1b2c3_d4e5f6_g7h8i9"),
                Tags = new List<LocalString>
                {
                    new LocalString("a1b2c3_j4k5l6_m7n8o9"),
                    new LocalString("a1b2c3_p4q5r6_s7t8u9"),
                }
            }
        }
    };
}
```

### 4.2 LocalString 运行时类型

生成单个文件 `LocalString.cs`，输出到**代码输出目录**（如 `Generated/`），所有数据文件共用。

> **依赖说明**：游戏项目需要引入 [YamlDotNet](https://github.com/aaubry/YamlDotNet) NuGet 包。

```csharp
// 由 LightyDesign 自动生成
using System.Collections.Generic;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

public class LocalString
{
    private static Dictionary<string, string> _currentMap = new();
    private static string _currentLanguage = "zh-cn";
    private static string _sourceLanguage = "zh-cn";     // 源语言（由导出配置决定）
    private static string _basePath = "";
    
    public static event System.Action OnLanguageChanged;
    
    private string _key;
    
    public LocalString(string key) => _key = key;
    
    public override string ToString()
    {
        if (string.IsNullOrEmpty(_key)) return "";
        return _currentMap.TryGetValue(_key, out var value) ? value : _key;
    }
    
    public static void Initialize(string basePath, string sourceLanguage, string language)
    {
        _basePath = basePath;
        _sourceLanguage = sourceLanguage;
        LoadLanguage(language);
    }
    
    public static void LoadLanguage(string language)
    {
        _currentLanguage = language;
        _currentMap.Clear();
        
        // 读取源语言目录的 manifest 获取文件列表
        var manifestPath = Path.Combine(_basePath, _sourceLanguage, "i18n_manifest.yaml");
        var manifest = LoadManifest(manifestPath);
        
        // 从目标语言目录加载每个 YAML 文件
        foreach (var wb in manifest.Workbooks)
        {
            var yamlPath = Path.Combine(_basePath, language, wb.File);
            if (!File.Exists(yamlPath))
            {
                throw new FileNotFoundException(
                    $"本地化文件缺失：语言 '{language}' 缺少工作簿 '{wb.Name}' 的映射文件，期望路径: {yamlPath}");
            }
            LoadYamlFile(yamlPath);
        }
        
        OnLanguageChanged?.Invoke();
    }
    
    private static void LoadYamlFile(string path)
    {
        var yaml = System.IO.File.ReadAllText(path);
        var deserializer = new DeserializerBuilder()
            .WithNamingConvention(UnderscoredNamingConvention.Instance)
            .Build();
        var entries = deserializer.Deserialize<Dictionary<string, string>>(yaml);
        foreach (var kv in entries)
        {
            _currentMap[kv.Key] = kv.Value;
        }
    }
}
```

---

## 5. 工作区配置

### 5.1 配置模型

在 `LightyWorkbookCodegenOptions` 中增加 I18n 配置：

```csharp
public class LightyWorkbookCodegenOptions
{
    public string OutputRelativePath { get; set; } = "Generated";
    public I18nCodegenOptions I18n { get; set; } = new();
}

public class I18nCodegenOptions
{
    // I18nMap 输出相对路径，独立于代码输出路径
    public string OutputRelativePath { get; set; } = "../I18nMap";
    
    // 源语言代码（策划表编写用的语言）
    public string SourceLanguage { get; set; } = "zh-cn";
}
```

### 5.2 配置文件（codegen.json）

```json
{
    "outputRelativePath": "Generated",
    "i18n": {
        "outputRelativePath": "../I18nMap",
        "sourceLanguage": "zh-cn"
    }
}
```

### 5.3 前端 UI

在 `CodegenDialog.tsx` 的导出选项中增加 I18n 配置区域：

- ✅ **启用本地化导出**（checkbox/toggle）
- **I18nMap 路径**（路径输入 + 目录选择器，可选，默认 `../I18nMap`）
- **源语言**（文本输入，默认 `zh-cn`）

---

## 6. 运行时 API

### 6.1 初始化

```csharp
// 游戏启动时
LocalString.Initialize(
    basePath: Application.streamingAssetsPath + "/I18nMap",
    sourceLanguage: "zh-cn",
    language: "zh-cn"
);
```

### 6.2 切换语言

```csharp
// 主菜单切换语言
LocalString.LoadLanguage("en-us");
// → 自动触发 OnLanguageChanged 事件
// → UI 监听事件刷新文本
```

### 6.3 使用

```csharp
// 数据代码中使用
var desc = monsterRow.Description.ToString();  // → 从当前语言映射表查值

// 或直接声明
var text = new LocalString("a1b2c3_d4e5f6_g7h8i9");
Debug.Log(text.ToString());
```

### 6.4 缺少文件处理

运行时加载时，若目标语言目录缺少某工作簿的 YAML 文件，抛出明确错误：

```
本地化文件缺失：语言 'en-us' 缺少工作簿 'Monster' 的映射文件，期望路径: .../I18nMap/en-us/Monster.yaml
```

---

## 7. 删除项

- 移除 Excel 导入/导出相关所有文件：
  - `LightyWorkbookExcelExporter.cs`
  - `LightyWorkbookExcelImporter.cs`
  - `ExcelHeaderValueConverter.cs`
  - 前端 Excel 导入/导出 UI

---

## 8. 实施要点

1. 类型系统：`LightyColumnTypeDescriptor` 新增 `IsLocalString` 属性
2. CRC32 工具方法：用于键生成
3. 代码生成器：识别 LocalString 列 → 输出 `new LocalString("key")` + 收集键值对
4. YAML 写入器：按工作簿分组写入 + 差异更新逻辑
5. manifest 写入器：文件列表 + 增删同步
6. `LocalString.cs` 模板：运行时类型
7. 配置模型 + UI：路径和语言设置
8. 移除 Excel 导入导出
