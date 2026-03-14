using System.Text.Json;
using LightyDesign.Core;
using LightyDesign.Generator;

namespace LightyDesign.Tests;

public class CodeGenerationTests
{
    [Fact]
    public void WorkbookCodeGenerator_ShouldGenerateSheetWorkbookAndEntryFiles()
    {
        var workspace = CreateWorkspace(new LightyWorkbookCodegenOptions("Generated/Config"));
        var workbook = Assert.Single(workspace.Workbooks);
        var generator = new LightyWorkbookCodeGenerator();

        var package = generator.Generate(workspace, workbook);

        Assert.Equal("Generated/Config", package.OutputRelativePath);
        Assert.Contains(package.Files, file => file.RelativePath == "DesignDataReference.cs");
        Assert.Contains(package.Files, file => file.RelativePath == "Item/Consumable.cs");
        Assert.Contains(package.Files, file => file.RelativePath == "Item/Stage.cs");
        Assert.Contains(package.Files, file => file.RelativePath == "Item/Item.cs");
        Assert.Contains(package.Files, file => file.RelativePath == "LDD.cs");

        var consumableFile = Assert.Single(package.Files, file => file.RelativePath == "Item/Consumable.cs");
        Assert.Contains("namespace LightyDesignData;", consumableFile.Content, StringComparison.Ordinal);
        Assert.Contains("public ConsumableRow this[int id]", consumableFile.Content, StringComparison.Ordinal);
        Assert.Contains("Name = \"Potion\"", consumableFile.Content, StringComparison.Ordinal);

        var stageFile = Assert.Single(package.Files, file => file.RelativePath == "Item/Stage.cs");
        Assert.Contains("public StageByID1Index this[int id1]", stageFile.Content, StringComparison.Ordinal);
        Assert.Contains("public StageRow this[int id2]", stageFile.Content, StringComparison.Ordinal);

        var entryFile = Assert.Single(package.Files, file => file.RelativePath == "LDD.cs");
        Assert.Contains("namespace LightyDesignData;", entryFile.Content, StringComparison.Ordinal);
        Assert.Contains("public static ItemWorkbook Item", entryFile.Content, StringComparison.Ordinal);
    }

