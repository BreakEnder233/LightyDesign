# 流程图类型系统

## 作用

本文件定义流程图节点属性和计算端口使用的类型系统。它解决三类类型表达：基础类型、外部自定义类型、容器类型。

## 设计目标

1. 类型必须能直接落到节点定义 JSON 中。
2. 类型必须能支撑代码生成时的精确类型定位。
3. 类型必须能表达 `List<T>` 和 `Dictionary<TKey, TValue>`，以支持流程图中的读取、修改和遍历。
4. 容器操作能力应由标准节点库提供，而不是由 JSON 连接格式隐式表达。
5. 同一份标准节点定义应能在多个具体元素类型上复用，同时保留编辑期连线合法性分析能力。

## TypeRef 结构

`TypeRef` 使用递归结构。除直接可落地的 `builtin`、`custom`、`list`、`dictionary` 外，另允许使用一种仅服务于节点参数化建模的 `kind`：`typeParameter`。

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

### 类型参数

```json
{
  "kind": "typeParameter",
  "name": "TElement"
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

### typeParameter

1. `kind` 固定为 `typeParameter`。
2. `name` 必须引用节点定义 `typeParameters` 中声明过的类型参数名。
3. `typeParameter` 只允许出现在节点定义或节点实例显式 `typeArguments` 的推断上下文中，不应作为已完成导出的最终 concrete type 保留下去。

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

## 节点多态与类型参数

为了减少标准节点库的重复定义，同时保留连线类型分析能力，类型设计应区分两类多态：

1. 参数化多态：例如 `List<T>`、`Dictionary<TKey, TValue>` 这类容器节点。
2. 受控重载多态：例如 `Add`、比较、相等等内置计算节点。

### 类型参数约束建议

节点定义中的 `typeParameters` 建议支持以下标准约束名：

1. `any`
2. `numeric`
3. `comparable`
4. `hashableKey`

其中：

1. `List<T>` 常用 `any`。
2. `Dictionary<TKey, TValue>` 中的 `TKey` 应使用 `hashableKey`。
3. 数值运算节点如 `Add`、`Subtract` 应使用 `numeric`。

### 类型求解原则

1. 连接合法性优先通过节点实例局部类型推断判断，而不是统一退化到 `object`。
2. 推断来源可以包括显式 `typeArguments`、节点属性字面量、上游输出类型和下游输入约束。
3. 若同一节点实例无法得到一致的类型参数替换结果，应视为保存阻断错误。
4. 若尚无足够信息确定具体类型，但也不存在冲突，可保留为“未定型”诊断状态。
5. 导出前所有参与生成的节点实例都必须收敛到唯一 concrete type。

## 容器操作方案

为了在流程图中支持修改和遍历 `List` 与 `Dictionary`，建议采用“类型系统表达容器形状，标准节点库表达容器操作”的方案。

### 原则

1. JSON 连接格式只表达节点、端口和连线，不表达容器操作语义。
2. 对容器的读取、修改和遍历全部通过标准节点定义实现。
3. 这样可以避免把流程控制逻辑硬编码进文件格式，也更利于后续生成器输出可读代码。

### List 标准节点建议

1. 读取类：`Count<T>`、`GetAt<T>`、`Contains<T>`。
2. 修改类：`SetAt<T>`、`Add<T>`、`Insert<T>`、`RemoveAt<T>`、`Clear<T>`。
3. 遍历类：`ForEach<T>`。

### Dictionary 标准节点建议

1. 读取类：`Count<TKey, TValue>`、`ContainsKey<TKey, TValue>`、`TryGetValue<TKey, TValue>`、`Keys<TKey, TValue>`、`Values<TKey, TValue>`。
2. 修改类：`Set<TKey, TValue>`、`Remove<TKey, TValue>`、`Clear<TKey, TValue>`。
3. 遍历类：`ForEach<TKey, TValue>`。

### 内置计算节点建议

1. `Add`、比较、相等等节点不建议继续按每个具体 builtin 类型复制节点定义。
2. 这类节点应通过稳定的绑定名指向一组受控签名，再由校验器和生成器做候选收敛。
3. 目标语言中的函数重载是实现手段，不应取代流程图自身的类型分析。

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
5. `typeParameter` 只作为节点具体化前的中间表示，不应直接原样输出到最终生成代码。
6. 生成器不应根据节点名称猜测容器语义，而应明确读取 `TypeRef.kind` 和节点绑定信息。
7. 对容器标准节点，生成器应优先输出已解析后的泛型调用。
8. 对算术和比较标准节点，生成器可调用重载 helper，但必须先在导出前解析到唯一具体签名。

## 当前状态结论

类型系统的方向已经明确：继续保留 builtin / custom / list / dictionary 四类 concrete type，同时引入只服务于节点复用的 `typeParameter` 中间表达。后续重点在于补齐类型参数求解、标准节点绑定和对应生成模板，而不是把容器与运算节点整体弱化成 `object` 连接。