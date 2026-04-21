
# LightyDesign 规范说明

本目录用于描述各子系统职责、当前实现状态和后续待办。需要先看目录协议时，优先阅读 [Workspace/README.md](Workspace/README.md)；需要看流程图边界时，优先阅读 [FlowCharts/README.md](FlowCharts/README.md)。

## 特殊文件夹

1. `SampleWorkspace` 用于测试编辑功能的策划数据工作区，其中的文件不属于工程源码。
2. `SampleWorkspaceCodeGen` 用于测试代码生成功能的目标文件夹，其中的文件不属于工程源码。

## 文档导航

1. [Workspace/README.md](Workspace/README.md)
2. [FlowCharts/README.md](FlowCharts/README.md)
3. [WorkbookEditor/README.md](WorkbookEditor/README.md)
4. [FlowChartEditor/README.md](FlowChartEditor/README.md)
5. [Core/README.md](Core/README.md)
6. [FileProcess/README.md](FileProcess/README.md)
7. [DesktopHost/README.md](DesktopHost/README.md)
8. [DesktopApp/README.md](DesktopApp/README.md)
9. [Generator/README.md](Generator/README.md)
10. [Tests/README.md](Tests/README.md)
11. [MCP/README.md](MCP/README.md)
12. [Tooling/README.md](Tooling/README.md)

## 当前架构重点

1. 工作区协议已切换为显式双根目录：`Workbooks` 和 `FlowCharts`。
2. 旧工作区结构不做兼容。
3. 流程图节点定义位于工作区共享目录 `FlowCharts/Nodes`，且允许形成目录树。
4. 流程图实例位于 `FlowCharts/Files`，按文件夹组织树形结构。
5. 桌面端后续拆为三个并列部分：桌面壳、WorkbookEditor、FlowChartEditor。
6. 生成代码输出需在 `Generated` 下继续区分 `Workbooks` 和 `FlowCharts`。

## 最小试运行方法

1. 在仓库根目录执行 `dotnet test .\LightyDesign.sln`。
2. 在 `app\desktop` 目录执行 `npm run build`。
3. 在仓库根目录执行 `pwsh -ExecutionPolicy Bypass -File .\ShellFiles\Bootstrap-LightyDesign.ps1 -RunDesktop`。

## 当前工作区结构

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

## 当前表格协议说明

1. `Workbooks` 下每个子目录是一个工作簿。
2. 每个 Sheet 继续由 `.txt` 数据文件和 `_header.json` 表头文件构成。
3. 工作区级 `headers.json` 继续描述表头从上到下每一行的语义和配置。

## 当前流程图协议说明

1. `FlowCharts/Nodes` 下每个 json 文件是一个节点定义。
2. `FlowCharts/Files` 下每个 json 文件是一张流程图。
3. 流程图实例通过节点定义文件路径和文件名引用节点定义。
4. 流程图实例需要持久化节点坐标。

## 当前状态结论

Spec 已开始从“按工程项目描述”扩展为“按未来开发边界描述”。后续代理在动手前，应先确认自己处理的是工作区协议、表格编辑器、流程图领域、流程图编辑器，还是底层 Core、DesktopHost、Generator 实现。