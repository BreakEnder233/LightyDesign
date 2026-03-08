# LightyDesign 策划表编辑器 — 规范说明

本文件为 LightyDesign 项目的规格与数据约定（用于前端编辑器、后端解析、导出与代码生成）。本项目采用 Web + Electron 方案，后端以 C# 为主。

## 当前仓库状态

当前仓库已经完成第一阶段工程搭建，重点成果如下：

1. 已创建 .NET 解决方案与基础项目：Core、FileProcess、Generator、DesktopHost、Tests。
2. 已创建 Electron + React + Vite 的桌面前端骨架。
3. 已完成 Electron 与 DesktopHost 的本地接入，桌面端可自动拉起宿主并读取健康状态。
4. 已补充一键引导脚本、根 README 和仓库级 .gitignore。
5. 已在 Core 中落地第一批工作区模型、协议加载器和惰性值解析基础设施。

这意味着当前仓库已经具备“可构建、可运行、可继续迭代”的基础，但业务协议的大部分实现仍待补充。

## 子系统文档导航

为了让 Spec 不只描述理想设计，也能同步记录当前工程进展，Spec 目录已经按子系统拆分出独立文档：

1. Core 子系统：见 [Core/README.md](Core/README.md)
2. FileProcess 子系统：见 [FileProcess/README.md](FileProcess/README.md)
3. Generator 子系统：见 [Generator/README.md](Generator/README.md)
4. DesktopHost 子系统：见 [DesktopHost/README.md](DesktopHost/README.md)
5. DesktopApp 子系统：见 [DesktopApp/README.md](DesktopApp/README.md)
6. Tests 子系统：见 [Tests/README.md](Tests/README.md)
7. Tooling 子系统：见 [Tooling/README.md](Tooling/README.md)

建议阅读顺序：

1. 先读本文件，理解整体协议和目录约定。
2. 再读 DesktopApp 与 DesktopHost，理解当前可运行链路。
3. 最后读 Core 与 Generator，规划协议实现和导出实现。

## 概览
- 名称：LightyDesign（策划表编辑器）
- 工作区：一个文件夹，每个工作簿（LightyWorkbook）对应一个子文件夹，内含多个表格文件（LightySheet）及对应表头文件。

## 当前工程对应关系

当前仓库中的主要实现目录与本规格的关系如下：

```text
LightyDesign/
  Spec/                    <- 规格与当前子系统状态说明
  src/LightyDesign.Core/   <- 未来承载文件协议与领域模型
  src/LightyDesign.FileProcess/ <- 当前承载 xlsx 与 Core 模型的双向转换
  src/LightyDesign.Generator/ <- 未来承载 C# 代码生成
  src/LightyDesign.DesktopHost/ <- 当前本地 .NET 宿主 API
  tests/LightyDesign.Tests/ <- 测试项目
  app/desktop/             <- Electron + React + Vite 桌面应用
  ShellFiles/              <- 一键引导和后续脚本入口
```

这份映射的目的是帮助实现者区分“规格写在哪里”和“代码应该落在哪里”。

## 当前 Core 实施状态

截至目前，Core 子系统已完成以下第一阶段实现：

1. 已实现 `LightyWorkspace`、`LightyWorkbook`、`LightySheet`、`LightySheetHeader`、`ColumnDefine`、`LightySheetRow` 等核心对象。
2. 已实现工作区级 headers.json 与 Sheet 级 _header.json 的文件读取与反序列化。
3. 已实现 txt 文件的转义/反转义、行列拆分与数据行加载。
4. 已实现 `[[...]]` 引用语法的基础解析模型。
5. 已实现按需触发的值解析层，支持单元格级缓存，且普通显示和普通编辑不会触发解析。

## 当前 FileProcess 实施状态

截至目前，FileProcess 子系统已完成以下第一阶段实现：

1. 已实现一个 xlsx 文件映射为一个 `LightyWorkbook`。
2. 已实现一个 Worksheet 映射为一个 `LightySheet`。
3. 已实现由 `WorkspaceHeaderLayout` 驱动的多行表头导入导出。
4. 已实现从 Excel 导入时重建 `ColumnDefine`，并允许表头变更回写到 Core 模型。
5. 已补充 Excel workbook round-trip 和导入错误场景测试。

这部分能力意味着后续 DesktopHost 已可以在 Core 之上继续实现真实工作区扫描 API，而不需要再重复定义文件协议。

