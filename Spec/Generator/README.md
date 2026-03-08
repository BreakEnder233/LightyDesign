# Generator 子系统

## 职责

Generator 子系统对应 src/LightyDesign.Generator。它负责把策划表协议转换为可被项目直接使用的 C# 代码，包括 LDD 入口、工作簿容器、表结构、索引器和数据初始化代码。

## 当前已完成的工作

1. 已创建 .NET 类库项目骨架。
2. 已加入解决方案。
3. 已建立对 Core 的项目引用。
4. 已通过解决方案构建验证。

## 当前尚未实现的业务能力

1. 根据表头生成字段类型与数据类。
2. 生成 LDD.<Workbook>.<Table> 访问结构。
3. 生成单 ID 与复合 ID 的索引器代码。
4. 生成 List<Ref:...> 对应的引用封装代码。
5. 输出大型初始化代码文件。

## 与 Core 的当前关系

截至目前，Generator 已经可以依赖 Core 中已落地的以下能力作为输入基础：

1. `LightyWorkspace`、`LightyWorkbook`、`LightySheet` 等工作区与表结构模型。
2. `LightySheetHeader` 与 `ColumnDefine` 提供的列定义和字段类型描述。
3. `LightyColumnTypeDescriptor` 提供的 List、Dictionary、Ref 等类型形状信息。
4. `LightyReferenceValue` 和惰性值解析层所沉淀的基础值语义。

这意味着 Generator 后续应建立在 Core 提供的统一协议模型之上，而不应重新解析 `_header.json` 或 txt 数据文本。

## 当前状态结论

Generator 目前仍处于工程骨架阶段，尚未承载真实生成逻辑。但由于 Core 已经具备可消费的协议模型，后续生成器实现时应直接围绕这些模型构建代码输出，而不是重复承担协议解析职责。
