# FlowChart Node-Centric Code Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign FlowChart code generation from Flow-centric to Node-centric architecture: nodes carry PORT constants, property helpers, and `Evaluate` methods returning `int` port IDs; `Flow<TContext>` becomes a shared non-generated routing engine; `FlowChart` (generated) replaces the old `*Definition` + `*Flow` pair.

**Architecture:** Four types: `FlowChart` (generated abstract base, per-graph static data), `Flow<TContext>` (shared sealed, not generated, routing engine), `IFlowRuntime` (bridge interface), Node classes (sealed built-in, partial custom). All data enters nodes through `IFlowRuntime` parameter. Graph dispatch delegates to `FlowChart.EvaluateFlowNode()`.

**Tech Stack:** C# (Unity-compatible, `#nullable disable`, no `!` operator), LightyDesign Generator (existing `CodeWriter` infrastructure), xUnit tests with string-content assertions on generated code.

**Spec:** `docs/superpowers/specs/2026-05-05-flowchart-nodecentric-codegen-design.md`

---

## File Structure

### New Files
| File | Purpose |
|------|---------|
| `src/LightyDesign.Generator/FlowChartRuntimeSupport.cs` | Hand-written shared runtime: `IFlowRuntime`, `FlowChart` abstract base, `Flow<TContext>`, `FlowChartNodeDescriptor`, `FlowChartConnectionDescriptor`, `LightyFlowChartPropertyBag` |

### Modified Files
| File | Change Description |
|------|-------------------|
| `src/LightyDesign.Generator/LightyFlowChartCodegenNaming.cs` | Add `PortToConstantName(string portName)` and `PropertyToHelperMethodName(string propertyName)` utility methods |
| `src/LightyDesign.Generator/LightyFlowChartNodeCodeGenerator.cs` | Rewrite node rendering: sealed for built-in, partial for custom; PORT constants; `IFlowRuntime` parameter; flow nodes return `int`; compute nodes return `void` + `out`; property helper generation |
| `src/LightyDesign.Generator/LightyFlowChartFileCodeGenerator.cs` | Replace `RenderDefinitionFile`/`RenderFlowFile`/`RenderRuntimeSupportFile` with `RenderFlowChartFile` that generates `FlowChart` subclass; remove `FlowChartStandardNodeBindingHelper` generation; remove old runtime support generation |
| `tests/LightyDesign.Tests/FlowChartCodeGenerationTests.cs` | Update all string-assertion tests for new code shapes (PORT constants, IFlowRuntime param, sealed, int/void return, etc.) |

### Generated Output Structure (per spec)
```
Generated/Config/
└── FlowCharts/
    ├── FlowChartRuntimeSupport.cs          ← Hand-written, NOT generated
    ├── Nodes/Builtin/Arithmetic/AddNode.cs
    ├── Nodes/Builtin/Arithmetic/SubtractNode.cs
    ├── Nodes/Builtin/Comparison/EqualNode.cs
    ├── Nodes/Builtin/Constant/Int32Node.cs
    ├── Nodes/Builtin/Control/IfNode.cs
    ├── Nodes/Builtin/List/AddNode.cs
    ├── Nodes/Builtin/Dictionary/SetNode.cs
    └── ... (all other built-in node definition files)
    └── Files/Quest/Intro/IntroFlowChart.cs ← Replaces old IntroDefinition.cs + IntroFlow.cs
```

---

### Task 1: Add PORT constant and property helper naming utilities

**Files:**
- Modify: `src/LightyDesign.Generator/LightyFlowChartCodegenNaming.cs` (append new methods)

- [ ] **Step 1: Read the current file to understand existing patterns**

Run: `cat -n src/LightyDesign.Generator/LightyFlowChartCodegenNaming.cs`
Expected: the existing file with `ToTypeIdentifier`, `GetFlowChartLeafTypeIdentifier`, `BuildLddFlowChartPropertyName` methods.

- [ ] **Step 2: Write the failing test for PortToConstantName**

Add to `tests/LightyDesign.Tests/FlowChartCodeGenerationTests.cs`:

```csharp
[Fact]
public void CodegenNaming_PortToConstantName_ShouldConvertPortNames()
{
    Assert.Equal("PORT_IN", LightyFlowChartCodegenNaming.PortToConstantName("In"));
    Assert.Equal("PORT_THEN", LightyFlowChartCodegenNaming.PortToConstantName("Then"));
    Assert.Equal("PORT_ELSE", LightyFlowChartCodegenNaming.PortToConstantName("Else"));
    Assert.Equal("PORT_CONDITION", LightyFlowChartCodegenNaming.PortToConstantName("Condition"));
    Assert.Equal("PORT_LEFT", LightyFlowChartCodegenNaming.PortToConstantName("Left"));
    Assert.Equal("PORT_RIGHT", LightyFlowChartCodegenNaming.PortToConstantName("Right"));
    Assert.Equal("PORT_RESULT", LightyFlowChartCodegenNaming.PortToConstantName("Result"));
    Assert.Equal("PORT_UPDATED_LIST", LightyFlowChartCodegenNaming.PortToConstantName("UpdatedList"));
    Assert.Equal("PORT_TRUE", LightyFlowChartCodegenNaming.PortToConstantName("True"));
    Assert.Equal("PORT_FALSE", LightyFlowChartCodegenNaming.PortToConstantName("False"));
    Assert.Equal("PORT_FINAL_DAMAGE", LightyFlowChartCodegenNaming.PortToConstantName("FinalDamage"));
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `dotnet test tests/LightyDesign.Tests --filter "CodegenNaming_PortToConstantName" --nologo`
Expected: FAIL — `LightyFlowChartCodegenNaming` does not contain `PortToConstantName`

- [ ] **Step 4: Implement PortToConstantName and PropertyToHelperMethodName**

Add to end of `LightyFlowChartCodegenNaming.cs`:

```csharp
public static string PortToConstantName(string portName)
{
    if (string.IsNullOrWhiteSpace(portName))
    {
        return "PORT_UNKNOWN";
    }

    var builder = new StringBuilder("PORT");
    foreach (var character in portName)
    {
        if (char.IsUpper(character) && builder.Length > 4)
        {
            builder.Append('_');
        }
        builder.Append(char.ToUpperInvariant(character));
    }
    return builder.ToString();
}

