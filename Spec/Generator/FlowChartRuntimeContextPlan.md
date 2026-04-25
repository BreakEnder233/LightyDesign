# FlowChart 运行时 Context 与代码生成规划

## 背景

当前生成器已经能够为流程图实例输出以下内容：

1. `*Definition` 静态定义类型。
2. `*Flow<TContext>` 运行时类型。
3. `FlowChartRuntimeSupport.cs` 运行时辅助类型。
4. 内置 `If`、`While`、`Pause`、`List.ForEach`、`Dictionary.ForEach` 的首版调度分派。

当前生成模型的核心形态其实已经接近目标：生成出的 `*Flow<TContext>` 既持有流程图定义引用，也持有单次运行所需的通用执行态。当前运行时中的以下成员挂在 Flow 上：

1. `CurrentNodeId`
2. `IsPaused`
3. `IsCompleted`
4. `_nodeStates`
5. `_stepComputeCache`

这些成员应继续保留在 Flow 上，因为它们只与单次 Flow 运行相关，且逻辑在不同图之间是统一的。真正需要继续规划的，是哪些“图专属/业务专属数据”应进入 generated Context，以及是否值得为某些图生成更强类型的 Context 视图。

## 结论

1. 不需要把 `CurrentNodeId`、`IsPaused`、`IsCompleted`、`_nodeStates` 从 Flow 挪出；当前这部分机制方向是对的。
2. 不需要调整 FlowChart 文件格式、节点/端口/连线模型、流程回路规则或类型系统主方向。
3. 需要继续规划的是 generated Context 的职责，以及它与 Flow 持有通用运行态之间的边界。
4. 如果后续要支持“自定义且有节点实例状态”的节点，仍然可能需要补一个共享运行时接口层。

## 目标模型

### 1. 生成类型层次

每张流程图建议至少生成以下三类类型：

1. `QuestIntroDefinition`
   静态定义对象，描述节点、端口、连接关系和节点运行时单例。
2. `QuestIntroFlow<TContext>`
   单次运行实例，负责根据连接关系和节点绑定逻辑推进自己持有的 Context。
3. `QuestIntroContext<TExternalContext>`
   与该图关联的强类型上下文视图，用于承载业务数据和图专属上下文字段。

推荐的使用方式如下：

```csharp
var definition = QuestIntroDefinition.Create();
var flow = definition.CreateFlow(new GameContext());

flow.RunUntilPaused();
flow.Resume();
flow.RunToCompletion();
```

如果需要显式选择入口，则更自然的做法仍是由 `CreateFlow(entryNodeId, context)` 或同等接口负责初始化 Flow 自身状态。

### 2. Context 内容

生成出的 `*Context<TExternalContext>` 更适合承载以下信息：

1. `ExternalContext`
   业务侧传入的外部上下文。
2. 图专属业务字段或黑板数据。
3. 需要对节点逻辑暴露的强类型访问入口。
4. 该图专属的辅助服务或快照视图。

可以按需追加：

1. `PauseReason`
2. `LastTransition`
3. `StepCount`
4. `DebugTrace`

### 3. Flow 职责

Flow 应负责以下事情：

1. 解析流程连接与计算连接。
2. 在单步范围内求值 compute outputs。
3. 调用节点运行时代码。
4. 改写当前 Flow 的生命周期状态和节点状态。
5. 在需要时通过 Context 读写业务和图专属数据。

Flow 应继续持有：

1. `CurrentNodeId`
2. `IsPaused`
3. `IsCompleted`
4. `_nodeStates`
5. 单次运行范围内需要的临时缓存

`_stepComputeCache` 是否做成字段还是局部变量，属于实现细节；只要它绑定当前 Flow，而不是挂到共享定义对象上，就不构成模型问题。

## 节点实例状态策略

### 1. 首轮迁移策略

第一轮不必调整节点状态归属。更稳妥的做法是：

1. 继续把当前 `Dictionary<uint, FlowChartNodeState>` 保留在 Flow 上。
2. 让现有 `If`、`While`、`Pause`、`List.ForEach`、`Dictionary.ForEach` 继续沿用当前调度逻辑。
3. 若未来需要强类型化节点状态，再先论证它是应挂在 Flow 上，还是应暴露为图专属 Context 的一部分。

### 2. 目标状态形态

中期目标仍可考虑只为真正有状态的节点生成状态槽，而不是把所有节点都放入统一对象字典。典型例子如下：

1. `Pause`
   通常不需要节点局部状态，只改写 `IsPaused` 和 `CurrentNodeId`。
2. `PauseSeconds`
   需要记录首次进入时间、唤醒时间或剩余等待时长。
3. `List.ForEach`
   需要记录当前索引、当前元素以及必要的输出快照。
4. `Dictionary.ForEach`
   需要记录当前索引以及本轮枚举物化出的 entries 快照。
5. 自定义等待/冷却/重试节点
   需要各自专属状态类型。

