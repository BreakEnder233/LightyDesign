# FileProcess 子系统

## 职责

FileProcess 子系统对应 src/LightyDesign.FileProcess。它负责在 xlsx 文件与 Core 工作簿模型之间进行双向转换，并作为未来 DesktopHost 暴露 Excel 导入导出能力时的底层适配层。

## 当前已完成的工作

1. 已创建 .NET 类库项目并加入解决方案。
2. 已建立对 Core 的项目引用，并接入 ClosedXML 依赖。
3. 已实现一个 xlsx 文件映射为一个 `LightyWorkbook` 的导入导出主链。
4. 已实现一个 Worksheet 映射为一个 `LightySheet` 的转换规则。
5. 已实现基于 `WorkspaceHeaderLayout` 的多行表头导入导出。
6. 已实现将 Excel 表头导入为 `ColumnDefine` 集合，并允许更新 Sheet 表头定义。
7. 已补充 Workbook round-trip 和导入错误场景测试，并验证解决方案测试通过。

## 当前职责边界

FileProcess 当前明确承担的是“Excel 文件与 Core 模型之间的转换”，不承担以下职责：

1. 不直接写入工作区目录结构。
2. 不直接实现 DesktopHost API。
3. 不负责 Generator 的导出代码生成。
4. 不负责普通单元格值的强类型解析；Excel 导入导出以 Core 的原始字符串表示为主。

## 当前映射规则

1. 一个 xlsx 文件对应一个 `LightyWorkbook`。
2. xlsx 内每个 Worksheet 对应一个 `LightySheet`。
3. 工作表前 N 行由工作区级 `headers.json` 对应的 `WorkspaceHeaderLayout` 决定。
4. 这些表头行用于承载 `FieldName`、`DisplayName`、`Type`、`ExportScope` 等列语义。
5. 表头之后的行作为数据区，按原始字符串读写。

## 当前尚未实现的业务能力

1. 更完整的 Excel 样式控制，例如冻结列、数据验证、颜色语义和批量格式规则。
2. 更丰富的导入错误恢复与局部容错策略。
3. 与 DesktopHost 的上传下载接口接线后的保存编排。
4. 与工作区落盘写入器的编排整合。
5. 更复杂的 Excel 协议支持，例如批注、隐藏工作表或额外元数据页。

## 与 DesktopHost 的当前关系

截至目前，DesktopHost 已经接入 FileProcess，并提供了基础的 Excel 导入导出 API。

当前接线方式是：

1. 导入接口负责接收 xlsx 上传并返回导入后的 `LightyWorkbook` 预览。
2. 导出接口负责从指定 workspacePath 加载现有工作簿并返回 xlsx 文件。
3. 当前宿主已经具备独立的 workbook 保存接口，因此导入结果可以进一步交给宿主写回工作区；但 FileProcess 自身仍不直接承担落盘职责。

## 当前状态结论

FileProcess 已经从“新增项目”进入“具备基础 Excel 转换能力”的阶段。后续 DesktopHost 和 DesktopApp 需要实现 Excel 导入导出时，应优先直接复用这里的转换主链，而不是重新处理 xlsx 协议。