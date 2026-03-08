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

## 当前接口说明

1. /api/health
   返回宿主状态、应用名、环境、版本、时间戳和仓库根目录。
2. /api/workspace/summary
   返回仓库根目录以及 app、Spec、src、tests、ShellFiles 等关键目录是否存在。
3. /api/workspace
   根据 workspacePath 加载真实工作区，返回工作区级 header 布局、工作簿、Sheet、列定义和数据行内容。
4. /api/workspace/workbooks/{workbookName}
   根据 workspacePath 加载单个工作簿，返回该工作簿下所有 Sheet、列定义和数据行内容。
5. /api/workspace/workbooks/{workbookName}/sheets/{sheetName}
   根据 workspacePath 加载单个 Sheet，返回其表头和数据行内容。
6. /api/workspace/workbooks/{workbookName}/sheets/{sheetName}/metadata
   根据 workspacePath 加载单个 Sheet 的轻量元信息，返回路径、行数、列数和列定义，但不返回数据行内容。
7. /api/file-process/workbooks/import-excel
   接收 multipart/form-data 上传的 xlsx 文件、workspacePath 和可选 workbookName，按工作区 headers.json 导入为 `LightyWorkbook` 预览结果。
8. /api/file-process/workbooks/{workbookName}/export-excel
   根据 workspacePath 加载指定工作簿，并导出为 xlsx 文件下载。
9. /api/workspace/workbooks/save
   接收工作区路径和 workbook JSON 负载，调用 Core 写回器将其保存为 `.txt` 与 `_header.json`。

## 当前尚未实现的业务能力

1. 更细粒度的 sheet 局部保存接口。
2. 工作簿与表文件编辑后的增量落盘编排。
3. 导入结果写回工作区目录结构后的冲突处理与确认流程。
4. 更完整的导出调用与错误回传模型。
5. 结合前端的上传下载与预览流程。

## 与 Core 的当前关系

截至目前，Core 已经具备以下可被 DesktopHost 直接复用的能力：

1. 工作区、工作簿、表、列定义和数据行模型。
2. 工作区级 headers.json 与 Sheet 级 _header.json 的读取与反序列化。
3. txt 文件的转义/反转义、行列拆分和基础引用解析。
4. 按需触发的惰性值解析能力。

这意味着 DesktopHost 后续实现真实工作区接口时，不应再重复编写协议解析逻辑，而应直接调用 Core 暴露的模型和加载器。

## 当前状态结论

DesktopHost 已经从“模板项目”进入“具备真实工作区读取、细粒度 sheet 元信息读取、Excel 转换和 workbook 写回能力”的阶段。当前最适合优先实现的能力是把前端编辑流程和 Excel 导入预览进一步编排到保存、冲突处理与增量写回流程中。