这一步的价值是：

1. 减少 `object` 装箱和弱类型 `Payload`。
2. 提高生成代码可读性。
3. 为未来的状态节点模板扩展提供稳定形状。

## 节点 partial class 边界

这是当前机制里最容易被忽略的约束：节点 partial class 是按“节点定义”共享生成的，不是按“流程图实例”生成的。

这意味着：

1. 节点类不能直接依赖某一张图的 `QuestIntroContext<TExternalContext>`。
2. 同一个节点定义可能同时被多张图复用。
3. 因此，若未来允许自定义有状态节点访问运行时上下文，就必须引入一层共享运行时契约。

建议的方向是增加共享运行时抽象，例如：

1. `IFlowExecutionContext<TExternalContext>`
   暴露外部上下文和少量通用运行时信息。
2. `FlowNodeExecutionResult`
   显式表达“继续到哪个流程出口”“是否暂停”“是否结束”等结果。
3. `IFlowNodeState` 或等价抽象
   用于约束自定义节点状态的传递方式。

在这层共享契约建立之前，内置控制节点和迭代节点继续由生成器专用模板负责是合理的。

## 对当前机制的具体判断

### 不需要调整的部分

以下内容当前不需要因为 Context 方案而改动：

1. FlowChart 文件 JSON 结构。
2. 节点/端口/连线的核心协议。
3. 流程回路允许、计算回路禁止的规则。
4. 泛型节点的类型参数、类型实参和导出期签名收敛方向。

### 需要调整的部分

以下内容更值得进入下一轮实现：

1. `Context` 是否需要为图专属数据生成更强类型的访问视图。
2. `Definition.CreateFlow(...)` 与可选的 `Definition.CreateContext(...)` 如何协同。
3. `FlowChartRuntimeSupport.cs` 中运行时辅助类型是否需要拆分“通用 Flow 状态”和“图专属上下文”两层。
4. 相关单元测试对生成代码形状的断言。

### 可能需要新增的机制

如果目标包含“自定义且有节点实例状态”的节点，还需要新增：

1. 节点运行时共享接口。
2. 自定义节点状态类型与生成器绑定约定。
3. 可能的 codegenBinding 扩展字段，用来声明节点执行契约与状态需求。

## 分阶段实施建议

### 阶段 1：澄清 Flow 与 Context 的职责

1. 明确保留 `CurrentNodeId`、`IsPaused`、`IsCompleted`、`_nodeStates` 在 Flow 上。
2. 判断哪些图专属字段值得进入 generated Context。
3. 视需要把 Definition 的 API 扩成“直接创建 Flow”以及“创建图专属 Context 视图”两步。
4. 更新现有字符串断言测试与规范文档。

### 阶段 2：内置状态节点强类型化

1. 为 `ForEach`、未来的 `PauseSeconds` 等节点生成专属状态类型或状态字段。
2. 逐步减少 `FlowChartNodeState.Payload` 这类弱类型载荷。
3. 增加等待型节点与迭代型节点的模板测试。

### 阶段 3：自定义有状态节点契约

1. 引入共享运行时接口。
2. 明确节点执行结果模型。
3. 让自定义节点可以显式声明自己是否需要节点实例状态。
4. 让生成器把上下文状态槽与节点 partial class 调用正确连起来。

### 阶段 4：调度与等待能力扩展

1. 新增 `PauseSeconds`、`WaitUntil`、`Cooldown` 等等待型节点模板。
2. 明确时间来源和调度来源应来自 `ExternalContext` 还是共享 runtime service。
3. 确保等待信息保存在 Context，而不是保存在 Flow 上。

## 建议的测试补齐

下一轮至少应补以下测试：

1. 生成出的 `Flow` 是否继续持有 `CurrentNodeId`、`IsPaused`、`IsCompleted`、节点状态存储。
2. 生成出的 `Context` 是否只承载业务和图专属数据。
3. `Pause`、`ForEach`、未来 `PauseSeconds` 的状态写入是否仍然正确落在当前 Flow 上。
4. 若引入 `CreateContext`，它是否只负责图专属上下文构造，而不是复制 Flow 生命周期状态。
5. 若引入共享运行时契约，自定义节点 skeleton 是否生成了正确签名。

## 最终判断

对当前流程图机制的调整仍然需要，但重点不再是“把运行态从 Flow 挪到 Context”，而是“把 Flow 通用运行态和图专属 Context 的职责说清楚”。

更具体地说：

1. 现在就应该修正 Flow 与 Context 的职责边界表述。
2. 现在还不需要改动 FlowChart 文件结构，也不需要强行搬迁 `CurrentNodeId`、`IsPaused`、`IsCompleted`、`_nodeStates`。
3. 如果短期目标只覆盖内置控制节点与迭代节点，Generator 现有运行时模型可以继续沿用。
4. 如果中期目标包含自定义有状态节点，则共享运行时接口仍会成为下一轮真正的机制扩展点。