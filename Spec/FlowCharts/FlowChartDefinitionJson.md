# 流程图定义 JSON

## 作用

流程图定义 JSON 用于描述一张具体流程图实例，包括节点实例、节点布局、属性覆盖值以及流程端口和计算端口之间的连接关系。

## 文件路径约定

1. 所有流程图定义位于 `FlowCharts/Files` 下。
2. `FlowCharts/Files` 下允许继续使用目录树组织分类。
3. 流程图文件路径参与代码生成命名空间。
4. 建议文件名与流程图 `name` 一致，降低路径标识与生成类型名的歧义。

## 顶层结构

```json
{
  "formatVersion": "1.0",
  "name": "LoginFlow",
  "alias": "登录流程",
  "nodes": [],
  "flowConnections": [],
  "computeConnections": []
}
```

## 顶层字段

1. `formatVersion`
   协议版本号。首版固定为 `1.0`。
2. `name`
   流程图标准名称，用于生成类型名。必须是稳定英文标识符。
3. `alias`
   流程图别名，用于展示和检索。可为空或省略。
4. `nodes`
   节点实例列表。字段必须存在，可为空数组。
5. `flowConnections`
   流程端口连接列表。字段必须存在，可为空数组。
6. `computeConnections`
   计算端口连接列表。字段必须存在，可为空数组。

## 节点实例

```json
{
  "nodeId": 1,
  "nodeType": "Event/Player/OnEnterScene",
  "layout": {
    "x": 120,
    "y": 80
  },
  "propertyValues": [
    {
      "propertyId": 1,
      "value": 1001
    }
  ]
}
```

字段约定：

1. `nodeId`
   `uint32`，流程图内稳定 id。`0` 保留为无效值，不允许使用。
2. `nodeType`
   节点类型路径，相对 `FlowCharts/Nodes`，不带 `.json` 扩展名。
3. `layout`
   节点布局信息。首版固定包含 `x` 和 `y` 两个数值字段。
4. `propertyValues`
   节点属性值覆盖列表。字段必须存在，可为空数组。

补充约定：

1. `propertyValues` 使用 `propertyId` 绑定节点定义中的属性，避免属性改名后实例数据丢失。
2. 若某属性未在 `propertyValues` 中出现，则回退使用节点定义中的 `defaultValue`。

## 节点属性值

```json
{
  "propertyId": 1,
  "value": 1001
}
```

字段约定：

1. `propertyId`
   必须引用节点定义中存在的属性 id。
2. `value`
   使用 JSON 原生值存储。实际类型由节点定义中的属性类型决定。

## 流程端口连接

```json
{
  "sourceNodeId": 1,
  "sourcePortId": 201,
  "targetNodeId": 2,
  "targetPortId": 301
}
```

字段约定：

1. `sourceNodeId`
   源节点 id。
2. `sourcePortId`
   源流程端口 id，必须是输出端口。
3. `targetNodeId`
   目标节点 id。
4. `targetPortId`
   目标流程端口 id，必须是输入端口。

## 计算端口连接

```json
{
  "sourceNodeId": 2,
  "sourcePortId": 102,
  "targetNodeId": 3,
  "targetPortId": 103
}
```

字段约定：

1. `sourceNodeId`
   源节点 id。
2. `sourcePortId`
   源计算端口 id，必须是输出端口。
3. `targetNodeId`
   目标节点 id。
4. `targetPortId`
   目标计算端口 id，必须是输入端口。

## 结构约束

1. 同一流程图内，`nodeId` 必须唯一。
2. `nodeType` 必须能解析到 `FlowCharts/Nodes` 下存在的节点定义文件。
3. 连接中的节点 id 和端口 id 必须都能解析到真实节点实例和真实端口定义。
4. 流程连接只能由流程输出端口指向流程输入端口。
5. 计算连接只能由计算输出端口指向计算输入端口。
6. 同一个流程输出端口最多只能有一条流程连接。
7. 同一个流程输入端口允许接收多条流程连接。
8. 同一个计算输入端口最多只能有一条计算连接。
9. 同一个计算输出端口允许发出多条计算连接。
10. 计算连接图不允许形成回路。
11. 同一条连接四元组不得重复出现。
12. 流程连接允许形成回路，不应因为流程回路而阻止保存。

## 完整示例

```json
{
  "formatVersion": "1.0",
  "name": "LoginFlow",
  "alias": "登录流程",
  "nodes": [
    {
      "nodeId": 1,
      "nodeType": "Event/Player/OnEnterScene",
      "layout": {
        "x": 120,
        "y": 80
      },
      "propertyValues": [
        {
          "propertyId": 1,
          "value": 1001
        }
      ]
    },
    {
      "nodeId": 2,
      "nodeType": "Flow/UI/ShowLoginPanel",
      "layout": {
        "x": 420,
        "y": 80
      },
      "propertyValues": []
    }
  ],
  "flowConnections": [
    {
      "sourceNodeId": 1,
      "sourcePortId": 201,
      "targetNodeId": 2,
      "targetPortId": 301
    }
  ],
  "computeConnections": []
}
```