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

## 当前尚未实现的工作

1. Core 的工作区加载器尚未切换到新目录协议。
2. 工作区初始化能力尚未创建 `Workbooks`、`FlowCharts/Nodes` 和 `FlowCharts/Files` 默认目录。
3. SampleWorkspace 和相关测试样例尚未迁移到新结构。
4. DesktopHost 和 DesktopApp 尚未按新目录结构返回导航与创建资产。
5. 尚未制作正式的工作区模板目录，用于承载完整工作区结构、默认表格、默认控制节点、默认集合访问节点和默认简单计算节点。
6. 新建工作区流程尚未改为直接复制工作区模板内容。

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

Workspace 子系统的目录协议已经冻结，可以作为后续 Core、DesktopHost、DesktopApp、Generator 和测试改造的共同输入。下一步重点是把新协议落实到加载、保存、初始化和样例工作区。