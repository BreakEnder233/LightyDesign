using System.Text.Json;
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

                        var definitionFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Files/Quest/Intro/IntroDefinition.cs");
                        Assert.Contains("namespace LightyDesignData.FlowCharts.Files.Quest.Intro", definitionFile.Content, StringComparison.Ordinal);
                        Assert.Contains("public sealed partial class IntroDefinition", definitionFile.Content, StringComparison.Ordinal);
                        Assert.Contains("private static readonly LightyDesignData.FlowCharts.Nodes.Builtin.Arithmetic.AddNode Node3 = new LightyDesignData.FlowCharts.Nodes.Builtin.Arithmetic.AddNode();", definitionFile.Content, StringComparison.Ordinal);
                        Assert.Contains("private static readonly LightyDesignData.FlowCharts.Nodes.Builtin.List.AddNode<int> Node4 = new LightyDesignData.FlowCharts.Nodes.Builtin.List.AddNode<int>();", definitionFile.Content, StringComparison.Ordinal);
                        Assert.Contains("private static readonly LightyDesignData.FlowCharts.Nodes.Builtin.Dictionary.SetNode<string, int> Node5 = new LightyDesignData.FlowCharts.Nodes.Builtin.Dictionary.SetNode<string, int>();", definitionFile.Content, StringComparison.Ordinal);
                        Assert.Contains("public IntroFlow<TContext> CreateFlow<TContext>(TContext context)", definitionFile.Content, StringComparison.Ordinal);

                        var flowFile = Assert.Single(package.Files, file => file.RelativePath == "FlowCharts/Files/Quest/Intro/IntroFlow.cs");
                        Assert.Contains("public sealed partial class IntroFlow<TContext>", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("public void StepOnce()", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("public void RunToCompletion()", flowFile.Content, StringComparison.Ordinal);
                        Assert.Contains("throw new NotSupportedException", flowFile.Content, StringComparison.Ordinal);
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
}