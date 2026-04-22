# DesktopHost 子系统

## 职责

DesktopHost 子系统对应 src/LightyDesign.DesktopHost。它是 Electron 桌面应用的本地 .NET 宿主，当前以 ASP.NET Core 最小 API 的形式提供服务。

## 当前已完成的工作

1. 已创建 ASP.NET Core Web API 项目骨架。
2. 已加入解决方案，并建立对 Core、FileProcess 和 Generator 的引用。
3. 已替换默认 weatherforecast 示例接口。
4. 已提供 /api/health 健康检查接口。
5. 已提供 /api/workspace/summary 工作区摘要接口。
6. 已提供 /api/workspace 真实工作区读取接口。
7. 已提供基于 FileProcess 的 Excel 导入导出接口。
8. 已提供 /api/workspace/workbooks/save workbook 写回接口。
9. 已完成与 Electron 主进程的自动启动接入。
10. 已验证宿主可在 http://127.0.0.1:5000 正常监听并返回 JSON。
11. 已提供代码导出、导出前校验以及“手动校验当前工作簿”所需的宿主接口。
12. 已提供 validation schema 查询与 validation 规则结构预校验接口，供桌面端表头编辑器使用。
13. 已切换到 `Workbooks` / `FlowCharts` 双根目录工作区协议。
14. 已提供 FlowChart 节点定义、流程图文件导航、读取、保存接口，以及统一标签页资产读取接口。

## 当前接口说明

1. /api/health
   返回宿主状态、应用名、环境、版本、时间戳和仓库根目录。
2. /api/workspace/summary
   返回仓库根目录以及 app、Spec、src、tests、ShellFiles 等关键目录是否存在。
3. /api/workspace
   根据 workspacePath 加载真实工作区，返回工作区级 header 布局、`Workbooks` 导航/内容以及 `FlowCharts` 资产清单。
4. /api/workspace/navigation
   根据 workspacePath 加载轻量工作区导航数据，返回工作簿、Sheet 和 FlowChart 资产基础元信息，不返回整表数据行内容。
5. /api/workspace/flowcharts/navigation
   根据 workspacePath 加载 FlowChart 轻量导航数据，返回节点定义与流程图文件列表，不返回文档正文。
6. /api/workspace/flowcharts/nodes/{relativePath}
   根据 workspacePath 读取指定节点定义 JSON。
7. /api/workspace/flowcharts/files/{relativePath}
   根据 workspacePath 读取指定流程图文件 JSON。
8. /api/workspace/assets/{assetKind}/{assetPath}
   根据 workspacePath 统一读取 workbook、sheet、flowchart-node、flowchart-file 四类标签页资产。
9. /api/file-process/workbooks/import-excel
   接收 multipart/form-data 上传的 xlsx 文件、workspacePath 和可选 workbookName，按工作区 headers.json 导入为 `LightyWorkbook` 预览结果。
10. /api/file-process/workbooks/{workbookName}/export-excel
    根据 workspacePath 加载指定工作簿，并导出为 xlsx 文件下载。
11. /api/workspace/workbooks/save
    接收工作区路径和 workbook JSON 负载，调用 Core 写回器将其保存到 `Workbooks/{Workbook}` 下的 `.txt` 与 `_header.json`。
12. /api/workspace/flowcharts/nodes/save
    接收工作区路径、相对路径和节点定义 JSON，写回 `FlowCharts/Nodes`。
13. /api/workspace/flowcharts/files/save
    接收工作区路径、相对路径和流程图文件 JSON，写回 `FlowCharts/Files`。
14. /api/workspace/type-metadata
    返回后端集中管理的类型元数据（标量列表、容器类型与槽位定义、引用类型和可引用目标），供前端类型构建器使用。
15. /api/workspace/type-validation
    对指定的类型字符串或当前列类型执行语法与语义校验。响应在原有校验结果之上，额外返回规范化的类型字符串与递归的类型描述符（type descriptor），便于 UI 回填和呈现类型结构。
16. /api/workspace/validation-schema
    根据指定 Type 返回对应的 validation schema，包括字段说明、默认值、示例值和嵌套规则结构，供桌面端侧边说明区使用。
17. /api/workspace/validation-rules/validate
    对指定 Type 的 validation JSON 做结构预校验，仅检查规则本身是否合法，不执行整表数据扫描。
18. /api/workspace/workbooks/codegen/validate
    对指定工作簿执行手动校验，复用导出前的 validation 执行链路，但不写出代码文件。
19. /api/workspace/workbooks/codegen/export
    对指定工作簿执行导出前校验，校验通过后再生成并写出代码。
20. /api/workspace/workbooks/codegen/export-all
    对整个工作区执行导出前校验，全部通过后再批量生成并写出代码。
21. /api/workspace/workbooks/{workbookName}
    根据 workspacePath 加载单个工作簿，返回该工作簿下所有 Sheet、列定义和数据行内容。
22. /api/workspace/workbooks/{workbookName}/sheets/{sheetName}
    根据 workspacePath 加载单个 Sheet，返回其表头和数据行内容。
23. /api/workspace/workbooks/{workbookName}/sheets/{sheetName}/metadata
    根据 workspacePath 加载单个 Sheet 的轻量元信息，返回路径、行数、列数和列定义，但不返回数据行内容。

## 当前尚未实现的业务能力

1. 更细粒度的 sheet 局部保存接口。
2. 工作簿与表文件编辑后的增量落盘编排。
3. 导入结果写回工作区目录结构后的冲突处理与确认流程。
4. 更细的导出结果分组与错误回传模型。
5. 结合前端的上传下载与预览流程。
6. FlowCharts 校验与代码生成接口。
7. workbook 与 flowchart 混合资产的统一保存编排。

## 与 Core 的当前关系

截至目前，Core 已经具备以下可被 DesktopHost 直接复用的能力：

1. 工作区、工作簿、表、列定义和数据行模型。
2. 工作区级 headers.json 与 Sheet 级 _header.json 的读取与反序列化。
3. txt 文件的转义/反转义、行列拆分和基础引用解析。
4. 按需触发的惰性值解析能力。
5. FlowChart 节点定义与流程图文件的 JSON 级加载、保存与路径校验。
6. validation 规则执行、validation schema 查询和规则结构预校验。

这意味着 DesktopHost 后续实现真实工作区接口时，不应再重复编写协议解析逻辑，而应直接调用 Core 暴露的模型和加载器。

## 当前状态结论

DesktopHost 已经从“模板项目”进入“具备 Workbooks / FlowCharts 双资产读取、FlowChart JSON 保存、标签页统一加载、表头编辑支撑和代码导出能力”的阶段。当前最适合优先实现的能力是继续补齐 FlowChart 校验/代码生成、冲突处理与更细粒度的保存结果模型。
