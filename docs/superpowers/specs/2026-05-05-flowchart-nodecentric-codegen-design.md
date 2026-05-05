# FlowChart Node-Centric Code Generation Design

- **Date:** 2026-05-05
- **Status:** Draft
- **Target:** LightyDesign Generator — C# code generation for Unity engine

## Overview

Redesign the FlowChart code generation model from a **Flow-centric** architecture (where all routing and dispatch logic is hardcoded in a generated `*Flow<TContext>` class) to a **Node-centric** architecture (where each node encapsulates its own execution logic and returns an `int` port ID to express routing intent).

### Motivation

The current architecture concentrates all routing knowledge in a single generated `*Flow<TContext>` switch statement, making the code hard to extend for custom nodes, duplicating logic across flowcharts, and preventing node-level reuse.

The new architecture:

- Pushes execution and routing decisions into each node class.
- Keeps `Flow<TContext>` as a lightweight, **non-generated**, shared routing engine.
- Introduces `FlowChart` (generated abstract base) to hold per-graph static data and queries.
- Distinguishes **built-in nodes** (sealed, fully generated) from **custom nodes** (partial, user-implemented).

### Unity Compatibility

Generated C# code targets the C# language version supported by Unity. The following C# features are **avoided**:

| Feature | Status |
|---------|--------|
| Null-forgiving operator `!` | ❌ Avoid |
| Nullable reference type annotations `?` on reference types | ❌ Avoid |
| `record` / `record struct` | ❌ Avoid |
| `init` accessor | ❌ Avoid |
| `in` parameter modifier (C# 7.2+) | ✅ Safe (Unity 2020.3+) |
| `out` parameter modifier | ✅ Safe |
| `ref` return | ❌ Avoid |
| `static local functions` (C# 8.0+) | ✅ Safe |
| `default interface methods` (C# 8.0+) | ❌ Avoid |
| `function pointers` (C# 9.0+) | ❌ Avoid |

Nullable is globally disabled in generated code (`#nullable disable`).

---

## 1. Type Architecture

Four core types form the runtime model:

```
                    ┌─────────────────────────────────────┐
                    │        FlowChart (abstract)          │
                    │  ─────────────────────────────────── │
                    │  Per-graph static data & queries.    │
                    │  Generated once per .flowchart file. │
                    │  Holds: node singletons,            │
                    │    connections, property values.     │
                    └──────────────────┬──────────────────┘
                                       │ owns
                    ┌──────────────────▼──────────────────┐
                    │     Flow<TContext> (sealed)          │
                    │  ─────────────────────────────────── │
                    │  Per-instance runtime state.         │
                    │  NOT generated — shared runtime.     │
                    │  Routes via Graph.EvaluateFlowNode() │
                    │  + return value (int port ID).       │
                    └──────────────────┬──────────────────┘
                                       │ accesses
               ┌───────────────────────┼───────────────────────┐
               │                       │                       │
  ┌────────────▼──────────┐  ┌─────────▼──────────┐  ┌─────────▼──────────┐
  │  Node (sealed/partial)│  │  Context (TContext) │  │  FlowChart graph   │
  │  Per node definition. │  │  Per-instance       │  │  + property store  │
  │  Has: PORT constants, │  │  dynamic context.   │  │                    │
  │  property helpers,    │  │  Extension point    │  │                    │
  │  Evaluate method.     │  │  for future use.    │  │                    │
  └───────────────────────┘  └─────────────────────┘  └────────────────────┘
```

### 1.1 Responsibilities

| Type | Generated? | Scope | Purpose |
|------|-----------|-------|---------|
| `FlowChart` | ✅ Once per `.flowchart` | Shared across instances (singleton) | Static graph data, node instances, connections, property values, node dispatch |
| `Flow<TContext>` | ❌ Shared runtime | Per runtime instance | Routing engine, lifecycle state, query forwarding |
| `TContext` | ❌ User-provided | Per runtime instance | Dynamic context (game state, services, etc.) |
| Node classes | ✅ Per node definition | Shared across instances | Business logic, port constants, property access |

### 1.2 Key Design Decisions

**Decision 1: `Flow<TContext>` is NOT generated.**
It is a single shared sealed class that knows nothing about any specific flowchart. All graph-specific dispatch goes through `FlowChart` virtual/abstract methods.

**Decision 2: `FlowChart` is the only generated runtime type per flowchart file.**
It carries node singletons, connection descriptors, property values, and provides query methods + dispatch entry points.

**Decision 3: Nodes are instantiated per FlowChart, not per Flow instance.**
Since nodes are stateless (they receive all data through method parameters), a single instance per graph definition is sufficient and safe.

**Decision 4: All data enters nodes through method parameters.**
No node should reach into global state, singletons, or statics. The `IFlowRuntime` parameter gives access to the `FlowChart` (for property reads and connection queries) and the runtime.

---

## 2. IFlowRuntime Interface

The bridge between `Flow<TContext>` and nodes. Avoids coupling node code to the concrete `Flow<TContext>` type.

```csharp
// ===== FlowChartRuntimeSupport.cs (shared runtime) =====

#nullable disable

public interface IFlowRuntime
{
    /// <summary>
    /// The flowchart graph definition (generated per flowchart file).
    /// Provides access to node properties, connections, and dispatch.
    /// </summary>
    FlowChart Graph { get; }

    /// <summary>
    /// The current runtime context (game state, services, etc.).
    /// Erased to object for cross-graph node reuse.
    /// </summary>
    object Context { get; }

    /// <summary>
    /// The currently executing node's ID.
    /// For flow nodes being evaluated via EvaluateFlowNode, this points
    /// to the flow node itself.
    /// For compute nodes being evaluated via EvaluateComputeNode, the
    /// dispatcher temporarily sets this to the compute node ID so that
    /// property helpers resolve correctly.
    /// </summary>
    uint CurrentNodeId { get; }

    /// <summary>
    /// Set the current node ID (used internally by FlowChart dispatch).
    /// </summary>
    void SetCurrentNodeId(uint? nodeId);

    /// <summary>
    /// Resolve a compute input by tracing connections backward.
    /// </summary>
    T ResolveComputeInput<T>(uint targetNodeId, uint targetPortId);
}
```

### Unity Notes

- `#nullable disable` at file level avoids nullable annotations.
- The `Context` property is typed as `object` to keep `IFlowRuntime` non-generic. The concrete `Flow<TContext>` casts on the way in.
- No null-forgiving operators are used.

---

## 3. FlowChart (Generated Abstract Base)

### 3.1 Shared Runtime Definition

```csharp
// ===== FlowChartRuntimeSupport.cs =====

public abstract class FlowChart
{
    // ---- Metadata ----
    public abstract string RelativePath { get; }
    public abstract string Name { get; }

    // ---- Entry Point ----
    public abstract uint? GetEntryNodeId();

    // ---- Property Access ----
    public abstract T GetNodeProperty<T>(uint nodeId, string propertyName);

    // ---- Connection Queries ----
    public abstract bool TryResolveFlowTarget(
        uint sourceNodeId, uint sourcePortId,
        out uint targetNodeId, out uint targetPortId);

    public abstract void ResolveComputeSource(
        uint targetNodeId, uint targetPortId,
        out uint sourceNodeId, out uint sourcePortId);

    // ---- Node Dispatch (internal; called by Flow<TContext>) ----
    internal abstract int EvaluateFlowNode(IFlowRuntime flow, uint nodeId);
    internal abstract void EvaluateComputeNode(
        IFlowRuntime flow, uint nodeId, uint portId, out object result);
}
```

### 3.2 Generated Implementation

For each flowchart file (e.g. `Quest/Intro.flowchart`), the generator produces:

```csharp
// ===== Generated: FlowCharts/Files/Quest/Intro/IntroFlowChart.cs =====

#nullable disable

public sealed class IntroFlowChart : FlowChart
{
    // ---- Singleton Instance ----
    public static readonly IntroFlowChart Instance = new IntroFlowChart();
    private IntroFlowChart() { }

    // ---- Node Singletons ----
    // Event nodes
    private static readonly EventStartNode _node1 = new EventStartNode();

    // Flow nodes
    private static readonly IfNode _node3 = new IfNode();

    // Compute nodes (including constants)
    private static readonly Int32Node _node2 = new Int32Node();
    private static readonly AddNode _node4 = new AddNode();

    // ---- Connection Descriptors ----
    private static readonly FlowChartConnectionDescriptor[] _flowConns = new[]
    {
        new FlowChartConnectionDescriptor(1u, 251u, 3u, 201u),
    };

    private static readonly FlowChartConnectionDescriptor[] _computeConns = new[]
    {
        new FlowChartConnectionDescriptor(2u, 151u, 3u, 101u),
        new FlowChartConnectionDescriptor(4u, 151u, 5u, 101u),
    };

    // ---- Property Values (per node UID + property name) ----
    private static readonly Dictionary<uint, LightyFlowChartPropertyBag> _props = new()
    {
        [2u] = LightyFlowChartPropertyBag.Create()
            .Set("Value", 42),
        [5u] = LightyFlowChartPropertyBag.Create()
            .Set("Message", "hello"),
    };

    // ---- Metadata ----
    public override string RelativePath => "Quest/Intro";
    public override string Name => "Intro";

    // ---- Entry Point ----
    public override uint? GetEntryNodeId() => 1u;

    // ---- Property Access ----
    public override T GetNodeProperty<T>(uint nodeId, string propertyName)
    {
        return _props[nodeId].Get<T>(propertyName);
    }

    // ---- Connection Resolution ----
    public override bool TryResolveFlowTarget(
        uint sourceNodeId, uint sourcePortId,
        out uint targetNodeId, out uint targetPortId)
    {
        foreach (var conn in _flowConns)
        {
            if (conn.SourceNodeId == sourceNodeId
                && conn.SourcePortId == sourcePortId)
            {
                targetNodeId = conn.TargetNodeId;
                targetPortId = conn.TargetPortId;
                return true;
            }
        }
        targetNodeId = 0;
        targetPortId = 0;
        return false;
    }

    public override void ResolveComputeSource(
        uint targetNodeId, uint targetPortId,
        out uint sourceNodeId, out uint sourcePortId)
    {
        foreach (var conn in _computeConns)
        {
            if (conn.TargetNodeId == targetNodeId
                && conn.TargetPortId == targetPortId)
            {
                sourceNodeId = conn.SourceNodeId;
                sourcePortId = conn.SourcePortId;
                return;
            }
        }
        throw new InvalidOperationException(
            $"Compute input ({targetNodeId}:{targetPortId}) is not connected.");
    }

    // ---- Node Dispatch ----
    internal override int EvaluateFlowNode(IFlowRuntime flow, uint nodeId)
    {
        switch (nodeId)
        {
            case 1u: return _node1.Evaluate(flow);
            case 3u: return _node3.Evaluate(flow,
                flow.ResolveComputeInput<bool>(3u, 101u));
            default:
                throw new NotSupportedException(
                    $"Flow node {nodeId} is not a flow node.");
        }
    }

    internal override void EvaluateComputeNode(
        IFlowRuntime flow, uint nodeId, uint portId, out object result)
    {
        // Save and restore CurrentNodeId so property helpers in compute
        // nodes resolve to the correct node (not the calling flow node).
        var savedNodeId = flow.CurrentNodeId;
        flow.SetCurrentNodeId(nodeId);

        try
        {
            switch (nodeId)
            {
                case 2u:
                    if (portId == 151u)
                    {
                        _node2.Evaluate(flow, out int tmp);
                        result = tmp;
                        return;
                    }
                    break;
                case 4u:
                    if (portId == 151u)
                    {
                        _node4.Evaluate(flow,
                            flow.ResolveComputeInput<int>(4u, 101u),
                            flow.ResolveComputeInput<int>(4u, 102u),
                            out int tmp);
                        result = tmp;
                        return;
                    }
                    break;
            }
            throw new NotSupportedException(
                $"Compute output ({nodeId}:{portId}) is not supported.");
        }
        finally
        {
            flow.SetCurrentNodeId(savedNodeId);
        }
    }
}
```

### 3.3 Property Bag

A lightweight, Unity-safe container for per-node property values:

```csharp
// ===== FlowChartRuntimeSupport.cs =====

#nullable disable

public sealed class LightyFlowChartPropertyBag
{
    private readonly Dictionary<string, string> _values;

    private LightyFlowChartPropertyBag()
    {
        _values = new Dictionary<string, string>();
    }

    public static LightyFlowChartPropertyBag Create()
    {
        return new LightyFlowChartPropertyBag();
    }

    public LightyFlowChartPropertyBag Set<T>(string propertyName, T value)
    {
        var json = JsonSerializer.Serialize(value);
        _values[propertyName] = json;
        return this;
    }

    public T Get<T>(string propertyName)
    {
        if (!_values.TryGetValue(propertyName, out var json))
        {
            throw new InvalidOperationException(
                $"Property '{propertyName}' not found.");
        }
        return JsonSerializer.Deserialize<T>(json);
    }
}
```

**Unity note:** Uses `JsonSerializer` from `System.Text.Json` if available, or could be swapped for `Newtonsoft.Json` / `JsonUtility` in the Unity-specific build. The spec assumes `System.Text.Json` for now; the binding layer can abstract it.

---

## 4. Flow<TContext> (Shared Sealed Routing Engine)

NOT generated. Lives in `FlowChartRuntimeSupport.cs`.

```csharp
// ===== FlowChartRuntimeSupport.cs =====

#nullable disable

public sealed class Flow<TContext> : IFlowRuntime
{
    // ---- Special Return Values ----
    public const int End = 0;
    public const int Loop = -1;
    public const int Pause = -2;

    public Flow(FlowChart graph, TContext context)
    {
        if (graph == null)
            throw new ArgumentNullException(nameof(graph));

        Graph = graph;
        Context = context;
    }

    // ---- IFlowRuntime ----
    public FlowChart Graph { get; }
    public TContext Context { get; }
    object IFlowRuntime.Context => Context as object;

    // ---- Lifecycle State ----
    public uint? CurrentNodeId { get; private set; }
    public bool IsPaused { get; private set; }
    public bool IsCompleted { get; private set; }

    // ---- Public API ----
    public void Resume()
    {
        IsPaused = false;
    }

    public void StepOnce()
    {
        StepOnce(TimeSpan.Zero);
    }

    public void StepOnce(TimeSpan deltaTime)
    {
        if (deltaTime < TimeSpan.Zero)
            throw new ArgumentOutOfRangeException(nameof(deltaTime));

        if (IsCompleted || IsPaused)
            return;

        // First entry: resolve entry node
        if (CurrentNodeId == null)
        {
            var entry = Graph.GetEntryNodeId();
            if (entry == null || entry.Value == 0u)
            {
                Complete();
                return;
            }
            CurrentNodeId = entry;
        }

        // Delegate dispatch to FlowChart
        var result = Graph.EvaluateFlowNode(this, CurrentNodeId.Value);

        // Route based on return value
        switch (result)
        {
            case End:
                Complete();
                break;

            case Loop:
                // Re-enter current node (loop back)
                break;

            case Pause:
                IsPaused = true;
                break;

            default:
                // result > 0: treat as target port ID
                if (Graph.TryResolveFlowTarget(
                    CurrentNodeId.Value, (uint)result,
                    out var targetNodeId, out _))
                {
                    CurrentNodeId = targetNodeId;
                }
                else
                {
                    // No connection from this port = end of flow
                    Complete();
                }
                break;
        }
    }

    public void Step(int maxSteps)
    {
        Step(maxSteps, TimeSpan.Zero);
    }

    public void Step(int maxSteps, TimeSpan deltaTime)
    {
        if (maxSteps <= 0)
            throw new ArgumentOutOfRangeException(nameof(maxSteps));

        for (var i = 0; i < maxSteps; i++)
        {
            if (IsPaused || IsCompleted)
                break;
            StepOnce(deltaTime);
        }
    }

    public void RunToCompletion()
    {
        RunToCompletion(TimeSpan.Zero);
    }

    public void RunToCompletion(TimeSpan deltaTime)
    {
        while (!IsPaused && !IsCompleted)
            StepOnce(deltaTime);
    }

    public void RunUntilPaused()
    {
        RunUntilPaused(TimeSpan.Zero);
    }

    public void RunUntilPaused(TimeSpan deltaTime)
    {
        while (!IsPaused && !IsCompleted)
            StepOnce(deltaTime);
    }

    // ---- Compute Input Resolution ----
    public T ResolveComputeInput<T>(uint targetNodeId, uint targetPortId)
    {
        Graph.ResolveComputeSource(
            targetNodeId, targetPortId,
            out var sourceNodeId, out var sourcePortId);

        Graph.EvaluateComputeNode(
            this, sourceNodeId, sourcePortId, out var value);

        return (T)value;
    }

    // ---- Internal ----
    // ---- IFlowRuntime.SetCurrentNodeId ----
    void IFlowRuntime.SetCurrentNodeId(uint? nodeId)
    {
        CurrentNodeId = nodeId;
    }

    private void Complete()
    {
        CurrentNodeId = null;
        IsCompleted = true;
        IsPaused = false;
    }
}
```

### Return Value Semantics (enforced by Flow<TContext>)

| Return value | Constant | Semantics |
|---|---|---|
| `0` | `Flow<TContext>.End` | Flow execution ends. `IsCompleted = true`. |
| `-1` | `Flow<TContext>.Loop` | Current node re-enters itself on next step (loop). |
| `-2` | `Flow<TContext>.Pause` | Current node pauses. `IsPaused = true`. |
| `> 0` | — | Treated as target port ID. Flow resolves the connection from this port and transitions to the connected node. |

---

## 5. Node Code Generation

### 5.1 General Rules

| Node kind | Built-in | Custom |
|-----------|----------|--------|
| Class keyword | `sealed class` | `partial class` |
| Evaluate method | Full body | `partial` declaration only |
| `Flow` node return type | `int` (port ID) | `int` (port ID) |
| `Compute` node return type | `void` (uses `out`) | `void` (uses `out`) |
| Parameter order | `IFlowRuntime flow, [in inputs...], [out outputs...]` | Same |

### 5.2 Generated Members (all nodes)

For every non-event node, the generator produces:

1. **PORT_XXX constants** — one per compute port and flow port
2. **Property helper methods** — one per property (e.g., `GetValue`, `GetDuration`)
3. **`Evaluate` method** — sealed or partial depending on built-in/custom

### 5.3 PORT Constant Naming Convention

```
<compute/flow port name> → PORT_<UPPER_SNAKE_CASE_NAME>
```

Examples:

| Port name | Constant |
|-----------|----------|
| `In` | `PORT_IN` |
| `Then` | `PORT_THEN` |
| `Else` | `PORT_ELSE` |
| `Condition` | `PORT_CONDITION` |
| `Left` | `PORT_LEFT` |
| `Right` | `PORT_RIGHT` |
| `Result` | `PORT_RESULT` |
| `UpdatedList` | `PORT_UPDATED_LIST` |

The port value is the numeric `portId` from the node definition.

### 5.4 Examples

#### Built-in Flow Node (If)

```csharp
// Generated: Nodes/Builtin/Control/IfNode.cs
#nullable disable

namespace LightyDesignData.FlowCharts.Nodes.Builtin.Control
{
    public sealed class IfNode
    {
        // ---- Port Constants ----
        public const int PORT_IN = 201;
        public const int PORT_THEN = 251;
        public const int PORT_ELSE = 252;
        public const int PORT_CONDITION = 101;

        // ---- Evaluate ----
        public int Evaluate(IFlowRuntime flow, bool condition)
        {
            return condition ? PORT_THEN : PORT_ELSE;
        }
    }
}
```

#### Built-in Compute Node (Add)

```csharp
// Generated: Nodes/Builtin/Arithmetic/AddNode.cs
#nullable disable

namespace LightyDesignData.FlowCharts.Nodes.Builtin.Arithmetic
{
    public sealed class AddNode
    {
        // ---- Port Constants ----
        public const int PORT_LEFT = 101;
        public const int PORT_RIGHT = 102;
        public const int PORT_RESULT = 151;

        // ---- Evaluate ----
        public void Evaluate(IFlowRuntime flow, int left, int right, out int result)
        {
            result = left + right;
        }
    }
}
```

(All existing arithmetic/comparison overloads from `FlowChartStandardNodeBindingHelper` follow the same pattern.)

#### Important: Property Helper Node ID Convention

Property helpers must handle the distinction between **flow node context** and **compute node context**:

- When a **flow node** is executing (`EvaluateFlowNode`), `flow.CurrentNodeId` points to that flow node — property helpers can use it directly.
- When a **compute node** is executing (`EvaluateComputeNode`), `flow.CurrentNodeId` points to the *calling flow node*, NOT the compute node. Therefore, property helpers for compute nodes **must accept an explicit `uint nodeId` parameter**.

Convention:

| Node kind | Property helper signature |
|-----------|--------------------------|
| Flow node | `T GetXxx(IFlowRuntime flow)` — uses `flow.CurrentNodeId` |
| Compute node | `T GetXxx(IFlowRuntime flow, uint nodeId)` — explicit node ID |

#### Built-in Compute Node with Property (Int32 constant)

```csharp
// Generated: Nodes/Builtin/Constant/Int32Node.cs
#nullable disable

namespace LightyDesignData.FlowCharts.Nodes.Builtin.Constant
{
    public sealed class Int32Node
    {
        // ---- Port Constants ----
        public const int PORT_RESULT = 151;

        // ---- Property Helpers (compute node: explicit nodeId) ----
        public int GetValue(IFlowRuntime flow, uint nodeId)
        {
            return flow.Graph.GetNodeProperty<int>(nodeId, "Value");
        }

        // ---- Evaluate ----
        public void Evaluate(IFlowRuntime flow, out int result)
        {
            result = GetValue(flow, flow.CurrentNodeId);
        }
    }
}
```

**NOTE:** The dispatcher (`EvaluateComputeNode`) sets `flow.CurrentNodeId` to the compute node's ID *before* calling `Evaluate` for constant/property-backed compute nodes. This ensures `flow.CurrentNodeId` is correct. For details, see §3.2 `EvaluateComputeNode` — the implementation should save/restore `CurrentNodeId` around compute evaluation.

#### Built-in Flow Node with Property (PauseSeconds)

```csharp
// Generated: Nodes/Builtin/Control/PauseSecondsNode.cs
#nullable disable

namespace LightyDesignData.FlowCharts.Nodes.Builtin.Control
{
    public sealed class PauseSecondsNode
    {
        public const int PORT_IN = 201;
        public const int PORT_OUT = 251;

        // ---- Property Helpers (flow node: uses flow.CurrentNodeId) ----
        public int GetDuration(IFlowRuntime flow)
        {
            return flow.Graph.GetNodeProperty<int>(
                flow.CurrentNodeId, "Duration");
        }

        public int Evaluate(IFlowRuntime flow)
        {
            var duration = GetDuration(flow);
            // ... pause logic using Flow<TContext>.Pause, deltaTime, etc.
            // (Deferred to Phase 2 for time-aware node semantics)
            return PORT_OUT;
        }
    }
}
```

#### Custom Flow Node (partial)

```csharp
// Generated: Nodes/Custom/Quest/CheckConditionNode.cs
#nullable disable

namespace LightyDesignData.FlowCharts.Nodes.Custom.Quest
{
    public partial class CheckConditionNode
    {
        public const int PORT_IN = 201;
        public const int PORT_PASS = 251;
        public const int PORT_FAIL = 252;
        public const int PORT_PLAYER_LEVEL = 101;
        public const int PORT_THRESHOLD = 102;

        // ---- Property Helpers (flow node: uses flow.CurrentNodeId) ----
        public int GetMinLevel(IFlowRuntime flow)
        {
            return flow.Graph.GetNodeProperty<int>(
                flow.CurrentNodeId, "MinLevel");
        }

        // ---- Implemented by external system ----
        public partial int Evaluate(IFlowRuntime flow, int playerLevel, int threshold);
    }
}
```

The external implementation:

```csharp
// In user code (e.g., Game/Scripts/FlowChart/Nodes/CheckConditionNodeImpl.cs)
public partial class CheckConditionNode
{
    public partial int Evaluate(IFlowRuntime flow, int playerLevel, int threshold)
    {
        if (playerLevel >= GetMinLevel(flow))
            return PORT_PASS;
        return PORT_FAIL;
    }
}
```

#### Custom Compute Node (partial)

```csharp
// Generated: Nodes/Custom/Math/DamageCalculateNode.cs
#nullable disable

namespace LightyDesignData.FlowCharts.Nodes.Custom.Math
{
    public partial class DamageCalculateNode
    {
        public const int PORT_BASE_DAMAGE = 101;
        public const int PORT_ATTACK_MULTIPLIER = 102;
        public const int PORT_FINAL_DAMAGE = 151;

        public partial void Evaluate(
            IFlowRuntime flow,
            int baseDamage,
            float attackMultiplier,
            out int finalDamage);
    }
}
```

### 5.5 Built-in Node with Generic Type Parameter (List.Add)

```csharp
// Generated: Nodes/Builtin/List/AddNode.cs
#nullable disable

namespace LightyDesignData.FlowCharts.Nodes.Builtin.List
{
    public sealed class AddNode<TElement>
    {
        public const int PORT_IN = 201;
        public const int PORT_THEN = 251;
        public const int PORT_LIST = 101;
        public const int PORT_ITEM = 102;
        public const int PORT_UPDATED_LIST = 151;

        public int Evaluate(
            IFlowRuntime flow,
            List<TElement> list,
            TElement item,
            out List<TElement> updatedList)
        {
            list.Add(item);
            updatedList = list;
            return PORT_THEN;
        }
    }
}
```

### 5.6 Built-in Node with Overloads (Arithmetic.Add)

```csharp
// Generated: Nodes/Builtin/Arithmetic/AddNode.cs
#nullable disable

namespace LightyDesignData.FlowCharts.Nodes.Builtin.Arithmetic
{
    public sealed class AddNode
    {
        public const int PORT_LEFT = 101;
        public const int PORT_RIGHT = 102;
        public const int PORT_RESULT = 151;

        // Overloads for each numeric type
        public void Evaluate(IFlowRuntime flow, int left, int right, out int result)
        {
            result = left + right;
        }

        public void Evaluate(IFlowRuntime flow, float left, float right, out float result)
        {
            result = left + right;
        }

        public void Evaluate(IFlowRuntime flow, double left, double right, out double result)
        {
            result = left + right;
        }
        // ... additional overloads
    }
}
```

### 5.7 Overload Dispatch Table (Break from Current)

In the current model, overloaded built-in nodes (Arithmetic, Comparison) use a shared `FlowChartStandardNodeBindingHelper` class with many static methods. In the new model:

- Each overloaded node **directly implements** the overloads in its own sealed class (inline operators).
- The `FlowChartStandardNodeBindingHelper` class is **removed** — no more separate helper file.

This eliminates the extra indirection and keeps code local to the node.

**Exception:** Generic helper methods (List operations, Dictionary operations) that have clear generic signatures may remain as shared helpers if appropriate, but the node class itself still provides the `Evaluate` wrapper with PORT constants.

---

## 6. FlowChart Dispatch Flow (Complete Walkthrough)

A complete execution cycle for a flowchart with: `Event Start → If → PauseSeconds → End`

```
1. User calls: flow.StepOnce()

2. Flow<TContext>.StepOnce():
   - CurrentNodeId == null → Graph.GetEntryNodeId() → 1u
   - CurrentNodeId = 1u
   - Graph.EvaluateFlowNode(flow, 1u)

3. IntroFlowChart.EvaluateFlowNode(flow, 1u):
   - case 1u: return _node1.Evaluate(flow);
   - EventStartNode.Evaluate(flow):
     - No compute ports → no inputs to resolve
     - Returns PORT_THEN (251)

4. Flow<TContext>.StepOnce() resumes:
   - result = 251 (> 0, treat as port ID)
   - Graph.TryResolveFlowTarget(1u, 251u, ...) → (3u, 201u)
   - CurrentNodeId = 3u

5. Next StepOnce():
   - Graph.EvaluateFlowNode(flow, 3u)
   - IfNode.Evaluate(flow, condition):
     - condition = flow.ResolveComputeInput<bool>(3u, 101u)
     → traces back to compute source, evaluates Int32Node, gets 42
     - Returns 42 != 0 ? PORT_THEN : PORT_ELSE → PORT_THEN (251)

6. Flow<TContext>.StepOnce() resumes:
   - result = 251 → resolve flow target → PauseSeconds node
   - CurrentNodeId = 4u

7. Next StepOnce():
   - Graph.EvaluateFlowNode(flow, 4u)
   - PauseSecondsNode.Evaluate(flow):
     - GetDuration(flow) → 3 (seconds)
     - ... internal pause logic ...
     - Either returns Pause (-2) to wait, or PORT_OUT (251) when done

8. When PORT_OUT returned:
   - resolve flow target → no connection or exit node → Complete()
```

---

## 7. Changes from Current Model

| Area | Current (Flow-centric) | New (Node-centric) |
|------|----------------------|-------------------|
| Node class modifier | `partial class` (all) | `sealed class` (built-in), `partial class` (custom) |
| Node method name | `Evaluate` (compute) / `Execute` (flow) | `Evaluate` (all non-event nodes) |
| Node return type | Computed value type | `int` (flow nodes), `void` (compute nodes) |
| Output mechanism | Return value | `out` parameter |
| Flow parameter | None | `IFlowRuntime flow` (first param) |
| PORT constants | None (hardcoded IDs) | `public const int PORT_XXX = NNN` |
| Property access | Inline `JsonSerializer.Deserialize` in `*Flow.cs` | `flow.Graph.GetNodeProperty<T>(nodeId, "name")` |
| `*Flow.cs` dispatch | Hardcoded switch with full logic | Delegates to `FlowChart.EvaluateFlowNode()` |
| `FlowChartStandardNodeBindingHelper` | Shared static helper class | Removed (logic inlined into node classes) |
| `Flow<TContext>` | Generated per graph | Shared sealed class, not generated |
| `FlowChart` base class | Does not exist | New abstract base, generated per graph |

---

## 8. Generator Implementation Outline

### 8.1 Files to Modify

| File | Change |
|------|--------|
| `LightyFlowChartNodeCodeGenerator.cs` | Rewrite `RenderNodeFile` for new node shapes (sealed/partial, PORT constants, property helpers, `IFlowRuntime` param, `int`/`void` return, `out` params) |
| `LightyFlowChartFileCodeGenerator.cs` | Replace `RenderDefinitionFile` + `RenderFlowFile` with a single `RenderFlowChartFile` that generates the `FlowChart` subclass; remove `RenderRuntimeSupportFile` content that will be shared; remove old `RenderFlowFile` |
| `LightyFlowChartCodegenNaming.cs` | Add PORT constant naming utilities (`ComputePortToConstantName`, `FlowPortToConstantName`) |
| `LightyGeneratedFlowChartPackage.cs` | May need adjustment for new file structure |

### 8.2 Files to Create

| File | Purpose |
|------|---------|
| `FlowChartRuntimeSupport.cs` (shared runtime, hand-written) | `IFlowRuntime`, `Flow<TContext>`, `FlowChart` abstract base, `FlowChartNodeDescriptor`, `FlowChartConnectionDescriptor`, `LightyFlowChartPropertyBag` |

### 8.3 Files to Remove

| File | Reason |
|------|--------|
| `FlowChartStandardNodeBindingHelper.cs` | Logic inlined into node classes |

### 8.4 File Output Structure

```
Generated/Config/
└── FlowCharts/
    ├── FlowChartRuntimeSupport.cs          ← Shared (hand-written, not generated)
    ├── Nodes/
    │   ├── Builtin/
    │   │   ├── Arithmetic/{Add,Subtract,...}Node.cs
    │   │   ├── Comparison/{Equal,NotEqual,...}Node.cs
    │   │   ├── Constant/{Bool,Int32,String}Node.cs
    │   │   ├── Config/{ListInt32,DictionaryStringInt32}Node.cs
    │   │   ├── Control/{If,While,Pause,WaitUntil,PauseSeconds}Node.cs
    │   │   ├── List/{Add,Count,GetAt,ForEach}Node.cs
    │   │   └── Dictionary/{Set,Get,ContainsKey,ForEach}Node.cs
    │   └── Custom/... (user-defined nodes)
    └── Files/
        └── Quest/
            └── Intro/
                └── IntroFlowChart.cs       ← Generated sealed FlowChart
```

---

## 9. Migration Considerations

### 9.1 Backward Compatibility

- The old `*Definition.cs` and `*Flow.cs` generated files will be replaced by `*FlowChart.cs`.
- Consumers that reference `IntroDefinition.Create()` and `IntroFlow<TContext>` directly need updating.
- New usage pattern:

```csharp
// Old (current)
var definition = IntroDefinition.Create();
var flow = definition.CreateFlow(context);
flow.RunToCompletion();

// New
var graph = IntroFlowChart.Instance;
var flow = new Flow<GameContext>(graph, context);
flow.RunToCompletion();
```

### 9.2 Phase 1 vs. Future Work

This spec covers Phase 1 of the Node-centric redesign:

| Phase | Scope |
|-------|-------|
| **Phase 1 (this spec)** | Core architecture: FlowChart base, Flow<TContext> engine, node generation (sealed + partial), PORT constants, property helpers, connection queries |
| **Phase 2 (future)** | Time-aware nodes (PauseSeconds, WaitUntil), deltaTime propagation, node state management |
| **Phase 3 (future)** | Shared runtime interface for custom stateful nodes, node execution result model |
| **Phase 4 (future)** | Scheduling and waiting capabilities, time sources, context expansion |

---

## 10. Test Plan

The following test categories need updating:

1. **Node generation tests** — Verify PORT constants, property helpers, Evaluate signatures (sealed vs. partial, int vs. void, `IFlowRuntime` param)
2. **FlowChart generation tests** — Verify FlowChart subclass shape, property bag, connection queries, dispatch switch
3. **Runtime routing tests** — Verify `Flow<TContext>` correctly interprets return values (0, -1, -2, >0) and resolves connections
4. **Compilation tests** — Verify generated code compiles cleanly with `#nullable disable`, no `!` operator usage
5. **Custom node integration tests** — Verify partial method compilation and linkage
6. **Generic and overload nodes** — Verify type parameters and overload resolution still work

---

## 11. Open Questions

1. **Time/deltaTime propagation:** Should `Flow.StepOnce(TimeSpan)` pass deltaTime to nodes, or should nodes query time from the context? (Deferred to Phase 2.)
2. **Loop re-entry state:** When a node returns `-1` (Loop), should `Flow` reset the node's compute cache, or preserve it? (Deferred to Phase 2.)
3. **Event nodes:** The spec excludes event nodes from having `Evaluate`. Event nodes always auto-transition on entry and have no compute logic. Is this correct, or should event nodes also support `Evaluate` for conditional event execution? (Deferred.)
4. **PropertyBag serialization:** Using `System.Text.Json` may not be available in all Unity targets. Consider abstracting the serialization layer or providing a Unity-compatible `JsonUtility` alternative.