    [Fact]
    public void WorkbookCodeGenerator_ShouldRequireOutputRelativePath()
    {
        var workspace = CreateWorkspace(new LightyWorkbookCodegenOptions());
        var workbook = Assert.Single(workspace.Workbooks);
        var generator = new LightyWorkbookCodeGenerator();

        var exception = Assert.Throws<LightyCoreException>(() => generator.Generate(workspace, workbook));

        Assert.Contains("does not define a code generation output path", exception.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void GenerateEntryPointFile_ShouldIncludeAllGeneratedWorkbooks()
    {
        var generator = new LightyWorkbookCodeGenerator();

        var content = generator.GenerateEntryPointFile(new[] { "Monster", "Item", "Monster" });

        Assert.Contains("public static ItemWorkbook Item", content, StringComparison.Ordinal);
        Assert.Contains("public static MonsterWorkbook Monster", content, StringComparison.Ordinal);
        Assert.Contains("_ = Item;", content, StringComparison.Ordinal);
        Assert.Contains("_ = Monster;", content, StringComparison.Ordinal);
        Assert.DoesNotContain("public static MonsterWorkbook Monster { get; } = MonsterWorkbook.Create();\npublic static MonsterWorkbook Monster", content, StringComparison.Ordinal);
    }

    [Fact]
    public void WorkbookCodeGenerator_ShouldGroupClientAndServerScopedMembersWithPreprocessorDirectives()
    {
        var workspace = CreateWorkspaceWithScopedColumns(new LightyWorkbookCodegenOptions("Generated/Config"));
        var workbook = Assert.Single(workspace.Workbooks);
        var generator = new LightyWorkbookCodeGenerator();

        var package = generator.Generate(workspace, workbook);
        var sheetFile = Assert.Single(package.Files, file => file.RelativePath == "Config/FeatureFlag.cs");
        var normalizedContent = NormalizeNewlines(sheetFile.Content);

        Assert.Contains("namespace LightyDesignData;", sheetFile.Content, StringComparison.Ordinal);
        Assert.Contains("public required int ID { get; init; }", sheetFile.Content, StringComparison.Ordinal);
        Assert.Contains("public required string SharedName { get; init; }", sheetFile.Content, StringComparison.Ordinal);
        Assert.Contains("#if LDD_Client", normalizedContent, StringComparison.Ordinal);
        Assert.Contains("public required string ClientOnlyName { get; init; }", normalizedContent, StringComparison.Ordinal);
        Assert.Contains("#if LDD_Server", normalizedContent, StringComparison.Ordinal);
        Assert.Contains("public required string ServerOnlyNote { get; init; }", normalizedContent, StringComparison.Ordinal);
        Assert.Contains("new()", normalizedContent, StringComparison.Ordinal);
        Assert.Contains("ID = 1,", normalizedContent, StringComparison.Ordinal);
        Assert.Contains("SharedName = \"Shared\",", normalizedContent, StringComparison.Ordinal);
        Assert.Contains("ClientOnlyName = \"Client\",", normalizedContent, StringComparison.Ordinal);
        Assert.Contains("ServerOnlyNote = \"Server\",", normalizedContent, StringComparison.Ordinal);
    }

    [Fact]
    public void WorkbookCodeGenerator_ShouldGenerateReferenceLiteralsForSingleCompositeAndListReferences()
    {
        var workspace = CreateWorkspaceWithReferenceColumns(new LightyWorkbookCodegenOptions("Generated/Config"));
        var workbook = Assert.Single(workspace.Workbooks.Where(candidate => candidate.Name == "Config"));
        var generator = new LightyWorkbookCodeGenerator();

        var package = generator.Generate(workspace, workbook);
        var supportFile = Assert.Single(package.Files, file => file.RelativePath == "DesignDataReference.cs");
        var sheetFile = Assert.Single(package.Files, file => file.RelativePath == "Config/FeatureLink.cs");

        Assert.Contains("public sealed class DesignDataReference<TTarget>", supportFile.Content, StringComparison.Ordinal);
        Assert.Contains("public TTarget GetValue() => _resolver(_identifiers);", supportFile.Content, StringComparison.Ordinal);
        Assert.Contains("public required DesignDataReference<ConsumableRow> PrimaryItem { get; init; }", sheetFile.Content, StringComparison.Ordinal);
        Assert.Contains("public required DesignDataReference<StageRow> TargetStage { get; init; }", sheetFile.Content, StringComparison.Ordinal);
        Assert.Contains("public required IReadOnlyList<DesignDataReference<StageRow>> StageHistory { get; init; }", sheetFile.Content, StringComparison.Ordinal);
        Assert.Contains("new DesignDataReference<ConsumableRow>(\"Item\", \"Consumable\", static identifiers => LDD.Item.Consumable[DesignDataReferenceHelper.ParseInt32(identifiers[0])], \"1001\")", sheetFile.Content, StringComparison.Ordinal);
        Assert.Contains("new DesignDataReference<StageRow>(\"Item\", \"Stage\", static identifiers => LDD.Item.Stage[DesignDataReferenceHelper.ParseInt32(identifiers[0])][DesignDataReferenceHelper.ParseInt32(identifiers[1])], \"1\", \"10\")", sheetFile.Content, StringComparison.Ordinal);
        Assert.Contains("new List<DesignDataReference<StageRow>>", sheetFile.Content, StringComparison.Ordinal);
    }

    private static LightyWorkspace CreateWorkspace(LightyWorkbookCodegenOptions codegenOptions)
    {
        var workbookDirectory = @"D:\Workspace\Item";
        var workbook = new LightyWorkbook(
            "Item",
            workbookDirectory,
            new[]
            {
                new LightySheet(
                    "Consumable",
                    Path.Combine(workbookDirectory, "Consumable.txt"),
                    Path.Combine(workbookDirectory, "Consumable_header.json"),
                    new LightySheetHeader(new[]
                    {
                        new ColumnDefine("ID", "int", "编号", CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                        new ColumnDefine("Name", "string", "名称", CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                        new ColumnDefine("Annotation", "string", "注释", CreateAttributes(LightyHeaderTypes.ExportScope, "None")),
                    }),
                    new[]
                    {
                        new LightySheetRow(0, new[] { "1001", "Potion", "note" }),
                        new LightySheetRow(1, new[] { "1002", "Ether", "note" }),
                    }),
                new LightySheet(
                    "Stage",
                    Path.Combine(workbookDirectory, "Stage.txt"),
                    Path.Combine(workbookDirectory, "Stage_header.json"),
                    new LightySheetHeader(new[]
                    {
                        new ColumnDefine("ID1", "int", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                        new ColumnDefine("ID2", "int", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                        new ColumnDefine("Value", "string", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                    }),
                    new[]
                    {
                        new LightySheetRow(0, new[] { "1", "10", "Alpha" }),
                        new LightySheetRow(1, new[] { "1", "11", "Beta" }),
                    }),
            },
            codegenOptions,
            Path.Combine(workbookDirectory, LightyWorkbookCodegenOptionsSerializer.DefaultFileName));

        return new LightyWorkspace(
            @"D:\Workspace",
            @"D:\Workspace\config.json",
            @"D:\Workspace\headers.json",
            WorkspaceHeaderLayout.CreateDefault(),
            new[] { workbook });
    }

    private static LightyWorkspace CreateWorkspaceWithScopedColumns(LightyWorkbookCodegenOptions codegenOptions)
    {
        var workbookDirectory = @"D:\Workspace\Config";
        var workbook = new LightyWorkbook(
            "Config",
            workbookDirectory,
            new[]
            {
                new LightySheet(
                    "FeatureFlag",
                    Path.Combine(workbookDirectory, "FeatureFlag.txt"),
                    Path.Combine(workbookDirectory, "FeatureFlag_header.json"),
                    new LightySheetHeader(new[]
                    {
                        new ColumnDefine("ID", "int", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                        new ColumnDefine("SharedName", "string", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                        new ColumnDefine("ClientOnlyName", "string", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "Client")),
                        new ColumnDefine("ServerOnlyNote", "string", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "Server")),
                    }),
                    new[]
                    {
                        new LightySheetRow(0, new[] { "1", "Shared", "Client", "Server" }),
                    }),
            },
            codegenOptions,
            Path.Combine(workbookDirectory, LightyWorkbookCodegenOptionsSerializer.DefaultFileName));

        return new LightyWorkspace(
            @"D:\Workspace",
            @"D:\Workspace\config.json",
            @"D:\Workspace\headers.json",
            WorkspaceHeaderLayout.CreateDefault(),
            new[] { workbook });
    }

    private static LightyWorkspace CreateWorkspaceWithReferenceColumns(LightyWorkbookCodegenOptions codegenOptions)
    {
        var itemWorkbookDirectory = @"D:\Workspace\Item";
        var configWorkbookDirectory = @"D:\Workspace\Config";

        var itemWorkbook = new LightyWorkbook(
            "Item",
            itemWorkbookDirectory,
            new[]
            {
                new LightySheet(
                    "Consumable",
                    Path.Combine(itemWorkbookDirectory, "Consumable.txt"),
                    Path.Combine(itemWorkbookDirectory, "Consumable_header.json"),
                    new LightySheetHeader(new[]
                    {
                        new ColumnDefine("ID", "int", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                        new ColumnDefine("Name", "string", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                    }),
                    new[]
                    {
                        new LightySheetRow(0, new[] { "1001", "Potion" }),
                    }),
                new LightySheet(
                    "Stage",
                    Path.Combine(itemWorkbookDirectory, "Stage.txt"),
                    Path.Combine(itemWorkbookDirectory, "Stage_header.json"),
                    new LightySheetHeader(new[]
                    {
                        new ColumnDefine("ID1", "int", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                        new ColumnDefine("ID2", "int", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                        new ColumnDefine("Value", "string", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                    }),
                    new[]
                    {
                        new LightySheetRow(0, new[] { "1", "10", "Alpha" }),
                        new LightySheetRow(1, new[] { "1", "11", "Beta" }),
                    }),
            },
            new LightyWorkbookCodegenOptions("Generated/Config"),
            Path.Combine(itemWorkbookDirectory, LightyWorkbookCodegenOptionsSerializer.DefaultFileName));

        var configWorkbook = new LightyWorkbook(
            "Config",
            configWorkbookDirectory,
            new[]
            {
                new LightySheet(
                    "FeatureLink",
                    Path.Combine(configWorkbookDirectory, "FeatureLink.txt"),
                    Path.Combine(configWorkbookDirectory, "FeatureLink_header.json"),
                    new LightySheetHeader(new[]
                    {
                        new ColumnDefine("ID", "int", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                        new ColumnDefine("PrimaryItem", "Ref:Item.Consumable", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                        new ColumnDefine("TargetStage", "Ref:Item.Stage", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                        new ColumnDefine("StageHistory", "List<Ref:Item.Stage>", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                    }),
                    new[]
                    {
                        new LightySheetRow(0, new[] { "1", "[[1001]]", "[[1,10]]", "[[1,10]], [[1,11]]" }),
                    }),
            },
            codegenOptions,
            Path.Combine(configWorkbookDirectory, LightyWorkbookCodegenOptionsSerializer.DefaultFileName));

        return new LightyWorkspace(
            @"D:\Workspace",
            @"D:\Workspace\config.json",
            @"D:\Workspace\headers.json",
            WorkspaceHeaderLayout.CreateDefault(),
            new[] { itemWorkbook, configWorkbook });
    }

    private static IReadOnlyDictionary<string, JsonElement> CreateAttributes(string key, string value)
    {
        return new Dictionary<string, JsonElement>
        {
            [key] = JsonSerializer.SerializeToElement(value),
        };
    }

    private static string NormalizeNewlines(string value)
    {
        return value.Replace("\r\n", "\n", StringComparison.Ordinal);
    }
}