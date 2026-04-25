# LightyDesign

LightyDesign 是一个面向策划表协议的桌面编辑器。仓库目前由三部分组成：Core 协议层、DesktopHost 本地宿主、Electron 桌面壳。

## 快速开始

先安装 .NET SDK 9、Node.js LTS 和 PowerShell，然后在仓库根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\ShellFiles\Bootstrap-LightyDesign.ps1
```

这会还原并构建 .NET 解决方案，同时安装并构建桌面前端。

如果要直接启动开发模式：

```powershell
powershell -ExecutionPolicy Bypass -File .\ShellFiles\Bootstrap-LightyDesign.ps1 -RunDesktop
```

如果要生成一份可运行部署目录：

```powershell
powershell -ExecutionPolicy Bypass -File .\ShellFiles\Deploy-LightyDesign.ps1
```

部署脚本会发布 DesktopHost、构建 Electron 前端、准备本地 Electron 运行时，并在输出目录生成 `Start-LightyDesign.ps1`。

## GitHub Actions 打包

仓库现在包含一个可直接生成部署包的 GitHub Actions 工作流：`.github/workflows/build-desktop-package.yml`。

使用方式如下：

1. 在 GitHub 的 Actions 页面手动触发 `Build Desktop Package`。
2. 如只做手动打包，`version` 可留空，此时默认使用当前 `app/desktop/package.json` 里的版本号。
3. 如需直接发版，可勾选 `publish_release`，工作流会自动按该版本生成或更新 `v版本号` 对应的 GitHub Release。
4. 工作流会在 Windows runner 上同时执行 `ShellFiles/Deploy-LightyDesign.ps1` 和 `ShellFiles/Build-LightyDesignInstaller.ps1`。
5. 完成后会同时上传 zip 部署目录、Windows 安装器 artifact，以及一份 `version-metadata.json` 版本元数据。

手动触发且勾选 `publish_release` 时，`version` 为必填项。工作流还会先检查目标 `v版本号` 对应的 Git tag 和 GitHub Release 是否已经存在；如果已存在，会直接失败，避免误覆盖已有版本。

如果推送形如 `v1.0.0` 的 tag，该工作流还会自动：

1. 构建同样的部署目录。
2. 生成 NSIS Windows 安装器和 `latest.yml`。
3. 自动把 Electron 应用版本、安装器版本和 .NET 程序集版本统一注入到本次构建。
4. 把 zip、安装器和更新元数据附加到对应的 GitHub Release。

## 桌面端更新检查

桌面端现在支持基于 GitHub Releases 的更新检查，但默认需要先配置更新源。

可选配置位置：

1. `app/desktop/package.json` 中的 `lightyDesign.updates.githubRepository`
2. 运行时环境变量 `LDD_GITHUB_REPOSITORY`
3. 如需自定义 API 或发布页地址，也可配置 `lightyDesign.updates.releasesApiUrl` 与 `lightyDesign.updates.releasesPageUrl`

推荐直接填成：

```json
{
   "lightyDesign": {
      "updates": {
         "githubRepository": "owner/repo"
      }
   }
}
```

配置完成后，桌面端会：

1. 启动后自动检查最新 Release
2. 在状态栏显示更新状态
3. 发现新版本时支持在应用内直接下载并静默执行 Windows 安装器

当前阶段已经支持“检查更新 + 应用内下载 + 静默覆盖安装”。当前实现优先支持 NSIS exe 与 MSI 资产；安装完成后的自动回前台启动仍未接入。

## Windows 安装器

如果要在本地构建可覆盖安装的 Windows 安装器，可在仓库根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\ShellFiles\Build-LightyDesignInstaller.ps1
```

如需在构建时显式指定安装器版本，可直接传入：

```powershell
powershell -ExecutionPolicy Bypass -File .\ShellFiles\Build-LightyDesignInstaller.ps1 -Version 0.1.3
```

该脚本会：

1. 发布 DesktopHost 到安装器资源目录。
2. 构建 Electron 前端与主进程产物。
3. 在传入 `-Version` 时先同步 Electron `package.json` 版本。
4. 调用 electron-builder 生成 NSIS 安装器。

