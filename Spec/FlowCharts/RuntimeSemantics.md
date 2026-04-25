# 流程图运行时语义

## 作用

本文件定义流程图运行时对象、生命周期、推理接口、暂停/结束语义以及异常传播规则。它为后续 Core 和 Generator 提供统一目标。

## 基本对象

### FlowChart 定义对象

1. FlowChart 定义对象描述一张流程图的静态结构。
2. 它持有节点、端口和连接关系，但不持有会变化的运行时上下文。
3. 同一张 FlowChart 定义可以同时创建任意多个 Flow 和任意多个 Context。

### Flow 运行时类型

1. 每张流程图可生成一个 `Flow<TExternalContext>` 类型，作为该图的无状态解释器和调度器。
2. Flow 可以持有流程图定义引用、入口策略、节点运行时单例等只读成员。
3. Flow 不应持有会在推理过程中变化的成员；同一 Flow 实例应可复用于多个 Context。

### FlowContext 运行时上下文对象

1. 每张流程图应生成一个与该图实例紧密关联的 Context 类型，例如 `QuestIntroContext<TExternalContext>`。
2. Context 持有外部业务上下文 `ExternalContext`，也持有该流程图实例自身的运行时状态。
3. Context 是流程图运行时唯一的可变状态载体；Flow 只能读取和修改传入的 Context。
4. 同一张 FlowChart 定义可同时存在多个 Context，它们之间互不污染。

## 入口与重入

1. `event` 节点是合法的 Flow 创建入口。
2. 调用方应先获得某张图的 Flow，再为每次运行创建独立的 Context。
3. 入口节点选择应记录在 Context 中，而不是记录在 Flow 的可变字段中。
4. 因为 FlowChart 定义和 Flow 都不持有可变运行态，所以同一张图可以任意重入，并可同时推进多个 Context。

## Context 持有状态

首版 Context 至少需要持有以下状态：

1. `externalContext`
   外部业务侧上下文，由调用方传入。
2. `entryNodeId`
   本次运行选定的入口节点 id。若未显式指定，可由生成器填入默认入口。
3. `currentNodeId`
   当前所在流程节点 id。若尚未开始或已结束，可为空。
4. `isPaused`
   当前是否处于暂停状态。
5. `isCompleted`
   当前是否已经结束。
6. `nodeStates`
   与节点实例绑定的运行时状态集合，用于保存循环索引、等待起始时间、延迟计时、上次输出等节点局部状态。
7. `storedOutputs`
   需要跨步保留的流程节点输出快照。该状态可独立建模，也可视为节点状态的一部分。

建议补充但非首版强制的状态：

1. `pauseReason`
   用于区分外部请求暂停、节点主动暂停或条件等待。
2. `lastTransition`
   用于调试和日志记录。
3. `stepCount`
   用于统计执行步数和调试。
4. `debugTrace`
   用于按需记录调度轨迹。

## 节点实例状态

1. 只要某个节点跨步保留状态，该状态就必须进入 Context，而不能保存在 Flow 上。
2. `Pause` 这类节点可以只改写 `isPaused` 和 `currentNodeId`；若未来扩展出“暂停到指定条件/时间”的节点，则应把等待信息写入对应节点状态。
3. `PauseSeconds` 一类节点应在首次进入时把起始时间或唤醒时间写入节点状态；后续调度时继续读取该状态，而不是重新初始化。
4. `ForEach` 一类节点应把迭代索引、当前元素快照以及必要的枚举载荷保存在 Context 的节点状态中。
5. 节点状态的生命周期应与 Context 绑定；节点执行结束、循环走完或显式重置时，再清空对应状态。

## Flow 自身约束

1. Flow 可以保留只读的定义引用、节点运行时单例和静态连接表。
2. Flow 不应持有 `currentNodeId`、`isPaused`、`isCompleted`、`nodeStates` 等可变字段。
3. 单步推理过程中若需要临时计算缓存，应使用方法局部变量，或在严格限定为“单步生命周期”的前提下使用局部辅助对象，而不是把缓存持久挂在 Flow 实例上。
4. 如果未来需要跨步缓存，该缓存仍应进入 Context。

