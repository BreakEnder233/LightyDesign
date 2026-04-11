using System.Text.Json;
using LightyDesign.Core;
using LightyDesign.Generator;

namespace LightyDesign.Tests;

public class CodeGenerationTests
{
    [Fact]
    public void WorkbookCodeGenerator_ShouldGenerateSheetWorkbookAndSupportFiles()
    {
        var workspace = CreateWorkspace(new LightyWorkbookCodegenOptions("Generated/Config"));
        var workbook = Assert.Single(workspace.Workbooks);
        var generator = new LightyWorkbookCodeGenerator();

        var package = generator.Generate(workspace, workbook);

        Assert.Equal("Generated/Config", package.OutputRelativePath);
        Assert.Contains(package.Files, file => file.RelativePath == "DesignDataReference.cs");
        Assert.Contains(package.Files, file => file.RelativePath == "Item/ConsumableRow.cs");
        Assert.Contains(package.Files, file => file.RelativePath == "Item/ConsumableTable.cs");
        Assert.Contains(package.Files, file => file.RelativePath == "Item/StageRow.cs");
        Assert.Contains(package.Files, file => file.RelativePath == "Item/StageTable.cs");
        Assert.Contains(package.Files, file => file.RelativePath == "Item/StageByID1Index.cs");
        Assert.Contains(package.Files, file => file.RelativePath == "Item/ItemWorkbook.cs");
        Assert.DoesNotContain(package.Files, file => file.RelativePath == "LDD.cs");

        var consumableRowFile = Assert.Single(package.Files, file => file.RelativePath == "Item/ConsumableRow.cs");
        Assert.Contains("namespace LightyDesignData", consumableRowFile.Content, StringComparison.Ordinal);
        Assert.Contains("public sealed partial class ConsumableRow", consumableRowFile.Content, StringComparison.Ordinal);
        Assert.Contains("public int ID { get; set; }", consumableRowFile.Content, StringComparison.Ordinal);
        Assert.Contains("public string Name { get; set; }", consumableRowFile.Content, StringComparison.Ordinal);

        var consumableTableFile = Assert.Single(package.Files, file => file.RelativePath == "Item/ConsumableTable.cs");
        Assert.Contains("public sealed partial class ConsumableTable", consumableTableFile.Content, StringComparison.Ordinal);
        Assert.Contains("public ConsumableRow this[int id]", consumableTableFile.Content, StringComparison.Ordinal);
        Assert.Contains("Name = \"Potion\"", consumableTableFile.Content, StringComparison.Ordinal);

        var stageTableFile = Assert.Single(package.Files, file => file.RelativePath == "Item/StageTable.cs");
        Assert.Contains("public StageByID1Index this[int id1]", stageTableFile.Content, StringComparison.Ordinal);

        var stageIndexFile = Assert.Single(package.Files, file => file.RelativePath == "Item/StageByID1Index.cs");
        Assert.Contains("public sealed partial class StageByID1Index", stageIndexFile.Content, StringComparison.Ordinal);
        Assert.Contains("public StageRow this[int id2]", stageIndexFile.Content, StringComparison.Ordinal);

        var workbookFile = Assert.Single(package.Files, file => file.RelativePath == "Item/ItemWorkbook.cs");
        Assert.Contains("public sealed partial class ItemWorkbook", workbookFile.Content, StringComparison.Ordinal);
    }