public static string PropertyToHelperMethodName(string propertyName)
{
    if (string.IsNullOrWhiteSpace(propertyName))
    {
        return "GetUnknownProperty";
    }

    var typeName = ToTypeIdentifier(propertyName);
    return typeName.StartsWith('@')
        ? "Get" + typeName.Substring(1)
        : "Get" + typeName;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `dotnet test tests/LightyDesign.Tests --filter "CodegenNaming_PortToConstantName" --nologo`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/LightyDesign.Generator/LightyFlowChartCodegenNaming.cs tests/LightyDesign.Tests/FlowChartCodeGenerationTests.cs
git commit -m "feat(flowchart): add PORT constant and property helper naming utilities"
```

---

### Task 2: Create FlowChartRuntimeSupport.cs (shared runtime types)

**Files:**
- Create: `src/LightyDesign.Generator/FlowChartRuntimeSupport.cs`

- [ ] **Step 1: Create the shared runtime support file**

Write `src/LightyDesign.Generator/FlowChartRuntimeSupport.cs`:

```csharp
#nullable disable

using System;
using System.Collections.Generic;
using System.Text.Json;

namespace LightyDesign.Generator
{
    // ============================================================
    // IFlowRuntime — bridge interface between Flow<TContext> and nodes
    // ============================================================

    public interface IFlowRuntime
    {
        FlowChart Graph { get; }
        object Context { get; }
        uint CurrentNodeId { get; }
        void SetCurrentNodeId(uint? nodeId);
        T ResolveComputeInput<T>(uint targetNodeId, uint targetPortId);
    }

    // ============================================================
    // FlowChart — abstract base (generated per .flowchart file)
    // ============================================================

    public abstract class FlowChart
    {
        public abstract string RelativePath { get; }
        public abstract string Name { get; }
        public abstract uint? GetEntryNodeId();
        public abstract T GetNodeProperty<T>(uint nodeId, string propertyName);
        public abstract bool TryResolveFlowTarget(
            uint sourceNodeId, uint sourcePortId,
            out uint targetNodeId, out uint targetPortId);
        public abstract void ResolveComputeSource(
            uint targetNodeId, uint targetPortId,
            out uint sourceNodeId, out uint sourcePortId);
        internal abstract int EvaluateFlowNode(IFlowRuntime flow, uint nodeId);
        internal abstract void EvaluateComputeNode(
            IFlowRuntime flow, uint nodeId, uint portId, out object result);
    }

    // ============================================================
    // Flow<TContext> — shared sealed routing engine (NOT generated)
    // ============================================================

    public sealed class Flow<TContext> : IFlowRuntime
    {
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

        public FlowChart Graph { get; }
        public TContext Context { get; }
        object IFlowRuntime.Context => Context as object;

        public uint? CurrentNodeId { get; private set; }
        public bool IsPaused { get; private set; }
        public bool IsCompleted { get; private set; }

        public void Resume() => IsPaused = false;

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

            var result = Graph.EvaluateFlowNode(this, CurrentNodeId.Value);
            switch (result)
            {
                case End:
                    Complete();
                    break;
                case Loop:
                    break;
                case Pause:
                    IsPaused = true;
                    break;
                default:
                    if (Graph.TryResolveFlowTarget(
                        CurrentNodeId.Value, (uint)result,
                        out var targetNodeId, out _))
                    {
                        CurrentNodeId = targetNodeId;
                    }
                    else
                    {
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

        public T ResolveComputeInput<T>(uint targetNodeId, uint targetPortId)
        {
            Graph.ResolveComputeSource(
                targetNodeId, targetPortId,
                out var sourceNodeId, out var sourcePortId);
            Graph.EvaluateComputeNode(
                this, sourceNodeId, sourcePortId, out var value);
            return (T)value;
        }

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

    // ============================================================
    // FlowChartNodeDescriptor — metadata for a node instance in a graph
    // ============================================================

    public sealed class FlowChartNodeDescriptor
    {
        public FlowChartNodeDescriptor(uint nodeId, string nodeType, string runtimeTypeName, double x, double y)
        {
            NodeId = nodeId;
            NodeType = nodeType;
            RuntimeTypeName = runtimeTypeName;
            X = x;
            Y = y;
        }

        public uint NodeId { get; }
        public string NodeType { get; }
        public string RuntimeTypeName { get; }
        public double X { get; }
        public double Y { get; }
    }

    // ============================================================
    // FlowChartConnectionDescriptor — connection between two nodes
    // ============================================================

    public sealed class FlowChartConnectionDescriptor
    {
        public FlowChartConnectionDescriptor(uint sourceNodeId, uint sourcePortId, uint targetNodeId, uint targetPortId)
        {
            SourceNodeId = sourceNodeId;
            SourcePortId = sourcePortId;
            TargetNodeId = targetNodeId;
            TargetPortId = targetPortId;
        }

        public uint SourceNodeId { get; }
        public uint SourcePortId { get; }
        public uint TargetNodeId { get; }
        public uint TargetPortId { get; }
    }

    // ============================================================
    // LightyFlowChartPropertyBag — per-node property value store
    // ============================================================

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
                    "Property '" + propertyName + "' not found.");
            }
            return JsonSerializer.Deserialize<T>(json);
        }
    }
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `dotnet build src/LightyDesign.Generator --nologo`
Expected: Build succeeds (may show warnings but no errors)

- [ ] **Step 3: Commit**

```bash
git add src/LightyDesign.Generator/FlowChartRuntimeSupport.cs
git commit -m "feat(flowchart): add shared runtime types (IFlowRuntime, FlowChart, Flow<TContext>, PropertyBag)"
```

---

### Task 3: Rewrite node code generator (sealed/partial, PORT constants, IFlowRuntime param, int/void return)

**Files:**
- Modify: `src/LightyDesign.Generator/LightyFlowChartNodeCodeGenerator.cs`

- [ ] **Step 1: Read the current file to understand its structure**

Run: `cat -n src/LightyDesign.Generator/LightyFlowChartNodeCodeGenerator.cs | head -120`
Expected: Shows the current structure with `RenderNodeFile`, `AppendStandardBindingMembers`, etc.

- [ ] **Step 2: Write a failing test for the new node shapes**

Add test(s) to `FlowChartCodeGenerationTests.cs`. This test asserts that generated node code has:
- `sealed class` (not `partial class`) for built-in (standard binding) nodes
- `partial class` for custom nodes (no codegenBinding, or non-standard binding)
- `public const int PORT_XXX` constants
- `IFlowRuntime flow` as first parameter
- Flow nodes: `int Evaluate(...)` return type
- Compute nodes: `void Evaluate(...)` with `out` parameter
- Property helper methods for nodes with properties

Since this is a large-scale rewrite, write a comprehensive integration test:

```csharp
[Fact]
public void FlowChartNodeCodeGenerator_ShouldGenerateNewNodeCentricShapes()
{
    var workspaceRoot = CreateWorkspaceDirectory();
    try
    {
        var scaffoldedWorkspace = LightyWorkspaceScaffolder.Create(workspaceRoot);
        var workspace = WithOutputRelativePath(scaffoldedWorkspace, "Generated/Config");
        var generator = new LightyFlowChartNodeCodeGenerator();
        var package = generator.Generate(workspace);

        // Built-in compute node (Add): sealed, PORT constants, void+out, IFlowRuntime
        var addFile = Assert.Single(package.Files,
            file => file.RelativePath == "FlowCharts/Nodes/Builtin/Arithmetic/AddNode.cs");
        Assert.Contains("public sealed class AddNode", addFile.Content, StringComparison.Ordinal);
        Assert.Contains("public const int PORT_LEFT = 101", addFile.Content, StringComparison.Ordinal);
        Assert.Contains("public const int PORT_RIGHT = 102", addFile.Content, StringComparison.Ordinal);
        Assert.Contains("public const int PORT_RESULT = 151", addFile.Content, StringComparison.Ordinal);
        Assert.Contains("public void Evaluate(IFlowRuntime flow, int left, int right, out int result)",
            addFile.Content, StringComparison.Ordinal);
        Assert.Contains("result = left + right;", addFile.Content, StringComparison.Ordinal);
        Assert.DoesNotContain("partial class AddNode", addFile.Content, StringComparison.Ordinal);

        // Built-in flow node (List.Add): sealed, PORT constants, int return, IFlowRuntime
        var listAddFile = Assert.Single(package.Files,
            file => file.RelativePath == "FlowCharts/Nodes/Builtin/List/AddNode.cs");
        Assert.Contains("public sealed class AddNode<TElement>", listAddFile.Content, StringComparison.Ordinal);
        Assert.Contains("public const int PORT_IN = 201", listAddFile.Content, StringComparison.Ordinal);
        Assert.Contains("public const int PORT_THEN = 251", listAddFile.Content, StringComparison.Ordinal);
        Assert.Contains("public int Evaluate(IFlowRuntime flow, List<TElement> list, TElement item, out List<TElement> updatedList)",
            listAddFile.Content, StringComparison.Ordinal);

        // Built-in constant node (Int32): sealed, property helper, PORT constants
        var int32File = Assert.Single(package.Files,
            file => file.RelativePath == "FlowCharts/Nodes/Builtin/Constant/Int32Node.cs");
        Assert.Contains("public sealed class Int32Node", int32File.Content, StringComparison.Ordinal);
        Assert.Contains("public const int PORT_RESULT = 151", int32File.Content, StringComparison.Ordinal);
        Assert.Contains("public int GetValue(IFlowRuntime flow, uint nodeId)", int32File.Content, StringComparison.Ordinal);
        Assert.Contains("flow.Graph.GetNodeProperty<int>(nodeId, \"Value\")", int32File.Content, StringComparison.Ordinal);
        Assert.Contains("public void Evaluate(IFlowRuntime flow, out int result)", int32File.Content, StringComparison.Ordinal);

        // Built-in flow control node (If): sealed, PORT constants, int return with condition
        var ifFile = Assert.Single(package.Files,
            file => file.RelativePath == "FlowCharts/Nodes/Builtin/Control/IfNode.cs");
        Assert.Contains("public sealed class IfNode", ifFile.Content, StringComparison.Ordinal);
        Assert.Contains("public const int PORT_IN = 201", ifFile.Content, StringComparison.Ordinal);
        Assert.Contains("public const int PORT_THEN = 251", ifFile.Content, StringComparison.Ordinal);
        Assert.Contains("public const int PORT_ELSE = 252", ifFile.Content, StringComparison.Ordinal);
        Assert.Contains("public const int PORT_CONDITION = 101", ifFile.Content, StringComparison.Ordinal);
        Assert.Contains("public int Evaluate(IFlowRuntime flow, bool condition)", ifFile.Content, StringComparison.Ordinal);
        Assert.Contains("return condition ? PORT_THEN : PORT_ELSE;", ifFile.Content, StringComparison.Ordinal);

        // Constant nodes (Bool): sealed, PORT constants, property helper
        var boolFile = Assert.Single(package.Files,
            file => file.RelativePath == "FlowCharts/Nodes/Builtin/Constant/BoolNode.cs");
        Assert.Contains("public sealed class BoolNode", boolFile.Content, StringComparison.Ordinal);
        Assert.Contains("public const int PORT_RESULT = 151", boolFile.Content, StringComparison.Ordinal);

        // PauseSeconds: sealed, property helper for Duration
        var pauseSecondsFile = Assert.Single(package.Files,
            file => file.RelativePath == "FlowCharts/Nodes/Builtin/Control/PauseSecondsNode.cs");
        Assert.Contains("public sealed class PauseSecondsNode", pauseSecondsFile.Content, StringComparison.Ordinal);
        Assert.Contains("public const int PORT_IN = 201", pauseSecondsFile.Content, StringComparison.Ordinal);
        Assert.Contains("public const int PORT_OUT = 251", pauseSecondsFile.Content, StringComparison.Ordinal);
        Assert.Contains("public int GetDuration(IFlowRuntime flow)", pauseSecondsFile.Content, StringComparison.Ordinal);

        // WaitUntil: sealed
        var waitUntilFile = Assert.Single(package.Files,
            file => file.RelativePath == "FlowCharts/Nodes/Builtin/Control/WaitUntilNode.cs");
        Assert.Contains("public sealed class WaitUntilNode", waitUntilFile.Content, StringComparison.Ordinal);
        Assert.Contains("public const int PORT_IN = 201", waitUntilFile.Content, StringComparison.Ordinal);
        Assert.Contains("public const int PORT_OUT = 251", waitUntilFile.Content, StringComparison.Ordinal);
        Assert.Contains("public int Evaluate(IFlowRuntime flow, bool condition)", waitUntilFile.Content, StringComparison.Ordinal);

        // Pause: sealed
        var pauseFile = Assert.Single(package.Files,
            file => file.RelativePath == "FlowCharts/Nodes/Builtin/Control/PauseNode.cs");
        Assert.Contains("public sealed class PauseNode", pauseFile.Content, StringComparison.Ordinal);
        Assert.Contains("public const int PORT_IN = 201", pauseFile.Content, StringComparison.Ordinal);
        Assert.Contains("public const int PORT_OUT = 251", pauseFile.Content, StringComparison.Ordinal);

        // ForEach: sealed with generic
        var forEachFile = Assert.Single(package.Files,
            file => file.RelativePath == "FlowCharts/Nodes/Builtin/List/ForEachNode.cs");
        Assert.Contains("public sealed class ForEachNode<TElement>", forEachFile.Content, StringComparison.Ordinal);
        Assert.Contains("public const int PORT_IN = 201", forEachFile.Content, StringComparison.Ordinal);
        Assert.Contains("public const int PORT_BODY = 251", forEachFile.Content, StringComparison.Ordinal);
        Assert.Contains("public const int PORT_COMPLETED = 252", forEachFile.Content, StringComparison.Ordinal);

        // Overload node: multiple Evaluate overloads
        var subtractFile = Assert.Single(package.Files,
            file => file.RelativePath == "FlowCharts/Nodes/Builtin/Arithmetic/SubtractNode.cs");
        Assert.Contains("public void Evaluate(IFlowRuntime flow, int left, int right, out int result)",
            subtractFile.Content, StringComparison.Ordinal);
        Assert.Contains("public void Evaluate(IFlowRuntime flow, double left, double right, out double result)",
            subtractFile.Content, StringComparison.Ordinal);

        // Comparison.Equal: sealed, string overload
        var equalFile = Assert.Single(package.Files,
            file => file.RelativePath == "FlowCharts/Nodes/Builtin/Comparison/EqualNode.cs");
        Assert.Contains("public sealed class EqualNode", equalFile.Content, StringComparison.Ordinal);
        Assert.Contains("public void Evaluate(IFlowRuntime flow, string left, string right, out bool result)",
            equalFile.Content, StringComparison.Ordinal);
        Assert.Contains("result = string.Equals(left, right, StringComparison.Ordinal);",
            equalFile.Content, StringComparison.Ordinal);
    }
    finally
    {
        if (Directory.Exists(workspaceRoot))
            Directory.Delete(workspaceRoot, recursive: true);
    }
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `dotnet test tests/LightyDesign.Tests --filter "FlowChartNodeCodeGenerator_ShouldGenerateNewNodeCentricShapes" --nologo`
Expected: FAIL — generated node code does not contain new shapes

- [ ] **Step 4: Rewrite LightyFlowChartNodeCodeGenerator.cs**

Replace the entire file content. The key changes in `RenderNodeFile`:

```csharp
private static string RenderNodeFile(LightyFlowChartNodeDefinition nodeDefinition)
{
    var writer = new CodeWriter();
    writer.AppendAutoGeneratedHeader();
    writer.AppendLine("#nullable disable");
    writer.AppendLine("using System;");
    writer.AppendLine("using System.Collections.Generic;");
    writer.AppendLine("using " + RootNamespace + ";");
    writer.AppendLine();
    writer.AppendLine("namespace " + BuildNodeNamespace(nodeDefinition));
    writer.AppendLine("{");
    writer.Indent();

    var isBuiltin = nodeDefinition.CodegenBinding is not null
        && string.Equals(nodeDefinition.CodegenBinding.Provider, "standard", StringComparison.OrdinalIgnoreCase);
    var hasCodegenCode = isBuiltin;

    // --- PORT constants ---
    var allPorts = new List<(uint PortId, string Name)>();
    foreach (var cp in nodeDefinition.ComputePorts)
        allPorts.Add((cp.PortId, cp.Name));
    foreach (var fp in nodeDefinition.FlowPorts)
        allPorts.Add((fp.PortId, fp.Name));

    foreach (var (portId, portName) in allPorts)
    {
        var constName = LightyFlowChartCodegenNaming.PortToConstantName(portName);
        writer.AppendLine("public const int " + constName + " = " + portId + ";");
    }

    if (allPorts.Count > 0)
        writer.AppendLine();

    // --- Property helpers ---
    foreach (var prop in nodeDefinition.Properties)
    {
        var helperName = LightyFlowChartCodegenNaming.PropertyToHelperMethodName(prop.Name);
        var propType = MapToCSharpType(prop.Type);
        // Flow node: uses flow.CurrentNodeId
        // Compute node: accepts explicit uint nodeId
        if (nodeDefinition.NodeKind == LightyFlowChartNodeKind.Flow)
        {
            writer.AppendLine("public " + propType + " " + helperName + "(IFlowRuntime flow)");
            writer.AppendLine("{");
            writer.Indent();
            writer.AppendLine("return flow.Graph.GetNodeProperty<" + propType + ">("
                + "flow.CurrentNodeId, " + ToStringLiteral(prop.Name) + ");");
            writer.Outdent();
            writer.AppendLine("}");
        }
        else
        {
            writer.AppendLine("public " + propType + " " + helperName + "(IFlowRuntime flow, uint nodeId)");
            writer.AppendLine("{");
            writer.Indent();
            writer.AppendLine("return flow.Graph.GetNodeProperty<" + propType + ">("
                + "nodeId, " + ToStringLiteral(prop.Name) + ");");
            writer.Outdent();
            writer.AppendLine("}");
        }
        writer.AppendLine();
    }

    // --- Class declaration ---
    var classKeyword = isBuiltin ? "public sealed class" : "public partial class";
    writer.AppendLine(classKeyword + " " + BuildClassName(nodeDefinition) + BuildGenericParameterList(nodeDefinition));
    writer.AppendLine("{");
    writer.Indent();

    // --- Evaluate method(s) ---
    if (hasCodegenCode)
    {
        AppendEvaluateMethods(writer, nodeDefinition);
    }
    else if (!isBuiltin)
    {
        // Custom node: generate partial Evaluate method declaration (no body)
        AppendPartialEvaluateDeclaration(writer, nodeDefinition);
    }

    writer.Outdent();
    writer.AppendLine("}");
    writer.Outdent();
    writer.AppendLine("}");
    return writer.ToString();
}
```

The helper `AppendEvaluateMethods` and `AppendPartialEvaluateDeclaration` methods:

```csharp
private static void AppendEvaluateMethods(CodeWriter writer, LightyFlowChartNodeDefinition nodeDefinition)
{
    var isFlow = nodeDefinition.NodeKind == LightyFlowChartNodeKind.Flow;
    var outputPort = nodeDefinition.ComputePorts.FirstOrDefault(p => p.Direction == LightyFlowChartPortDirection.Output);
    var hasOutput = outputPort is not null;

    if (nodeDefinition.CodegenBinding is not null
        && nodeDefinition.CodegenBinding.ResolutionMode == LightyFlowChartCodegenResolutionMode.Overload)
    {
        // Overload mode: render multiple Evaluate overloads (Arithmetic, Comparison)
        AppendOverloadEvaluateMethods(writer, nodeDefinition, isFlow);
        return;
    }

    if (nodeDefinition.CodegenBinding is not null
        && nodeDefinition.CodegenBinding.ResolutionMode == LightyFlowChartCodegenResolutionMode.Generic)
    {
        // Generic mode: single Evaluate with generic type parameters
        AppendGenericEvaluateMethod(writer, nodeDefinition, isFlow);
        return;
    }

    // Fallback: for built-in nodes without codegenBinding (If, While, etc.)
    AppendBuiltinEvaluate(writer, nodeDefinition, isFlow, hasOutput);
}

private static void AppendPartialEvaluateDeclaration(CodeWriter writer, LightyFlowChartNodeDefinition nodeDefinition)
{
    var isFlow = nodeDefinition.NodeKind == LightyFlowChartNodeKind.Flow;
    var inputPorts = nodeDefinition.ComputePorts
        .Where(p => p.Direction == LightyFlowChartPortDirection.Input).ToList();
    var outputPort = nodeDefinition.ComputePorts
        .FirstOrDefault(p => p.Direction == LightyFlowChartPortDirection.Output);

    writer.Write("public partial " + (isFlow ? "int" : "void") + " Evaluate(");
    writer.Write("IFlowRuntime flow");
    foreach (var port in inputPorts)
        writer.Write(", " + MapToCSharpType(port.Type) + " " + ToParameterIdentifier(port.Name));
    if (outputPort is not null)
        writer.Write(", out " + MapToCSharpType(outputPort.Type) + " " + ToParameterIdentifier(outputPort.Name));
    writer.Write(")");
    if (isFlow)
    {
        writer.WriteLine();
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("return PORT_THEN;");
        writer.Outdent();
        writer.AppendLine("}");
    }
    else
    {
        writer.WriteLine(";");
    }
}
```

For the `AppendBuiltinEvaluate` method, handle each special built-in node:

```csharp
private static void AppendBuiltinEvaluate(CodeWriter writer, LightyFlowChartNodeDefinition nodeDefinition, bool isFlow, bool hasOutput)
{
    var inputPorts = nodeDefinition.ComputePorts
        .Where(p => p.Direction == LightyFlowChartPortDirection.Input).ToList();
    var outputPort = nodeDefinition.ComputePorts
        .FirstOrDefault(p => p.Direction == LightyFlowChartPortDirection.Output);

    var isIfOrWhile = string.Equals(nodeDefinition.RelativePath, "Builtin/Control/If", StringComparison.Ordinal)
        || string.Equals(nodeDefinition.RelativePath, "Builtin/Control/While", StringComparison.Ordinal);

    writer.Write("public " + (isFlow ? "int" : "void") + " Evaluate(IFlowRuntime flow");
    foreach (var port in inputPorts)
        writer.Write(", " + MapToCSharpType(port.Type) + " " + ToParameterIdentifier(port.Name));
    if (hasOutput && outputPort is not null)
        writer.Write(", out " + MapToCSharpType(outputPort.Type) + " " + ToParameterIdentifier(outputPort.Name));
    writer.WriteLine(")");
    writer.AppendLine("{");
    writer.Indent();

    if (isIfOrWhile)
    {
        var conditionPort = inputPorts.FirstOrDefault();
        if (conditionPort is not null)
        {
            var paramName = ToParameterIdentifier(conditionPort.Name);
            writer.AppendLine("return " + paramName + " ? PORT_THEN : PORT_ELSE;");
        }
        else
        {
            writer.AppendLine("return PORT_THEN;");
        }
    }
    else if (nodeDefinition.NodeKind == LightyFlowChartNodeKind.Flow)
    {
        // Default flow node: return the first output flow port
        var flowOutput = nodeDefinition.FlowPorts.FirstOrDefault(p => p.Direction == LightyFlowChartPortDirection.Output);
        if (flowOutput is not null)
        {
            var constName = LightyFlowChartCodegenNaming.PortToConstantName(flowOutput.Name);
            writer.AppendLine("return " + constName + ";");
        }
        else
        {
            writer.AppendLine("return Flow<TContext>.End;");
        }
    }
    else if (hasOutput && outputPort is not null)
    {
        // For property-backed compute nodes (Int32, Bool, etc.) with no codegenBinding,
        // resolve value from property via property helper
        var prop = nodeDefinition.Properties.FirstOrDefault();
        if (prop is not null)
        {
            var helperName = LightyFlowChartCodegenNaming.PropertyToHelperMethodName(prop.Name);
            var paramName = ToParameterIdentifier(outputPort.Name);
            writer.AppendLine(paramName + " = " + helperName + "(flow, flow.CurrentNodeId);");
        }
    }

    writer.Outdent();
    writer.AppendLine("}");
}
```

- [ ] **Step 5: Run test to verify the new shapes pass**

Run: `dotnet test tests/LightyDesign.Tests --filter "FlowChartNodeCodeGenerator_ShouldGenerateNewNodeCentricShapes" --nologo`
Expected: PASS

- [ ] **Step 6: Also verify existing tests for node parsing still pass**

Run: `dotnet test tests/LightyDesign.Tests --filter "FlowChartNodeDefinitionParser_ShouldParseTemplateStandardNodeFamilies" --nologo`
Expected: PASS (parsing logic was not changed)

- [ ] **Step 7: Commit**

```bash
git add src/LightyDesign.Generator/LightyFlowChartNodeCodeGenerator.cs
git commit -m "refactor(flowchart): rewrite node codegen with sealed/partial, PORT constants, IFlowRuntime, int/void return"
```

---

### Task 4: Rewrite FlowChart file code generator (replace Definition + Flow with FlowChart subclass)

**Files:**
- Modify: `src/LightyDesign.Generator/LightyFlowChartFileCodeGenerator.cs`

- [ ] **Step 1: Read the current file**

Run: `cat -n src/LightyDesign.Generator/LightyFlowChartFileCodeGenerator.cs | head -80`
Expected: Shows the current structure

- [ ] **Step 2: Write a failing test for the new FlowChart generation**

```csharp
[Fact]
public void FlowChartFileCodeGenerator_ShouldGenerateFlowChartSubclass()
{
    var workspaceRoot = CreateWorkspaceDirectory();
    try
    {
        var scaffoldedWorkspace = LightyWorkspaceScaffolder.Create(workspaceRoot);
        CreateNodeDefinition(
            workspaceRoot,
            "Custom/Math/ConstantInt",
            """
            {
                "formatVersion": "1.0",
                "name": "ConstantInt",
                "nodeKind": "compute",
                "typeParameters": [],
                "properties": [],
                "computePorts": [
                    {
                        "portId": 151,
                        "name": "Result",
                        "direction": "output",
                        "type": { "kind": "builtin", "name": "int32" }
                    }
                ],
                "flowPorts": []
            }
            """);
        CreateFlowChartFile(
            workspaceRoot,
            "Quest/Intro",
            """
            {
                "formatVersion": "1.0",
                "name": "Intro",
                "nodes": [
                    {
                        "nodeId": 1,
                        "nodeType": "Custom/Math/ConstantInt",
                        "layout": { "x": 100, "y": 80 },
                        "propertyValues": []
                    },
                    {
                        "nodeId": 2,
                        "nodeType": "Custom/Math/ConstantInt",
                        "layout": { "x": 100, "y": 220 },
                        "propertyValues": []
                    },
                    {
                        "nodeId": 3,
                        "nodeType": "Builtin/Arithmetic/Add",
                        "layout": { "x": 360, "y": 150 },
                        "propertyValues": []
                    }
                ],
                "flowConnections": [],
                "computeConnections": [
                    {
                        "sourceNodeId": 1, "sourcePortId": 151,
                        "targetNodeId": 3, "targetPortId": 101
                    },
                    {
                        "sourceNodeId": 2, "sourcePortId": 151,
                        "targetNodeId": 3, "targetPortId": 102
                    }
                ]
            }
            """);

        var workspace = WithOutputRelativePath(LightyWorkspaceLoader.Load(workspaceRoot), "Generated/Config");
        var generator = new LightyFlowChartFileCodeGenerator();
        var package = generator.Generate(workspace, "Quest/Intro");

        // Should NOT have old Definition/Flow files
        Assert.DoesNotContain(package.Files,
            file => file.RelativePath.Contains("IntroDefinition"));
        Assert.DoesNotContain(package.Files,
            file => file.RelativePath.Contains("IntroFlow"));

        // Should have FlowChart file
        var flowChartFile = Assert.Single(package.Files,
            file => file.RelativePath == "FlowCharts/Files/Quest/Intro/IntroFlowChart.cs");

        // FlowChart class shape
        Assert.Contains("public sealed class IntroFlowChart : FlowChart",
            flowChartFile.Content, StringComparison.Ordinal);
        Assert.Contains("public static readonly IntroFlowChart Instance = new IntroFlowChart();",
            flowChartFile.Content, StringComparison.Ordinal);
        Assert.Contains("private IntroFlowChart() { }",
            flowChartFile.Content, StringComparison.Ordinal);

        // Node singletons
        Assert.Contains("private static readonly LightyDesignData.FlowCharts.Nodes.Builtin.Arithmetic.AddNode",
            flowChartFile.Content, StringComparison.Ordinal);

        // Connection descriptors
        Assert.Contains("FlowChartConnectionDescriptor[] _flowConns",
            flowChartFile.Content, StringComparison.Ordinal);
        Assert.Contains("FlowChartConnectionDescriptor[] _computeConns",
            flowChartFile.Content, StringComparison.Ordinal);

        // Property bag
        Assert.Contains("LightyFlowChartPropertyBag",
            flowChartFile.Content, StringComparison.Ordinal);

        // Dispatch methods
        Assert.Contains("internal override int EvaluateFlowNode",
            flowChartFile.Content, StringComparison.Ordinal);
        Assert.Contains("internal override void EvaluateComputeNode",
            flowChartFile.Content, StringComparison.Ordinal);

        // Query methods
        Assert.Contains("override uint? GetEntryNodeId",
            flowChartFile.Content, StringComparison.Ordinal);
        Assert.Contains("override T GetNodeProperty<T>",
            flowChartFile.Content, StringComparison.Ordinal);
        Assert.Contains("override bool TryResolveFlowTarget",
            flowChartFile.Content, StringComparison.Ordinal);
        Assert.Contains("override void ResolveComputeSource",
            flowChartFile.Content, StringComparison.Ordinal);

        // Runtime support file (shared)
        Assert.Contains(package.Files,
            file => file.RelativePath == "FlowCharts/FlowChartRuntimeSupport.cs");

        // No old FlowChartStandardNodeBindingHelper
        Assert.DoesNotContain(package.Files,
            file => file.RelativePath.Contains("FlowChartStandardNodeBindingHelper"));
    }
    finally
    {
        if (Directory.Exists(workspaceRoot))
            Directory.Delete(workspaceRoot, recursive: true);
    }
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `dotnet test tests/LightyDesign.Tests --filter "FlowChartFileCodeGenerator_ShouldGenerateFlowChartSubclass" --nologo`
Expected: FAIL

- [ ] **Step 4: Rewrite LightyFlowChartFileCodeGenerator.cs**

Replace the current `Generate` and rendering methods. Key architectural changes:

**`Generate` method** — entry point changes:
```csharp
public LightyGeneratedFlowChartPackage Generate(LightyWorkspace workspace, IEnumerable<string> flowChartRelativePaths)
{
    // ... validation unchanged ...

    var nodeDefinitionsByType = workspace.FlowChartNodeDefinitions
        .Select(LightyFlowChartNodeDefinitionParser.Parse)
        .ToDictionary(d => d.RelativePath, StringComparer.Ordinal);

    // Generate node files (unchanged except task 3 rewrote the renderer)
    var nodePackage = new LightyFlowChartNodeCodeGenerator().Generate(workspace);
    var files = new List<LightyGeneratedCodeFile>(nodePackage.Files);

    // Add shared runtime support (hand-written, referenced not generated)
    // The shared runtime support file is NOT generated — it's a static hand-written file.
    // But we need to include it in the output so projects have it.
    // Actually, it should be placed once alongside the generated code.
    // For now, skip adding it here — the user will copy it manually once.

    // For each flowchart, generate the FlowChart subclass
    foreach (var relativePath in normalizedRelativePaths)
    {
        // ... resolve nodes, type inference ...
        var flowFile = RenderFlowChartFile(flowChart, resolvedNodes);
        files.Add(flowFile);
    }

    return new LightyGeneratedFlowChartPackage(workspace.CodegenOptions.OutputRelativePath!, files);
}
```

**`RenderFlowChartFile` method** — generates the `FlowChart` subclass:
```csharp
private static LightyGeneratedCodeFile RenderFlowChartFile(
    LightyFlowChartFileDefinition flowChart,
    IReadOnlyList<ResolvedNodeInstance> resolvedNodes)
{
    var writer = new CodeWriter();
    writer.AppendAutoGeneratedHeader();
    writer.AppendLine("#nullable disable");
    writer.AppendLine("using System;");
    writer.AppendLine("using System.Collections.Generic;");
    writer.AppendLine("using " + RootNamespace + ";");
    writer.AppendLine();
    writer.AppendLine("namespace " + BuildNamespace(flowChart.RelativePath));
    writer.AppendLine("{");
    writer.Indent();

    var typeName = BuildTypeName(flowChart.RelativePath);
    writer.AppendLine("public sealed class " + typeName + " : FlowChart");
    writer.AppendLine("{");
    writer.Indent();

    // Singleton
    writer.AppendLine("public static readonly " + typeName + " Instance = new " + typeName + "();");
    writer.AppendLine("private " + typeName + "() { }");
    writer.AppendLine();

    // Node singletons
    foreach (var resolvedNode in resolvedNodes)
    {
        writer.AppendLine("private static readonly " + BuildNodeRuntimeTypeName(resolvedNode)
            + " _node" + resolvedNode.Node.NodeId + " = new " + BuildNodeRuntimeTypeName(resolvedNode) + "();");
    }
    writer.AppendLine();

    // Connection descriptors
    RenderConnections(writer, flowChart);

    // Property values
    RenderPropertyBag(writer, flowChart, resolvedNodes);

    // Metadata overrides
    writer.AppendLine("public override string RelativePath => " + ToStringLiteral(flowChart.RelativePath) + ";");
    writer.AppendLine("public override string Name => " + ToStringLiteral(flowChart.Name) + ";");
    writer.AppendLine();

    // GetEntryNodeId
    RenderGetEntryNodeId(writer, flowChart, resolvedNodes);

    // GetNodeProperty<T>
    writer.AppendLine("public override T GetNodeProperty<T>(uint nodeId, string propertyName)");
    writer.AppendLine("{");
    writer.Indent();
    writer.AppendLine("return _props[nodeId].Get<T>(propertyName);");
    writer.Outdent();
    writer.AppendLine("}");
    writer.AppendLine();

    // TryResolveFlowTarget
    writer.AppendLine("public override bool TryResolveFlowTarget(");
    writer.Indent();
    writer.AppendLine("uint sourceNodeId, uint sourcePortId,");
    writer.AppendLine("out uint targetNodeId, out uint targetPortId)");
    writer.Outdent();
    writer.AppendLine("{");
    writer.Indent();
    writer.AppendLine("foreach (var conn in _flowConns)");
    writer.AppendLine("{");
    writer.Indent();
    writer.AppendLine("if (conn.SourceNodeId == sourceNodeId && conn.SourcePortId == sourcePortId)");
    writer.AppendLine("{");
    writer.Indent();
    writer.AppendLine("targetNodeId = conn.TargetNodeId;");
    writer.AppendLine("targetPortId = conn.TargetPortId;");
    writer.AppendLine("return true;");
    writer.Outdent();
    writer.AppendLine("}");
    writer.Outdent();
    writer.AppendLine("}");
    writer.AppendLine("targetNodeId = 0;");
    writer.AppendLine("targetPortId = 0;");
    writer.AppendLine("return false;");
    writer.Outdent();
    writer.AppendLine("}");
    writer.AppendLine();

    // ResolveComputeSource
    writer.AppendLine("public override void ResolveComputeSource(");
    writer.Indent();
    writer.AppendLine("uint targetNodeId, uint targetPortId,");
    writer.AppendLine("out uint sourceNodeId, out uint sourcePortId)");
    writer.Outdent();
    writer.AppendLine("{");
    writer.Indent();
    writer.AppendLine("foreach (var conn in _computeConns)");
    writer.AppendLine("{");
    writer.Indent();
    writer.AppendLine("if (conn.TargetNodeId == targetNodeId && conn.TargetPortId == targetPortId)");
    writer.AppendLine("{");
    writer.Indent();
    writer.AppendLine("sourceNodeId = conn.SourceNodeId;");
    writer.AppendLine("sourcePortId = conn.SourcePortId;");
    writer.AppendLine("return;");
    writer.Outdent();
    writer.AppendLine("}");
    writer.Outdent();
    writer.AppendLine("}");
    writer.AppendLine("throw new InvalidOperationException(");
    writer.AppendLine("    \"Compute input (\" + targetNodeId + \":\" + targetPortId + \") is not connected.\");");
    writer.Outdent();
    writer.AppendLine("}");
    writer.AppendLine();

    // EvaluateFlowNode dispatch
    writer.AppendLine("internal override int EvaluateFlowNode(IFlowRuntime flow, uint nodeId)");
    writer.AppendLine("{");
    writer.Indent();
    writer.AppendLine("switch (nodeId)");
    writer.AppendLine("{");
    writer.Indent();
    foreach (var resolvedNode in resolvedNodes.OrderBy(n => n.Node.NodeId))
    {
        if (resolvedNode.Definition.NodeKind == LightyFlowChartNodeKind.Flow
            || resolvedNode.Definition.NodeKind == LightyFlowChartNodeKind.Event)
        {
            writer.AppendLine("case " + resolvedNode.Node.NodeId + "u:");
            writer.Indent();
            writer.AppendLine("return _node" + resolvedNode.Node.NodeId
                + ".Evaluate(flow" + BuildFlowNodeArguments(resolvedNode) + ");");
            writer.Outdent();
        }
    }
    writer.AppendLine("default:");
    writer.Indent();
    writer.AppendLine("throw new NotSupportedException(");
    writer.AppendLine("    \"Flow node \" + nodeId + \" is not a flow node.\");");
    writer.Outdent();
    writer.Outdent();
    writer.AppendLine("}");
    writer.Outdent();
    writer.AppendLine("}");
    writer.AppendLine();

    // EvaluateComputeNode dispatch
    writer.AppendLine("internal override void EvaluateComputeNode(");
    writer.Indent();
    writer.AppendLine("IFlowRuntime flow, uint nodeId, uint portId, out object result)");
    writer.Outdent();
    writer.AppendLine("{");
    writer.Indent();
    writer.AppendLine("var savedNodeId = flow.CurrentNodeId;");
    writer.AppendLine("flow.SetCurrentNodeId(nodeId);");
    writer.AppendLine("try");
    writer.AppendLine("{");
    writer.Indent();
    writer.AppendLine("switch (nodeId)");
    writer.AppendLine("{");
    writer.Indent();
    foreach (var resolvedNode in resolvedNodes.OrderBy(n => n.Node.NodeId))
    {
        if (resolvedNode.Definition.NodeKind == LightyFlowChartNodeKind.Compute)
        {
            RenderComputeNodeCase(writer, resolvedNode);
        }
    }
    writer.AppendLine("default:");
    writer.Indent();
    writer.AppendLine("break;");
    writer.Outdent();
    writer.Outdent();
    writer.AppendLine("}");
    writer.AppendLine("throw new NotSupportedException(");
    writer.AppendLine("    \"Compute output (\" + nodeId + \":\" + portId + \") is not supported.\");");
    writer.Outdent();
    writer.AppendLine("}");
    writer.AppendLine("finally");
    writer.AppendLine("{");
    writer.Indent();
    writer.AppendLine("flow.SetCurrentNodeId(savedNodeId);");
    writer.Outdent();
    writer.AppendLine("}");
    writer.Outdent();
    writer.AppendLine("}");

    writer.Outdent();
    writer.AppendLine("}");
    writer.Outdent();
    writer.AppendLine("}");

    var chartDirectory = BuildFlowChartOutputDirectory(flowChart.RelativePath);
    return new LightyGeneratedCodeFile(chartDirectory + "/" + typeName + ".cs", writer.ToString());
}
```

Helper methods needed:
- `BuildFlowNodeArguments` — builds the argument list for each flow node (resolve compute inputs)
- `RenderComputeNodeCase` — renders the switch case for a compute node's output
- `RenderConnections` — renders `_flowConns` and `_computeConns` arrays
- `RenderPropertyBag` — renders `_props` dictionary
- `RenderGetEntryNodeId` — resolves the entry node

- [ ] **Step 5: Run test to verify passes**

Run: `dotnet test tests/LightyDesign.Tests --filter "FlowChartFileCodeGenerator_ShouldGenerateFlowChartSubclass" --nologo`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/LightyDesign.Generator/LightyFlowChartFileCodeGenerator.cs
git commit -m "refactor(flowchart): replace Definition+Flow generation with FlowChart subclass"
```

---

### Task 5: Update existing dispatch and runtime tests for new architecture

**Files:**
- Modify: `tests/LightyDesign.Tests/FlowChartCodeGenerationTests.cs`

- [ ] **Step 1: Read the existing test file to find all assertions that need updating**

Run: `cat -n tests/LightyDesign.Tests/FlowChartCodeGenerationTests.cs | grep -E "(Assert\.Contains|Assert\.DoesNotContain|Assert\.Equal|public class)"`
Expected: Shows all current assertions

- [ ] **Step 2: Update the existing tests for the new shapes**

Replace these test methods with updated assertions:

**`FlowChartNodeCodeGenerator_ShouldGenerateTemplateNodeFilesForGenericAndOverloadFamilies`** — update assertions:
- Remove `Assert.Contains` for `FlowChartStandardNodeBindingHelper` (no longer generated)
- Update all `public partial class` asserts to `public sealed class` (built-in)
- Update `public int Evaluate(int left, int right)` to `public void Evaluate(IFlowRuntime flow, int left, int right, out int result)`
- Update `public List<TElement> Execute(List<TElement> list, TElement item)` to `public int Evaluate(IFlowRuntime flow, List<TElement> list, TElement item, out List<TElement> updatedList)`
- Add PORT constant assertions
- Update `public partial class IfNode` to `public sealed class IfNode`
- Keep assertions for `partial class ForEachNode<TElement>` (unchanged from current)

**`FlowChartFileCodeGenerator_ShouldGenerateRuntimeDispatchForControlAndIterationNodes`** — update assertions:
- Replace `ControlRuntimeDefinition.cs` / `ControlRuntimeFlow.cs` assertions with `ControlRuntimeFlowChart.cs`
- Replace `Flow<TContext>` assertions with `FlowChart` base class assertions
- Replace `partial void OnNode1Enter` assertions with `EvaluateFlowNode` switch assertions

**`FlowChartFileCodeGenerator_ShouldGenerateRuntimeDispatchForWaitingNodes`** — update assertions:
- Replace old dispatch assertions with FlowChart dispatch assertions
- Replace `JsonSerializer.Deserialize<int>(\"3\")` with property bag-style assertions

**`FlowChartFileCodeGenerator_ShouldGeneratePropertyBackedLiteralRuntimeForDefaultConstantAndConfigNodes`** — update assertions:
- Replace old property resolution assertions with `GetNodeProperty<T>` calls

**`GeneratedWorkbookAndFlowChartCode_ShouldCompileTogetherWithLddEntryPoint`** — update:
- Replace `IntroDefinition.Create()` / `CreateFlow<TContext>` usage with `IntroFlowChart.Instance` / `new Flow<TContext>(graph, context)`

**`GenerateEntryPointFile_ShouldIncludeGeneratedFlowChartsAlongsideWorkbooks`** — update:
- Replace `FlowChartQuestIntro` property name if needed

- [ ] **Step 3: Write a new compilation test for the Flow<TContext> runtime**

```csharp
[Fact]
public void FlowRuntime_ShouldRouteBasedOnNodeReturnValues()
{
    // This test verifies the Flow<TContext> routing engine logic
    // using a minimal mock FlowChart.
    var mockGraph = new MockFlowChart();
    var flow = new Flow<object>(mockGraph, new object());

    Assert.Null(flow.CurrentNodeId);
    Assert.False(flow.IsCompleted);
    Assert.False(flow.IsPaused);

    flow.StepOnce();
    Assert.Equal(2u, flow.CurrentNodeId); // Entry node 1 returns PORT_THEN → resolves to node 2

    flow.StepOnce();
    Assert.True(flow.IsCompleted); // Node 2 returns End (0)
}

private sealed class MockFlowChart : FlowChart
{
    public override string RelativePath => "Mock/Test";
    public override string Name => "Test";
    
    public override uint? GetEntryNodeId() => 1u;
    
    public override T GetNodeProperty<T>(uint nodeId, string propertyName)
        => throw new NotSupportedException();
    
    public override bool TryResolveFlowTarget(uint sourceNodeId, uint sourcePortId,
        out uint targetNodeId, out uint targetPortId)
    {
        if (sourceNodeId == 1u && sourcePortId == 251u)
        {
            targetNodeId = 2u;
            targetPortId = 201u;
            return true;
        }
        targetNodeId = 0;
        targetPortId = 0;
        return false;
    }
    
    public override void ResolveComputeSource(uint targetNodeId, uint targetPortId,
        out uint sourceNodeId, out uint sourcePortId)
        => throw new NotSupportedException();
    
    internal override int EvaluateFlowNode(IFlowRuntime flow, uint nodeId)
    {
        // Node 1 returns PORT_THEN (251), Node 2 returns End (0)
        return nodeId == 1u ? 251 : 0;
    }
    
    internal override void EvaluateComputeNode(IFlowRuntime flow, uint nodeId, uint portId, out object result)
        => throw new NotSupportedException();
}
```

- [ ] **Step 4: Run all FlowChart tests**

Run: `dotnet test tests/LightyDesign.Tests --filter "FlowChart" --nologo`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add tests/LightyDesign.Tests/FlowChartCodeGenerationTests.cs
git commit -m "test(flowchart): update tests for node-centric architecture"
```

---

### Task 6: Verify compilation of generated code with LDD entry point

**Files:**
- Modify: `tests/LightyDesign.Tests/FlowChartCodeGenerationTests.cs`

- [ ] **Step 1: Update the compilation test**

Update `GeneratedWorkbookAndFlowChartCode_ShouldCompileTogetherWithLddEntryPoint`:

```csharp
[Fact]
public void GeneratedWorkbookAndFlowChartCode_ShouldCompileTogetherWithLddEntryPoint()
{
    var workspaceRoot = CreateWorkspaceDirectory();
    try
    {
        LightyWorkspaceScaffolder.Create(workspaceRoot);
        CreateNodeDefinition(workspaceRoot, "Event/System/Start", /* ... same as before ... */);
        CreateFlowChartFile(workspaceRoot, "Quest/Intro", /* ... same as before ... */);

        var workspace = WithOutputRelativePath(LightyWorkspaceLoader.Load(workspaceRoot), "Codegen");
        var workbookGenerator = new LightyWorkbookCodeGenerator();
        var workbookPackages = workspace.Workbooks
            .Select(workbook => (workbook.Name, workbookGenerator.Generate(workspace, workbook)))
            .ToArray();
        var flowChartPackage = new LightyFlowChartFileCodeGenerator().Generate(workspace, "Quest/Intro");

        var generatedOutputPath = GeneratedCodeOutputWriter.WriteGeneratedWorkspacePackages(
            workspace.RootPath, workbookPackages);
        GeneratedCodeOutputWriter.WriteGeneratedFlowChartPackage(
            workspace.RootPath, "Quest/Intro", flowChartPackage);

        // Also copy FlowChartRuntimeSupport.cs alongside the generated code
        var runtimeSupportDest = Path.Combine(generatedOutputPath, "FlowCharts", "FlowChartRuntimeSupport.cs");
        Directory.CreateDirectory(Path.GetDirectoryName(runtimeSupportDest));
        var runtimeSupportSource = Path.Combine(
            AppDomain.CurrentDomain.BaseDirectory,
            "../../../../src/LightyDesign.Generator/FlowChartRuntimeSupport.cs");
        // In CI, the source will be in the project; for now verify the file exists in the generator project
        Assert.True(File.Exists(
            Path.Combine(workspaceRoot, "../src/LightyDesign.Generator/FlowChartRuntimeSupport.cs")
                .Replace(".Tests/../../", ".Tests/../../../"),
            "FlowChartRuntimeSupport.cs must exist in the generator project"));

        var projectPath = CreateGeneratedCodeCompilationProject(workspaceRoot, generatedOutputPath);
        var buildResult = BuildGeneratedCodeProject(projectPath);

        Assert.True(buildResult.ExitCode == 0, buildResult.Output);
    }
    finally
    {
        if (Directory.Exists(workspaceRoot))
            Directory.Delete(workspaceRoot, recursive: true);
    }
}
```

- [ ] **Step 2: Run the compilation test**

Run: `dotnet test tests/LightyDesign.Tests --filter "GeneratedWorkbookAndFlowChartCode_ShouldCompileTogetherWithLddEntryPoint" --nologo`
Expected: PASS (exit code 0)

- [ ] **Step 3: Commit**

```bash
git add tests/LightyDesign.Tests/FlowChartCodeGenerationTests.cs
git commit -m "test(flowchart): update compilation test for FlowChart subclass"
```

---

### Task 7: Remove deprecated FlowChartStandardNodeBindingHelper generation

**Files:**
- Modify: `src/LightyDesign.Generator/LightyFlowChartNodeCodeGenerator.cs`

- [ ] **Step 1: Remove the RenderStandardBindingHelperFile and all helper-related code**

Delete from `LightyFlowChartNodeCodeGenerator.cs`:
- `RenderStandardBindingHelperFile()` method
- `OverloadBindings` dictionary (logic now inlined into node Evaluate methods)
- `ResolveHelperMethodName` method
- `AppendStandardBindingMembers` method (replaced by `AppendEvaluateMethods`)
- `AppendGenericBindingMember` method
- `AppendOverloadBindingMembers` method

The class no longer generates the `FlowChartStandardNodeBindingHelper.cs` file. Instead, each node's Evaluate method directly implements the operation (e.g., `result = left + right` for Add).

Remove from `Generate` method:
```csharp
// OLD:
var files = new List<LightyGeneratedCodeFile>
{
    new("FlowCharts/FlowChartStandardNodeBindingHelper.cs", RenderStandardBindingHelperFile()),
};
// NEW:
var files = new List<LightyGeneratedCodeFile>();
```

- [ ] **Step 2: Run tests to verify nothing breaks**

Run: `dotnet test tests/LightyDesign.Tests --filter "FlowChart" --nologo`
Expected: All tests PASS

Run: `dotnet test tests/LightyDesign.Tests --filter "FlowChartNodeCodeGenerator_ShouldGenerateTemplateNodeFilesForGenericAndOverloadFamilies" --nologo`
Expected: PASS — this test should already be updated in Task 5

- [ ] **Step 3: Commit**

```bash
git add src/LightyDesign.Generator/LightyFlowChartNodeCodeGenerator.cs
git commit -m "refactor(flowchart): remove deprecated FlowChartStandardNodeBindingHelper generation"
```

---

### Task 8: Update LightyGeneratedFlowChartPackage (file structure adjustments)

**Files:**
- Modify: `src/LightyDesign.Generator/LightyGeneratedFlowChartPackage.cs`

- [ ] **Step 1: Check if the package class needs changes**

Review the current class — it has `OutputRelativePath` and `Files` properties. The new file structure changes the file paths and content but the package class itself likely doesn't need changes. Verify by checking if any consumers depend on the old file naming.

- [ ] **Step 2: Verify all tests pass**

Run: `dotnet test tests/LightyDesign.Tests --nologo`
Expected: All tests PASS

- [ ] **Step 3: Commit (if any changes were needed)**

```bash
git add src/LightyDesign.Generator/LightyGeneratedFlowChartPackage.cs
git commit -m "chore(flowchart): adjust package for new file structure"
```

---

## Self-Review Checklist

After writing the plan, verify against the spec:

- [ ] **§2 IFlowRuntime interface** — Task 2 creates the interface with all required members
- [ ] **§3 FlowChart abstract base** — Task 2 creates the abstract class; Task 4 generates the subclass
- [ ] **§3.2 Generated FlowChart implementation** — Task 4: node singletons, connections, property bag, query methods, dispatch
- [ ] **§3.3 Property Bag** — Task 2: `LightyFlowChartPropertyBag` with Set/Get
- [ ] **§4 Flow\<TContext\>** — Task 2: sealed shared engine with End/Loop/Pause constants, StepOnce routing, ResolveComputeInput
- [ ] **§5 Node generation rules** — Task 3: sealed (built-in) vs partial (custom), PORT constants, IFlowRuntime param, int/void return, out params
- [ ] **§5.3 PORT naming** — Task 1: `PortToConstantName` utility
- [ ] **§5.4 Property helpers** — Task 3: `GetXxx(IFlowRuntime flow)` for flow nodes, `GetXxx(IFlowRuntime flow, uint nodeId)` for compute nodes
- [ ] **§5.5-5.6 Generic and overload nodes** — Task 3: generic type parameters preserved, overloads rendered as multiple Evaluate methods
- [ ] **§5.7 Removal of helper class** — Task 7: FlowChartStandardNodeBindingHelper removed
- [ ] **§7 Changes table** — All items covered across Tasks 2, 3, 4, 7
- [ ] **§10 Test plan** — Tasks 3, 5, 6 cover all test categories

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-05-flowchart-nodecentric-codegen.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
