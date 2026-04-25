using System.Diagnostics;
using System.Text.Json;
using LightyDesign.Core;
using LightyDesign.DesktopHost;
using LightyDesign.Generator;

namespace LightyDesign.Tests;

public class FlowChartCodeGenerationTests
{
    [Fact]
    public void FlowChartNodeDefinitionParser_ShouldParseTemplateStandardNodeFamilies()
    {
        var workspaceRoot = CreateWorkspaceDirectory();

        try
        {
            var workspace = LightyWorkspaceScaffolder.Create(workspaceRoot);

            var arithmeticDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/Arithmetic/Add");
            var arithmeticNode = LightyFlowChartNodeDefinitionParser.Parse(arithmeticDocument);
            Assert.Equal(LightyFlowChartNodeKind.Compute, arithmeticNode.NodeKind);
            Assert.Equal("Arithmetic.Add", arithmeticNode.CodegenBinding!.Operation);
            Assert.Equal(LightyFlowChartCodegenResolutionMode.Overload, arithmeticNode.CodegenBinding.ResolutionMode);
            Assert.Single(arithmeticNode.TypeParameters);
            Assert.Equal("TNumeric", arithmeticNode.TypeParameters[0].Name);
            Assert.Equal("numeric", arithmeticNode.TypeParameters[0].Constraint);

            var subtractDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/Arithmetic/Subtract");
            var subtractNode = LightyFlowChartNodeDefinitionParser.Parse(subtractDocument);
            Assert.Equal("Arithmetic.Subtract", subtractNode.CodegenBinding!.Operation);

            var multiplyDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/Arithmetic/Multiply");
            var multiplyNode = LightyFlowChartNodeDefinitionParser.Parse(multiplyDocument);
            Assert.Equal("Arithmetic.Multiply", multiplyNode.CodegenBinding!.Operation);

            var divideDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/Arithmetic/Divide");
            var divideNode = LightyFlowChartNodeDefinitionParser.Parse(divideDocument);
            Assert.Equal("Arithmetic.Divide", divideNode.CodegenBinding!.Operation);

            var listDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/List/Add");
            var listNode = LightyFlowChartNodeDefinitionParser.Parse(listDocument);
            Assert.Equal(LightyFlowChartNodeKind.Flow, listNode.NodeKind);
            Assert.Equal("List.Add", listNode.CodegenBinding!.Operation);
            Assert.Equal(LightyFlowChartCodegenResolutionMode.Generic, listNode.CodegenBinding.ResolutionMode);
            Assert.Single(listNode.TypeParameters);
            Assert.Equal("TElement", listNode.TypeParameters[0].Name);
            Assert.Equal("any", listNode.TypeParameters[0].Constraint);

            var listCountDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/List/Count");
            var listCountNode = LightyFlowChartNodeDefinitionParser.Parse(listCountDocument);
            Assert.Equal(LightyFlowChartNodeKind.Compute, listCountNode.NodeKind);
            Assert.Equal("List.Count", listCountNode.CodegenBinding!.Operation);

            var listGetAtDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/List/GetAt");
            var listGetAtNode = LightyFlowChartNodeDefinitionParser.Parse(listGetAtDocument);
            Assert.Equal(LightyFlowChartNodeKind.Compute, listGetAtNode.NodeKind);
            Assert.Equal("List.GetAt", listGetAtNode.CodegenBinding!.Operation);

            var listForEachDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/List/ForEach");
            var listForEachNode = LightyFlowChartNodeDefinitionParser.Parse(listForEachDocument);
            Assert.Equal(LightyFlowChartNodeKind.Flow, listForEachNode.NodeKind);
            Assert.Equal(new[] { "TElement" }, listForEachNode.TypeParameters.Select(parameter => parameter.Name).ToArray());
            Assert.Equal(3, listForEachNode.FlowPorts.Count);
            Assert.Equal(3, listForEachNode.ComputePorts.Count);
            Assert.Null(listForEachNode.CodegenBinding);

            var dictionaryDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/Dictionary/Set");
            var dictionaryNode = LightyFlowChartNodeDefinitionParser.Parse(dictionaryDocument);
            Assert.Equal(LightyFlowChartNodeKind.Flow, dictionaryNode.NodeKind);
            Assert.Equal("Dictionary.Set", dictionaryNode.CodegenBinding!.Operation);
            Assert.Equal(LightyFlowChartCodegenResolutionMode.Generic, dictionaryNode.CodegenBinding.ResolutionMode);
            Assert.Equal(new[] { "TKey", "TValue" }, dictionaryNode.TypeParameters.Select(parameter => parameter.Name).ToArray());

            var dictionaryGetDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/Dictionary/Get");
            var dictionaryGetNode = LightyFlowChartNodeDefinitionParser.Parse(dictionaryGetDocument);
            Assert.Equal(LightyFlowChartNodeKind.Compute, dictionaryGetNode.NodeKind);
            Assert.Equal("Dictionary.Get", dictionaryGetNode.CodegenBinding!.Operation);

            var dictionaryContainsKeyDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/Dictionary/ContainsKey");
            var dictionaryContainsKeyNode = LightyFlowChartNodeDefinitionParser.Parse(dictionaryContainsKeyDocument);
            Assert.Equal(LightyFlowChartNodeKind.Compute, dictionaryContainsKeyNode.NodeKind);
            Assert.Equal("Dictionary.ContainsKey", dictionaryContainsKeyNode.CodegenBinding!.Operation);

            var dictionaryForEachDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/Dictionary/ForEach");
            var dictionaryForEachNode = LightyFlowChartNodeDefinitionParser.Parse(dictionaryForEachDocument);
            Assert.Equal(LightyFlowChartNodeKind.Flow, dictionaryForEachNode.NodeKind);
            Assert.Equal(new[] { "TKey", "TValue" }, dictionaryForEachNode.TypeParameters.Select(parameter => parameter.Name).ToArray());
            Assert.Equal(3, dictionaryForEachNode.FlowPorts.Count);
            Assert.Equal(3, dictionaryForEachNode.ComputePorts.Count);
            Assert.Null(dictionaryForEachNode.CodegenBinding);

            var comparisonDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/Comparison/Equal");
            var comparisonNode = LightyFlowChartNodeDefinitionParser.Parse(comparisonDocument);
            Assert.Equal(LightyFlowChartNodeKind.Compute, comparisonNode.NodeKind);
            Assert.Equal("Comparison.Equal", comparisonNode.CodegenBinding!.Operation);
            Assert.Equal(LightyFlowChartCodegenResolutionMode.Overload, comparisonNode.CodegenBinding.ResolutionMode);
            Assert.Single(comparisonNode.TypeParameters);
            Assert.Equal("TComparable", comparisonNode.TypeParameters[0].Name);
            Assert.Equal("comparable", comparisonNode.TypeParameters[0].Constraint);

            var comparisonNotEqualDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/Comparison/NotEqual");
            var comparisonNotEqualNode = LightyFlowChartNodeDefinitionParser.Parse(comparisonNotEqualDocument);
            Assert.Equal("Comparison.NotEqual", comparisonNotEqualNode.CodegenBinding!.Operation);

            var comparisonGreaterThanDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/Comparison/GreaterThan");
            var comparisonGreaterThanNode = LightyFlowChartNodeDefinitionParser.Parse(comparisonGreaterThanDocument);
            Assert.Equal("Comparison.GreaterThan", comparisonGreaterThanNode.CodegenBinding!.Operation);

            var comparisonLessThanDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/Comparison/LessThan");
            var comparisonLessThanNode = LightyFlowChartNodeDefinitionParser.Parse(comparisonLessThanDocument);
            Assert.Equal("Comparison.LessThan", comparisonLessThanNode.CodegenBinding!.Operation);

            var boolConstantDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/Constant/Bool");
            var boolConstantNode = LightyFlowChartNodeDefinitionParser.Parse(boolConstantDocument);
            Assert.Equal(LightyFlowChartNodeKind.Compute, boolConstantNode.NodeKind);
            Assert.Single(boolConstantNode.Properties);
            Assert.Null(boolConstantNode.CodegenBinding);

            var int32ConstantDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/Constant/Int32");
            var int32ConstantNode = LightyFlowChartNodeDefinitionParser.Parse(int32ConstantDocument);
            Assert.Equal(LightyFlowChartNodeKind.Compute, int32ConstantNode.NodeKind);
            Assert.Single(int32ConstantNode.Properties);

            var stringConstantDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/Constant/String");
            var stringConstantNode = LightyFlowChartNodeDefinitionParser.Parse(stringConstantDocument);
            Assert.Equal(LightyFlowChartNodeKind.Compute, stringConstantNode.NodeKind);
            Assert.Single(stringConstantNode.Properties);

            var listConfigDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/Config/ListInt32");
            var listConfigNode = LightyFlowChartNodeDefinitionParser.Parse(listConfigDocument);
            Assert.Equal(LightyFlowChartNodeKind.Compute, listConfigNode.NodeKind);
            Assert.Single(listConfigNode.Properties);

            var dictionaryConfigDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/Config/DictionaryStringInt32");
            var dictionaryConfigNode = LightyFlowChartNodeDefinitionParser.Parse(dictionaryConfigDocument);
            Assert.Equal(LightyFlowChartNodeKind.Compute, dictionaryConfigNode.NodeKind);
            Assert.Single(dictionaryConfigNode.Properties);

            var ifDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/Control/If");
            var ifNode = LightyFlowChartNodeDefinitionParser.Parse(ifDocument);
            Assert.Equal(LightyFlowChartNodeKind.Flow, ifNode.NodeKind);
            Assert.Single(ifNode.ComputePorts);
            Assert.Equal(3, ifNode.FlowPorts.Count);
            Assert.Null(ifNode.CodegenBinding);

            var whileDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/Control/While");
            var whileNode = LightyFlowChartNodeDefinitionParser.Parse(whileDocument);
            Assert.Equal(LightyFlowChartNodeKind.Flow, whileNode.NodeKind);
            Assert.Single(whileNode.ComputePorts);
            Assert.Equal(3, whileNode.FlowPorts.Count);
            Assert.Null(whileNode.CodegenBinding);

            var pauseDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/Control/Pause");
            var pauseNode = LightyFlowChartNodeDefinitionParser.Parse(pauseDocument);
            Assert.Equal(LightyFlowChartNodeKind.Flow, pauseNode.NodeKind);
            Assert.Empty(pauseNode.ComputePorts);
            Assert.Equal(2, pauseNode.FlowPorts.Count);
            Assert.Null(pauseNode.CodegenBinding);

            var waitUntilDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/Control/WaitUntil");
            var waitUntilNode = LightyFlowChartNodeDefinitionParser.Parse(waitUntilDocument);
            Assert.Equal(LightyFlowChartNodeKind.Flow, waitUntilNode.NodeKind);
            Assert.Single(waitUntilNode.ComputePorts);
            Assert.Equal(2, waitUntilNode.FlowPorts.Count);
            Assert.Null(waitUntilNode.CodegenBinding);

            var pauseSecondsDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/Control/PauseSeconds");
            var pauseSecondsNode = LightyFlowChartNodeDefinitionParser.Parse(pauseSecondsDocument);
            Assert.Equal(LightyFlowChartNodeKind.Flow, pauseSecondsNode.NodeKind);
            Assert.Empty(pauseSecondsNode.ComputePorts);
            Assert.Equal(2, pauseSecondsNode.FlowPorts.Count);
            Assert.Single(pauseSecondsNode.Properties);
            Assert.Null(pauseSecondsNode.CodegenBinding);
        }
        finally
        {
            if (Directory.Exists(workspaceRoot))
            {
                Directory.Delete(workspaceRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void FlowChartNodeCodeGenerator_ShouldGenerateTemplateNodeFilesForGenericAndOverloadFamilies()
    {
        var workspaceRoot = CreateWorkspaceDirectory();

        try
        {
            var scaffoldedWorkspace = LightyWorkspaceScaffolder.Create(workspaceRoot);
            var workspace = WithOutputRelativePath(scaffoldedWorkspace, "Generated/Config");
            var generator = new LightyFlowChartNodeCodeGenerator();

            var package = generator.Generate(workspace);

            Assert.Equal("Generated/Config", package.OutputRelativePath);
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/FlowChartStandardNodeBindingHelper.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Arithmetic/AddNode.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Arithmetic/SubtractNode.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Arithmetic/MultiplyNode.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Arithmetic/DivideNode.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Comparison/EqualNode.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Comparison/NotEqualNode.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Comparison/GreaterThanNode.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Comparison/LessThanNode.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Constant/BoolNode.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Constant/Int32Node.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Constant/StringNode.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Config/ListInt32Node.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Config/DictionaryStringInt32Node.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Control/IfNode.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Control/WhileNode.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Control/PauseNode.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Control/WaitUntilNode.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Control/PauseSecondsNode.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/List/AddNode.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/List/CountNode.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/List/GetAtNode.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/List/ForEachNode.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Dictionary/SetNode.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Dictionary/GetNode.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Dictionary/ContainsKeyNode.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Dictionary/ForEachNode.cs");

            var helperFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/FlowChartStandardNodeBindingHelper.cs");
            Assert.Contains("public static partial class FlowChartStandardNodeBindingHelper", helperFile.Content, StringComparison.Ordinal);
            Assert.Contains("public static List<TElement> ListAdd<TElement>(List<TElement> list, TElement item)", helperFile.Content, StringComparison.Ordinal);
            Assert.Contains("public static int ListCount<TElement>(List<TElement> list)", helperFile.Content, StringComparison.Ordinal);
            Assert.Contains("public static TElement ListGetAt<TElement>(List<TElement> list, int index)", helperFile.Content, StringComparison.Ordinal);
            Assert.Contains("public static Dictionary<TKey, TValue> DictionarySet<TKey, TValue>(Dictionary<TKey, TValue> dictionary, TKey key, TValue value)", helperFile.Content, StringComparison.Ordinal);
            Assert.Contains("public static TValue DictionaryGet<TKey, TValue>(Dictionary<TKey, TValue> dictionary, TKey key)", helperFile.Content, StringComparison.Ordinal);
            Assert.Contains("public static bool DictionaryContainsKey<TKey, TValue>(Dictionary<TKey, TValue> dictionary, TKey key)", helperFile.Content, StringComparison.Ordinal);
            Assert.Contains("public static int ArithmeticAdd(int left, int right)", helperFile.Content, StringComparison.Ordinal);
            Assert.Contains("public static int ArithmeticSubtract(int left, int right)", helperFile.Content, StringComparison.Ordinal);
            Assert.Contains("public static int ArithmeticMultiply(int left, int right)", helperFile.Content, StringComparison.Ordinal);
            Assert.Contains("public static int ArithmeticDivide(int left, int right)", helperFile.Content, StringComparison.Ordinal);
            Assert.Contains("public static bool ComparisonEqual(string left, string right)", helperFile.Content, StringComparison.Ordinal);
            Assert.Contains("public static bool ComparisonNotEqual(string left, string right)", helperFile.Content, StringComparison.Ordinal);
            Assert.Contains("public static bool ComparisonGreaterThan(int left, int right)", helperFile.Content, StringComparison.Ordinal);
            Assert.Contains("public static bool ComparisonLessThan(int left, int right)", helperFile.Content, StringComparison.Ordinal);

            var arithmeticFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Arithmetic/AddNode.cs");
            Assert.Contains("namespace LightyDesignData.FlowCharts.Nodes.Builtin.Arithmetic", arithmeticFile.Content, StringComparison.Ordinal);
            Assert.Contains("public partial class AddNode", arithmeticFile.Content, StringComparison.Ordinal);
            Assert.Contains("public int Evaluate(int left, int right)", arithmeticFile.Content, StringComparison.Ordinal);
            Assert.Contains("public double Evaluate(double left, double right)", arithmeticFile.Content, StringComparison.Ordinal);
            Assert.Contains("FlowChartStandardNodeBindingHelper.ArithmeticAdd(left, right)", arithmeticFile.Content, StringComparison.Ordinal);

            var arithmeticSubtractFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Arithmetic/SubtractNode.cs");
            Assert.Contains("public int Evaluate(int left, int right)", arithmeticSubtractFile.Content, StringComparison.Ordinal);
            Assert.Contains("FlowChartStandardNodeBindingHelper.ArithmeticSubtract(left, right)", arithmeticSubtractFile.Content, StringComparison.Ordinal);

            var arithmeticMultiplyFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Arithmetic/MultiplyNode.cs");
            Assert.Contains("public int Evaluate(int left, int right)", arithmeticMultiplyFile.Content, StringComparison.Ordinal);
            Assert.Contains("FlowChartStandardNodeBindingHelper.ArithmeticMultiply(left, right)", arithmeticMultiplyFile.Content, StringComparison.Ordinal);

            var arithmeticDivideFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Arithmetic/DivideNode.cs");
            Assert.Contains("public int Evaluate(int left, int right)", arithmeticDivideFile.Content, StringComparison.Ordinal);
            Assert.Contains("FlowChartStandardNodeBindingHelper.ArithmeticDivide(left, right)", arithmeticDivideFile.Content, StringComparison.Ordinal);

            var comparisonFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Comparison/EqualNode.cs");
            Assert.Contains("namespace LightyDesignData.FlowCharts.Nodes.Builtin.Comparison", comparisonFile.Content, StringComparison.Ordinal);
            Assert.Contains("public partial class EqualNode", comparisonFile.Content, StringComparison.Ordinal);
            Assert.Contains("public bool Evaluate(bool left, bool right)", comparisonFile.Content, StringComparison.Ordinal);
            Assert.Contains("public bool Evaluate(string left, string right)", comparisonFile.Content, StringComparison.Ordinal);
            Assert.Contains("FlowChartStandardNodeBindingHelper.ComparisonEqual(left, right)", comparisonFile.Content, StringComparison.Ordinal);

            var comparisonNotEqualFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Comparison/NotEqualNode.cs");
            Assert.Contains("public bool Evaluate(string left, string right)", comparisonNotEqualFile.Content, StringComparison.Ordinal);
            Assert.Contains("FlowChartStandardNodeBindingHelper.ComparisonNotEqual(left, right)", comparisonNotEqualFile.Content, StringComparison.Ordinal);

            var comparisonGreaterThanFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Comparison/GreaterThanNode.cs");
            Assert.Contains("public bool Evaluate(int left, int right)", comparisonGreaterThanFile.Content, StringComparison.Ordinal);
            Assert.Contains("FlowChartStandardNodeBindingHelper.ComparisonGreaterThan(left, right)", comparisonGreaterThanFile.Content, StringComparison.Ordinal);

            var comparisonLessThanFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Comparison/LessThanNode.cs");
            Assert.Contains("public bool Evaluate(int left, int right)", comparisonLessThanFile.Content, StringComparison.Ordinal);
            Assert.Contains("FlowChartStandardNodeBindingHelper.ComparisonLessThan(left, right)", comparisonLessThanFile.Content, StringComparison.Ordinal);

            var boolConstantFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Constant/BoolNode.cs");
            Assert.Contains("public partial class BoolNode", boolConstantFile.Content, StringComparison.Ordinal);

            var int32ConstantFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Constant/Int32Node.cs");
            Assert.Contains("public partial class Int32Node", int32ConstantFile.Content, StringComparison.Ordinal);

            var stringConstantFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Constant/StringNode.cs");
            Assert.Contains("public partial class StringNode", stringConstantFile.Content, StringComparison.Ordinal);

            var listConfigFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Config/ListInt32Node.cs");
            Assert.Contains("public partial class ListInt32Node", listConfigFile.Content, StringComparison.Ordinal);

            var dictionaryConfigFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Config/DictionaryStringInt32Node.cs");
            Assert.Contains("public partial class DictionaryStringInt32Node", dictionaryConfigFile.Content, StringComparison.Ordinal);

            var ifFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Control/IfNode.cs");
            Assert.Contains("namespace LightyDesignData.FlowCharts.Nodes.Builtin.Control", ifFile.Content, StringComparison.Ordinal);
            Assert.Contains("public partial class IfNode", ifFile.Content, StringComparison.Ordinal);

            var whileFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Control/WhileNode.cs");
            Assert.Contains("public partial class WhileNode", whileFile.Content, StringComparison.Ordinal);

            var pauseFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Control/PauseNode.cs");
            Assert.Contains("public partial class PauseNode", pauseFile.Content, StringComparison.Ordinal);

            var waitUntilFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Control/WaitUntilNode.cs");
            Assert.Contains("public partial class WaitUntilNode", waitUntilFile.Content, StringComparison.Ordinal);

            var pauseSecondsFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Control/PauseSecondsNode.cs");
            Assert.Contains("public partial class PauseSecondsNode", pauseSecondsFile.Content, StringComparison.Ordinal);

            var listFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/List/AddNode.cs");
            Assert.Contains("namespace LightyDesignData.FlowCharts.Nodes.Builtin.List", listFile.Content, StringComparison.Ordinal);
            Assert.Contains("public partial class AddNode<TElement>", listFile.Content, StringComparison.Ordinal);
            Assert.Contains("public List<TElement> Execute(List<TElement> list, TElement item)", listFile.Content, StringComparison.Ordinal);
            Assert.Contains("FlowChartStandardNodeBindingHelper.ListAdd(list, item)", listFile.Content, StringComparison.Ordinal);

            var listCountFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/List/CountNode.cs");
            Assert.Contains("public partial class CountNode<TElement>", listCountFile.Content, StringComparison.Ordinal);
            Assert.Contains("public int Evaluate(List<TElement> list)", listCountFile.Content, StringComparison.Ordinal);
            Assert.Contains("FlowChartStandardNodeBindingHelper.ListCount(list)", listCountFile.Content, StringComparison.Ordinal);

            var listGetAtFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/List/GetAtNode.cs");
            Assert.Contains("public partial class GetAtNode<TElement>", listGetAtFile.Content, StringComparison.Ordinal);
            Assert.Contains("public TElement Evaluate(List<TElement> list, int index)", listGetAtFile.Content, StringComparison.Ordinal);
            Assert.Contains("FlowChartStandardNodeBindingHelper.ListGetAt(list, index)", listGetAtFile.Content, StringComparison.Ordinal);

            var listForEachFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/List/ForEachNode.cs");
            Assert.Contains("public partial class ForEachNode<TElement>", listForEachFile.Content, StringComparison.Ordinal);

            var dictionaryFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Dictionary/SetNode.cs");
            Assert.Contains("namespace LightyDesignData.FlowCharts.Nodes.Builtin.Dictionary", dictionaryFile.Content, StringComparison.Ordinal);
            Assert.Contains("public partial class SetNode<TKey, TValue>", dictionaryFile.Content, StringComparison.Ordinal);
            Assert.Contains("public Dictionary<TKey, TValue> Execute(Dictionary<TKey, TValue> dictionary, TKey key, TValue value)", dictionaryFile.Content, StringComparison.Ordinal);
            Assert.Contains("FlowChartStandardNodeBindingHelper.DictionarySet(dictionary, key, value)", dictionaryFile.Content, StringComparison.Ordinal);

            var dictionaryGetFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Dictionary/GetNode.cs");
            Assert.Contains("public partial class GetNode<TKey, TValue>", dictionaryGetFile.Content, StringComparison.Ordinal);
            Assert.Contains("public TValue Evaluate(Dictionary<TKey, TValue> dictionary, TKey key)", dictionaryGetFile.Content, StringComparison.Ordinal);
            Assert.Contains("FlowChartStandardNodeBindingHelper.DictionaryGet(dictionary, key)", dictionaryGetFile.Content, StringComparison.Ordinal);

            var dictionaryContainsKeyFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Dictionary/ContainsKeyNode.cs");
            Assert.Contains("public partial class ContainsKeyNode<TKey, TValue>", dictionaryContainsKeyFile.Content, StringComparison.Ordinal);
            Assert.Contains("public bool Evaluate(Dictionary<TKey, TValue> dictionary, TKey key)", dictionaryContainsKeyFile.Content, StringComparison.Ordinal);
            Assert.Contains("FlowChartStandardNodeBindingHelper.DictionaryContainsKey(dictionary, key)", dictionaryContainsKeyFile.Content, StringComparison.Ordinal);

            var dictionaryForEachFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Dictionary/ForEachNode.cs");
            Assert.Contains("public partial class ForEachNode<TKey, TValue>", dictionaryForEachFile.Content, StringComparison.Ordinal);
        }
        finally
        {
            if (Directory.Exists(workspaceRoot))
            {
                Directory.Delete(workspaceRoot, recursive: true);
            }
        }
    }

        [Fact]
        public void FlowChartFileParser_ShouldParseTypeArgumentsAndConnections()
        {
                var workspaceRoot = CreateWorkspaceDirectory();

                try
                {
                        LightyWorkspaceScaffolder.Create(workspaceRoot);

                        using var document = JsonDocument.Parse(
                                """
                                {
                                    "formatVersion": "1.0",
                                      "name": "Intro",
                                    "alias": "任务开场",
                                    "nodes": [
                                        {
                                            "nodeId": 1,
                                            "nodeType": "Builtin/List/Add",
                                            "typeArguments": [
                                                {
                                                    "name": "TElement",
                                                    "type": {
                                                        "kind": "builtin",
                                                        "name": "int32"
                                                    }
                                                }
                                            ],
                                            "layout": {
                                                "x": 120,
                                                "y": 80
                                            },
                                            "propertyValues": [
                                                {
                                                    "propertyId": 1,
                                                    "value": 42
                                                }
                                            ]
                                        },
                                        {
                                            "nodeId": 2,
                                            "nodeType": "Builtin/Dictionary/Set",
                                            "layout": {
                                                "x": 420,
                                                "y": 80
                                            },
                                            "propertyValues": []
                                        }
                                    ],
                                    "flowConnections": [
                                        {
                                            "sourceNodeId": 1,
                                            "sourcePortId": 251,
                                            "targetNodeId": 2,
                                            "targetPortId": 201
                                        }
                                    ],
                                    "computeConnections": [
                                        {
                                            "sourceNodeId": 1,
                                            "sourcePortId": 151,
                                            "targetNodeId": 2,
                                            "targetPortId": 103
                                        }
                                    ]
                                }
                                """);

                        var parsed = LightyFlowChartFileDefinitionParser.Parse("Quest/Intro", Path.Combine(workspaceRoot, "QuestIntro.json"), document.RootElement);

                        Assert.Equal("Quest/Intro", parsed.RelativePath);
                        Assert.Equal("Intro", parsed.Name);
                        Assert.Equal("任务开场", parsed.Alias);
                        Assert.Equal(2, parsed.Nodes.Count);
                        Assert.Single(parsed.FlowConnections);
                        Assert.Single(parsed.ComputeConnections);

                        var listNode = parsed.Nodes[0];
                        Assert.Equal((uint)1, listNode.NodeId);
                        Assert.Equal("Builtin/List/Add", listNode.NodeType);
                        Assert.Single(listNode.TypeArguments);
                        Assert.Equal("TElement", listNode.TypeArguments[0].Name);
                        Assert.Equal(LightyFlowChartTypeKind.Builtin, listNode.TypeArguments[0].Type.Kind);
                        Assert.Equal("int32", listNode.TypeArguments[0].Type.Name);
                        Assert.Single(listNode.PropertyValues);
                        Assert.Equal((uint)1, listNode.PropertyValues[0].PropertyId);
                }
                finally
                {
                        if (Directory.Exists(workspaceRoot))
                        {
                                Directory.Delete(workspaceRoot, recursive: true);
                        }
                }
        }

        [Fact]
        public void FlowChartFileCodeGenerator_ShouldGenerateDefinitionRuntimeAndResolvedNodeMembers()
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
                                    "alias": "整数常量",
                                    "nodeKind": "compute",
                                    "properties": [],
                                    "computePorts": [
                                        {
                                            "portId": 151,
                                            "name": "Result",
                                            "alias": "结果",
                                            "direction": "output",
                                            "type": {
                                                "kind": "builtin",
                                                "name": "int32"
                                            }
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
                                    "alias": "任务开场",
                                    "nodes": [
                                        {
                                            "nodeId": 1,
                                            "nodeType": "Custom/Math/ConstantInt",
                                            "layout": {
                                                "x": 100,
                                                "y": 80
                                            },
                                            "propertyValues": []
                                        },
                                        {
                                            "nodeId": 2,
                                            "nodeType": "Custom/Math/ConstantInt",
                                            "layout": {
                                                "x": 100,
                                                "y": 220
                                            },
                                            "propertyValues": []
                                        },
                                        {
                                            "nodeId": 3,
                                            "nodeType": "Builtin/Arithmetic/Add",
                                            "layout": {
                                                "x": 360,
                                                "y": 150
                                            },
                                            "propertyValues": []
                                        },
                                        {
                                            "nodeId": 4,
                                            "nodeType": "Builtin/List/Add",
                                            "typeArguments": [
                                                {
                                                    "name": "TElement",
                                                    "type": {
                                                        "kind": "builtin",
                                                        "name": "int32"
                                                    }
                                                }
                                            ],
                                            "layout": {
                                                "x": 640,
                                                "y": 150
                                            },
                                            "propertyValues": []
                                        },
                                        {
                                            "nodeId": 5,
                                            "nodeType": "Builtin/Dictionary/Set",
                                            "typeArguments": [
                                                {
                                                    "name": "TKey",
                                                    "type": {
                                                        "kind": "builtin",
                                                        "name": "string"
                                                    }
                                                },
                                                {
                                                    "name": "TValue",
                                                    "type": {
                                                        "kind": "builtin",
                                                        "name": "int32"
                                                    }
                                                }
                                            ],
                                            "layout": {
                                                "x": 920,
                                                "y": 150
                                            },
                                            "propertyValues": []
                                        }
                                    ],
                                    "flowConnections": [],
                                    "computeConnections": [
                                        {
                                            "sourceNodeId": 1,
                                            "sourcePortId": 151,
                                            "targetNodeId": 3,
                                            "targetPortId": 101
                                        },
                                        {
                                            "sourceNodeId": 2,
                                            "sourcePortId": 151,
                                            "targetNodeId": 3,
                                            "targetPortId": 102
                                        }
                                    ]
                                }
                                """);

                        var workspace = WithOutputRelativePath(LightyWorkspaceLoader.Load(workspaceRoot), "Generated/Config");
                        var generator = new LightyFlowChartFileCodeGenerator();

                        var package = generator.Generate(workspace, "Quest/Intro");

                        Assert.Equal("Generated/Config", package.OutputRelativePath);
                        Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/FlowChartRuntimeSupport.cs");
                        Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/FlowChartStandardNodeBindingHelper.cs");
                        Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Files/Quest/Intro/IntroDefinition.cs");
                        Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Files/Quest/Intro/IntroFlow.cs");

                        var runtimeSupportFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/FlowChartRuntimeSupport.cs");
                        Assert.Contains("public sealed class FlowChartNodeState", runtimeSupportFile.Content, StringComparison.Ordinal);

                        var definitionFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Files/Quest/Intro/IntroDefinition.cs");
                        Assert.Contains("namespace LightyDesignData.FlowCharts.Files.Quest.Intro", definitionFile.Content, StringComparison.Ordinal);
                        Assert.Contains("public sealed partial class IntroDefinition", definitionFile.Content, StringComparison.Ordinal);
                        Assert.Contains("private static readonly LightyDesignData.FlowCharts.Nodes.Builtin.Arithmetic.AddNode Node3 = new LightyDesignData.FlowCharts.Nodes.Builtin.Arithmetic.AddNode();", definitionFile.Content, StringComparison.Ordinal);
                        Assert.Contains("private static readonly LightyDesignData.FlowCharts.Nodes.Builtin.List.AddNode<int> Node4 = new LightyDesignData.FlowCharts.Nodes.Builtin.List.AddNode<int>();", definitionFile.Content, StringComparison.Ordinal);
                        Assert.Contains("private static readonly LightyDesignData.FlowCharts.Nodes.Builtin.Dictionary.SetNode<string, int> Node5 = new LightyDesignData.FlowCharts.Nodes.Builtin.Dictionary.SetNode<string, int>();", definitionFile.Content, StringComparison.Ordinal);
                        Assert.Contains("public IntroFlow<TContext> CreateFlow<TContext>(TContext context)", definitionFile.Content, StringComparison.Ordinal);
                        Assert.Contains("public IntroFlow<TContext> CreateFlow<TContext>(uint entryNodeId, TContext context)", definitionFile.Content, StringComparison.Ordinal);

                        var flowFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Files/Quest/Intro/IntroFlow.cs");
                        Assert.Contains("public sealed partial class IntroFlow<TContext>", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("private readonly Dictionary<uint, FlowChartNodeState> _nodeStates = new Dictionary<uint, FlowChartNodeState>();", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("private readonly Dictionary<(uint NodeId, uint PortId), object?> _stepComputeCache = new Dictionary<(uint NodeId, uint PortId), object?>();", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("public void Resume()", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("public void StepOnce()", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("public void Step(int maxSteps)", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("public void RunToCompletion()", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("public void RunUntilPaused()", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("private T ResolveComputeInput<T>(uint targetNodeId, uint targetPortId)", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("private object? EvaluateNodeOutputValue(uint sourceNodeId, uint sourcePortId)", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("Node3.Evaluate(ResolveComputeInput<int>(3u, 101u), ResolveComputeInput<int>(3u, 102u))", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("throw new NotSupportedException($\"Runtime evaluation is not supported for output '{sourceNodeId}:{sourcePortId}'.\")", flowFile.Content, StringComparison.Ordinal);
                }
                finally
                {
                        if (Directory.Exists(workspaceRoot))
                        {
                                Directory.Delete(workspaceRoot, recursive: true);
                        }
                }
        }

        [Fact]
        public void FlowChartFileCodeGenerator_ShouldGenerateRuntimeDispatchForControlAndIterationNodes()
        {
                var workspaceRoot = CreateWorkspaceDirectory();

                try
                {
                        LightyWorkspaceScaffolder.Create(workspaceRoot);
                        CreateNodeDefinition(
                                workspaceRoot,
                                "Event/System/Start",
                                """
                                {
                                    "formatVersion": "1.0",
                                    "name": "Start",
                                    "alias": "开始",
                                    "nodeKind": "event",
                                    "properties": [],
                                    "computePorts": [],
                                    "flowPorts": [
                                        {
                                            "portId": 251,
                                            "name": "Then",
                                            "alias": "然后",
                                            "direction": "output"
                                        }
                                    ]
                                }
                                """);
                        CreateFlowChartFile(
                                workspaceRoot,
                                "Quest/ControlRuntime",
                                """
                                {
                                    "formatVersion": "1.0",
                                    "name": "ControlRuntime",
                                    "alias": "控制运行时",
                                    "nodes": [
                                        {
                                            "nodeId": 1,
                                            "nodeType": "Event/System/Start",
                                            "layout": { "x": 80, "y": 80 },
                                            "propertyValues": []
                                        },
                                        {
                                            "nodeId": 2,
                                            "nodeType": "Builtin/Control/If",
                                            "layout": { "x": 260, "y": 80 },
                                            "propertyValues": []
                                        },
                                        {
                                            "nodeId": 3,
                                            "nodeType": "Builtin/Control/Pause",
                                            "layout": { "x": 440, "y": 20 },
                                            "propertyValues": []
                                        },
                                        {
                                            "nodeId": 4,
                                            "nodeType": "Builtin/Control/While",
                                            "layout": { "x": 440, "y": 180 },
                                            "propertyValues": []
                                        },
                                        {
                                            "nodeId": 5,
                                            "nodeType": "Builtin/List/ForEach",
                                            "typeArguments": [
                                                {
                                                    "name": "TElement",
                                                    "type": {
                                                        "kind": "builtin",
                                                        "name": "int32"
                                                    }
                                                }
                                            ],
                                            "layout": { "x": 680, "y": 120 },
                                            "propertyValues": []
                                        },
                                        {
                                            "nodeId": 6,
                                            "nodeType": "Builtin/Dictionary/ForEach",
                                            "typeArguments": [
                                                {
                                                    "name": "TKey",
                                                    "type": {
                                                        "kind": "builtin",
                                                        "name": "string"
                                                    }
                                                },
                                                {
                                                    "name": "TValue",
                                                    "type": {
                                                        "kind": "builtin",
                                                        "name": "int32"
                                                    }
                                                }
                                            ],
                                            "layout": { "x": 940, "y": 120 },
                                            "propertyValues": []
                                        }
                                    ],
                                    "flowConnections": [
                                        {
                                            "sourceNodeId": 1,
                                            "sourcePortId": 251,
                                            "targetNodeId": 2,
                                            "targetPortId": 201
                                        },
                                        {
                                            "sourceNodeId": 2,
                                            "sourcePortId": 251,
                                            "targetNodeId": 3,
                                            "targetPortId": 201
                                        },
                                        {
                                            "sourceNodeId": 2,
                                            "sourcePortId": 252,
                                            "targetNodeId": 4,
                                            "targetPortId": 201
                                        },
                                        {
                                            "sourceNodeId": 3,
                                            "sourcePortId": 251,
                                            "targetNodeId": 4,
                                            "targetPortId": 201
                                        },
                                        {
                                            "sourceNodeId": 4,
                                            "sourcePortId": 251,
                                            "targetNodeId": 5,
                                            "targetPortId": 201
                                        },
                                        {
                                            "sourceNodeId": 4,
                                            "sourcePortId": 252,
                                            "targetNodeId": 6,
                                            "targetPortId": 201
                                        },
                                        {
                                            "sourceNodeId": 5,
                                            "sourcePortId": 251,
                                            "targetNodeId": 4,
                                            "targetPortId": 201
                                        },
                                        {
                                            "sourceNodeId": 5,
                                            "sourcePortId": 252,
                                            "targetNodeId": 6,
                                            "targetPortId": 201
                                        }
                                    ],
                                    "computeConnections": []
                                }
                                """);

                        var workspace = WithOutputRelativePath(LightyWorkspaceLoader.Load(workspaceRoot), "Generated/Config");
                        var generator = new LightyFlowChartFileCodeGenerator();

                        var package = generator.Generate(workspace, "Quest/ControlRuntime");

                        var definitionFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Files/Quest/ControlRuntime/ControlRuntimeDefinition.cs");
                        Assert.Contains("public ControlRuntimeFlow<TContext> CreateFlow<TContext>(uint entryNodeId, TContext context)", definitionFile.Content, StringComparison.Ordinal);

                        var flowFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Files/Quest/ControlRuntime/ControlRuntimeFlow.cs");
                        Assert.Contains("return _entryNodeIdOverride ?? 1u;", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("case 2u:", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("var condition = ResolveComputeInput<bool>(2u, 101u);", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("CurrentNodeId = ResolveFlowTarget(2u, condition ? 251u : 252u);", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("case 3u:", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("IsPaused = true;", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("case 4u:", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("var condition = ResolveComputeInput<bool>(4u, 101u);", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("case 5u:", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("var nextIndex = state.IterationIndex + 1;", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("state.SetOutputValue(151u, list[nextIndex]);", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("case 6u:", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("var entries = state.Payload as List<KeyValuePair<string, int>>;", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("state.SetOutputValue(151u, entry.Key);", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("state.SetOutputValue(152u, entry.Value);", flowFile.Content, StringComparison.Ordinal);
                }
                finally
                {
                        if (Directory.Exists(workspaceRoot))
                        {
                                Directory.Delete(workspaceRoot, recursive: true);
                        }
                }
        }

        [Fact]
        public void FlowChartFileCodeGenerator_ShouldGenerateRuntimeDispatchForWaitingNodes()
        {
                var workspaceRoot = CreateWorkspaceDirectory();

                try
                {
                        LightyWorkspaceScaffolder.Create(workspaceRoot);
                        CreateNodeDefinition(
                                workspaceRoot,
                                "Event/System/Start",
                                """
                                {
                                    "formatVersion": "1.0",
                                    "name": "Start",
                                    "alias": "开始",
                                    "nodeKind": "event",
                                    "properties": [],
                                    "computePorts": [],
                                    "flowPorts": [
                                        {
                                            "portId": 251,
                                            "name": "Then",
                                            "alias": "然后",
                                            "direction": "output"
                                        }
                                    ]
                                }
                                """);
                        CreateFlowChartFile(
                                workspaceRoot,
                                "Quest/WaitingRuntime",
                                """
                                {
                                    "formatVersion": "1.0",
                                    "name": "WaitingRuntime",
                                    "alias": "等待运行时",
                                    "nodes": [
                                        {
                                            "nodeId": 1,
                                            "nodeType": "Event/System/Start",
                                            "layout": { "x": 80, "y": 80 },
                                            "propertyValues": []
                                        },
                                        {
                                            "nodeId": 2,
                                            "nodeType": "Builtin/Constant/Bool",
                                            "layout": { "x": 80, "y": 220 },
                                            "propertyValues": [
                                                {
                                                    "propertyId": 1,
                                                    "value": true
                                                }
                                            ]
                                        },
                                        {
                                            "nodeId": 3,
                                            "nodeType": "Builtin/Control/WaitUntil",
                                            "layout": { "x": 320, "y": 80 },
                                            "propertyValues": []
                                        },
                                        {
                                            "nodeId": 4,
                                            "nodeType": "Builtin/Control/PauseSeconds",
                                            "layout": { "x": 560, "y": 80 },
                                            "propertyValues": [
                                                {
                                                    "propertyId": 1,
                                                    "value": 3
                                                }
                                            ]
                                        }
                                    ],
                                    "flowConnections": [
                                        {
                                            "sourceNodeId": 1,
                                            "sourcePortId": 251,
                                            "targetNodeId": 3,
                                            "targetPortId": 201
                                        },
                                        {
                                            "sourceNodeId": 3,
                                            "sourcePortId": 251,
                                            "targetNodeId": 4,
                                            "targetPortId": 201
                                        }
                                    ],
                                    "computeConnections": [
                                        {
                                            "sourceNodeId": 2,
                                            "sourcePortId": 151,
                                            "targetNodeId": 3,
                                            "targetPortId": 101
                                        }
                                    ]
                                }
                                """);

                        var workspace = WithOutputRelativePath(LightyWorkspaceLoader.Load(workspaceRoot), "Generated/Config");
                        var generator = new LightyFlowChartFileCodeGenerator();

                        var package = generator.Generate(workspace, "Quest/WaitingRuntime");

                        var runtimeSupportFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/FlowChartRuntimeSupport.cs");
                        Assert.Contains("public interface IFlowChartTimeContext", runtimeSupportFile.Content, StringComparison.Ordinal);
                        Assert.Contains("DateTime UtcNow { get; }", runtimeSupportFile.Content, StringComparison.Ordinal);

                        var flowFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Files/Quest/WaitingRuntime/WaitingRuntimeFlow.cs");
                        Assert.Contains("case 3u:", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("var condition = ResolveComputeInput<bool>(3u, 101u);", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("CurrentNodeId = 3u;", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("case 4u:", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("var timeContext = Context as IFlowChartTimeContext;", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("var durationSeconds = JsonSerializer.Deserialize<int>(\"3\")", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("var wakeUpUtc = state.Payload as DateTime?;", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("wakeUpUtc = timeContext.UtcNow.AddSeconds(durationSeconds);", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("CurrentNodeId = 4u;", flowFile.Content, StringComparison.Ordinal);
                }
                finally
                {
                        if (Directory.Exists(workspaceRoot))
                        {
                                Directory.Delete(workspaceRoot, recursive: true);
                        }
                }
        }

        [Fact]
        public void FlowChartFileCodeGenerator_ShouldGeneratePropertyBackedLiteralRuntimeForDefaultConstantAndConfigNodes()
        {
                var workspaceRoot = CreateWorkspaceDirectory();

                try
                {
                        LightyWorkspaceScaffolder.Create(workspaceRoot);
                        CreateFlowChartFile(
                                workspaceRoot,
                                "Quest/DefaultConstants",
                                """
                                {
                                    "formatVersion": "1.0",
                                    "name": "DefaultConstants",
                                    "alias": "默认常量样例",
                                    "nodes": [
                                        {
                                            "nodeId": 1,
                                            "nodeType": "Builtin/Constant/Bool",
                                            "layout": { "x": 80, "y": 40 },
                                            "propertyValues": [
                                                {
                                                    "propertyId": 1,
                                                    "value": true
                                                }
                                            ]
                                        },
                                        {
                                            "nodeId": 2,
                                            "nodeType": "Builtin/Constant/Int32",
                                            "layout": { "x": 80, "y": 140 },
                                            "propertyValues": [
                                                {
                                                    "propertyId": 1,
                                                    "value": 3
                                                }
                                            ]
                                        },
                                        {
                                            "nodeId": 3,
                                            "nodeType": "Builtin/Config/ListInt32",
                                            "layout": { "x": 80, "y": 240 },
                                            "propertyValues": [
                                                {
                                                    "propertyId": 1,
                                                    "value": [1, 2, 3]
                                                }
                                            ]
                                        },
                                        {
                                            "nodeId": 4,
                                            "nodeType": "Builtin/Config/DictionaryStringInt32",
                                            "layout": { "x": 80, "y": 360 },
                                            "propertyValues": [
                                                {
                                                    "propertyId": 1,
                                                    "value": {
                                                        "hp": 100,
                                                        "mp": 50
                                                    }
                                                }
                                            ]
                                        },
                                        {
                                            "nodeId": 5,
                                            "nodeType": "Builtin/Control/If",
                                            "layout": { "x": 360, "y": 40 },
                                            "propertyValues": []
                                        },
                                        {
                                            "nodeId": 6,
                                            "nodeType": "Builtin/List/ForEach",
                                            "typeArguments": [
                                                {
                                                    "name": "TElement",
                                                    "type": {
                                                        "kind": "builtin",
                                                        "name": "int32"
                                                    }
                                                }
                                            ],
                                            "layout": { "x": 360, "y": 220 },
                                            "propertyValues": []
                                        },
                                        {
                                            "nodeId": 7,
                                            "nodeType": "Builtin/Dictionary/ForEach",
                                            "typeArguments": [
                                                {
                                                    "name": "TKey",
                                                    "type": {
                                                        "kind": "builtin",
                                                        "name": "string"
                                                    }
                                                },
                                                {
                                                    "name": "TValue",
                                                    "type": {
                                                        "kind": "builtin",
                                                        "name": "int32"
                                                    }
                                                }
                                            ],
                                            "layout": { "x": 360, "y": 360 },
                                            "propertyValues": []
                                        }
                                    ],
                                    "flowConnections": [],
                                    "computeConnections": [
                                        {
                                            "sourceNodeId": 1,
                                            "sourcePortId": 151,
                                            "targetNodeId": 5,
                                            "targetPortId": 101
                                        },
                                        {
                                            "sourceNodeId": 3,
                                            "sourcePortId": 151,
                                            "targetNodeId": 6,
                                            "targetPortId": 101
                                        },
                                        {
                                            "sourceNodeId": 4,
                                            "sourcePortId": 151,
                                            "targetNodeId": 7,
                                            "targetPortId": 101
                                        }
                                    ]
                                }
                                """);

                        var workspace = WithOutputRelativePath(LightyWorkspaceLoader.Load(workspaceRoot), "Generated/Config");
                        var generator = new LightyFlowChartFileCodeGenerator();

                        var package = generator.Generate(workspace, "Quest/DefaultConstants");

                        var flowFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Files/Quest/DefaultConstants/DefaultConstantsFlow.cs");
                        Assert.Contains("using System.Text.Json;", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("computedValue = JsonSerializer.Deserialize<bool>(\"true\")", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("computedValue = JsonSerializer.Deserialize<int>(\"3\")", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("computedValue = JsonSerializer.Deserialize<List<int>>(\"[1, 2, 3]\")", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("computedValue = JsonSerializer.Deserialize<Dictionary<string, int>>(", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("\\\"hp\\\": 100", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("\\\"mp\\\": 50", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("var condition = ResolveComputeInput<bool>(5u, 101u);", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("var list = ResolveComputeInput<List<int>>(6u, 101u);", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("var dictionary = ResolveComputeInput<Dictionary<string, int>>(7u, 101u);", flowFile.Content, StringComparison.Ordinal);
                }
                finally
                {
                        if (Directory.Exists(workspaceRoot))
                        {
                                Directory.Delete(workspaceRoot, recursive: true);
                        }
                }
        }

        [Fact]
        public void GenerateEntryPointFile_ShouldIncludeGeneratedFlowChartsAlongsideWorkbooks()
        {
                var generator = new LightyWorkbookCodeGenerator();

                var content = generator.GenerateEntryPointFile(new[] { "Item" }, new[] { "Quest/Intro", "Combat/Boss/Opening" });

                Assert.Contains("public static ItemWorkbook Item", content, StringComparison.Ordinal);
                Assert.Contains("public static FlowCharts.Files.Quest.Intro.IntroDefinition FlowChartQuestIntro", content, StringComparison.Ordinal);
                Assert.Contains("public static FlowCharts.Files.Combat.Boss.Opening.OpeningDefinition FlowChartCombatBossOpening", content, StringComparison.Ordinal);
                Assert.Contains("_ = FlowChartQuestIntro;", content, StringComparison.Ordinal);
                Assert.Contains("_ = FlowChartCombatBossOpening;", content, StringComparison.Ordinal);
        }

        [Fact]
        public void GeneratedWorkbookAndFlowChartCode_ShouldCompileTogetherWithLddEntryPoint()
        {
                var workspaceRoot = CreateWorkspaceDirectory();

                try
                {
                        LightyWorkspaceScaffolder.Create(workspaceRoot);
                        CreateNodeDefinition(
                                workspaceRoot,
                                "Event/System/Start",
                                """
                                {
                                    "formatVersion": "1.0",
                                    "name": "Start",
                                    "alias": "开始",
                                    "nodeKind": "event",
                                    "properties": [],
                                    "computePorts": [],
                                    "flowPorts": [
                                        {
                                            "portId": 251,
                                            "name": "Then",
                                            "alias": "然后",
                                            "direction": "output"
                                        }
                                    ]
                                }
                                """);
                        CreateFlowChartFile(
                                workspaceRoot,
                                "Quest/Intro",
                                """
                                {
                                    "formatVersion": "1.0",
                                    "name": "Intro",
                                    "alias": "任务开场",
                                    "nodes": [
                                        {
                                            "nodeId": 1,
                                            "nodeType": "Event/System/Start",
                                            "layout": { "x": 80, "y": 80 },
                                            "propertyValues": []
                                        },
                                        {
                                            "nodeId": 2,
                                            "nodeType": "Builtin/Constant/Bool",
                                            "layout": { "x": 80, "y": 220 },
                                            "propertyValues": [
                                                {
                                                    "propertyId": 1,
                                                    "value": true
                                                }
                                            ]
                                        },
                                        {
                                            "nodeId": 3,
                                            "nodeType": "Builtin/Control/WaitUntil",
                                            "layout": { "x": 280, "y": 80 },
                                            "propertyValues": []
                                        },
                                        {
                                            "nodeId": 4,
                                            "nodeType": "Builtin/Control/PauseSeconds",
                                            "layout": { "x": 520, "y": 80 },
                                            "propertyValues": [
                                                {
                                                    "propertyId": 1,
                                                    "value": 1
                                                }
                                            ]
                                        }
                                    ],
                                    "flowConnections": [
                                        {
                                            "sourceNodeId": 1,
                                            "sourcePortId": 251,
                                            "targetNodeId": 3,
                                            "targetPortId": 201
                                        },
                                        {
                                            "sourceNodeId": 3,
                                            "sourcePortId": 251,
                                            "targetNodeId": 4,
                                            "targetPortId": 201
                                        }
                                    ],
                                    "computeConnections": [
                                        {
                                            "sourceNodeId": 2,
                                            "sourcePortId": 151,
                                            "targetNodeId": 3,
                                            "targetPortId": 101
                                        }
                                    ]
                                }
                                """);

                        var workspace = WithOutputRelativePath(LightyWorkspaceLoader.Load(workspaceRoot), "Codegen");
                        var workbookGenerator = new LightyWorkbookCodeGenerator();
                        var workbookPackages = workspace.Workbooks
                                .Select(workbook => (workbook.Name, workbookGenerator.Generate(workspace, workbook)))
                                .ToArray();
                        var flowChartPackage = new LightyFlowChartFileCodeGenerator().Generate(workspace, "Quest/Intro");

                        var generatedOutputPath = GeneratedCodeOutputWriter.WriteGeneratedWorkspacePackages(workspace.RootPath, workbookPackages);
                        GeneratedCodeOutputWriter.WriteGeneratedFlowChartPackage(workspace.RootPath, "Quest/Intro", flowChartPackage);

                        var projectPath = CreateGeneratedCodeCompilationProject(workspaceRoot, generatedOutputPath);
                        var buildResult = BuildGeneratedCodeProject(projectPath);

                        Assert.True(buildResult.ExitCode == 0, buildResult.Output);
                }
                finally
                {
                        if (Directory.Exists(workspaceRoot))
                        {
                                Directory.Delete(workspaceRoot, recursive: true);
                        }
                }
        }

    private static LightyWorkspace WithOutputRelativePath(LightyWorkspace workspace, string outputRelativePath)
    {
        return new LightyWorkspace(
            workspace.RootPath,
            workspace.ConfigFilePath,
            workspace.HeadersFilePath,
            workspace.HeaderLayout,
            workspace.Workbooks,
            new LightyWorkbookCodegenOptions(outputRelativePath),
            workspace.CodegenConfigFilePath,
            workspace.FlowChartNodeDefinitions,
            workspace.FlowChartFiles);
    }

    private static string CreateWorkspaceDirectory()
    {
        return Path.Combine(Path.GetTempPath(), $"LightyDesign.FlowChartCodeGenerationTests.{Guid.NewGuid():N}");
    }

    private static void CreateNodeDefinition(string workspaceRoot, string relativePath, string json)
    {
        var filePath = LightyWorkspacePathLayout.GetFlowChartNodeDefinitionFilePath(workspaceRoot, relativePath);
        Directory.CreateDirectory(Path.GetDirectoryName(filePath)!);
        File.WriteAllText(filePath, json);
    }

    private static void CreateFlowChartFile(string workspaceRoot, string relativePath, string json)
    {
        var filePath = LightyWorkspacePathLayout.GetFlowChartFilePath(workspaceRoot, relativePath);
        Directory.CreateDirectory(Path.GetDirectoryName(filePath)!);
        File.WriteAllText(filePath, json);
    }

    private static string CreateGeneratedCodeCompilationProject(string workspaceRoot, string generatedOutputPath)
    {
        var projectDirectory = Path.Combine(workspaceRoot, "GeneratedCodeCompile");
        Directory.CreateDirectory(projectDirectory);

        var generatedIncludePath = Path.GetRelativePath(projectDirectory, generatedOutputPath)
            .Replace('\\', '/');
        var projectPath = Path.Combine(projectDirectory, "GeneratedCodeCompile.csproj");
        File.WriteAllText(
            projectPath,
            $"""
            <Project Sdk="Microsoft.NET.Sdk">
              <PropertyGroup>
                <TargetFramework>net9.0</TargetFramework>
                <OutputType>Library</OutputType>
                <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
                <ImplicitUsings>enable</ImplicitUsings>
                <Nullable>disable</Nullable>
              </PropertyGroup>

              <ItemGroup>
                <Compile Include="{generatedIncludePath}/**/*.cs" />
              </ItemGroup>
            </Project>
            """);

        return projectPath;
    }

    private static BuildResult BuildGeneratedCodeProject(string projectPath)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = "dotnet",
            Arguments = $"build \"{projectPath}\" --nologo",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = Path.GetDirectoryName(projectPath)!,
        };

        using var process = Process.Start(startInfo);
        Assert.NotNull(process);

        var standardOutput = process.StandardOutput.ReadToEnd();
        var standardError = process.StandardError.ReadToEnd();
        process.WaitForExit();

        return new BuildResult(process.ExitCode, standardOutput + Environment.NewLine + standardError);
    }

    private sealed record BuildResult(int ExitCode, string Output);
}