    [Fact]
    public void WorkbookCodeGenerator_ShouldPlaceWorkbookAndSameNamedSheetTypesInDistinctFiles()
    {
        var workspace = CreateWorkspaceWithSameNamedSheet(new LightyWorkbookCodegenOptions("Generated/Config"));
        var workbook = Assert.Single(workspace.Workbooks);
        var generator = new LightyWorkbookCodeGenerator();

        var package = generator.Generate(workspace, workbook);
        var relativePaths = package.Files.Select(file => file.RelativePath).ToList();

        Assert.Contains("Item/ItemRow.cs", relativePaths);
        Assert.Contains("Item/ItemTable.cs", relativePaths);
        Assert.Contains("Item/ItemWorkbook.cs", relativePaths);
        Assert.Equal(relativePaths.Count, relativePaths.Distinct(StringComparer.OrdinalIgnoreCase).Count());

        var tableFile = Assert.Single(package.Files, file => file.RelativePath == "Item/ItemTable.cs");
        var workbookFile = Assert.Single(package.Files, file => file.RelativePath == "Item/ItemWorkbook.cs");

        Assert.Contains("public sealed partial class ItemTable", tableFile.Content, StringComparison.Ordinal);
        Assert.Contains("public ItemTable Item { get; }", workbookFile.Content, StringComparison.Ordinal);
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
        var rowFile = Assert.Single(package.Files, file => file.RelativePath == "Config/FeatureFlagRow.cs");
        var tableFile = Assert.Single(package.Files, file => file.RelativePath == "Config/FeatureFlagTable.cs");
        var normalizedRowContent = NormalizeNewlines(rowFile.Content);
        var normalizedTableContent = NormalizeNewlines(tableFile.Content);

        Assert.Contains("namespace LightyDesignData", rowFile.Content, StringComparison.Ordinal);
        Assert.Contains("public int ID { get; set; }", rowFile.Content, StringComparison.Ordinal);
        Assert.Contains("public string SharedName { get; set; }", rowFile.Content, StringComparison.Ordinal);
        Assert.Contains("#if LDD_Client", normalizedRowContent, StringComparison.Ordinal);
        Assert.Contains("public string ClientOnlyName { get; set; }", normalizedRowContent, StringComparison.Ordinal);
        Assert.Contains("#if LDD_Server", normalizedRowContent, StringComparison.Ordinal);
        Assert.Contains("public string ServerOnlyNote { get; set; }", normalizedRowContent, StringComparison.Ordinal);
        Assert.Contains("new FeatureFlagRow()", normalizedTableContent, StringComparison.Ordinal);
        Assert.Contains("ID = 1,", normalizedTableContent, StringComparison.Ordinal);
        Assert.Contains("SharedName = \"Shared\",", normalizedTableContent, StringComparison.Ordinal);
        Assert.Contains("ClientOnlyName = \"Client\",", normalizedTableContent, StringComparison.Ordinal);
        Assert.Contains("ServerOnlyNote = \"Server\",", normalizedTableContent, StringComparison.Ordinal);
    }

    [Fact]
    public void WorkbookCodeGenerator_ShouldGenerateReferenceLiteralsForSingleCompositeAndListReferences()
    {
        var workspace = CreateWorkspaceWithReferenceColumns(new LightyWorkbookCodegenOptions("Generated/Config"));
        var workbook = Assert.Single(workspace.Workbooks, candidate => candidate.Name == "Config");
        var generator = new LightyWorkbookCodeGenerator();

        var package = generator.Generate(workspace, workbook);
        var supportFile = Assert.Single(package.Files, file => file.RelativePath == "DesignDataReference.cs");
        var rowFile = Assert.Single(package.Files, file => file.RelativePath == "Config/FeatureLinkRow.cs");
        var tableFile = Assert.Single(package.Files, file => file.RelativePath == "Config/FeatureLinkTable.cs");

        Assert.Contains("public sealed partial class DesignDataReference<TTarget>", supportFile.Content, StringComparison.Ordinal);
        Assert.Contains("public TTarget GetValue() => _resolver(_identifiers);", supportFile.Content, StringComparison.Ordinal);
        Assert.Contains("internal static partial class DesignDataReferenceHelper", supportFile.Content, StringComparison.Ordinal);
        Assert.DoesNotContain("ThrowIfNullOrWhiteSpace", supportFile.Content, StringComparison.Ordinal);
        Assert.DoesNotContain("ThrowIfNull(", supportFile.Content, StringComparison.Ordinal);
        Assert.Contains("if (string.IsNullOrWhiteSpace(workbookName))", supportFile.Content, StringComparison.Ordinal);
        Assert.Contains("throw new ArgumentNullException(nameof(resolver));", supportFile.Content, StringComparison.Ordinal);
        Assert.Contains("public DesignDataReference<ConsumableRow> PrimaryItem { get; set; }", rowFile.Content, StringComparison.Ordinal);
        Assert.Contains("public DesignDataReference<StageRow> TargetStage { get; set; }", rowFile.Content, StringComparison.Ordinal);
        Assert.Contains("public IReadOnlyList<DesignDataReference<StageRow>> StageHistory { get; set; }", rowFile.Content, StringComparison.Ordinal);
        Assert.Contains("new DesignDataReference<ConsumableRow>(\"Item\", \"Consumable\", identifiers => LDD.Item.Consumable[DesignDataReferenceHelper.ParseInt32(identifiers[0])], \"1001\")", tableFile.Content, StringComparison.Ordinal);
        Assert.Contains("new DesignDataReference<StageRow>(\"Item\", \"Stage\", identifiers => LDD.Item.Stage[DesignDataReferenceHelper.ParseInt32(identifiers[0])][DesignDataReferenceHelper.ParseInt32(identifiers[1])], \"1\", \"10\")", tableFile.Content, StringComparison.Ordinal);
        Assert.Contains("new List<DesignDataReference<StageRow>>", tableFile.Content, StringComparison.Ordinal);
    }

