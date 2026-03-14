# Generator 子系统

## 职责

Generator 子系统对应 src/LightyDesign.Generator。它负责把策划表协议转换为可被项目直接使用的 C# 代码，包括 LDD 入口、工作簿容器、表结构、索引器和数据初始化代码。

## 当前已完成的工作

1. 已完成 Generator 项目接入，并建立对 Core 的正式依赖。
2. 已实现基于 Core 协议模型的代码生成主入口 `LightyWorkbookCodeGenerator`。
3. 已支持按工作簿生成代码包，输出内容包括：
	- 每个 Sheet 一个独立的 C# 文件。
	- 每个 Workbook 一个聚合 C# 文件。
	- 一个全局 `LDD.cs` 入口文件。
4. 已支持根据 Sheet 表头生成：
	- 行类型。
	- 表类型。
	- 行初始化代码。
	- `LDD.<Workbook>.<Table>` 访问结构。
5. 已支持单 ID 索引生成。
6. 已支持连续 `ID1`、`ID2`、... 形式的复合 ID 索引生成。
7. 已支持按 `ExportScope` 过滤输出列，其中 `None` 列不会进入生成结果。
8. 已支持 `string`、`int`、`long`、`float`、`double`、`bool` 以及其 `List<>`、`Dictionary<,>` 组合的 C# 类型映射和初始化字面量生成。
9. 已支持工作簿级代码生成配置 `codegen.json`，用于保存相对工作区根目录的输出路径。
10. 已支持在导出时扫描同一输出目录下已生成的工作簿，并重建聚合后的全局 `LDD.cs` 入口。
11. 已通过单元测试验证生成结果、索引结构和输出路径配置约束。

## 当前尚未实现的业务能力

1. 尚未支持 `Ref:Workbook.Sheet` 和 `List<Ref:...>` 的引用封装代码生成。
2. 尚未处理更复杂的生成目标拆分，例如 Client/Server 分流或多套命名空间策略。
3. 尚未针对超大体量数据生成进一步优化初始化代码的拆分策略。
4. 当前生成结果的目录结构已经明确：目标输出目录根下生成一个全局 `LDD.cs`，并为每个 Workbook 生成一个同名子文件夹。

## 与 Core 的当前关系

当前 Generator 明确建立在 Core 提供的统一协议模型之上，直接消费以下能力作为输入：

1. `LightyWorkspace`、`LightyWorkbook`、`LightySheet` 等工作区与表结构模型。
2. `LightySheetHeader` 与 `ColumnDefine` 提供的列定义和字段类型描述。
3. `LightyColumnTypeDescriptor` 提供的 List、Dictionary、Ref 等类型形状信息。
4. `DefaultLightyValueParser` 提供的单元格运行时值解析能力。
5. `LightyWorkbookCodegenOptions` 提供的工作簿级代码生成输出配置。

这意味着 Generator 不负责重新解析 `_header.json` 或 txt 数据文本，而是建立在 Core 已完成的工作区加载、列类型解析和单元格值解析结果之上。

## 当前导出流程

当前代码生成闭环已经具备基础工作流：

1. 工作簿保存 `codegen.json`，记录输出目录相对路径。
2. DesktopHost 读取工作区与工作簿模型。
3. Generator 生成内存中的代码文件包。
4. DesktopHost 将生成结果写入工作区内目标目录。
5. DesktopHost 扫描该输出目录下已经生成的工作簿，并重新生成聚合后的 `LDD.cs`。

导出时如果工作簿未配置输出相对路径，应视为配置不完整并拒绝执行导出。

这里的聚合规则是：只要某个子目录内存在与目录同名的 Workbook 主文件，就会被视为一个已生成工作簿，并纳入最终的 `LDD.Initialize()` 初始化链。

当前这一版的输出组织约定已经明确为：

1. 输出根目录下存在唯一的全局入口 `LDD.cs`。
2. 每个 Workbook 对应输出根目录下的一个同名文件夹。
3. 每个 Workbook 文件夹内包含该 Workbook 的主文件以及所属 Sheet 文件。

## 测试覆盖

当前测试已覆盖以下核心行为：

1. 生成 Sheet 文件、Workbook 文件和 `LDD.cs` 入口文件。
2. 单 ID 索引生成。
3. 复合 ID 索引生成。
4. 多工作簿场景下的聚合 `LDD.cs` 入口生成。
5. 缺失输出路径时的失败行为。

## 当前状态结论

Generator 已经从工程骨架阶段进入可用的第一版实现阶段，能够围绕 Core 的统一协议模型生成基础 C# 访问代码，并接入到工作簿级导出流程中。当前输出结构也已经明确为“根目录一个 `LDD.cs`，每个 Workbook 一个子文件夹”，并且全局入口已具备对同一输出目录下多个已生成工作簿的聚合初始化能力。后续工作的重点不再是“是否开始生成”，而是继续补齐引用类型和大规模初始化代码等剩余能力。
