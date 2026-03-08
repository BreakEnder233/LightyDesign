# Tooling 子系统

## 职责

Tooling 子系统主要对应 ShellFiles 和仓库级开发辅助配置，用于降低项目初始化、构建和本地调试的门槛。

## 当前已完成的工作

1. 已创建 ShellFiles/Bootstrap-LightyDesign.ps1。
2. 该脚本可以还原并构建 .NET 解决方案。
3. 该脚本可以安装并构建 Electron 前端。
4. 该脚本支持在构建完成后直接启动桌面开发模式。
5. 已补充仓库级 .gitignore，用于忽略 .NET、Node、Electron 构建产物和常见 IDE 缓存。
6. 已补充根 README，说明环境准备、启动方式、常见问题和开发顺序。

## 当前尚未实现的业务能力

1. 一键打包脚本。
2. CI 配置。
3. 发布说明生成。
4. 自动化版本号管理。

## 当前状态结论

Tooling 已经具备“新开发者可以快速拉起仓库”的基础能力。对于没有 Electron 和 Web 经验的成员，当前脚本和 README 已足够支撑第一次本地启动。