    [Fact]
    public void WorkbookCodeGenerator_ShouldSplitLargeSheetInitializationIntoChunkFiles()
    {
        var workspace = CreateWorkspaceWithLargeSheet(new LightyWorkbookCodegenOptions("Generated/Config"));
        var workbook = Assert.Single(workspace.Workbooks);
        var generator = new LightyWorkbookCodeGenerator();

        var package = generator.Generate(workspace, workbook);

        Assert.Contains(package.Files, file => file.RelativePath == "Massive/LargeSheetRow.cs");
        Assert.Contains(package.Files, file => file.RelativePath == "Massive/LargeSheetTable.cs");
        Assert.Contains(package.Files, file => file.RelativePath == "Massive/LargeSheetTableData1.cs");
        Assert.Contains(package.Files, file => file.RelativePath == "Massive/LargeSheetTableData2.cs");

        var mainFile = Assert.Single(package.Files, file => file.RelativePath == "Massive/LargeSheetTable.cs");
        var chunkFile = Assert.Single(package.Files, file => file.RelativePath == "Massive/LargeSheetTableData1.cs");

        Assert.Contains("public sealed partial class LargeSheetTable", mainFile.Content, StringComparison.Ordinal);
        Assert.Contains("LargeSheetTableData1.Append(rows);", mainFile.Content, StringComparison.Ordinal);
        Assert.Contains("LargeSheetTableData2.Append(rows);", mainFile.Content, StringComparison.Ordinal);
        Assert.Contains("internal static class LargeSheetTableData1", chunkFile.Content, StringComparison.Ordinal);
        Assert.Contains("internal static void Append(List<LargeSheetRow> rows)", chunkFile.Content, StringComparison.Ordinal);
        Assert.Contains("rows.Add(new LargeSheetRow()", chunkFile.Content, StringComparison.Ordinal);
    }

