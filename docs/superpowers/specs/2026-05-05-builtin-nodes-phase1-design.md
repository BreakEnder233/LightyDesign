# 内置节点 Phase 1 拓展设计文档

## 概述

对 LightyDesign 流程图系统的内置节点库进行第一阶段拓展，补齐 Spec 文档（TypeSystem.md、GenericNodeDesignPlan.md、RuntimeSemantics.md）中已承诺但尚未实现的标准节点。本阶段覆盖 List 操作齐全化、Dictionary 操作齐全化以及控制流节点补齐。

## 背景

当前内置节点共 24 个，覆盖算术、比较、常量、控制流、List/Dictionary 操作和 Config 等类别。对照已有 Spec 文档，存在以下缺口：

1. **List 操作不完整**：仅有 Add、Count、GetAt、ForEach，缺少 Contains、SetAt、Insert、RemoveAt、Clear
2. **Dictionary 操作不完整**：仅有 ContainsKey、Get、Set、ForEach，缺少 Count、TryGetValue、Remove、Clear、Keys、Values
3. **控制流不完整**：缺少 Break 和 Continue 循环控制节点

## 设计原则

1. **遵循现有模式**：新节点 JSON 格式、端口编号规则、typeParameters 约定和 codegenBinding 模式与现有节点一致。
2. **修改节点用 flow 类型**：会修改容器的节点定义为 flow 类型（In→Then），输出更新后的容器，与现有 Add/Set 保持一致。
3. **只读操作用 compute 类型**：仅读取不修改容器的节点定义为 compute 类型。
4. **增量交付**：本阶段不涉及 Config 节点迁移、类型参数实例化系统改动或前端对话框修改。

## 实施范围

### 1. List 操作补齐（5 个节点）

#### Contains\<TElement\>

| 字段 | 值 |
|------|-----|
| 文件名 | `List/Contains.json` |
| nodeKind | compute |
| typeParameters | `TElement: any` |
| codegenBinding | `List.Contains` → generic |

计算端口：

| portId | 名称 | 别名 | 方向 | 类型 |
|--------|------|------|------|------|
| 101 | List | 列表 | input | List\<TElement\> |
| 102 | Item | 元素 | input | TElement |
| 151 | Result | 结果 | output | bool |

#### SetAt\<TElement\>

| 字段 | 值 |
|------|-----|
| 文件名 | `List/SetAt.json` |
| nodeKind | flow |
| typeParameters | `TElement: any` |
| codegenBinding | `List.SetAt` → generic |

计算端口：

| portId | 名称 | 别名 | 方向 | 类型 |
|--------|------|------|------|------|
| 101 | List | 列表 | input | List\<TElement\> |
| 102 | Index | 索引 | input | int32 |
| 103 | Item | 元素 | input | TElement |
| 151 | UpdatedList | 结果列表 | output | List\<TElement\> |

流程端口：

| portId | 名称 | 别名 | 方向 |
|--------|------|------|------|
| 201 | In | 输入 | input |
| 251 | Then | 然后 | output |

#### Insert\<TElement\>

| 字段 | 值 |
|------|-----|
| 文件名 | `List/Insert.json` |
| nodeKind | flow |
| typeParameters | `TElement: any` |
| codegenBinding | `List.Insert` → generic |

计算端口：

| portId | 名称 | 别名 | 方向 | 类型 |
|--------|------|------|------|------|
| 101 | List | 列表 | input | List\<TElement\> |
| 102 | Index | 索引 | input | int32 |
| 103 | Item | 元素 | input | TElement |
| 151 | UpdatedList | 结果列表 | output | List\<TElement\> |

流程端口：

| portId | 名称 | 别名 | 方向 |
|--------|------|------|------|
| 201 | In | 输入 | input |
| 251 | Then | 然后 | output |

#### RemoveAt\<TElement\>

| 字段 | 值 |
|------|-----|
| 文件名 | `List/RemoveAt.json` |
| nodeKind | flow |
| typeParameters | `TElement: any` |
| codegenBinding | `List.RemoveAt` → generic |

计算端口：

| portId | 名称 | 别名 | 方向 | 类型 |
|--------|------|------|------|------|
| 101 | List | 列表 | input | List\<TElement\> |
| 102 | Index | 索引 | input | int32 |
| 151 | UpdatedList | 结果列表 | output | List\<TElement\> |

流程端口：

| portId | 名称 | 别名 | 方向 |
|--------|------|------|------|
| 201 | In | 输入 | input |
| 251 | Then | 然后 | output |

#### Clear\<TElement\>

| 字段 | 值 |
|------|-----|
| 文件名 | `List/Clear.json` |
| nodeKind | flow |
| typeParameters | `TElement: any` |
| codegenBinding | `List.Clear` → generic |

计算端口：

| portId | 名称 | 别名 | 方向 | 类型 |
|--------|------|------|------|------|
| 101 | List | 列表 | input | List\<TElement\> |
| 151 | UpdatedList | 结果列表 | output | List\<TElement\> |

流程端口：

| portId | 名称 | 别名 | 方向 |
|--------|------|------|------|
| 201 | In | 输入 | input |
| 251 | Then | 然后 | output |