安装器默认输出到 `app\desktop\dist-installer`，运行新的安装器即可覆盖旧版本安装。

如在中国大陆网络环境下构建，建议追加：

```powershell
powershell -ExecutionPolicy Bypass -File .\ShellFiles\Build-LightyDesignInstaller.ps1 -UseChinaMirror
```

这个参数会同时配置 npm、Electron 和 electron-builder 二进制镜像，避免 `winCodeSign`、`nsis` 等安装器依赖从 GitHub 直连下载时超时。

## 手动命令

仓库根目录：

```powershell
dotnet restore .\LightyDesign.sln
dotnet build .\LightyDesign.sln
dotnet test .\LightyDesign.sln
```

桌面前端目录 `app\desktop`：

```powershell
npm ci
npm run dev
npm run build
.\node_modules\.bin\tsc.cmd --noEmit -p tsconfig.json
```

单独启动 DesktopHost：

```powershell
dotnet run --project .\src\LightyDesign.DesktopHost\LightyDesign.DesktopHost.csproj --no-launch-profile --urls http://127.0.0.1:5000
```

## 项目结构

```text
LightyDesign/
   app/desktop/              Electron + React + Vite 桌面端
   src/LightyDesign.Core/    工作区模型、协议读取、惰性值解析、写回
   src/LightyDesign.FileProcess/ xlsx 与 Core 模型转换
   src/LightyDesign.DesktopHost/ 本地 Web API 宿主
   src/LightyDesign.Generator/ 代码生成器骨架
   tests/LightyDesign.Tests/ 单元测试
   Spec/                     规格与子系统说明
   ShellFiles/               引导与部署脚本
```

## 当前能力

1. Core 已实现工作区、工作簿、表、列定义、引用模型与惰性值解析。
2. Core 已支持工作区扫描、Sheet header 读写和 workbook 写回。
3. FileProcess 已支持 xlsx 与 `LightyWorkbook` 双向转换。
4. Core 已支持 validation 规则执行、validation schema 查询和规则结构预校验。
5. DesktopHost 已提供健康检查、工作区读取、sheet 元信息、Excel 导入导出、workbook 保存、validation schema 和代码导出/校验接口。
6. Electron 已能在开发模式和部署目录中自动拉起 DesktopHost，并在表头编辑器中显示 validation 侧边说明区与规则预校验结果。
7. WorkbookEditor 已支持 number 列专用行内输入，以及 number、reference、list、dictionary、object 的按类型值编辑入口；其中 list / dictionary 支持递归弹窗编辑，object 当前走 JSON fallback。

## 前端维护约定

桌面前端的 React 代码按“装配层、Hook、渲染组件、共享类型/工具”拆分，而不是把所有状态和 UI 都堆在一个 App.tsx 中。

当前标准如下：

1. `App.tsx` 只负责页面装配、顶层状态编排、数据加载和业务动作汇总。
2. `src/components/` 只放可复用的渲染组件，不承担工作区加载或保存编排。
3. `src/hooks/` 只放可复用行为，例如快捷键、通知、副作用注册。
4. `src/types/` 统一放桌面端共享类型、纯工具函数和轻量模型辅助方法。
5. 当某个文件同时承担“数据加载 + 状态机 + 大段 JSX + 可复用逻辑”时，应优先继续拆分，而不是继续扩写原文件。
6. 宿主连接、通知中心、工作区编辑会话这类状态密集逻辑，应优先拆到专用 Hook，再由 `App.tsx` 进行装配。

## 文档入口

1. [Spec/README.md](Spec/README.md)：整体协议与目录约定。
2. [Spec/Core/README.md](Spec/Core/README.md)：Core 当前能力与边界。
3. [Spec/DesktopHost/README.md](Spec/DesktopHost/README.md)：宿主接口与职责。
4. [Spec/Tooling/README.md](Spec/Tooling/README.md)：脚本与交付方式。

## AI 助手技能

- 项目根目录包含一份 `SKILL.md`，用于指导 AI 通过 MCP/宿主 API 理解并编辑策划表（planning sheet），包含工作流、决策点、示例 prompts 与 patch 模板。参见： [SKILL.md](SKILL.md)