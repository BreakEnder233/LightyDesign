# 流程图类型系统

## 作用

本文件定义流程图节点属性和计算端口使用的类型系统。它解决三类类型表达：基础类型、外部自定义类型、容器类型。

## 设计目标

1. 类型必须能直接落到节点定义 JSON 中。
2. 类型必须能支撑代码生成时的精确类型定位。
3. 类型必须能表达 `List<T>` 和 `Dictionary<TKey, TValue>`，以支持流程图中的读取、修改和遍历。
4. 容器操作能力应由标准节点库提供，而不是由 JSON 连接格式隐式表达。

## TypeRef 结构

首版 `TypeRef` 使用递归结构，当前支持四种 `kind`：`builtin`、`custom`、`list`、`dictionary`。

### 基础类型

```json
{
  "kind": "builtin",
  "name": "int32"
}
```

### 外部自定义类型

```json
{
  "kind": "custom",
  "name": "Vector3",
  "fullName": "GamePlay.Common.Vector3"
}
```

### List 类型

```json
{
  "kind": "list",
  "elementType": {
    "kind": "builtin",
    "name": "int32"
  }
}
```

### Dictionary 类型

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

## 类型字段约定

### builtin

1. `kind` 固定为 `builtin`。
2. `name` 为基础类型名。

首版建议允许的基础类型：

1. `bool`
2. `int32`
3. `uint32`
4. `int64`
5. `uint64`
6. `float`
7. `double`
8. `string`

### custom

1. `kind` 固定为 `custom`。
2. `name` 为展示和短名称。
3. `fullName` 为代码生成时使用的完整类型名，必填。

### list

1. `kind` 固定为 `list`。
2. `elementType` 为元素类型，必须是合法 `TypeRef`。

### dictionary

1. `kind` 固定为 `dictionary`。
2. `keyType` 为键类型，必须是合法 `TypeRef`。
3. `valueType` 为值类型，必须是合法 `TypeRef`。

## 容器类型约束

### List

1. `List<T>` 可用于节点属性和计算端口。
2. `T` 可以是基础类型、自定义类型、List 或 Dictionary。

### Dictionary

1. `Dictionary<TKey, TValue>` 可用于节点属性和计算端口。
2. `TValue` 可以是基础类型、自定义类型、List 或 Dictionary。
3. 首版建议把 `TKey` 限制为可稳定比较和哈希的标量类型。
4. 为避免跨语言生成时出现哈希与相等性歧义，首版建议只允许以下字典键类型：`bool`、`int32`、`uint32`、`int64`、`uint64`、`string`。
5. 首版不建议使用 `float`、`double`、复杂自定义类型、List 或 Dictionary 作为字典键类型。

## 容器操作方案

为了在流程图中支持修改和遍历 `List` 与 `Dictionary`，建议采用“类型系统表达容器形状，标准节点库表达容器操作”的方案。

### 原则

1. JSON 连接格式只表达节点、端口和连线，不表达容器操作语义。
2. 对容器的读取、修改和遍历全部通过标准节点定义实现。
3. 这样可以避免把流程控制逻辑硬编码进文件格式，也更利于后续生成器输出可读代码。

### List 标准节点建议

1. 读取类：`Count`、`GetAt`、`Contains`。
2. 修改类：`SetAt`、`Add`、`Insert`、`RemoveAt`、`Clear`。
3. 遍历类：`ForEach`。

### Dictionary 标准节点建议

1. 读取类：`Count`、`ContainsKey`、`TryGetValue`、`Keys`、`Values`。
2. 修改类：`Set`、`Remove`、`Clear`。
3. 遍历类：`ForEach`。

### 容器修改节点约定

1. 会修改容器的节点建议定义为 `flow` 节点，而不是纯 `compute` 节点。
2. 这类节点既有流程输入输出，也有计算输入输出。
3. 为了让数据依赖显式可见，修改节点除了接受容器输入外，还应输出“修改后的容器”。
4. 对生成器而言，可根据目标语言选择原地修改或返回新对象；但流程图层面统一表现为“输入容器，输出容器”。

### 容器遍历节点约定

1. `ForEach`、`While`、`Break`、`Continue` 这类节点应视为流程控制节点。
2. 它们的循环行为通过流程回路表达，而不是通过特殊的连线格式表达。
3. `ForEach` 节点可额外暴露当前元素、当前索引或当前键值对等计算输出端口。

## 代码生成建议

1. `builtin` 直接映射到目标语言内建类型。
2. `custom` 通过 `fullName` 定位目标类型。
3. `list` 映射到目标语言列表类型。
4. `dictionary` 映射到目标语言字典类型。
5. 生成器不应根据节点名称猜测容器语义，而应明确读取 `TypeRef.kind`。

## 当前状态结论

首版类型系统已经明确：基础类型、外部类型、List 和 Dictionary 都是正式支持的类型形状。后续实现重点不在继续扩充 JSON 语法，而在补齐标准容器节点库和对应生成模板。