## 流程回路

1. 流程连接允许形成回路。
2. `if`、`while`、`for each`、`break`、`continue` 等控制节点依赖这一能力实现。
3. 允许流程回路不代表允许计算回路；计算连接仍然必须保持无环。

## 推理接口

首版 Flow 运行时应提供以下接口语义：

1. `StepOnce(context)`
   执行一个最小流程推进单位。
2. `Step(context, maxSteps)`
   最多连续执行 N 个最小流程推进单位。
3. `RunToCompletion(context)`
   持续执行，直到 `isCompleted == true`。
4. `RunUntilPaused(context)`
   持续执行，直到 `isPaused == true` 或 `isCompleted == true`。
5. `RunUntil(context, predicate)`
   持续执行，直到外部基于 Context 的条件返回成立，或流程暂停，或流程结束。
6. `Resume(context)`
   清除暂停态并允许后续继续推进。

## 步进语义

1. “一步”指一次可观察的流程推进，而不是单纯一次计算端口求值。
2. 一个流程节点在被调度执行后，可能：
   - 跳转到下一个流程节点。
   - 改写当前 Context 的暂停状态。
   - 改写当前 Context 的结束状态。
   - 改写当前 Context 的节点实例状态。
   - 抛出异常。
3. 计算端口求值属于该步内部行为，不单独暴露为 Flow 的公共步进单位。
4. 一次步进中发生的所有可持久变化，都应最终落在 Context 上。

## 暂停语义

Flow 的暂停来源分为两类：

1. 外部请求暂停
   调用方在运行接口的边界上要求当前 Context 在合适时机停下。
2. 节点主动暂停
   某个流程节点在执行后要求当前 Context 停止推进，直到后续再次被唤醒。

补充约定：

1. 当 `isPaused == true` 时，Flow 不应继续自动推进该 Context。
2. 被暂停的 Context 可以在后续再次调用运行接口后继续推进。
3. `Resume(context)` 只负责解除暂停；它不应隐式清理节点实例状态。
4. 暂停不等于结束；`isPaused` 与 `isCompleted` 是两个独立状态。

## 结束语义

1. 当 Context 到达显式结束节点或运行时定义的结束条件时，`isCompleted` 置为 `true`。
2. 已结束的 Context 不应再继续推进。
3. 已结束的 Context 可以保留最终外部上下文与节点状态，以供外部读取结果或调试。

## 异常传播

1. 推理过程中产生的异常不需要在 Flow 或 Context 内部持久保存。
2. 异常应直接抛给调用 Flow 接口的上层。
3. 首版不要求记录异常历史。

## 中间值缓存

1. 单步内部的计算缓存可作为一次 `StepOnce` 的局部临时对象存在。
2. 任何跨步缓存都必须进入 Context，而不能放在共享 Flow 上。
3. 缓存必须与具体 Context 绑定，不能污染其它 FlowChart 实例运行态。

## 代码生成建议

1. 每张流程图生成一个静态定义对象、一个 `Flow<TExternalContext>` 类型和一个 `Context<TExternalContext>` 类型。
2. 定义对象负责创建 Flow，也负责创建 Context。
3. Flow 类型只负责读取和修改 Context，并暴露步进与运行接口。
4. 已知的有状态节点应优先生成专属状态槽；在首轮迁移阶段，也可先把 `Dictionary<uint, FlowChartNodeState>` 放入生成出的 Context 作为兼容层。
5. 节点 partial class 是按节点定义共享生成的，而不是按流程图实例生成的；如果未来允许自定义有状态节点访问运行时上下文，应补一层共享运行时接口，而不是让节点类直接依赖某一张图的专属 Context 类型。
6. 节点抛出的异常直接透传，不在生成骨架中吞掉。

## 当前状态结论

流程图运行时的核心语义已经进一步收敛：FlowChart 定义保持静态，Flow 保持无状态，所有可变运行态都进入与图实例绑定的 Context。现有机制需要调整的重点是代码生成出的运行时模型和节点执行契约，而不是流程图文件格式、连线规则或类型系统本身。