# Tooling 子系统

## 职责

Tooling 子系统主要对应 ShellFiles 和仓库级开发辅助配置，用于降低项目初始化、构建和本地调试的门槛。

## 当前已完成的工作

1. 已创建 ShellFiles/Bootstrap-LightyDesign.ps1，用于本地引导和开发启动。
2. 已创建 ShellFiles/Deploy-LightyDesign.ps1，用于生成可运行部署目录。
3. 引导脚本会优先使用 `npm ci`，并支持构建完成后直接启动 Electron 开发模式。
4. 部署脚本会发布 DesktopHost、构建桌面前端、安装 Electron 运行时，并生成 `Start-LightyDesign.ps1`。
5. 已补充仓库级 .gitignore 和根 README，覆盖基本开发与交付说明。
6. 已补充 GitHub Actions 打包工作流，可在 Windows runner 上自动产出 zip 部署包，并在 tag 发布时上传到 GitHub Release。

## 当前尚未实现的业务能力

1. 安装包生成，例如 MSI 或 NSIS。
2. 发布说明模板与更完整的发版编排。
3. 自动化版本号管理。

## 当前状态结论

Tooling 现在已经覆盖“本地开发引导”、“目录级部署产物生成”和“GitHub Actions 自动打包”三条链路。当前仍未进入真正安装包分发阶段，但已经可以稳定产出一份独立的运行目录，并通过 CI 快速分发 zip 形式的可运行包。
