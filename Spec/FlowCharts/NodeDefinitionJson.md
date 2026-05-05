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
  "description": "触发玩家进入场景时触发。可用于场景加载、初始状态设置等。",
   "typeParameters": [],
  "properties": [],
  "computePorts": [],
   "flowPorts": [],
   "codegenBinding": null
}
```

## 顶层字段

1. `formatVersion`
   协议版本号。当前固定为 `1.0`。
2. `name`
   节点标准名称，用于生成类名。必须是稳定英文标识符。
3. `alias`
   节点别名，用于展示和检索。可为空或省略。
4. `nodeKind`
   节点种类。当前固定为 `event`、`flow`、`compute` 三种。
5. `description`
   可选。节点概述，纯文本。用于编辑器内的搜索检索和节点预览。不参与代码生成。
6. `typeParameters`
   可选。节点类型参数列表。对非参数化节点可省略或为空数组。
7. `properties`
   节点属性定义列表。字段必须存在，可为空数组。
8. `computePorts`
   计算端口定义列表。字段必须存在，可为空数组。
9. `flowPorts`
   流程端口定义列表。字段必须存在，可为空数组。
10. `codegenBinding`
   可选。标准节点的稳定生成绑定信息，用于把节点定义映射到生成器中的实现族。

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

类型参数示例：

```json
{
   "kind": "typeParameter",
   "name": "TValue"
}
```

## 节点类型参数定义

```json
{
   "name": "TValue",
   "constraint": "numeric"
}
```

字段约定：

1. `name`
    类型参数稳定名称，必须在同一节点定义内唯一。
2. `constraint`
    可选。约束名，建议使用 `any`、`numeric`、`comparable`、`hashableKey` 之一。

补充约定：

1. `typeParameters` 仅声明节点内部可复用的类型形状，不直接代表最终生成代码中的完整类型。
2. 节点属性与计算端口可通过 `TypeRef.kind = typeParameter` 引用这些参数。
3. 事件节点通常不需要类型参数，但协议不强制禁止。

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

## 代码生成绑定

```json
{
   "provider": "standard",
  "operation": "List.Add",
  "resolutionMode": "generic"
}
```

字段约定：

1. `provider`
   当前建议使用 `standard`，表示该节点对应标准节点族。
2. `operation`
   稳定绑定名，例如 `List.Add`、`Dictionary.Set`、`Arithmetic.Add`。
3. `resolutionMode`
   绑定解析模式。当前建议支持 `generic` 与 `overload`。

补充约定：

1. `generic` 适用于 `List<T>`、`Dictionary<TKey, TValue>` 这类可直接映射到泛型 helper 的节点。
2. `overload` 适用于 `Add`、比较、相等等需要从有限签名集合中选路的节点。
3. 绑定名对应的候选签名表属于标准节点库契约的一部分，不应要求生成器靠节点别名或文件路径猜语义。

## 结构约束

1. 同一节点定义内，`propertyId` 必须唯一。
2. 同一节点定义内，所有流程端口和计算端口各自的 `portId` 必须唯一。
3. 端口删除后不得重排保留端口的 `portId`。
4. 节点改名时允许修改 `name` 和 `alias`，但不应改动已发布端口的 `portId` 和属性的 `propertyId`。
5. `event` 节点视为开始节点，不允许有流程输入端口，且至少有一个流程输出端口。
6. `flow` 节点视为中间流程节点，必须恰好有一个流程输入端口，且至少有一个流程输出端口。
7. `compute` 节点不允许有流程端口，且至少有一个计算输出端口。
8. `List<T>` 和 `Dictionary<TKey, TValue>` 是正式支持的类型形状。
9. 同一节点定义内，`typeParameters.name` 必须唯一。
10. 若端口或属性使用了 `typeParameter`，其 `name` 必须能在 `typeParameters` 中找到声明。
11. `hashableKey` 约束的类型参数只应用于字典键位置，不应用于任意值位置。
12. 对标准复用节点，建议填写 `codegenBinding`；业务侧自定义节点可留空并由 partial class 自行实现。

## 完整示例

```json
{
   "formatVersion": "1.0",
  "name": "OnEnterScene",
  "alias": "进入场景",
  "nodeKind": "event",
  "description": "触发玩家进入场景时触发。可用于场景加载、初始状态设置等。",
   "typeParameters": [],
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
   ],
   "codegenBinding": null
}
```