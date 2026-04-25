# FlowChart 运行时 Context 与代码生成规划

## 背景

当前生成器已经能够为流程图实例输出以下内容：

1. `*Definition` 静态定义类型。
2. `*Flow<TContext>` 运行时类型。
3. `FlowChartRuntimeSupport.cs` 运行时辅助类型。
4. 内置 `If`、`While`、`Pause`、`List.ForEach`、`Dictionary.ForEach` 的首版调度分派。

但当前生成模型仍有一个关键偏差：生成出的 `*Flow<TContext>` 同时承担了“无状态解释器”和“执行态容器”两种职责。当前运行时中的以下成员仍挂在 Flow 上：

1. `CurrentNodeId`
2. `IsPaused`
3. `IsCompleted`
4. `_nodeStates`
5. `_stepComputeCache`

这与新的目标不一致。新的目标是：Flow 保持无状态，所有可变运行态都进入与流程图实例绑定的 generated Context。

## 结论

1. 需要调整当前流程图运行时机制，但调整点集中在生成运行时模型与节点执行契约。
2. 不需要调整 FlowChart 文件格式、节点/端口/连线模型、流程回路规则或类型系统主方向。
3. 如果只考虑内置控制节点和迭代节点，这一轮调整可以先在 Generator 模板与运行时辅助类型内完成。
4. 如果后续要支持“自定义且有节点实例状态”的节点，则还需要补一个共享运行时接口层。

## 目标模型

### 1. 生成类型层次

每张流程图建议至少生成以下三类类型：

1. `QuestIntroDefinition`
   静态定义对象，描述节点、端口、连接关系和节点运行时单例。
2. `QuestIntroFlow<TExternalContext>`
   无状态解释器，负责根据连接关系和节点绑定逻辑推进 Context。
3. `QuestIntroContext<TExternalContext>`
   与单次流程图实例运行绑定的可变状态容器。

推荐的使用方式如下：

```csharp
var definition = QuestIntroDefinition.Create();
var flow = definition.CreateFlow<GameContext>();
var context = definition.CreateContext(new GameContext());

flow.RunUntilPaused(context);
flow.Resume(context);
flow.RunToCompletion(context);
```

如果需要显式选择入口，则建议由 `CreateContext(entryNodeId, externalContext)` 或同等接口负责记录入口，而不是让 Flow 自身保存一份可变入口状态。

### 2. Context 内容

生成出的 `*Context<TExternalContext>` 至少需要承载以下信息：

1. `ExternalContext`
   业务侧传入的外部上下文。
2. `EntryNodeId`
   本次运行的入口节点。
3. `CurrentNodeId`
   当前执行位置。
4. `IsPaused`
   当前是否暂停。
5. `IsCompleted`
   当前是否结束。
6. `NodeStates`
   节点实例状态集合。
7. `StoredOutputs`
   需要跨步保留的流程节点输出。

可以按需追加：

1. `PauseReason`
2. `LastTransition`
3. `StepCount`
4. `DebugTrace`

### 3. Flow 职责

调整后的 Flow 应只负责以下事情：

1. 解析流程连接与计算连接。
2. 在单步范围内求值 compute outputs。
3. 调用节点运行时代码。
4. 把所有持久变化写回传入的 Context。

调整后的 Flow 不应再持有：

1. `CurrentNodeId`
2. `IsPaused`
3. `IsCompleted`
4. `_nodeStates`
5. 任何跨步生存的缓存

`_stepComputeCache` 这类只服务单次步进的结构，可改成 `StepOnce(context)` 内部的局部变量；只要它不跨步持久化，就不属于 Context 模型冲突点。

## 节点实例状态策略

### 1. 首轮迁移策略

第一轮不必马上把所有节点状态生成成强类型字段。更稳妥的做法是：

1. 先把当前 `Dictionary<uint, FlowChartNodeState>` 从 Flow 挪到 generated Context。
2. 让现有 `If`、`While`、`Pause`、`List.ForEach`、`Dictionary.ForEach` 继续沿用当前调度逻辑。
3. 先完成“状态归属正确”这一件事，再做状态强类型化。

这样可以在不推翻当前 dispatch 模板的前提下，先满足“所有可变状态归 Context”这一目标。

### 2. 目标状态形态

中期目标应是只为真正有状态的节点生成状态槽，而不是把所有节点都放入统一对象字典。典型例子如下：

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

以下内容需要进入下一轮实现：

1. `Definition.CreateFlow(...)` 的 API 形态。
2. `Definition.CreateContext(...)` 的新增或等价入口。
3. `*Flow<TContext>` 到 `*Flow<TExternalContext> + *Context<TExternalContext>` 的职责拆分。
4. `FlowChartRuntimeSupport.cs` 中运行时状态辅助类型的位置与用途。
5. 相关单元测试对生成代码形状的断言。

### 可能需要新增的机制

如果目标包含“自定义且有节点实例状态”的节点，还需要新增：

1. 节点运行时共享接口。
2. 自定义节点状态类型与生成器绑定约定。
3. 可能的 codegenBinding 扩展字段，用来声明节点执行契约与状态需求。

## 分阶段实施建议

### 阶段 1：状态迁移到 Context

1. 生成 `*Context<TExternalContext>`。
2. 把 `CurrentNodeId`、`IsPaused`、`IsCompleted`、`_nodeStates` 从 Flow 挪入 Context。
3. 把 `_stepComputeCache` 改成 `StepOnce` 局部临时变量。
4. 把 Definition 的创建 API 拆成“创建 Flow”和“创建 Context”两步。
5. 更新现有字符串断言测试。

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

1. 生成出的 `Definition` 是否同时暴露 `CreateFlow` 与 `CreateContext`。
2. 生成出的 `Context` 是否包含 `CurrentNodeId`、`IsPaused`、`IsCompleted`、节点状态存储。
3. 生成出的 `Flow` 是否不再持有 `_nodeStates` 和运行态字段。
4. `Pause`、`ForEach`、未来 `PauseSeconds` 的状态写入是否落在 Context 上。
5. 若引入共享运行时契约，自定义节点 skeleton 是否生成了正确签名。

## 最终判断

对当前流程图机制的调整是需要的，但这是一次“运行时对象模型”和“生成契约”的调整，不是一次“文件格式”和“图结构协议”的调整。

更具体地说：

1. 现在就应该调整 Flow 与 Context 的职责边界。
2. 现在还不需要改动 FlowChart 文件结构。
3. 如果短期目标只覆盖内置控制节点与迭代节点，Generator 可以先独立完成这次迁移。
4. 如果中期目标包含自定义有状态节点，则必须补共享运行时接口，这会成为下一轮真正的机制扩展点。