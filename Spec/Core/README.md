# Core 子系统

## 职责

Core 子系统对应 src/LightyDesign.Core。它用于承载 LightyDesign 的核心领域模型、文件协议、表头语义、数据值解析和共享基础类型。

## 当前已完成的工作

1. 已完成 Core 项目的基础目录结构与核心类型落位。
2. 已实现工作区、工作簿、表、表头、列定义、数据行等领域模型。
3. 已实现工作区级 headers.json 与 Sheet 级 _header.json 的反序列化和文件加载链路。
4. 已实现 txt 数据文件的读取、行列拆分、转义/反转义以及基础引用语法解析。
5. 已实现 ColumnDefine 的类型描述与已知属性访问器，包括 ExportScope、Validation 和引用目标读取。
6. 已实现第一版惰性值解析层，支持按需解析与单元格级缓存失效。
7. 已实现 `LightyWorkbook` 写回能力，可将工作簿保存为工作区目录下的 `.txt` 和 `_header.json` 文件。
8. 已实现第一版 validation 执行层，支持按主要类型分发规则、导出前校验、手动校验和错误收集。
9. 已实现 validation schema provider，可按 Type 返回字段说明、默认值、示例和嵌套规则结构。
10. 已补充覆盖核心模型、协议读取、写回、值解析和 validation 行为的单元测试，并验证解决方案构建与测试通过。

## 当前尚未实现的业务能力

1. 更完整的复杂值解析协议，例如更严格的 CSV 字符串规则和更丰富的嵌套泛型支持。
2. 更完整的 validation schema 分组、正式版本化与表单化描述能力。
3. 面向 Generator 的更高层字段语义与导出辅助模型。
4. 面向 DesktopHost 的工作区编辑、保存与增量更新接口。
5. 更完整的引用解析上下文与更细的诊断模型。

## 当前已落地的模型与协议

当前 Core 中已经落地的第一批主干对象包括：

1. `LightyWorkspace`：工作区根模型，持有工作区路径、全局 headers 配置和多个工作簿。
2. `LightyWorkbook`：工作簿目录模型，管理多个 `LightySheet`。
3. `LightySheet`：表模型，持有 `.txt` 数据文件、`_header.json` 表头文件、表头对象和数据行集合。
4. `LightySheetHeader` 与 `ColumnDefine`：以列定义为中心的 Sheet 表头模型。
5. `WorkspaceHeaderLayout` 与 `WorkspaceHeaderRowDefinition`：工作区级 headers.json 模型，用于描述表头行语义和全局配置。
6. `LightyTextCodec`：负责 txt 协议中的转义、反转义、行拆分和列拆分。
7. `LightyReferenceValue`：负责 `[[...]]` 引用语法的结构化表示。
8. `LightyWorkbookWriter`：负责把内存中的 workbook 写回工作区文件结构。

## 当前已落地的已知语义

1. `ExportScope` 当前支持 `Client`、`Server`、`All`、`None`。
2. `ExportScope.None` 表示该列在代码导出阶段应被忽略，而不是导出到任一目标端。
3. `Validation` 当前按主要类型分发到标量、List、Dictionary 和 Reference 校验器，并在未填写参数时使用默认值。
4. `Validation` 当前支持 schema 查询与规则结构预校验，供宿主和桌面端编辑器复用。

## 当前已落地的加载与解析能力

当前 Core 已具备以下协议能力：

1. 可从磁盘根目录加载一个完整工作区，并自动扫描工作簿和 Sheet。
2. 可读取工作区级 headers.json。
3. 可读取 Sheet 级 _header.json，并兼容“列定义格式”和“按语义行描述再投影为列定义”的两种输入形式。
4. 可读取 txt 数据文件并完成反转义，生成 `LightySheetRow`。
5. 可按需解析单元格值，当前支持基础标量、List、Dictionary、单引用和引用列表。
6. 可将 `LightyWorkbook` 写回为工作区目录结构，并清理当前工作簿目录下过期的 sheet 文件。

## 当前值解析边界

值解析层当前采用惰性策略，边界如下：

1. 工作区加载阶段不预解析整表值。
2. 普通表格显示和普通文本编辑只读取/写回原始字符串，不触发解析。
3. 只有验证流程或专用引用编辑器等显式请求解析时，才根据列类型执行解析。
4. 当单元格原始值发生变化时，仅清除该格的解析缓存，不影响其它单元格。

## 当前状态结论

Core 已经从“工程骨架”进入“协议层与首版 validation 可用”的状态，当前已经具备工作区读取、表头建模、txt 协议处理、引用结构化、workbook 写回、惰性值解析和 validation/schema 基础能力。后续所有文件协议、值语义和验证逻辑仍应继续优先沉淀在这里，而不是直接写进 UI 或宿主层。
