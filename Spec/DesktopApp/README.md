# DesktopApp 子系统

## 职责

DesktopApp 子系统对应 app/desktop。它负责 Electron 主进程、预加载桥接、桌面壳、共享标签容器、通知中心和全局模式切换等跨编辑器基础设施。

## 当前已完成的工作

1. 已创建 Electron + React + Vite 的桌面前端骨架。
2. 已完成 package.json、TypeScript 配置、Vite 配置和 Electron 入口配置。
3. 已实现 Electron 主进程自动拉起 DesktopHost。
4. 已通过 preload 层向前端暴露 DesktopHost 信息、健康检查和工作区目录选择调用。
5. 已完成工作区目录选择、轻量导航树加载、多标签打开 Sheet 和只读表格查看。
6. 已补充工作区搜索、Sheet 文本筛选、行号列和真正的虚拟滚动表格。
7. 已支持按 workspace 维度持久化当前打开 tabs 和激活标签。
8. 已开始接入基础编辑状态，允许直接修改单元格文本并标记 dirty。
9. 已按列类型区分编辑器形态，例如 boolean 下拉、number 输入、reference/list 文本编辑。
10. 已支持当前 Sheet 的撤销、恢复、整表还原，以及未保存离开提醒。
11. 已接入基础快捷键系统，并支持撤销、恢复、保存快捷键。
12. 已接入基于现有 workbook 保存接口的前端保存按钮，并支持 Ctrl+S 保存当前工作簿。
13. 已完成 npm run build 构建验证。
14. 已补充失败时的红色错误消息气泡，并支持点击查看具体错误详情。
15. 已补充保存成功后的绿色消息气泡，并在错误详情面板中支持复制完整错误文本。
16. 已支持消息气泡自动消失、悬停暂停计时，以及从保存成功气泡直接定位到对应工作簿。
17. 已开始按装配层、Hook、渲染组件、共享类型拆分前端代码，降低 `App.tsx` 的维护压力。
18. 已继续把宿主连接、通知中心、工作区编辑会话下沉到独立 Hook，进一步压缩 `App.tsx` 的职责面。
19. 已在顶部工具栏新增“AI工具”下拉菜单，提供 MCP 服务开关、MCP 配置窗口、配置 JSON 复制和当前上下文导出入口。
20. 已把 MCP 开关状态保存到用户偏好，并在下次启动时沿用。
21. 已把当前活动 Sheet 与当前选区同步为桌面侧上下文快照，供 AI 工具与 MCP bridge 使用。
22. 已补充轻量 MCP bridge 的读写工具，包括工作区导航、Sheet schema、分页读取、类型校验、工作簿/表创建，以及基于现有 workbook 保存接口的行列结构化补丁。
23. 已支持在 MCP 配置窗口中编辑本地 HTTP 端口与路径、自动查找可用端口，并在启动失败时直接留在配置界面继续尝试启动。
24. 已限制桌面端为单实例运行；再次启动 LightyDesign 时会转而激活已有窗口，而不是再开一个新实例。
25. 已支持主编辑表格选区右下角拖动手柄；直线拖拽时可按 Excel 风格继续填充数字、日期与版本号格式文本，无法推断序列或对角扩展时回退为按块重复填充。
26. 已支持表头列编辑弹窗中的 validation 侧边说明区，可根据当前 Type 展示规则字段、默认值、示例和嵌套结构。
27. 已支持在列编辑弹窗内对 validation JSON 做结构预校验，并在保存前阻止非法规则提交。
28. 已支持从顶部工具栏手动校验当前工作簿，并在代码导出前自动执行同一套 validation 链路。
29. 已明确后续前端需要拆为 Desktop 壳、WorkbookEditor、FlowChartEditor 三个并列区域，而不是继续把两种编辑器揉在同一个装配文件里。
30. 已开始把 Workbook 专属组件、Hook 和共享类型迁入 `src/workbook-editor/`，为后续继续从桌面壳中剥离表格编辑逻辑做准备。
31. 已抽出 `WorkbookEditorView` 这一层页面视图组件，把 Sidebar、Header、Viewer 和列编辑弹窗组合从 `App.tsx` 中继续下沉。
32. 已抽出 `WorkbookEditorOverlays`，把 Workbook 相关的右键菜单、重命名弹窗、别名弹窗、代码导出弹窗和冻结弹窗从 `App.tsx` 中继续下沉。

## 当前已完成的桌面壳能力

1. Electron 主进程、DesktopHost 自动拉起和 preload bridge 已可用。
2. 顶部工具栏、通知中心、宿主连接状态和底部状态栏已可用。
3. 工作区会话、标签页基础设施和 workspace 维度持久化已可用。
4. MCP bridge、上下文快照和配置窗口已可用。

## 当前尚未实现的工作

1. 尚未把现有 Workbook 相关 UI 和状态完整拆到独立的 `WorkbookEditor` 目录；当前只完成了第一批组件、Hook 和类型迁移。
2. 尚未接入 `FlowChartEditor` 并列子系统。
3. 尚未实现全局模式切换驱动下的双导航树和双编辑器装配。
4. 尚未实现跨编辑器共享标签页模型。
5. 尚未把流程图引用字段的跳转与标签编排接入桌面壳。

