# Workspace 子系统

## 职责

Workspace 子系统描述工作区目录结构、文件归属和跨子系统共享的落盘约定。后续 Core、DesktopHost、DesktopApp 和 Generator 都应以这里的目录协议为准。

## 文档导航

1. [Template.md](Template.md)

## 当前已完成的工作

1. 已确定新工作区不兼容旧扁平目录结构。
2. 已确定工作区根目录显式区分 `Workbooks` 和 `FlowCharts`。
3. 已确定流程图节点定义目录为工作区共享目录 `FlowCharts/Nodes`，且允许继续使用目录树组织分类。
4. 已确定流程图实例目录为 `FlowCharts/Files`，允许继续按文件夹组织树形结构。
5. 已确定生成代码输出目录需要在 `Generated` 下继续区分 `Workbooks` 和 `FlowCharts`。
6. Core 已切换到 `Workbooks` / `FlowCharts` 双根目录加载与保存协议。
7. DesktopHost 已按新目录结构返回工作区导航，并提供 FlowChart 节点定义与流程图文件的读取、保存接口。
8. DesktopApp 已消费新的 FlowChart 资产导航与保存接口，并在 FlowChartEditor 内按工作区真实资产读写节点定义与流程图文件。
9. 已制作正式的工作区模板目录，用于承载完整工作区结构、默认表格、默认流程控制节点、默认集合访问节点、默认简单计算节点和默认流程图样例。
10. 新建工作区流程已切换为直接复制完整工作区模板内容，而不是继续在业务代码里零散创建目录和默认文件。
11. 打开工作区后，顶部工具栏的“文件”下拉菜单已提供入口，可按最新模板刷新流程图内置节点定义。

## 当前尚未实现的工作

1. 模板更新入口当前只覆盖流程图内置节点；如果后续需要让默认工作簿、默认样例流程图等内容也支持增量更新，应在同一入口下继续扩展更新策略与冲突处理规则。

## 工作区模板

工作区模板规范已拆到 [Template.md](Template.md)。后续新建工作区应基于模板复制，而不是继续在代码里零散创建默认目录和默认文件。

## 目录结构

```text
Workspace/
  config.json
  headers.json
  codegen.json
  Workbooks/
    Item/
      Consumable.txt
      Consumable_header.json
  FlowCharts/
    Nodes/
      Event/
        Player/
          OnEnter.json
    Files/
      Main/
        LoginFlow.json
```

## 目录约定

1. `Workbooks` 下每个子目录是一个工作簿，继续沿用 `.txt` 与 `_header.json` 成对文件协议。
2. `FlowCharts/Nodes` 下所有节点定义对整个工作区共享，不跟随单个流程图重复存放。
3. `FlowCharts/Nodes` 下允许使用目录树组织分类，节点定义相对路径同时参与类型标识和代码生成命名空间。
4. `FlowCharts/Files` 下每个 json 文件是一张流程图，文件夹仅用于组织分类。
5. 流程图实例通过节点定义文件路径和文件名引用节点定义。
6. 旧格式工作区不做兼容读取，也不提供自动迁移假设；如需迁移，应单独提供迁移工具或脚本。

## 生成目录约定

```text
CodeGenRoot/
  Generated/
    Workbooks/
    FlowCharts/
  Extended/
```

1. `Generated/Workbooks` 存放表格相关生成代码。
2. `Generated/FlowCharts` 存放流程图节点定义与流程图运行时骨架。
3. `Extended` 继续保留给手写扩展代码，不由生成流程清空。

## 当前状态结论

Workspace 子系统的目录协议、模板目录与新建工作区流程已经形成闭环。当前 Core、DesktopHost 和 DesktopApp 都已按同一份工作区模板工作；后续若继续扩展模板能力，重点将转向“模板内容的增量更新策略”而不是基础目录协议本身。
