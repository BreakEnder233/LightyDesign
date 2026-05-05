# 流程图添加节点菜单设计

## 概述

重构流程图编辑器的"添加节点"体验，从当前的重型模态对话框改为**双入口混合模式**：
- **Quick Add 浮层**（Ctrl+P 触发）：搜索优先，键盘友好，适合熟练用户快速添加
- **树形浏览器对话框**：浏览优先，适合不熟悉节点库的策划按目录查找

同时新增节点 `description` 字段以改善搜索和预览体验。

---

## 问题分析

当前 `FlowChartNodeDialog` 存在三个核心问题：

| 问题 | 影响 |
|------|------|
| 全屏模态框太重，遮挡整个编辑器 | 打断工作流，操作成本高 |
| 节点列表平铺展示，无视目录层级 | 上千节点无法浏览，只能搜索 |
| 预览面板只显示种类和路径 | 无法判断节点是否合适 |

---

## 设计概览

```
用户操作流程

熟练策划:  Ctrl+P → 输入关键词 → 回车添加  (2-3 秒)
不熟策划:  Ctrl+P → 搜不到 → "浏览全部" → 树形浏览 → 选中 → 添加  (5-15 秒)
程序:      右键菜单"新建节点" → Ctrl+P 同入口
```

---

## 组件一：Quick Add 浮层 (`QuickAddOverlay`)

### 触发方式

| 方式 | 说明 |
|------|------|
| `Ctrl+P` | **主要触发方式**，画布聚焦时生效 |
| `/` 键 | 备选触发方式 |
| 画布右键菜单 → "新建节点" | 鼠标右键触发，可传入画布位置 |
| 工具栏按钮 | 次要入口 |

### 定位与尺寸

- 出现在画布**视口中心偏上**（点击右键时传入位置则出现在画布右键位置）
- 宽度 **480px**，高度自适应，最大 400px，溢出滚动
- 半透明 backdrop，点击 backdrop 关闭
- 非全屏遮罩，不遮挡编辑器状态栏和工具栏

### 搜索行为

- 自动获取焦点
- **Fuzzy search**，匹配字段按权重排序：
  1. `name`（最高权重）
  2. `alias`
  3. `relativePath`
  4. `description`（新增，权重高于 nodeKind）
  5. `nodeKind`（最低权重）
- 支持 `>` 前缀语法过滤节点种类：`>event` 只显示 event 类型
- 支持 `path:` 前缀限定目录范围：`path:Event/Player`

### 搜索结果展示

```
┌──────────────────────────────────────────┐
│ 🔍 搜索节点类型...       (Ctrl+P)        │
├──────────────────────────────────────────┤
│ Event                                    │
│  ├ OnEnterScene ← 进入场景    event  ◈   │
│  └ OnLeaveScene                event  ◈   │
│ Flow                                      │
│  ├ Patrol/PatrolRoute          flow  ◆   │
│  └ Combat/AttackTarget         flow  ◆   │
│ Compute                                   │
│  └ Math/CalcDistance           compute ◆  │
├──────────────────────────────────────────┤
│ ↓ 浏览全部节点...                       │
└──────────────────────────────────────────┘
```

**搜索结果分组**：
- 按**一级目录名**分组（Event / Flow / Compute）
- 每组显示目录名作为组标题
- 每组默认展开，搜索结果少于 3 组时全部展开
- 组标题可折叠/展开

**搜索空状态**：
- 搜索无匹配时显示"未找到匹配节点定义"
- 底部显示"浏览全部节点…"入口
- 建议调整搜索关键词或使用 `path:` 缩小范围

### 交互规则

| 操作 | 行为 |
|------|------|
| ↑↓ | 在搜索结果中导航 |
| 回车 | 添加选中的节点并关闭浮层 |
| Esc | 关闭浮层 |
| 点击"浏览全部节点…" | 打开树形浏览器对话框 |
| 添加后 | 节点自动放置在视口中心（或右键菜单传入的位置） |
| 搜索空 + 回车 | 无操作，不停留在浮层 |

### 快捷键注册

- 注册在 `useEditorShortcuts` hook 中
- `Ctrl+P` 在流程图编辑视图激活时有效
- 与其他全局快捷键（如 Ctrl+S 保存）不冲突

---

## 组件二：树形浏览器对话框 (`NodeTreeDialog`)

### 触发方式

