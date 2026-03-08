# DesktopHost 子系统

## 职责

DesktopHost 子系统对应 src/LightyDesign.DesktopHost。它是 Electron 桌面应用的本地 .NET 宿主，当前以 ASP.NET Core 最小 API 的形式提供服务。

## 当前已完成的工作

1. 已创建 ASP.NET Core Web API 项目骨架。
2. 已加入解决方案，并建立对 Core 和 Generator 的引用。
3. 已替换默认 weatherforecast 示例接口。
4. 已提供 /api/health 健康检查接口。
5. 已提供 /api/workspace/summary 工作区摘要接口。
6. 已完成与 Electron 主进程的自动启动接入。
7. 已验证宿主可在 http://127.0.0.1:5000 正常监听并返回 JSON。

## 当前接口说明

1. /api/health
   返回宿主状态、应用名、环境、版本、时间戳和仓库根目录。
2. /api/workspace/summary
   返回仓库根目录以及 app、Spec、src、tests、ShellFiles 等关键目录是否存在。

## 当前尚未实现的业务能力

1. 真实工作区扫描。
2. 工作簿与表文件读取。
3. 表头 JSON 反序列化。
4. txt 行数据解析与保存。
5. 导出调用与错误回传。

## 与 Core 的当前关系

截至目前，Core 已经具备以下可被 DesktopHost 直接复用的能力：

1. 工作区、工作簿、表、列定义和数据行模型。
2. 工作区级 headers.json 与 Sheet 级 _header.json 的读取与反序列化。
3. txt 文件的转义/反转义、行列拆分和基础引用解析。
4. 按需触发的惰性值解析能力。

这意味着 DesktopHost 后续实现真实工作区接口时，不应再重复编写协议解析逻辑，而应直接调用 Core 暴露的模型和加载器。

## 当前状态结论

DesktopHost 已经从“模板项目”进入“可被桌面端访问的本地 API 宿主”阶段。当前最适合优先实现的能力是基于 Core 的真实工作区扫描和表格读取，而不是继续扩展静态摘要接口。
