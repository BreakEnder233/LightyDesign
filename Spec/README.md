# LightyDesign 规范说明

本文件描述工作区目录、Sheet 文件协议、表头语义以及导出约束。实现状态请分别查看各子系统文档。

## 文档导航

1. [Core/README.md](Core/README.md)
2. [FileProcess/README.md](FileProcess/README.md)
3. [DesktopHost/README.md](DesktopHost/README.md)
4. [DesktopApp/README.md](DesktopApp/README.md)
5. [Tooling/README.md](Tooling/README.md)

## 工作区结构

- 工作区：一个目录，包含 `config.json`、`headers.json` 和多个工作簿子目录。
- 工作簿：一个目录，对应一个 `LightyWorkbook`。
- Sheet：每个表由一对文件组成，分别是 `.txt` 数据文件和 `_header.json` 表头文件。

示例：

```text
Workspace/
  config.json
  headers.json
  Item/
    Consumable.txt
    Consumable_header.json
    Weapon.txt
    Weapon_header.json
```

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

## 表头文件

工作区级 `headers.json` 描述表头从上到下每一行的语义和配置。

Sheet 级 `_header.json` 描述从左到右每一列的定义。当前支持两种输入形式：

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

## 关键表头类型

1. `FieldName`（必须）：英文标识符，用于代码导出时的字段名。
2. `Type`（必须）：英文字符串或泛型形式，表示字段类型（如 `int`、`string`、`List<int>`、`List<Ref:OtherSheet>`）。其中，我们使用Ref:Item.Consumable表示引用来自于Item工作簿的Consumable表。
3. `DisplayName`（可选）：UTF-8 字符串，用于 UI 表头显示。
4. 其它可选类型：`Validation`、`ExportScope` 等，均以 `headerType` 进行扩展。

`ExportScope` 当前取值约定：`Client`、`Server`、`All`、`None`。其中 `None` 表示代码导出时忽略该列。

实现者应把表头按语义行（多行）解析为列的元信息集合，支持复数行不同作用（例如第1行为 `FieldName`，第2行为 `DisplayName`，第3行为 `Type`）。

## 数据值规范

- 简单数组（List<int>/List<string>）：逗号分隔。
  - 示例：`1,2,3,6,12`
  - 字符串数组示例：`"Hello","it's","fun"`（建议 CSV 风格的引号与转义规则）。
- 简单字典（Dictionary<int,string>）：以 `{k, "v"}` 形式的逗号分隔项。
  - 示例：`{1, "Hello"}, {2, "it's"}, {6, "nice"}`

值解析层采用惰性策略。普通展示和普通文本编辑不解析这些字面值；只有验证流程或专用编辑器显式请求时，才按列类型解析为标量、列表、字典或引用对象。

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

## 导出约束

1. 每个表导出到 `LDD.<WorkbookName>.<TableName>`。
2. 单列 `ID` 表支持按 ID 索引访问。
3. 复合 ID 表支持多级索引访问。
4. `List<Ref:...>` 等引用列在导出阶段需要映射到强类型引用对象。

后续实现应继续以 Core 为协议唯一来源，避免在 DesktopHost 或前端重复实现 txt、header 或引用规则。