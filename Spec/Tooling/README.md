# Tooling 子系统

## 职责

Tooling 子系统主要对应 ShellFiles 和仓库级开发辅助配置，用于降低项目初始化、构建和本地调试的门槛。

## 当前已完成的工作

1. 已创建 ShellFiles/Bootstrap-LightyDesign.ps1，用于本地引导和开发启动。
2. 已创建 ShellFiles/Deploy-LightyDesign.ps1，用于生成可运行部署目录。
3. 引导脚本会优先使用 `npm ci`，并支持构建完成后直接启动 Electron 开发模式。
4. 部署脚本会发布 DesktopHost、构建桌面前端、安装 Electron 运行时，并生成 `Start-LightyDesign.ps1`。
5. 已补充仓库级 .gitignore 和根 README，覆盖基本开发与交付说明。
6. 已补充 GitHub Actions 打包工作流，可在 Windows runner 上自动产出 zip 部署包、Windows 安装器和更新元数据，并在 tag 发布时上传到 GitHub Release。
7. 已创建 ShellFiles/Build-LightyDesignInstaller.ps1，用于本地和 CI 统一构建 NSIS Windows 安装器。

## 当前尚未实现的业务能力

1. 更完整的自动更新接入，例如静默安装、安装后自动重启回到应用。
2. 发布说明模板与更完整的发版编排。
3. 自动化版本号管理。

## 大规模更改后自动打包规则

完成涉及以下任意一项的大规模更改后，**必须**在本地构建 Windows 安装器，并在完成后将绝对路径发送给用户：

1. 修改了 Core 协议层（工作区模型、引用模型、惰性值解析、validation 等）。
2. 修改了 DesktopHost API（新增/变更接口、修改宿主行为）。
3. 修改了 Electron 桌面壳（主进程、预加载脚本、渲染进程关键流程）。
4. 修改了 FileProcess 导入导出逻辑。
5. 修改了 Generator 代码生成逻辑。
6. 修改了 ShellFiles 中的构建/部署脚本。

**例外情况**：如果用户明确说了”不需要打安装包”、”不用打包”、”don't build package”或类似表达，则跳过本地打包步骤。

**打包命令**：

```powershell
powershell -ExecutionPolicy Bypass -File .\ShellFiles\Build-LightyDesignInstaller.ps1
```

如在非中国大陆网络环境，也可不加 `-UseChinaMirror`：

```powershell
powershell -ExecutionPolicy Bypass -File .\ShellFiles\Build-LightyDesignInstaller.ps1
```

打包完成后，安装器默认输出到 `app\desktop\dist-installer`，产物包括：

- `LightyDesign Setup x.y.z.exe`（NSIS 安装器）
- `latest.yml`（electron-updater 更新元数据）

如果构建过程中出现网络超时（如 `winCodeSign`、`nsis` 资源下载失败），可重试并追加 `-UseChinaMirror` 参数使用国内镜像源。

## 当前状态结论

Tooling 现在已经覆盖”本地开发引导”、”目录级部署产物生成”、”Windows 安装器构建”、”大规模更改后自动打包规则”和”GitHub Actions 自动打包”五条链路。当前已经可以稳定产出独立运行目录和可覆盖安装的 Windows 安装器，并通过 CI 快速分发到 GitHub Release。