### 2. Dictionary 操作补齐（6 个节点）

#### Count\<TKey, TValue\>

| 字段 | 值 |
|------|-----|
| 文件名 | `Dictionary/Count.json` |
| nodeKind | compute |
| typeParameters | `TKey: hashableKey`, `TValue: any` |
| codegenBinding | `Dictionary.Count` → generic |

计算端口：

| portId | 名称 | 别名 | 方向 | 类型 |
|--------|------|------|------|------|
| 101 | Dictionary | 字典 | input | Dict\<TKey,TValue\> |
| 151 | Count | 数量 | output | int32 |

#### TryGetValue\<TKey, TValue\>

| 字段 | 值 |
|------|-----|
| 文件名 | `Dictionary/TryGetValue.json` |
| nodeKind | flow |
| typeParameters | `TKey: hashableKey`, `TValue: any` |
| codegenBinding | 无（运行时引擎内置处理） |

计算端口：

| portId | 名称 | 别名 | 方向 | 类型 |
|--------|------|------|------|------|
| 101 | Dictionary | 字典 | input | Dict\<TKey,TValue\> |
| 102 | Key | 键 | input | TKey |
| 151 | Value | 值 | output | TValue |

流程端口：

| portId | 名称 | 别名 | 方向 |
|--------|------|------|------|
| 201 | In | 输入 | input |
| 251 | Found | 找到 | output |
| 252 | NotFound | 未找到 | output |

说明：TryGetValue 设计为 flow 节点，而不是 compute 节点。这是因为它实际上有两种执行路径（找到/未找到），用流程分支表达比用 bool 输出端口更自然。`Value` 计算输出端口仅在 Found 路径上有效。这种设计也与当前代码生成器每个节点最多一个计算输出端口的约束兼容。

#### Remove\<TKey, TValue\>

| 字段 | 值 |
|------|-----|
| 文件名 | `Dictionary/Remove.json` |
| nodeKind | flow |
| typeParameters | `TKey: hashableKey`, `TValue: any` |
| codegenBinding | `Dictionary.Remove` → generic |

计算端口：

| portId | 名称 | 别名 | 方向 | 类型 |
|--------|------|------|------|------|
| 101 | Dictionary | 字典 | input | Dict\<TKey,TValue\> |
| 102 | Key | 键 | input | TKey |
| 151 | UpdatedDictionary | 结果字典 | output | Dict\<TKey,TValue\> |

流程端口：

| portId | 名称 | 别名 | 方向 |
|--------|------|------|------|
| 201 | In | 输入 | input |
| 251 | Then | 然后 | output |

#### Clear\<TKey, TValue\>

| 字段 | 值 |
|------|-----|
| 文件名 | `Dictionary/Clear.json` |
| nodeKind | flow |
| typeParameters | `TKey: hashableKey`, `TValue: any` |
| codegenBinding | `Dictionary.Clear` → generic |

计算端口：

| portId | 名称 | 别名 | 方向 | 类型 |
|--------|------|------|------|------|
| 101 | Dictionary | 字典 | input | Dict\<TKey,TValue\> |
| 151 | UpdatedDictionary | 结果字典 | output | Dict\<TKey,TValue\> |

流程端口：

| portId | 名称 | 别名 | 方向 |
|--------|------|------|------|
| 201 | In | 输入 | input |
| 251 | Then | 然后 | output |

#### Keys\<TKey, TValue\>

| 字段 | 值 |
|------|-----|
| 文件名 | `Dictionary/Keys.json` |
| nodeKind | compute |
| typeParameters | `TKey: hashableKey`, `TValue: any` |
| codegenBinding | `Dictionary.Keys` → generic |

计算端口：

| portId | 名称 | 别名 | 方向 | 类型 |
|--------|------|------|------|------|
| 101 | Dictionary | 字典 | input | Dict\<TKey,TValue\> |
| 151 | Keys | 键列表 | output | List\<TKey\> |

#### Values\<TKey, TValue\>

| 字段 | 值 |
|------|-----|
| 文件名 | `Dictionary/Values.json` |
| nodeKind | compute |
| typeParameters | `TKey: hashableKey`, `TValue: any` |
| codegenBinding | `Dictionary.Values` → generic |

计算端口：

| portId | 名称 | 别名 | 方向 | 类型 |
|--------|------|------|------|------|
| 101 | Dictionary | 字典 | input | Dict\<TKey,TValue\> |
| 151 | Values | 值列表 | output | List\<TValue\> |

### 3. 控制流补齐（2 个节点）

#### Break

| 字段 | 值 |
|------|-----|
| 文件名 | `Control/Break.json` |
| nodeKind | flow |
| typeParameters | 无 |
| codegenBinding | 无 |

流程端口：

| portId | 名称 | 别名 | 方向 |
|--------|------|------|------|
| 201 | In | 输入 | input |

说明：Break 没有流程输出端口。在运行时语义中，当 Flow 到达 Break 节点时，跳出当前循环（While/ForEach），流程继续执行循环后的 Completed 分支。

#### Continue

