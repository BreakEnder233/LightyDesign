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
2. 工作流会在 Windows runner 上执行 `ShellFiles/Deploy-LightyDesign.ps1`。
3. 完成后会上传一个 zip artifact，内容即现成的可运行部署目录。

如果推送形如 `v1.0.0` 的 tag，该工作流还会自动：

1. 构建同样的部署目录。
2. 打包为 zip。
3. 附加到对应的 GitHub Release，便于直接分发或下载后快速部署。

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
4. DesktopHost 已提供健康检查、工作区读取、sheet 元信息、Excel 导入导出和 workbook 保存接口。
5. Electron 已能在开发模式和部署目录中自动拉起 DesktopHost。

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