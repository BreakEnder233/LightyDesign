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

## 文档入口

1. [Spec/README.md](Spec/README.md)：整体协议与目录约定。
2. [Spec/Core/README.md](Spec/Core/README.md)：Core 当前能力与边界。
3. [Spec/DesktopHost/README.md](Spec/DesktopHost/README.md)：宿主接口与职责。
4. [Spec/Tooling/README.md](Spec/Tooling/README.md)：脚本与交付方式。