| 字段 | 值 |
|------|-----|
| 文件名 | `Control/Continue.json` |
| nodeKind | flow |
| typeParameters | 无 |
| codegenBinding | 无 |

流程端口：

| portId | 名称 | 别名 | 方向 |
|--------|------|------|------|
| 201 | In | 输入 | input |

说明：Continue 没有流程输出端口。在运行时语义中，当 Flow 到达 Continue 节点时，立即跳转到当前循环的下一次迭代（重新求值条件或获取下一个元素）。

### 4. 代码生成器变更

在 `LightyFlowChartNodeCodeGenerator.cs` 中：

#### 4.1 新增 helper 方法（追加到 `RenderStandardBindingHelperFile`）

```csharp
// List helpers
public static bool ListContains<TElement>(List<TElement> list, TElement item) => list.Contains(item);
public static List<TElement> ListSetAt<TElement>(List<TElement> list, int index, TElement item) { list[index] = item; return list; }
public static List<TElement> ListInsert<TElement>(List<TElement> list, int index, TElement item) { list.Insert(index, item); return list; }
public static List<TElement> ListRemoveAt<TElement>(List<TElement> list, int index) { list.RemoveAt(index); return list; }
public static List<TElement> ListClear<TElement>(List<TElement> list) { list.Clear(); return list; }

// Dictionary helpers
public static int DictionaryCount<TKey, TValue>(Dictionary<TKey, TValue> dict) => dict.Count;
// (TryGetValue 无 codegenBinding，由运行时引擎内置处理)
public static Dictionary<TKey, TValue> DictionaryRemove<TKey, TValue>(Dictionary<TKey, TValue> dict, TKey key) { dict.Remove(key); return dict; }
public static Dictionary<TKey, TValue> DictionaryClear<TKey, TValue>(Dictionary<TKey, TValue> dict) { dict.Clear(); return dict; }
public static List<TKey> DictionaryKeys<TKey, TValue>(Dictionary<TKey, TValue> dict) => new List<TKey>(dict.Keys);
public static List<TValue> DictionaryValues<TKey, TValue>(Dictionary<TKey, TValue> dict) => new List<TValue>(dict.Values);
```

#### 4.2 更新 `ResolveHelperMethodName` switch

追加以下映射：

```
"List.Contains"     → "ListContains"
"List.SetAt"        → "ListSetAt"
"List.Insert"       → "ListInsert"
"List.RemoveAt"     → "ListRemoveAt"
"List.Clear"        → "ListClear"
"Dictionary.Count"  → "DictionaryCount"
// TryGetValue 由运行时引擎内置处理，无需 helper 映射
"Dictionary.Remove" → "DictionaryRemove"
"Dictionary.Clear"  → "DictionaryClear"
"Dictionary.Keys"   → "DictionaryKeys"
"Dictionary.Values" → "DictionaryValues"
```

#### 4.3 Break/Continue 的代码生成

Break 和 Continue 没有 codegenBinding。它们由节点代码生成模板特殊处理：

- Break 节点生成 `break;`
- Continue 节点生成 `continue;`

在生成的节点 partial class 中，Execute 方法直接输出关键字。

### 5. 校验器变更

在流程图文档的校验规则中新增：

**Break/Continue 上下文校验**：
- 规则：Break 和 Continue 节点只能出现在 While 或 ForEach 节点的 LoopBody 流程路径（即由 LoopBody 输出端口连出的路径）中
- 严重级别：error（保存阻断）
- 诊断消息：`"Break/Continue 节点只能在循环体中使用"`

### 6. 不变的范围

- Config 节点（ListInt32, DictionaryStringInt32）保持现状
- 前端组件（FlowChartNodeDefinitionDialog, FlowChartCanvas 等）不修改
- 后端 API 不修改（现有 Save/Load 端点已支持新节点）
- 类型系统协议（TypeRef, TypeKind 等）不修改
- 现有 24 个内置节点的定义和 codegenBinding 不修改

### 7. 实施清单

1. 创建 13 个节点定义 JSON 文件
2. 在 `LightyFlowChartNodeCodeGenerator.cs` 中追加 10 个 helper 方法
3. 更新 `ResolveHelperMethodName` 映射表
4. 为 Break/Continue 添加特殊代码生成处理
5. 在 `LightyValidationRuleSchema.cs` 或对应校验器中添加 Break/Continue 上下文校验
6. 在 `LightyFlowChartAssetManager` 或资源系统中注册新内嵌资源（如已自动包含则跳过）
7. 添加对应测试

### 8. 测试计划

| 测试类别 | 内容 |
|---------|------|
| 节点定义解析 | 每个新节点的 JSON 能被正确解析为 `LightyFlowChartNodeDefinition` |
| codegen 单节点 | 每个新节点能生成正确的 partial class |
| codegen helper | 每个 helper 方法功能正确（含边界情况如空列表 Contains, 越界索引等） |
| 生成代码编译 | 生成的 C# 代码能成功编译 |
| Break/Continue 校验 | 正确识别循环体内的合法使用与顶层位置的非法使用 |
| 断点续用 | 添加新节点后，现有流程图文件不受影响 |
