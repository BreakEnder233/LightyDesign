# LightyDesign

LightyDesign 是一个面向策划表协议的桌面编辑器项目。当前仓库已经包含三部分基础骨架：

1. .NET 解决方案：负责核心模型、生成器和本地宿主。
2. Electron 桌面壳：负责桌面窗口、前端页面和与 .NET 宿主的连接。
3. 规格文档：位于 Spec/README.md，用来约束工作区目录、表头格式、数据转义和导出行为。

如果你没有 Electron 或 Web 开发经验，可以把这个项目理解成下面的结构：

1. Electron 负责“桌面程序外壳”。它会打开一个原生窗口。
2. React + Vite 负责“窗口里面显示的前端页面”。
3. DesktopHost 是一个本地 .NET Web API。它在本机启动，给 Electron 提供数据和功能。
4. Electron 在启动时会自动尝试拉起 DesktopHost，然后前端通过安全桥接查询宿主是否已就绪。

## 目录说明

```text
LightyDesign/
  LightyDesign.sln
  README.md
  Spec/
    README.md
  ShellFiles/
    Bootstrap-LightyDesign.ps1
  src/
    LightyDesign.Core/
      LightyDesign.FileProcess/
    LightyDesign.Generator/
    LightyDesign.DesktopHost/
  tests/
    LightyDesign.Tests/
  app/
    desktop/
      electron/
      src/
      package.json
```

## 先安装什么

第一次使用前，建议先准备下面的软件：

1. .NET SDK 9.0
   当前解决方案使用 net9.0。你可以在命令行执行 `dotnet --version` 检查是否安装成功。
2. Node.js
   建议安装 LTS 版本。安装后可以用 `node --version` 和 `npm --version` 检查。
3. Git
   用于拉取和更新仓库。
4. PowerShell
   Windows 默认自带。项目的一键引导脚本使用 PowerShell 编写。

## 最简单的启动方式

如果你只是想先把整个项目准备好，并验证是否能正常构建，最简单的方法是运行脚本：

```powershell
powershell -ExecutionPolicy Bypass -File .\ShellFiles\Bootstrap-LightyDesign.ps1
```

这个脚本会做四件事：

1. 还原 .NET 解决方案依赖。
2. 构建 .NET 解决方案。
3. 安装 Electron 前端依赖。
4. 构建 Electron 前端。

如果你希望脚本在构建完成后直接启动桌面应用，可以运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\ShellFiles\Bootstrap-LightyDesign.ps1 -RunDesktop
```

## 手动使用方法

如果你不想用脚本，也可以按下面的顺序手动执行。

### 1. 构建 .NET 解决方案

在仓库根目录执行：

```powershell
dotnet restore .\LightyDesign.sln
dotnet build .\LightyDesign.sln
```

这一步会构建下面几个项目：

1. LightyDesign.Core：核心领域模型与协议。
2. LightyDesign.FileProcess：xlsx 与工作簿模型之间的 Excel 转换层。
3. LightyDesign.Generator：未来用于生成 LDD 代码。
4. LightyDesign.DesktopHost：本地宿主 API。
5. LightyDesign.Tests：测试项目。

### 2. 安装桌面前端依赖

进入桌面前端目录：

```powershell
cd .\app\desktop
npm install
```

`npm install` 会下载 React、Vite、Electron 等依赖。第一次执行会比较慢，这是正常现象。

### 3. 启动桌面开发模式

还是在 `app\desktop` 目录执行：

```powershell
npm run dev
```

这个命令会启动两部分内容：

1. Vite 开发服务器：负责前端页面热更新。
2. Electron：负责打开桌面窗口。

当 Electron 启动后，它会自动尝试拉起 DesktopHost。你不需要另外手工开一个 .NET 终端。

### 4. 如果你只想单独调试 DesktopHost

可以在仓库根目录单独启动宿主：

```powershell
dotnet run --project .\src\LightyDesign.DesktopHost\LightyDesign.DesktopHost.csproj --no-launch-profile --urls http://127.0.0.1:5000
```

启动后，下面这个地址会返回健康检查 JSON：

```text
http://127.0.0.1:5000/api/health
```

## Electron 是怎么接入 DesktopHost 的

如果你不熟悉 Electron，可以先只记住这三层：

1. `app/desktop/electron/main.ts`
   这是 Electron 主进程。它负责创建窗口、自动启动 DesktopHost，并提供 IPC 接口。
2. `app/desktop/electron/preload.ts`
   这是安全桥接层。前端页面不能直接随意访问 Node 或系统 API，所以这里会把允许暴露的方法挂到 `window.lightyDesign` 上。
3. `app/desktop/src/App.tsx`
   这是 React 页面。它会通过 `window.lightyDesign` 查询 DesktopHost 的运行状态，并把结果显示在界面中。

你现在可以把这套交互理解为：

```text
React 页面 -> preload 安全桥 -> Electron 主进程 -> DesktopHost API
```

## 常用命令

在仓库根目录：

```powershell
dotnet build .\LightyDesign.sln
dotnet test .\LightyDesign.sln
```

在 `app\desktop` 目录：

```powershell
npm install
npm run dev
npm run build
```

## 开发建议

如果你后续要继续开发，推荐按这个顺序推进：

1. 先完善 DesktopHost 的工作区扫描接口。
2. 再让 Electron 前端从宿主读取真实工作簿和表结构。
3. 最后接入 LightyDesign.Generator，把导出流程串起来。

这样做的好处是：前端页面、桌面壳和 .NET 核心逻辑可以逐步联调，不会一次把问题混在一起。

## 常见问题

### 1. 双击脚本没有反应

请不要直接双击 PowerShell 文件，建议在 PowerShell 终端里运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\ShellFiles\Bootstrap-LightyDesign.ps1
```

### 2. `npm install` 很慢或者失败

这通常和网络环境有关。先重试一次，确认 Node.js 已正确安装。如果 Electron 依赖下载失败，重新执行 `npm install` 往往就可以恢复。

### 3. Electron 窗口打开了，但宿主状态一直不是 Connected

先检查这条命令是否可以单独启动：

```powershell
dotnet run --project .\src\LightyDesign.DesktopHost\LightyDesign.DesktopHost.csproj --no-launch-profile --urls http://127.0.0.1:5000
```

如果这条命令本身失败，优先修复 .NET 环境或宿主代码。

### 4. 我应该先看哪个文档

建议按这个顺序看：

1. 本 README：先学会项目怎么启动。
2. Spec/README.md：再理解表结构、文件格式和导出规则。

## 当前状态

当前仓库已经具备下面的基础能力：

1. .NET 解决方案可构建、可测试。
2. Electron 前端可构建。
3. Electron 已经能够自动启动 DesktopHost，并在界面上显示宿主状态。
4. Core 已实现工作区、工作簿、表、列定义和数据行等基础模型。
5. Core 已实现工作区扫描、header/txt 读取和基础引用解析。
6. Core 已实现第一版惰性值解析，支持按需解析并在单元格修改后清除该格缓存。
7. FileProcess 已实现 xlsx 与 `LightyWorkbook` 之间的基础双向转换。

下一步最适合继续实现的是：把 DesktopHost 接到真实工作区扫描与 FileProcess 的 Excel 导入导出链路上。