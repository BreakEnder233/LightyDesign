# 节点定义 JSON

## 作用

节点定义 JSON 用于描述一个可复用节点类型。它决定节点的标准名称、展示名称、属性、计算端口、流程端口以及代码生成骨架。

## 文件路径约定

1. 所有节点定义位于 `FlowCharts/Nodes` 下。
2. `FlowCharts/Nodes` 下允许继续使用目录树组织分类。
3. 节点类型标识使用相对 `FlowCharts/Nodes` 的路径，不带 `.json` 扩展名，统一使用 `/` 分隔。
4. 节点定义的目录路径参与代码生成命名空间。
5. 建议文件名与 `name` 一致，降低路径标识与生成类名的歧义。

示例：

```text
FlowCharts/
  Nodes/
    Event/
      Player/
        OnEnterScene.json
```

该节点的类型路径为：

```text
Event/Player/OnEnterScene
```

## 顶层结构

```json
{
  "formatVersion": "1.0",
  "name": "OnEnterScene",
  "alias": "进入场景",
  "nodeKind": "event",
  "properties": [],
  "computePorts": [],
  "flowPorts": []
}
```

## 顶层字段

1. `formatVersion`
   协议版本号。首版固定为 `1.0`。
2. `name`
   节点标准名称，用于生成类名。必须是稳定英文标识符。
3. `alias`
   节点别名，用于展示和检索。可为空或省略。
4. `nodeKind`
   节点种类。当前固定为 `event`、`flow`、`compute` 三种。
5. `properties`
   节点属性定义列表。字段必须存在，可为空数组。
6. `computePorts`
   计算端口定义列表。字段必须存在，可为空数组。
7. `flowPorts`
   流程端口定义列表。字段必须存在，可为空数组。

## 类型引用 TypeRef

节点属性和计算端口都必须带类型信息。`TypeRef` 的正式规则见 [TypeSystem.md](TypeSystem.md)。本文件只保留最小示例。

基础类型示例：

```json
{
  "kind": "builtin",
  "name": "int32"
}
```

```json
{
  "kind": "custom",
  "name": "Vector3",
  "fullName": "GamePlay.Common.Vector3"
}
```

List 类型示例：

```json
{
   "kind": "list",
   "elementType": {
      "kind": "builtin",
      "name": "int32"
   }
}
```

Dictionary 类型示例：

```json
{
   "kind": "dictionary",
   "keyType": {
      "kind": "builtin",
      "name": "string"
   },
   "valueType": {
      "kind": "custom",
      "name": "QuestState",
      "fullName": "GamePlay.Quests.QuestState"
   }
}
```

## 节点属性定义

```json
{
  "propertyId": 1,
  "name": "SceneId",
  "alias": "场景ID",
  "type": {
    "kind": "builtin",
    "name": "int32"
  },
  "defaultValue": 0
}
```

字段约定：

1. `propertyId`
   `uint32`，节点内稳定 id。`0` 保留为无效值，不允许使用。
2. `name`
   属性标准名称，用于生成成员名。
3. `alias`
   属性别名，用于展示和检索。可为空或省略。
4. `type`
   属性类型，使用 `TypeRef`。
5. `defaultValue`
   可选。节点实例未显式覆盖时使用该默认值。

补充约定：

1. `propertyId` 在同一节点定义内必须唯一。
2. 属性值建议在流程图实例内按 `propertyId` 存储，而不是按名称存储，这样改名或重排时不破坏实例数据。

## 计算端口定义

```json
{
  "portId": 101,
  "name": "Target",
  "alias": "目标",
  "direction": "input",
  "type": {
    "kind": "custom",
    "name": "UnitRef",
    "fullName": "GamePlay.Units.UnitRef"
  }
}
```

字段约定：

1. `portId`
   `uint32`，节点内稳定 id。`0` 保留为无效值，不允许使用。
2. `name`
   端口标准名称。
3. `alias`
   端口别名。可为空或省略。
4. `direction`
   当前固定为 `input` 或 `output`。
5. `type`
   端口类型，使用 `TypeRef`。

## 流程端口定义

```json
{
  "portId": 201,
  "name": "Then",
  "alias": "然后",
  "direction": "output"
}
```

字段约定：

1. `portId`
   `uint32`，节点内稳定 id。`0` 保留为无效值，不允许使用。
2. `name`
   端口标准名称。
3. `alias`
   端口别名。可为空或省略。
4. `direction`
   当前固定为 `input` 或 `output`。

## 结构约束

1. 同一节点定义内，`propertyId` 必须唯一。
2. 同一节点定义内，所有流程端口和计算端口各自的 `portId` 必须唯一。
3. 端口删除后不得重排保留端口的 `portId`。
4. 节点改名时允许修改 `name` 和 `alias`，但不应改动已发布端口的 `portId` 和属性的 `propertyId`。
5. `event` 节点视为开始节点，不允许有流程输入端口，且至少有一个流程输出端口。
6. `flow` 节点视为中间流程节点，必须恰好有一个流程输入端口，且至少有一个流程输出端口。
7. `compute` 节点不允许有流程端口，且至少有一个计算输出端口。
8. `List<T>` 和 `Dictionary<TKey, TValue>` 是正式支持的类型形状。

## 完整示例

```json
{
  "formatVersion": "1.0",
  "name": "OnEnterScene",
  "alias": "进入场景",
  "nodeKind": "event",
  "properties": [
    {
      "propertyId": 1,
      "name": "SceneId",
      "alias": "场景ID",
      "type": {
        "kind": "builtin",
        "name": "int32"
      },
      "defaultValue": 0
    }
  ],
  "computePorts": [
    {
      "portId": 101,
      "name": "SceneContext",
      "alias": "场景上下文",
      "direction": "output",
      "type": {
        "kind": "custom",
        "name": "SceneContext",
        "fullName": "GamePlay.Flow.SceneContext"
      }
    }
  ],
  "flowPorts": [
    {
      "portId": 201,
      "name": "Enter",
      "alias": "进入后",
      "direction": "output"
    }
  ]
}
```