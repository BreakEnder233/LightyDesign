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
	- 一个根目录级的引用支持文件，用于承载生成出的泛型引用类型。
4. 已支持根据 Sheet 表头生成：
	- 行类型。
	- 表类型。
	- 行初始化代码。
	- `LDD.<Workbook>.<Table>` 访问结构。
5. 已支持单 ID 索引生成。
6. 已支持连续 `ID1`、`ID2`、... 形式的复合 ID 索引生成。
7. 当表不含 `ID` 或连续 `ID1`、`ID2`、... 时，已支持回退使用首个可导出列作为键值生成索引访问。
8. 已支持按 `ExportScope` 过滤输出列，其中 `None` 列不会进入生成结果。
9. 已支持 Client/Server 双份导出代码使用预处理指令分隔：
	- 仅客户端代码输出在 `#if LDD_Client` 块内。
	- 仅服务器代码输出在 `#if LDD_Server` 块内。
	- 同一 scope 的成员和初始化代码会尽量聚合，避免过多穿插预处理指令。
10. 已支持 `string`、`int`、`long`、`float`、`double`、`bool` 以及其 `List<>`、`Dictionary<,>`、`Ref<>`、`List<Ref<>>` 组合的 C# 类型映射和初始化字面量生成。
11. 已支持生成泛型引用类型 `DesignDataReference<TTarget>`：
	- 初始化时写入目标 Workbook、目标 Sheet 和 ID 序列。
	- 支持单 ID 与复合 ID 引用。
	- 暴露 `GetValue()` 用于解析并返回目标数据行。
12. 已支持工作簿级代码生成配置 `codegen.json`，用于保存相对工作区根目录的输出路径。
13. 已支持将生成结果写入目标目录下固定的 `Generated` 子目录，并在每次导出前清空该子目录后重写生成内容。
14. 已通过单元测试验证生成结果、索引结构、预处理分组、引用代码生成和输出路径配置约束。

## 当前尚未实现的业务能力

1. 尚未提供可配置的分片阈值或按估算代码体积的更细粒度拆分策略；当前仅支持代码内写死阈值的按行数分片。
2. 尚未支持 `Generated/Workbooks` 与 `Generated/FlowCharts` 双目录输出。
3. 尚未支持节点定义 partial class 骨架生成。
4. 尚未支持流程图结构类、flow 运行时类型和 context 关联入口生成。
5. 尚未支持流程图标准节点的类型参数实例化、内置绑定签名解析和重载族选路。

## 与 Core 的当前关系

当前 Generator 明确建立在 Core 提供的统一协议模型之上，直接消费以下能力作为输入：

1. `LightyWorkspace`、`LightyWorkbook`、`LightySheet` 等工作区与表结构模型。
2. `LightySheetHeader` 与 `ColumnDefine` 提供的列定义和字段类型描述。
3. `LightyColumnTypeDescriptor` 提供的 List、Dictionary、Ref 等类型形状信息。
4. `DefaultLightyValueParser` 提供的单元格运行时值解析能力。
5. `LightyWorkbookCodegenOptions` 提供的工作簿级代码生成输出配置。
6. `LightyReferenceValue` 提供的引用 ID 序列语义。

这意味着 Generator 不负责重新解析 `_header.json` 或 txt 数据文本，而是建立在 Core 已完成的工作区加载、列类型解析和单元格值解析结果之上。

## 当前导出流程

当前代码生成闭环已经具备基础工作流：

1. 工作簿保存 `codegen.json`，记录输出目录相对路径。
2. DesktopHost 读取工作区与工作簿模型。
3. Generator 生成内存中的代码文件包。
4. DesktopHost 将生成结果写入工作区内目标目录的 `Generated` 子目录。
5. DesktopHost 在导出前清空该 `Generated` 子目录中的旧生成文件，再写入新的 `LDD.cs`、引用支持文件与 Workbook 代码。

导出时如果工作簿未配置输出相对路径，应视为配置不完整并拒绝执行导出。

当前每次导出都会重建目标目录下 `Generated` 子目录的全部生成结果，因此同一次导出内会统一重建对应的 `LDD.Initialize()` 初始化链。

当前这一版的输出组织约定已经明确为：

1. 目标输出目录本身允许保留非生成文件。
2. 所有生成代码统一写入目标输出目录下的 `Generated` 子目录。
3. `Generated` 子目录下存在唯一的全局入口 `LDD.cs`。
4. `Generated` 子目录下存在统一的基础引用支持文件。
5. 每个 Workbook 对应 `Generated` 子目录下的一个同名文件夹。
6. 每个 Workbook 文件夹内包含该 Workbook 的主文件以及所属 Sheet 文件。

所有导出的代码及类型都位于 `LightyDesignData` 命名空间，且所有生成类型均为 `partial`。

## 生成代码兼容性约束

为保证生成结果可用于 Unity 和较低版本 C# 编译环境，Generator 输出必须遵循以下约束：

