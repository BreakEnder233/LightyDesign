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

## 当前状态结论

DesktopHost 已经从“模板项目”进入“可被桌面端访问的本地 API 宿主”阶段，当前最适合优先实现的能力是工作区扫描和表格读取。