| 方式 | 说明 |
|------|------|
| Quick Add 浮层底部"浏览全部节点…" | 主要入口 |
| 侧边栏"节点树"标签 → 操作按钮 | 次要入口 |
| 编辑器菜单栏 → 新建节点 | 次要入口 |

### 布局结构

```
┌──────────────────────────────────────────────────────────┐
│  从节点库选择类型                     · 共 1,248 个类型  │
├──────────────────────┬───────────────────────────────────┤
│ 🔍 过滤节点...        │  OnEnterScene                     │
│                       │  进入场景                          │
│ 📂 Event              │  Event/Player/OnEnterScene        │
│   📂 Player           │  ·  event                        │
│     ◈ OnEnterScene    │                                   │
│     ◈ OnLeaveScene    │  触发玩家进入场景时触发。         │
│   📂 Monster          │  可用于场景加载、初始状态设置等。  │
│     ◈ OnSpawn         │                                   │
│     ◈ OnDeath         │  端口                              │
│   📂 System           │  Enter        flow  output  ◆     │
│     ◈ OnInit          │                                   │
│     ◈ OnUpdate        │  属性                              │
│                       │  SceneId      int32               │
│ 📂 Flow               │  PlayerCount  int32               │
│   📂 Patrol           │                                   │
│     ◆ PatrolRoute     │                                   │
│     ◆ WaitPoint       │                                   │
│   📂 Combat           │                                   │
│     ◆ AttackTarget    │                                   │
│     ◆ SkillCast       │                                   │
│                       │                                   │
│ 📂 Compute            │                                   │
│   📂 Math             │                                   │
│     ◇ CalcDistance    │                                   │
│     ◇ ClampValue      │                                   │
├──────────────────────┴───────────────────────────────────┤
│              [取消]                 [添加节点]             │
└──────────────────────────────────────────────────────────┘
```

### 左侧：目录树

**视觉设计**：
- 按节点定义文件的目录层级组织
- 目录图标：`📂`（VS Code 风格文件夹图标）
- 节点图标按种类区分：
  - `◈` event（蓝色，`#4fc1ff`）
  - `◆` flow（绿色，`#72d08d`）
  - `◇` compute（橙色，`#f0b35b`）
- 每行显示：图标 + 名称（+ 别名灰色小字）
- 选中行高亮样式同侧边栏行选中（蓝色背景 + 左边框）

**搜索过滤**：
- 输入搜索关键词时，自动展开匹配节点所在目录
- 匹配的节点行高亮背景
- 清空搜索时恢复到保存的展开状态
- 搜索逻辑同 Quick Add（fuzzy search，相同权重体系）

**展开/折叠状态持久化**：
- 存储到 `localStorage`，Key 格式：`lightydesign.flowchart.treeExpanded.{workspaceRootPath}`
- Value：`Set<string>`（展开的目录路径列表）
- 切换流程图根目录时根据 workspace 路径加载不同的展开状态
- 目录展开/折叠时自动保存

### 右侧：节点详情预览

**展示信息**：

```
[节点名称]              [种类标签]
 别名（如有）
 完整路径
 ─────────────────────
 概述
 [description 文本]
 ─────────────────────
 端口
 input:
   · flowIn     flow
 output:
   · flowOut    flow
 ─────────────────────
 属性
 · sceneId      int32
 · playerCount  int32
```

**交互**：
- 选中左侧节点后，右侧立即更新
- description 文本最多显示 6 行，超出用省略号，可展开查看完整内容
- 端口按输入/输出分组展示
- 属性显示名称和类型

### 底部操作栏

- **取消**：关闭对话框
- **添加节点**：将选中的节点添加到画布，关闭对话框
- **双击节点树中的节点项**：等同于选中 + 添加

---

## 新增：节点概述字段 `description`

### JSON Schema 变更

在节点定义 JSON 顶层新增可选字段：

```json
{
  "formatVersion": "1.0",
  "name": "OnEnterScene",
  "alias": "进入场景",
  "nodeKind": "event",
  "description": "触发玩家进入场景时触发。可用于场景加载、初始状态设置等。",
  "properties": [],
  "computePorts": [],
  "flowPorts": []
}
```

字段约定：
1. `description`（`string`，可选）—— 节点概述，纯文本，用于搜索和预览
2. 可为空或省略
3. 建议 1-3 句话描述节点用途和行为
4. 不参与代码生成，仅用于编辑器内检索和理解

