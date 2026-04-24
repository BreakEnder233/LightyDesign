# 工作区模板

## 作用

工作区模板用于初始化新的 LightyDesign 工作区。后续“新建工作区”流程不再零散创建默认目录和默认文件，而是直接复制这份模板内容。

## 目标

1. 让新建工作区逻辑尽量简单，只做模板复制和少量初始化替换。
2. 让默认表格、默认流程控制节点、默认集合访问节点和默认简单计算节点有统一来源。
3. 让测试样例、文档样例和真正的新建工作区行为尽量共享同一份模板基础。

## 建议目录结构

```text
WorkspaceTemplate/
  config.json
  headers.json
  codegen.json
  Workbooks/
    Common/
      Example.txt
      Example_header.json
  FlowCharts/
    Nodes/
      Builtin/
        Arithmetic/
          Add.json
          Subtract.json
          Multiply.json
          Divide.json
        Comparison/
          Equal.json
          NotEqual.json
          GreaterThan.json
          LessThan.json
        Constant/
          Bool.json
          Int32.json
          String.json
        Config/
          ListInt32.json
          DictionaryStringInt32.json
        List/
          Add.json
          GetAt.json
          ForEach.json
          Count.json
        Dictionary/
          Set.json
          Get.json
          ContainsKey.json
          ForEach.json
        Control/
          If.json
          While.json
          Pause.json
    Files/
      Samples/
        ExampleFlow.json
```

## 模板内容要求

### 根目录文件

1. `config.json`
   工作区基础配置。
2. `headers.json`
   默认表格表头布局。
3. `codegen.json`
   默认代码生成配置。

### 默认表格

1. 至少提供一个可打开、可编辑、可导出的默认工作簿与默认表格。
2. 默认表格不要求复杂，但应能验证工作区加载、保存和代码生成链路。

### 默认节点库

1. 控制节点
   至少包含 `If`、`While`、`Pause`。
2. 集合访问节点
   至少覆盖 `List` 和 `Dictionary` 的基础读取、写入和遍历能力。
3. 简单计算节点
   至少包含基础算术、比较和相等判断。

### 默认流程图样例

1. 至少提供一张可正常加载的样例流程图。
2. 该流程图应引用模板自带的默认节点，而不是引用模板外部节点。
3. 该流程图应尽量覆盖基本控制流或集合访问能力，方便作为回归样例。

## 新建工作区流程要求

后续实现时，新建工作区应遵循以下流程：

1. 复制模板目录到目标目录。
2. 按需要替换工作区名称或少量初始化字段。
3. 不再在业务代码里零散拼装默认 Workbooks、Nodes 和 Files。

## 当前状态结论

工作区模板资产已经落地到 Core 内嵌资源中，新建工作区流程也已切换为直接复制模板内容。当前模板已包含根配置、默认工作簿、默认内置节点和默认流程图样例；后续如需继续扩展，只需要围绕模板内容本身迭代，而不必再调整新建工作区的基础流程。