## 文件与目录约定

- 工作区文件夹：任意名称的文件夹，代表整个工作空间，内含有若干个工作簿文件夹和一个config.json文件和一个headers.json文件
  - config.json文件（目前无作用）：用于工作空间全局设置。
  - headers.json：表示该工作区的表头从上到下每一行的类型和配置。

- 工作簿文件夹：任意名称的文件夹，代表一个工作簿（LightyWorkbook）。示例：Item/
  - 工作簿内包含数个表格，每个表格对应两个文件，例如Consumable表格对应Consumable.txt文件和Consumable_header.json文件。
  - 表格数据文件：以 `.txt` 结尾，每个文件代表一个 `LightySheet`。文件名（不含扩展名）为表名。
  - 表头文件：以 `_header.json` 结尾（同前缀），用于描述该表的表头数组与各类元数据。

示例目录：

```
Workspace/
  config.json
  headers.json
  Item/
    Consumable.txt
    Consumable_header.json
    Weapon.txt
    Weapon_header.json
  Level/
    TestLevel.txt
    TestLevel_header.json
    Level.txt
    Level_header.json
```

## _header.json（Sheet 表头数组）

每个表的 `_header.json` 文件结构为一个 JSON 对象，其中包含一个数组，数组每个元素为一个对象，必须包含字段：

- `headerType` (string)：表示该表头条目的类型（例如 `FieldName`、`DisplayName`、`Type`、`Validation`、`ExportScope` 等）。
- `value` (object)：与 `headerType` 对应的Json数据，用于反序列化为对应的表头类型。

当前实现说明：Core 当前对 Sheet 表头支持两种输入形式：

1. 直接给出列定义数组。
2. 给出按 `headerType` 分行的数组，再由 Core 投影为 `ColumnDefine` 集合。

无论输入形式如何，运行时公共模型都以“从左到右的列定义集合”为主。

## 数据文件格式（.txt）

- 每行为一条数据记录（即表格的一行）。
- 字段间以制表符（Tab, `\t`）分隔。
- 换行使用 CRLF（`\r\n`）为标准；但读取时需兼容仅 LF 或仅 CR 的文件。
- 为避免与分隔符冲突，明文数据在写出到文件时需要做反转义处理：将内部的换行符与制表符替换为可识别的转义表示（或编码），以保证文件行/列不被误拆分；读取时反向还原。
- 反转义方案：写入到文件时，首先将原文中的&替换为&&a&&，然后将\t替换为&&t&&，将\n替换为&&n&&。注意：需要在一次替换内完成转义或反转义。

示例（伪）一行：

```
1001	Sword of Dawn	1,2,3	[[2001]]
```

## 表头类型（必须项与可选项）

1. `FieldName`（必须）：英文标识符，用于代码导出时的字段名。
2. `Type`（必须）：英文字符串或泛型形式，表示字段类型（如 `int`、`string`、`List<int>`、`List<Ref:OtherSheet>`）。其中，我们使用Ref:Item.Consumable表示引用来自于Item工作簿的Consumable表。
3. `DisplayName`（可选）：UTF-8 字符串，用于 UI 表头显示。
4. 其它可选类型：`Validation`（字段验证规则）、`ExportScope`（导出范围：Client/Server/All）等，均以 `headerType` 进行扩展。

实现者应把表头按语义行（多行）解析为列的元信息集合，支持复数行不同作用（例如第1行为 `FieldName`，第2行为 `DisplayName`，第3行为 `Type`）。

## 数据值规范

- 简单数组（List<int>/List<string>）：逗号分隔。
  - 示例：`1,2,3,6,12`
  - 字符串数组示例：`"Hello","it's","fun"`（建议 CSV 风格的引号与转义规则）。
- 简单字典（Dictionary<int,string>）：以 `{k, "v"}` 形式的逗号分隔项。
  - 示例：`{1, "Hello"}, {2, "it's"}, {6, "nice"}`

当前实现说明：值解析层采用惰性策略。表格在普通展示和普通文本编辑时不解析这些字面值；只有在显式请求真实值时，才按列类型解析为标量、列表、字典或引用对象。

当前实现说明：Excel 导入导出当前以这些单元格的原始字符串表示为主，不依赖值解析层即可完成 xlsx 与工作区模型之间的转换。

## 策划数据引用语法