## 当前前端结构说明

1. electron/main.ts
   Electron 主进程，负责窗口生命周期、启动 DesktopHost，并承载桌面侧 MCP 偏好、配置导出和编辑器上下文桥接。
2. electron/mcpServer.ts
   轻量 MCP bridge，负责通过本机 HTTP 端点暴露当前工作区导航、当前 Sheet 和当前选区等 AI 工具能力，并为 VS Code 生成可直接粘贴的 MCP 配置。
3. electron/preload.ts
   安全桥接层，负责把允许调用的宿主方法挂到 window.lightyDesign。
4. src/App.tsx
   当前桌面页面装配层。后续应继续收缩为壳层入口，并把 WorkbookEditor 与 FlowChartEditor 挂到并列目录。
5. src/workbook-editor/
   当前 Workbook 专属前端目录，已开始承载表格编辑相关组件、Hook 和类型定义。
6. src/workbook-editor/components/VirtualSheetTable.tsx
   虚拟滚动表格组件，负责表格渲染和单元格编辑控件切换。
7. src/components/ToastCenter.tsx
   通知中心组件，负责消息气泡栈和错误详情弹层渲染。
8. src/hooks/useEditorShortcuts.ts
   快捷键注册 Hook，负责把快捷键绑定到全局键盘事件。
9. src/hooks/useDesktopHostConnection.ts
   宿主连接 Hook，负责 DesktopHost 信息与健康状态轮询。
10. src/hooks/useToastCenter.ts
   通知中心 Hook，负责消息栈状态、自动消失和详情复制。
11. src/workbook-editor/hooks/useWorkspaceEditor.ts
   当前主要服务表格编辑会话。后续需要继续按桌面壳共享状态与 WorkbookEditor 专属状态重新拆分。
12. src/workbook-editor/types/desktopApp.ts
   当前 Workbook 编辑器使用的共享类型、轻量模型、validation schema DTO 和纯工具函数。
13. src/styles.css
   当前桌面界面样式，包括侧边栏、tabs、表格区、表头编辑器和通知层。
14. src/workbook-editor/components/ColumnEditorDialog.tsx
   列编辑弹窗，负责表头属性输入、Type 校验、validation schema 侧边说明区和规则预校验。

## 前端拆分标准

1. `App.tsx` 只保留页面装配、顶层状态和业务流程，不再承载可复用渲染块。
2. 可独立复用或可独立测试的 JSX 区块，优先拆到 `src/components/`。
3. 带副作用的通用行为，例如快捷键、通知调度，优先拆到 `src/hooks/`。
4. 只依赖输入参数、不依赖 React 生命周期的模型与工具，统一收敛到 `src/types/` 或后续的 `src/utils/`。
5. 后续新增功能如果让单文件再次同时承担多种职责，应继续按以上边界拆分，而不是回退到“大 App.tsx”模式。
6. 宿主连接、工作区编辑会话、通知中心等“状态密集 + 副作用密集”的能力，应优先用 Hook 承载，而不是留在装配层 JSX 文件中。
7. Workbook 相关界面和流程图相关界面必须拆到并列目录，不再通过同一组组件文件上的条件分支混合维护。

## 当前错误反馈

1. 工作区加载失败、Sheet 加载失败、工作簿保存失败时，会弹出红色错误消息气泡。
2. 错误气泡支持点击查看详情，展示错误来源、时间和完整错误文本。
3. 保存成功时，会弹出绿色成功消息气泡。
4. 错误详情支持一键复制完整错误文本。
5. 消息气泡支持自动消失，鼠标悬停时会暂停计时。
6. 保存成功气泡支持直接定位到对应工作簿。
7. 消息气泡支持单独关闭，最多保留最近 5 条消息。

## 当前快捷键

1. Ctrl+S
   保存当前工作簿。
2. Ctrl+Z
   撤销当前 Sheet 的最近一次编辑。
3. Ctrl+Y / Ctrl+Shift+Z
   恢复当前 Sheet 的最近一次撤销。

## 与 Core 和 DesktopHost 的当前关系

截至目前，DesktopApp 已消费 DesktopHost 的健康检查、工作区导航和 Sheet 详情接口。

由于 Core 已经具备工作区读取、表头反序列化和惰性值解析基础，后续 DesktopApp 的真实编辑器能力应通过 DesktopHost 暴露这些 Core 能力，而不是在前端直接实现 txt、header 或引用解析。

尤其是值解析相关能力，普通单元格显示和普通文本编辑应继续以原始文本为主；只有专用引用编辑器、验证面板等明确需要真实语义值的场景，才应通过宿主按需请求解析结果。

## 当前状态结论

DesktopApp 已经具备稳定的桌面壳基础设施，但它不应继续承载全部业务编辑界面。下一阶段的重点是把表格编辑器整体切出为 WorkbookEditor，再在同级引入 FlowChartEditor，由桌面壳只负责模式切换、标签容器、通知和宿主桥接。