### TypeScript 类型变更

```typescript
// FlowChartNodeDefinitionDocument 新增
interface FlowChartNodeDefinitionDocument {
  formatVersion: string;
  name: string;
  alias?: string | null;
  nodeKind: FlowChartNodeKind;
  description?: string | null;  // ← 新增
  properties: FlowChartPropertyDefinition[];
  computePorts: FlowChartComputePortDefinition[];
  flowPorts: FlowChartFlowPortDefinition[];
}

// FlowChartNodeDefinitionSummary 新增
interface FlowChartNodeDefinitionSummary {
  kind: "flowchart-node";
  relativePath: string;
  filePath: string;
  name: string;
  alias?: string | null;
  nodeKind: FlowChartNodeKind;
  description?: string | null;  // ← 新增
}
```

### 搜索权重

```
name > alias > relativePath > description > nodeKind
```

- description 权重大于 nodeKind
- 在 fuzzy search 实现中，description 匹配的得分低于 name/alias/relativePath
- 适用于 Quick Add 搜索和树形浏览器的搜索过滤

### 节点定义对话框变更

在 `FlowChartNodeDefinitionDialog` 的基础信息行中，在名称/别名/节点种类之后新增一行：

```
┌──────────────────────────────────────────┐
│  概述 (description)                       │
│  ┌──────────────────────────────────────┐ │
│  │ 触发玩家进入场景时触发。可用于场景   │ │
│  │ 加载、初始状态设置等。               │ │
│  └──────────────────────────────────────┘ │
│  textarea, 自适应高度, 最多 200 字        │
└──────────────────────────────────────────┘
```

- 使用 `<textarea>` 而非 `<input>` 以支持多行文本
- 高度自适应，最小 3 行，最大 8 行
- 字符限制 200 字（前端提示，非强制校验）

### 后端变更

DesktopHost 的导航 API（`/api/workspace/flowcharts/navigation`）返回的 `nodeDefinitions` 数组中，每个 summary 对象需要包含 `description` 字段。

读取节点定义 JSON 文件时，如果顶层存在 `description` 字段则返回，否则返回 `null`。

---

## 组件依赖关系

```
FlowChartEditorView
 ├── QuickAddOverlay (新增)
 │    ├── 搜索: fuzzySearch utility (新增)
 │    └── 进入树形浏览器: openNodeTreeDialog()
 ├── NodeTreeDialog (新增)
 │    ├── 左侧: TreeView (复用现有 TreeView 组件)
 │    ├── 右侧: NodePreviewPanel (新增)
 │    ├── 搜索: fuzzySearch utility (新增)
 │    └── 持久化: localStorage
 └── FlowChartNodeDialog (保留，但入口改为从树形浏览器底部进入)
```

### 废弃

- `FlowChartNodeDialog` 不再从右键菜单/Ctrl+P 触发
- 保留组件本身，但入口精简为树形浏览器的次要路径

### 复用

- `TreeView` 组件：树形浏览器左侧目录树复用现有的 `TreeView` / `TreeViewRow` / `TreeViewDragLayer`
- `DialogBackdrop`：树形浏览器使用现有的 DialogBackdrop

---

## 实现范围与优先级

### P0（必须）
1. `description` 字段：类型定义 + JSON schema 文档更新
2. `description` 字段：节点定义编辑对话框 UI
3. Quick Add 浮层：基本搜索 + 选择 + 添加
4. 树形浏览器对话框：基本树形浏览 + 预览
5. Ctrl+P 快捷键注册

### P1（重要）
1. Fuzzy search 实现（含权重体系）
2. 搜索分组展示
3. 展开状态持久化

### P2（锦上添花）
1. `>` 和 `path:` 前缀语法
2. description 在搜索结果中作为上下文提示展示
3. 搜索结果空状态的"浏览全部"入口
4. 浮层 backdrop 半透明效果

---

## 不包含的范围

- 不修改流程图实例 JSON 格式
- 不修改代码生成逻辑
- 不修改画布节点渲染
- 不修改侧边栏已有的节点树标签（仅增加互动入口）

---

## Spec 自我审查

- [x] 无占位符 / TODO / 未完成章节
- [x] 内部一致性：架构描述与组件描述匹配
- [x] 范围聚焦：只涉及添加节点菜单，不涉及其他子系统
- [x] 无歧义要求：所有搜索权重、交互规则、持久化方式都有明确定义
