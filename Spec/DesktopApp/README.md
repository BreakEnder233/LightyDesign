# DesktopApp 子系统

## 职责

DesktopApp 子系统对应 app/desktop。它包含 Electron 主进程、预加载桥接、React 前端页面和 Vite 构建配置，负责把 LightyDesign 以桌面应用方式呈现给用户。

## 当前已完成的工作

1. 已创建 Electron + React + Vite 的桌面前端骨架。
2. 已完成 package.json、TypeScript 配置、Vite 配置和 Electron 入口配置。
3. 已实现 Electron 主进程自动拉起 DesktopHost。
4. 已通过 preload 层向前端暴露 DesktopHost 信息与健康检查调用。
5. 已在 React 页面中显示宿主地址、运行时和宿主状态。
6. 已完成 npm run build 构建验证。

## 当前前端结构说明

1. electron/main.ts
   Electron 主进程，负责窗口生命周期与启动 DesktopHost。
2. electron/preload.ts
   安全桥接层，负责把允许调用的宿主方法挂到 window.lightyDesign。
3. src/App.tsx
   React 页面入口，用于显示桌面壳状态和宿主状态。
4. src/styles.css
   当前桌面界面样式。

## 当前尚未实现的业务能力

1. 真实工作簿导航树。
2. 多标签页表格编辑器。
3. 表头编辑器。
4. 导出按钮与宿主联动。
5. Excel 导入导出流程。

## 当前状态结论

DesktopApp 已经完成基础集成链路，可以打开桌面窗口并连接本地 .NET 宿主。现阶段它更像一个已接线完成的壳层，而不是完整编辑器。
