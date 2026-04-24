# WorkbookEditor 子系统

## 职责

WorkbookEditor 子系统承载当前表格编辑器的全部前端界面、交互和会话状态，不再和流程图编辑器共用同一批视图文件。

## 相关文档

1. [CompositeValueEditing.md](CompositeValueEditing.md)：定义 object / list / dictionary 等复合值的 JSON 兼容、右键扩展编辑器和递归模态规则。

## 当前已完成的工作

1. 已完成真实工作区加载、工作簿导航、Sheet 标签页打开和虚拟滚动表格显示。
2. 已完成单元格编辑、dirty 标记、撤销恢复、快捷键保存和未保存离开提醒。
3. 已完成列编辑弹窗、类型校验、validation schema 提示和规则结构预校验。
4. 已完成工作簿保存、手动校验和代码导出前校验入口。
5. 已确定该编辑器需要从桌面壳中整体拆出，形成独立组件目录和状态边界。
6. 已开始把 Workbook 专属的组件、Hook 和类型迁移到 `app/desktop/src/workbook-editor/`。
7. 已抽出 `WorkbookEditorView` 页面视图层，用于承载 Sidebar、Header、Viewer 和列编辑弹窗组合。
8. 已抽出 `WorkbookEditorOverlays`，用于承载 Workbook 的右键菜单与主要弹窗编排。

## 当前尚未实现的工作

1. 现有表格编辑界面仍主要由 DesktopApp 的公共装配层编排，尚未进一步收缩为独立的 WorkbookEditor 页面入口。
2. 表格字段中的流程图引用类型尚未接入。
3. 从表格字段跳转打开流程图标签页的交互尚未实现。
4. 面向 WorkbookEditor 的独立状态 Hook、路由装配和测试边界尚未单独建立。
5. object / 容器复合值的 JSON 直写兼容、按类型右键打开额外编辑器，以及递归类型树编辑机制尚未落地，具体设计见 [CompositeValueEditing.md](CompositeValueEditing.md)。

## 目标边界

1. WorkbookEditor 只处理工作簿树、Sheet 标签页、表格编辑、表头编辑、校验和保存。
2. WorkbookEditor 不负责流程图画布、流程图节点定义和流程图拓扑校验。
3. 需要和 DesktopApp 共享的能力，仅限于标签页容器、宿主连接、通知中心和全局模式状态。

## 建议目录方向

1. `app/desktop/src/workbook-editor/`：放置表格编辑器组件、Hook、类型和样式。
2. `app/desktop/src/shell/`：只保留顶层窗口装配、状态栏、全局模式切换和共享基础设施。
3. `app/desktop/src/flowchart-editor/`：与 WorkbookEditor 并列，而不是嵌套在其中。

## 当前状态结论

WorkbookEditor 已经具备可用的业务功能，但其代码边界还没有从桌面壳中完全抽离。下一步不是继续往现有装配层里叠条件分支，而是先完成前端目录和状态边界拆分。