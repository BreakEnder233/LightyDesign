---
name: lighty-design
description: "通过 LightyDesign 桌面端 MCP 读取工作区、编辑 workbook/sheet、编辑 flowchart 并触发流程图代码导出的可复用工作流。适用于仓库维护者与接入本地 HTTP MCP 的 AI 客户端。"
argument-hint: "要执行的 MCP 目标，例如：批量修改某个 Sheet；保存当前流程图并导出代码"
---

# LightyDesign MCP 工作流 Skill

## 概述

该 Skill 提供一套与当前 LightyDesign MCP bridge 对齐的工作流，帮助 AI 通过桌面端本地 HTTP MCP 服务完成以下两类任务：

- 本地开发者 / 仓库维护者（有 DesktopHost 与项目代码）
- 远程或第三方用户（没有源码，仅通过 MCP/HTTP API 与文件交互）

当前目标不是让 AI 直接读写底层 txt/json 文件，而是通过 MCP 工具复用现有工作区、Workbook、Sheet、FlowChart 与代码生成链路，完成查询、结构化编辑、保存和导出。

当前 Skill 覆盖两条主线：

- Workbook / Sheet：读取导航、读取 schema、分页读取行、校验列类型、dry-run 行列补丁、正式写回。
- FlowChart：读取导航、读取当前流程图上下文、读取节点定义与流程图文件、保存流程图文件，并通过 MCP 触发流程图代码导出。

## 何时使用

- 需要通过 MCP 读取当前工作区、Workbook、Sheet 或 FlowChart 的结构化上下文。
- 需要对 Sheet 执行结构化批量修改，而不是整文件替换。
- 需要在流程图模式下读取当前活动流程图、保存流程图文档，或触发流程图代码导出。
- 需要让 AI 优先使用当前编辑器上下文，而不是手工重复输入 workbookName、sheetName 或 flowchart relativePath。

## 当前 MCP 结构

### 接入方式

- LightyDesign 当前默认暴露的是本地 HTTP MCP，而不是 stdio。
- 默认本地地址为 `http://127.0.0.1:39231/mcp`。
- 使用前需要在桌面端顶部菜单 `AI工具` 中开启 MCP 服务。
- 外部客户端应使用 HTTP MCP 配置，而不是 `command/args` 型配置。

### 当前编辑器上下文

`get_active_editor_context` 会返回 `editorMode` 感知的上下文：

- `workbook` 模式：返回 `workspacePath`、`currentSheet`、`selection`。
- `flowchart` 模式：返回 `workspacePath`、`currentFlowChart`、`flowChartSelection`。

其中：

- `currentSheet` 提供 workbookName、sheetName、列摘要、行列数和当前选区地址。
- `selection` 提供当前单元格区域的地址、列预览和 previewRows。
- `currentFlowChart` 提供 relativePath、filePath、名称、dirty 状态、节点/连线数量、validationIssueCount。
- `flowChartSelection` 提供 nodeIds、connectionKeys、focus、selectedNode、selectedConnection、pendingConnection。

### 当前工具分组

当前 MCP bridge 已暴露以下工具：

- 工作区与上下文：`get_workspace_navigation`、`get_flowchart_navigation`、`get_active_editor_context`
- Workbook 查询：`get_header_property_schemas`、`get_sheet_schema`、`get_sheet_rows`、`validate_column_type`
- Workbook 写入：`create_workbook`、`create_sheet`、`patch_sheet_rows`、`patch_sheet_columns`
- FlowChart 查询：`get_current_flowchart`、`get_current_flowchart_selection`、`get_flowchart_node_definition`、`get_flowchart_file`
- FlowChart 写入与导出：`save_flowchart_file`、`export_flowchart_codegen`

注意：

- 当前 bridge 已支持 FlowChart 代码导出。
- 当前 bridge 尚未直接暴露 Workbook 代码导出工具；Workbook 侧的 MCP 重点仍是查询和结构化编辑。

## 输入与假设

- 已知或可查询的 MCP 工具集合，且 MCP 服务已在桌面端开启。
- 优先假设桌面端当前已经打开目标工作区；如无活动上下文，则显式传入 `workspacePath`。
- Workbook 操作可使用显式 `workbookName` / `sheetName`，也可在活动 Sheet 上下文存在时省略。
- FlowChart 操作可使用显式 `relativePath`，也可在活动流程图上下文存在时省略。
- `save_flowchart_file` 需要传入完整流程图文档对象，而不是局部补丁。
- `export_flowchart_codegen` 支持 `single`、`batch`、`all` 三种模式。

## 输出

- 可审阅的查询结果摘要，例如 schema、rows、当前流程图、当前选区。
- Workbook 侧可直接提交的结构化补丁与 dry-run 预览结果。
- FlowChart 侧可直接提交的完整文档保存请求与导出结果摘要。
- 面向用户或调用方的变更说明、风险说明和后续动作建议。

