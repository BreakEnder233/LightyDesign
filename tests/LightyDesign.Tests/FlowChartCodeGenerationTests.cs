using LightyDesign.Core;
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

            var dictionaryDocument = Assert.Single(
                workspace.FlowChartNodeDefinitions,
                document => document.RelativePath == "Builtin/Dictionary/Set");
            var dictionaryNode = LightyFlowChartNodeDefinitionParser.Parse(dictionaryDocument);
            Assert.Equal(LightyFlowChartNodeKind.Flow, dictionaryNode.NodeKind);
            Assert.Equal("Dictionary.Set", dictionaryNode.CodegenBinding!.Operation);
            Assert.Equal(LightyFlowChartCodegenResolutionMode.Generic, dictionaryNode.CodegenBinding.ResolutionMode);
            Assert.Equal(new[] { "TKey", "TValue" }, dictionaryNode.TypeParameters.Select(parameter => parameter.Name).ToArray());

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
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Comparison/EqualNode.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/List/AddNode.cs");
            Assert.Contains(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Dictionary/SetNode.cs");

            var helperFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/FlowChartStandardNodeBindingHelper.cs");
            Assert.Contains("public static partial class FlowChartStandardNodeBindingHelper", helperFile.Content, StringComparison.Ordinal);
            Assert.Contains("public static List<TElement> ListAdd<TElement>(List<TElement> list, TElement item)", helperFile.Content, StringComparison.Ordinal);
            Assert.Contains("public static Dictionary<TKey, TValue> DictionarySet<TKey, TValue>(Dictionary<TKey, TValue> dictionary, TKey key, TValue value)", helperFile.Content, StringComparison.Ordinal);
            Assert.Contains("public static int ArithmeticAdd(int left, int right)", helperFile.Content, StringComparison.Ordinal);
            Assert.Contains("public static bool ComparisonEqual(string left, string right)", helperFile.Content, StringComparison.Ordinal);

            var arithmeticFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Arithmetic/AddNode.cs");
            Assert.Contains("namespace LightyDesignData.FlowCharts.Nodes.Builtin.Arithmetic", arithmeticFile.Content, StringComparison.Ordinal);
            Assert.Contains("public partial class AddNode", arithmeticFile.Content, StringComparison.Ordinal);
            Assert.Contains("public int Evaluate(int left, int right)", arithmeticFile.Content, StringComparison.Ordinal);
            Assert.Contains("public double Evaluate(double left, double right)", arithmeticFile.Content, StringComparison.Ordinal);
            Assert.Contains("FlowChartStandardNodeBindingHelper.ArithmeticAdd(left, right)", arithmeticFile.Content, StringComparison.Ordinal);

            var comparisonFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Comparison/EqualNode.cs");
            Assert.Contains("namespace LightyDesignData.FlowCharts.Nodes.Builtin.Comparison", comparisonFile.Content, StringComparison.Ordinal);
            Assert.Contains("public partial class EqualNode", comparisonFile.Content, StringComparison.Ordinal);
            Assert.Contains("public bool Evaluate(bool left, bool right)", comparisonFile.Content, StringComparison.Ordinal);
            Assert.Contains("public bool Evaluate(string left, string right)", comparisonFile.Content, StringComparison.Ordinal);
            Assert.Contains("FlowChartStandardNodeBindingHelper.ComparisonEqual(left, right)", comparisonFile.Content, StringComparison.Ordinal);

            var listFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/List/AddNode.cs");
            Assert.Contains("namespace LightyDesignData.FlowCharts.Nodes.Builtin.List", listFile.Content, StringComparison.Ordinal);
            Assert.Contains("public partial class AddNode<TElement>", listFile.Content, StringComparison.Ordinal);
            Assert.Contains("public List<TElement> Execute(List<TElement> list, TElement item)", listFile.Content, StringComparison.Ordinal);
            Assert.Contains("FlowChartStandardNodeBindingHelper.ListAdd(list, item)", listFile.Content, StringComparison.Ordinal);

            var dictionaryFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Nodes/Builtin/Dictionary/SetNode.cs");
            Assert.Contains("namespace LightyDesignData.FlowCharts.Nodes.Builtin.Dictionary", dictionaryFile.Content, StringComparison.Ordinal);
            Assert.Contains("public partial class SetNode<TKey, TValue>", dictionaryFile.Content, StringComparison.Ordinal);
            Assert.Contains("public Dictionary<TKey, TValue> Execute(Dictionary<TKey, TValue> dictionary, TKey key, TValue value)", dictionaryFile.Content, StringComparison.Ordinal);
            Assert.Contains("FlowChartStandardNodeBindingHelper.DictionarySet(dictionary, key, value)", dictionaryFile.Content, StringComparison.Ordinal);
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
}