1. 生成代码必须优先使用兼容性更高的语法和 BCL API，不能依赖较新的辅助方法或语法糖。
2. 禁止在生成代码中使用 `ArgumentNullException.ThrowIfNull`、`ArgumentException.ThrowIfNullOrWhiteSpace` 等较新的参数校验辅助 API；统一改用显式 `if (...) throw ...` 写法。
3. 禁止在生成代码中使用 target-typed `new()`、`using var`、nullable reference type 注解等会提高语言版本要求的语法。
4. 当需要表达“可为 null 的引用”时，生成代码应继续使用传统引用类型写法，并通过显式空判断控制行为，而不是依赖 `T?` 注解。
5. 新增或调整生成模板时，必须先评估 Unity 常见编译环境与低版本 C# 的可接受范围；若存在歧义，默认选择更保守的语法。
6. 相关单元测试需要覆盖这些兼容性约束，至少要防止新的生成输出重新引入上述现代 API 或语法。

## 当前大表初始化拆分规则

对于超过固定阈值的大表，当前实现遵循以下规则：

1. 分片阈值写死在 Generator 代码中，不从 UI 或 `codegen.json` 读取。
2. 小表继续生成单个 Sheet 文件；超过阈值时，会额外生成若干数据分片文件。
3. 分片文件命名使用 `SheetName_DataN.cs` 形式，避免文件名中间出现点号。
4. 主 Sheet 文件保留 Row 类型、Table 类型、索引类型和 `Create()` 入口。
5. 数据分片文件使用同一个 `partial` Table 类型，分别承载 `AppendDataN` 之类的填充方法。
6. `Create()` 会先创建空列表，再顺序调用各个分片填充方法，最后统一构造 Table 和索引。
7. 分片只影响初始化代码的物理组织方式，不改变现有 `LDD -> Workbook -> Table` 的访问模型。

## 当前 Ref 生成规则

对于 `Ref:Workbook.Sheet` 与 `List<Ref:Workbook.Sheet>`，当前实现遵循以下规则：

1. 生成字段类型使用 `DesignDataReference<TTarget>` 或其列表形式。
2. `TTarget` 对应目标 Sheet 的生成行类型。
3. 初始化时会写入：目标 Workbook 名、目标 Sheet 名、以及引用值中的 ID 序列。
4. 同时会生成一个强类型 resolver 委托，通过 `LDD.<Workbook>.<Sheet>` 访问链解析目标数据行。
5. 当目标表使用单 ID 时，resolver 生成单层索引访问；当目标表使用连续 `ID1`、`ID2`、... 时，resolver 生成多层索引访问。

## 当前 ExportScope 生成规则

对于 `ExportScope`，当前实现遵循以下规则：

1. `All` 成员始终直接生成。
2. `Client` 成员生成在 `#if LDD_Client` 块内。
3. `Server` 成员生成在 `#if LDD_Server` 块内。
4. 同一 scope 的属性声明、对象初始化赋值和相关代码会尽量连续输出，避免过多预处理切换。
5. Sheet 行类型中的列成员以带 `get; set;` 的属性形式生成。
6. 因为需要按 scope 分块，单行对象初始化已放宽为多行初始化输出。

## 当前索引键选择规则

对于表级索引访问，当前实现遵循以下规则：

1. 若存在 `ID` 列，则优先使用 `ID` 作为单键索引。
2. 若不存在 `ID`，但存在连续 `ID1`、`ID2`、...，则使用它们生成复合索引。
3. 若以上两种形式都不存在，则回退使用首个可导出列作为单键索引。
4. 若表没有任何可导出列，则不会生成索引访问器。

## 测试覆盖

当前测试已覆盖以下核心行为：

1. 生成 Sheet 文件、Workbook 文件和 `LDD.cs` 入口文件。
2. 单 ID 索引生成。
3. 复合 ID 索引生成。
4. 无 ID/复合 ID 时回退首列作为键的索引生成。
5. `Generated` 子目录写入与清理行为。
6. Client/Server 预处理分组生成。
7. `Ref`、复合 `Ref` 与 `List<Ref>` 的代码生成。
8. 超过阈值时的大表分片文件生成。
9. 缺失输出路径时的失败行为。

## 未来 FlowChart 泛型节点生成约定

对于后续 FlowChart 生成链路，生成器应遵循以下原则：

1. 先解析节点实例的 concrete `typeArguments` 与最终绑定签名，再开始输出目标语言代码。
2. `List<T>`、`Dictionary<TKey, TValue>` 这类标准节点优先映射到泛型 helper 或泛型 partial 模板。
3. `Add`、比较、相等等标准节点可映射到重载 helper，但生成器必须在导出前收敛到唯一具体签名，不应输出 `object` 级调用等待编译器兜底。
4. 若节点实例仍处于“未定型”或“二义性”状态，导出必须失败并返回明确诊断。
5. 为保证 Unity 与较低版本 C# 兼容性，数值多态优先采用显式重载 helper，不依赖 .NET 新版本 generic math。

## 当前状态结论

Generator 已经从工程骨架阶段进入可用的第一版实现阶段，能够围绕 Core 的统一协议模型生成基础 C# 访问代码，并接入到工作簿级导出流程中。当前输出结构已经明确为“目标目录保留业务文件，所有生成结果集中写入其 `Generated` 子目录”，同时所有生成类型均使用 `partial`，Sheet 列成员以可读写属性形式输出。引用类型、Client/Server 预处理分组、统一命名空间和大表初始化分片都已经进入可用状态。后续工作的重点主要转向更细粒度的大表优化，以及可能的更通用运行时引用解析机制。