## 工作流（步骤）

1. 收集上下文
    - 优先调用 `get_active_editor_context`，确认 `editorMode`、`workspacePath` 与当前活动对象。
    - 如果桌面端没有合适的活动上下文，则显式确定目标：`workspacePath`、`workbookName` / `sheetName` 或 `relativePath`。
    - 如果目标仍不明确：Workbook 走 `get_workspace_navigation`；FlowChart 走 `get_flowchart_navigation`。

2. 路由到正确编辑面
    - 如果目标是 Sheet 或当前 `editorMode = workbook`，进入 Workbook 流程。
    - 如果目标是 FlowChart 或当前 `editorMode = flowchart`，进入 FlowChart 流程。
    - 如果用户只说“当前内容”，默认先依赖活动上下文，而不是猜测文件路径。

3. Workbook 流程
    - 使用 `get_sheet_schema` 获取列定义与元数据。
    - 使用 `get_sheet_rows` 分页读取必要的行，而不是一次读取整表。
    - 如果要新增或修改列，先结合 `get_header_property_schemas` 与 `validate_column_type` 理解列属性和类型合法性。
    - 生成 `patch_sheet_rows` 或 `patch_sheet_columns` 的结构化操作集合。
    - 默认先执行 `dryRun = true`，检查 summary、previewRows 或 schema 预览。
    - dry-run 结果可接受后，再执行正式写入。

4. FlowChart 流程
    - 先用 `get_current_flowchart` 或 `get_flowchart_file` 获取目标流程图的完整文档。
    - 如果需要理解节点属性、端口、节点种类或连线语义，再调用 `get_flowchart_node_definition` 读取相关节点定义。
    - 修改文档时保留完整结构：`formatVersion`、`name`、`alias`、`nodes`、`flowConnections`、`computeConnections`。
    - 如果当前上下文显示 `validationIssueCount > 0`，优先先解释并修复结构问题，再保存。
    - 调用 `save_flowchart_file` 保存完整流程图文档。

5. 代码导出
    - 若用户要求导出流程图代码，在成功保存目标版本后调用 `export_flowchart_codegen`。
    - `single`：导出单个流程图；通常传一个 `relativePath`，或依赖当前活动流程图。
    - `batch`：导出一组 `relativePaths`。
    - `all`：导出当前工作区全部流程图。
    - 返回 `outputDirectoryPath`、`fileCount`、`flowChartCount` 等摘要供用户确认。

6. 验证与汇总
    - Workbook：确认 dry-run 或正式写回后的 summary 是否符合预期，必要时继续分页复查受影响行。
    - FlowChart：确认保存结果与当前文档一致，再决定是否继续导出。
    - 最终输出变更摘要、未解决风险、后续建议。

## 决策点与分支逻辑

- 当 `editorMode = workbook` 且用户未提供 workbookName / sheetName 时：优先使用 `currentSheet` 和 `selection`。
- 当 `editorMode = flowchart` 且用户未提供 `relativePath` 时：优先使用 `currentFlowChart.relativePath`。
- 当用户只说“看下当前内容”时：先走 `get_active_editor_context`，不要盲猜是 Sheet 还是 FlowChart。
- 当需要理解 Sheet 结构时：先读 `get_sheet_schema`，再读 `get_sheet_rows`。
- 当需要理解 FlowChart 节点语义时：先读 `get_flowchart_node_definition`，再决定是否改文档。
- 当 Sheet 改动范围较大时：优先 `dryRun`，必要时拆分为多批 patch。
- 当 FlowChart 已显示 `validationIssueCount > 0` 时：优先修结构问题，不要直接覆盖保存。
- 当用户要求导出代码但只指定单一流程图时：用 `export_flowchart_codegen` 的 `single`。
- 当用户要求导出一个目录或一组流程图时：用 `batch` 并显式提供 `relativePaths`。
- 当用户要求导出整个工作区流程图时：用 `all`。
- 当没有桌面端活动上下文时：所有目标字段都要显式提供，不要依赖隐式解析。

## 质量标准（完成检查）

- 使用的工具名与当前 bridge 一致，不依赖已下线或尚未暴露的 MCP 能力。
- Workbook 写入默认经过 `dryRun`，除非用户明确要求直接提交。
- Sheet 侧补丁只改动目标行/列，不把整表重写成文本替换。
- FlowChart 保存使用完整文档结构，不遗漏 `nodes`、`flowConnections`、`computeConnections`。
- FlowChart 导出基于已保存的目标版本执行，而不是基于未落盘的内存假设。
- 结果中明确给出被修改的对象、数量、失败点与后续建议。

## 模板化输出格式

- Workbook dry-run 摘要示例：