    [Fact]
    public void WorkbookCodeGenerator_ShouldUseFirstExportedColumnAsKeyWhenIdColumnsAreMissing()
    {
        var workspace = CreateWorkspaceWithoutIdColumns(new LightyWorkbookCodegenOptions("Generated/Text"));
        var workbook = Assert.Single(workspace.Workbooks);
        var generator = new LightyWorkbookCodeGenerator();

        var package = generator.Generate(workspace, workbook);
        var rowFile = Assert.Single(package.Files, file => file.RelativePath == "Text/LocalizationRow.cs");
        var tableFile = Assert.Single(package.Files, file => file.RelativePath == "Text/LocalizationTable.cs");

        Assert.Contains("public string Key { get; set; }", rowFile.Content, StringComparison.Ordinal);
        Assert.Contains("private readonly IReadOnlyDictionary<string, LocalizationRow> _byKey;", tableFile.Content, StringComparison.Ordinal);
        Assert.Contains("_byKey = rows.ToDictionary(row => row.Key);", tableFile.Content, StringComparison.Ordinal);
        Assert.Contains("public LocalizationRow this[string key] => _byKey[key];", tableFile.Content, StringComparison.Ordinal);
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
            new[] { workbook },
            codegenOptions,
            Path.Combine(@"D:\Workspace", LightyWorkbookCodegenOptionsSerializer.DefaultFileName));
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
            new[] { workbook },
            codegenOptions,
            Path.Combine(@"D:\Workspace", LightyWorkbookCodegenOptionsSerializer.DefaultFileName));
    }

    private static LightyWorkspace CreateWorkspaceWithSameNamedSheet(LightyWorkbookCodegenOptions codegenOptions)
    {
        var workbookDirectory = @"D:\Workspace\Item";
        var workbook = new LightyWorkbook(
            "Item",
            workbookDirectory,
            new[]
            {
                new LightySheet(
                    "Item",
                    Path.Combine(workbookDirectory, "Item.txt"),
                    Path.Combine(workbookDirectory, "Item_header.json"),
                    new LightySheetHeader(new[]
                    {
                        new ColumnDefine("ID", "int", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                        new ColumnDefine("Name", "string", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                    }),
                    new[]
                    {
                        new LightySheetRow(0, new[] { "1", "Potion" }),
                    }),
            },
            codegenOptions,
            Path.Combine(workbookDirectory, LightyWorkbookCodegenOptionsSerializer.DefaultFileName));

        return new LightyWorkspace(
            @"D:\Workspace",
            @"D:\Workspace\config.json",
            @"D:\Workspace\headers.json",
            WorkspaceHeaderLayout.CreateDefault(),
            new[] { workbook },
            codegenOptions,
            Path.Combine(@"D:\Workspace", LightyWorkbookCodegenOptionsSerializer.DefaultFileName));
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
            new[] { itemWorkbook, configWorkbook },
            codegenOptions,
            Path.Combine(@"D:\Workspace", LightyWorkbookCodegenOptionsSerializer.DefaultFileName));
    }

    private static LightyWorkspace CreateWorkspaceWithLargeSheet(LightyWorkbookCodegenOptions codegenOptions)
    {
        var workbookDirectory = @"D:\Workspace\Massive";
        var rows = Enumerable.Range(1, 501)
            .Select(index => new LightySheetRow(index - 1, new[] { index.ToString(), $"Row{index}" }))
            .ToArray();

        var workbook = new LightyWorkbook(
            "Massive",
            workbookDirectory,
            new[]
            {
                new LightySheet(
                    "LargeSheet",
                    Path.Combine(workbookDirectory, "LargeSheet.txt"),
                    Path.Combine(workbookDirectory, "LargeSheet_header.json"),
                    new LightySheetHeader(new[]
                    {
                        new ColumnDefine("ID", "int", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                        new ColumnDefine("Name", "string", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                    }),
                    rows),
            },
            codegenOptions,
            Path.Combine(workbookDirectory, LightyWorkbookCodegenOptionsSerializer.DefaultFileName));

        return new LightyWorkspace(
            @"D:\Workspace",
            @"D:\Workspace\config.json",
            @"D:\Workspace\headers.json",
            WorkspaceHeaderLayout.CreateDefault(),
            new[] { workbook },
            codegenOptions,
            Path.Combine(@"D:\Workspace", LightyWorkbookCodegenOptionsSerializer.DefaultFileName));
    }

    private static LightyWorkspace CreateWorkspaceWithoutIdColumns(LightyWorkbookCodegenOptions codegenOptions)
    {
        var workbookDirectory = @"D:\Workspace\Text";
        var workbook = new LightyWorkbook(
            "Text",
            workbookDirectory,
            new[]
            {
                new LightySheet(
                    "Localization",
                    Path.Combine(workbookDirectory, "Localization.txt"),
                    Path.Combine(workbookDirectory, "Localization_header.json"),
                    new LightySheetHeader(new[]
                    {
                        new ColumnDefine("Key", "string", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                        new ColumnDefine("Value", "string", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
                    }),
                    new[]
                    {
                        new LightySheetRow(0, new[] { "HELLO", "Hello" }),
                        new LightySheetRow(1, new[] { "BYE", "Goodbye" }),
                    }),
            },
            codegenOptions,
            Path.Combine(workbookDirectory, LightyWorkbookCodegenOptionsSerializer.DefaultFileName));

        return new LightyWorkspace(
            @"D:\Workspace",
            @"D:\Workspace\config.json",
            @"D:\Workspace\headers.json",
            WorkspaceHeaderLayout.CreateDefault(),
            new[] { workbook },
            codegenOptions,
            Path.Combine(@"D:\Workspace", LightyWorkbookCodegenOptionsSerializer.DefaultFileName));
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
