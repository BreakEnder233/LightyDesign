# DesktopApp 子系统

## 职责

DesktopApp 子系统对应 app/desktop。它包含 Electron 主进程、预加载桥接、React 前端页面和 Vite 构建配置，负责把 LightyDesign 以桌面应用方式呈现给用户。

## 当前已完成的工作

1. 已创建 Electron + React + Vite 的桌面前端骨架。
2. 已完成 package.json、TypeScript 配置、Vite 配置和 Electron 入口配置。
3. 已实现 Electron 主进程自动拉起 DesktopHost。
4. 已通过 preload 层向前端暴露 DesktopHost 信息、健康检查和工作区目录选择调用。
5. 已完成工作区目录选择、轻量导航树加载、多标签打开 Sheet 和只读表格查看。
6. 已补充工作区搜索、Sheet 文本筛选、行号列和分页查看。
7. 已支持按 workspace 维度持久化当前打开 tabs 和激活标签。
8. 已完成 npm run build 构建验证。

## 当前前端结构说明

1. electron/main.ts
   Electron 主进程，负责窗口生命周期与启动 DesktopHost。
2. electron/preload.ts
   安全桥接层，负责把允许调用的宿主方法挂到 window.lightyDesign。
3. src/App.tsx
   React 页面入口，目前承担工作区导航、多标签状态和 Sheet 只读查看。
4. src/styles.css
   当前桌面界面样式，包括侧边栏、tabs、表格区和分页控件。

## 当前尚未实现的业务能力

1. 真实工作簿导航树。
2. 可编辑表格与保存流程。
3. 表头编辑器。
4. 导出按钮与宿主联动。
5. Excel 导入导出流程。
6. 更彻底的大表性能方案，例如虚拟滚动。

## 与 Core 和 DesktopHost 的当前关系

截至目前，DesktopApp 已消费 DesktopHost 的健康检查、工作区导航和 Sheet 详情接口。

由于 Core 已经具备工作区读取、表头反序列化和惰性值解析基础，后续 DesktopApp 的真实编辑器能力应通过 DesktopHost 暴露这些 Core 能力，而不是在前端直接实现 txt、header 或引用解析。

尤其是值解析相关能力，普通单元格显示和普通文本编辑应继续以原始文本为主；只有专用引用编辑器、验证面板等明确需要真实语义值的场景，才应通过宿主按需请求解析结果。

## 当前状态结论

DesktopApp 已经从“仅有桌面壳状态页”进入“可浏览真实工作区并按标签查看 Sheet”的阶段。下一阶段应继续沿着现有 tabs 与 viewer 状态结构推进编辑、保存和更细粒度的大表性能优化，而不是在前端重建协议层。 