```json
{
   "surface": "sheet",
   "target": {
      "workbookName": "Items",
      "sheetName": "Weapons"
   },
   "dryRun": true,
   "summary": {
      "insertedCount": 0,
      "updatedCount": 3,
      "deletedCount": 0
   }
}
```

- FlowChart 保存请求示例：

```json
{
   "tool": "save_flowchart_file",
   "arguments": {
      "workspacePath": "D:/Workspace/MyProject",
      "relativePath": "Quest/Intro",
      "document": {
         "formatVersion": "1.0",
         "name": "Intro",
         "alias": null,
         "nodes": [],
         "flowConnections": [],
         "computeConnections": []
      }
   }
}
```

- FlowChart 导出请求示例：

```json
{
   "tool": "export_flowchart_codegen",
   "arguments": {
      "workspacePath": "D:/Workspace/MyProject",
      "mode": "single",
      "relativePath": "Quest/Intro"
   }
}
```

## 为没有代码库的用户提供的降级路径

- Skill 会优先要求最小必要的目标定位信息：`workspacePath`、Sheet 标识或 FlowChart `relativePath`。
- 若用户无法提供活动上下文，则退化为显式参数驱动的 MCP 请求模板。
- 若用户只能提供 Excel/CSV 或流程图 JSON 样例，Skill 会先生成结构化 patch 或完整 document 建议，再由有宿主访问权限的人执行。

## 示例 prompts（可直接给 AI 使用）

- "读取当前活动表的 schema 和前 20 行，给出 `patch_sheet_rows` 的 dry-run 建议，并解释为什么这样改。"

- "在 `Events` sheet 中，将 `start_date` 列标准化为 ISO 日期；先生成 `patch_sheet_rows` 的 dry-run 结果，再决定是否正式提交。"

- "读取当前活动流程图与当前流程图选区，解释选中节点依赖的节点定义、端口和潜在结构问题。"

- "把当前流程图中指定节点的某个属性值改掉，保存流程图，然后触发 `export_flowchart_codegen` 的 `single` 模式导出。"

- "批量导出 `Quest/Main` 目录下的流程图代码；如果没有活动流程图上下文，请先从 `get_flowchart_navigation` 里找出对应 relativePaths。"

- 面向无源码用户的请求示例：
   - "我没有源码，只有工作区路径和流程图相对路径。请帮我生成 `get_flowchart_file -> save_flowchart_file -> export_flowchart_codegen` 的调用顺序与请求 JSON。"

## 迭代与审核建议

- 首次处理 Sheet 时只读取必要分页数据，不要一开始把整表灌入上下文。
- 首次改 Sheet 时优先 dry-run，再做正式提交。
- 首次改 FlowChart 时先读取完整文件与相关节点定义，再做最小文档改动。
- FlowChart 导出前优先确保目标版本已经保存，避免导出旧版本或半成品。

## 安全与权限

- 明确区分只读查询、Sheet 结构化写入、FlowChart 完整文档保存、代码导出四类动作。
- 对大范围 Sheet 改动、批量 FlowChart 导出或覆盖现有流程图文档，优先给出预览和风险说明。
- 不把 MCP 当作任意文件系统访问接口；只调用当前 bridge 已暴露的工具。

## 交付物（Skill 文件）包含

- 此 `SKILL.md`，用于指导 AI 正确使用当前 MCP 结构。
- 覆盖 Workbook 与 FlowChart 两条主线的工作流说明。
- 与当前 bridge 对齐的示例 prompts 与请求模板。

---
## 快速上手（给用户的最小步骤）

1. 在桌面端打开目标工作区，并在 `AI工具` 中开启 MCP 服务。
2. 在外部客户端接入本地 HTTP MCP：默认 `http://127.0.0.1:39231/mcp`。
3. 优先从 `get_active_editor_context` 开始，让 AI 先确认当前是 `workbook` 还是 `flowchart` 模式。
4. Sheet 任务优先走 `get_sheet_schema` / `get_sheet_rows` / `patch_sheet_*`；FlowChart 任务优先走 `get_current_flowchart` / `get_flowchart_file` / `save_flowchart_file` / `export_flowchart_codegen`。

示例快速命令式提示：

"先读取当前活动编辑器上下文；如果当前是 Sheet，就读取 schema 与前 20 行并生成 `patch_sheet_rows` dry-run；如果当前是 FlowChart，就读取当前流程图、保存修改后的 document，并触发 `export_flowchart_codegen`。"

---
## 备注

本 Skill 现在显式对齐当前仓库里的 MCP bridge 结构，而不是抽象的通用 REST 假设。后续如果 bridge 再新增 Workbook codegen、FlowChart 节点定义写入或更严格的保存校验，应同步更新本文件中的工具清单、决策分支和示例 prompts。