- 单项引用/复合引用采用 `[[...]]` 包裹：
  - 单 ID：`[[1234]]`
  - 复合 ID：`[[id1,id2,...]]`
  - 当字段为 `List<>` 且列类型为引用时，明文数据表现为多项引用用逗号或其它分隔符分隔的 `[[...]]` 序列，例如：
    - `[[1001]], [[1002]], [[1003]]`
    - 对于复合 ID 列：`[[1,2]], [[2,3]]`

解析器须能够识别并解析 `[[...]]` 内的整数/字符串标识，以及复合 ID 列表。

## 导出与代码生成行为

- 每个表（`LightySheet`）导出为静态类型 `LDD`（表示LightyDesignData）中的一个成员集合，访问约定为：`LDD.<WorkbookName>.<TableName>` ，例如 `LDD.Item.Consumable`。
- 对于包含单列 `ID` 的表：导出代码应提供按 ID 索引的访问方式，例如 `LDD.Item[id]` 返回一条记录或强类型对象。
- 对于不存在单列 `ID` 但存在 `ID1,ID2,...,IDn` 的情形：生成中间索引类型并重写索引器以支持链式访问：`LDD.Item[id1][id2]...[idn]`。

- 导出器需要在生成代码时为每个工作簿产生
  - C# 类型定义（LDD下的公共子静态类型）
  - 静态容器/索引器/加载器方法

- 导出器需要在生成代码时为每个表产生
  - C# 类型定义（字段名称和类型基于表头）
  - 静态容器/索引器/加载器方法
  - 数据初始化代码（将整个数据表转换为一个大型C#文件，用于初始化整个策划表）
  - 必要时生成复合索引中间类型与嵌套索引器。

## 关系推导（1:N / N:N）

- 若表头中某列类型声明为 `List<Ref:OtherSheet>` 或类似形式，则该字段表示一对多关系，表格中的数据以 `[[id]]` 或 `[[id1,id2]]` 形式列出引用项。
- 导出器生成时，需要将该字段转换为 `List<LDDRef<TOtherSheetData>>` 类型：
  - LDDRef内存储了目标工作簿、表名称和id列表，并提供一个接口用于获取目标的TOtherSheetData

## UI 简述

- 左侧：工作簿列表（含搜索），及面向工作簿操作（导出为 C#、导出为Excel、从Excel导入）。
- 右侧：表格编辑区，顶部为表级操作按钮（设置表冻结、表头编辑、验证等）。允许同时打开并编辑多个表格/工作簿，采用标签页进行切换。
- 表格区采用高级表格控件，表头为只读（仅允许通过独立的表头编辑器修改 `_header.json`）。
- 支持在单元格或列级别编辑脚本（脚本在后端执行并受沙箱限制）。
- 遇到一对多的情况下，可以弹出界面以快速跳转到目标工作簿对应表格的对应位置，或是快速添加对应项目。

## 当前 UI 实施状态

当前 UI 侧已经完成的是“桌面壳与宿主接线”，尚未进入“完整编辑器功能”：

1. 已有 Electron 主进程。
2. 已有 React + Vite 渲染层。
3. 已有 preload 安全桥接层。
4. 已有宿主状态展示界面。

尚未完成的部分包括：

1. 真实工作簿树与搜索。
2. 多标签表格编辑器。
3. 表头编辑器。
4. Excel 导入导出界面和与 FileProcess 的宿主接线。
5. 验证规则编辑和脚本编辑界面。

由于 Core 已经具备工作区读取和惰性值解析基础，后续 UI 接入时应优先复用宿主透出的 Core 模型，而不是在前端重写 txt 或 header 解析规则。

## 例子

- `Item.txt`（示例简化）：

```
1001	Sword of Dawn	"weapon","rare"
1002	Shield of Dawn	"armor","common"
```

## 下一步建议

按照当前仓库状态，后续最合理的实施顺序是：

1. 先在 Core 中实现工作区、工作簿、表和表头的基础模型。
2. 再在 DesktopHost 中实现基于 Core 的真实工作区扫描与文件读取接口。
3. 然后接入 FileProcess 到 DesktopHost，暴露 Excel 导入导出能力。
4. 再让 DesktopApp 消费真实接口数据，替换当前占位内容。
5. 再在 Core 中补验证层与更完整的复杂值解析规则。
6. 最后在 Generator 中补齐导出与代码生成链路。

这样可以保证协议层、宿主层和 UI 层按依赖方向逐层落地，而不是在多个子系统里重复实现同一套规则。