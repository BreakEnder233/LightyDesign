using System.Text.Json;
using LightyDesign.Core;

namespace LightyDesign.Tests;

public class HeaderEditingTests
{
    [Fact]
    public void HeaderPropertySchemaProvider_ShouldRespectWorkspaceRowOrder()
    {
        var layout = new WorkspaceHeaderLayout(new[]
        {
            new WorkspaceHeaderRowDefinition(LightyHeaderTypes.ExportScope, JsonSerializer.SerializeToElement(new { })),
            new WorkspaceHeaderRowDefinition(LightyHeaderTypes.Type, JsonSerializer.SerializeToElement(new { })),
            new WorkspaceHeaderRowDefinition("CustomJson", JsonSerializer.SerializeToElement(new { })),
        });

        var schemas = LightyHeaderPropertySchemaProvider.GetSchemas(layout);

        Assert.Collection(
            schemas,
            exportScope =>
            {
                Assert.Equal(LightyHeaderTypes.ExportScope, exportScope.HeaderType);
                Assert.Equal("attribute", exportScope.BindingSource);
                Assert.Equal("enum", exportScope.EditorKind);
                Assert.True(exportScope.Required);
                Assert.Contains(nameof(LightyExportScope.All), exportScope.Options);
            },
            type =>
            {
                Assert.Equal(LightyHeaderTypes.Type, type.HeaderType);
                Assert.Equal("field", type.BindingSource);
                Assert.Equal("type", type.BindingKey);
                Assert.True(type.Required);
            },
            custom =>
            {
                Assert.Equal("CustomJson", custom.HeaderType);
                Assert.Equal("json", custom.EditorKind);
                Assert.Equal("attribute", custom.BindingSource);
                Assert.Equal("CustomJson", custom.BindingKey);
            });
    }

    [Fact]
    public void SheetColumnValidator_ShouldRejectDuplicatedFieldName()
    {
        var columns = new[]
        {
            new ColumnDefine("Id", "int", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
            new ColumnDefine("id", "string", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
        };

        var exception = Assert.Throws<LightyCoreException>(() => LightySheetColumnValidator.Validate(columns, "Sheet1"));

        Assert.Contains("duplicated field name", exception.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void SheetColumnValidator_ShouldRejectInvalidType()
    {
        var columns = new[]
        {
            new ColumnDefine("Id", "not-a-valid-type", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
        };

        var exception = Assert.Throws<LightyCoreException>(() => LightySheetColumnValidator.Validate(columns, "Sheet1"));

        Assert.Contains("invalid type", exception.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void SheetColumnValidator_ValidateType_ShouldReturnDescriptorForSupportedType()
    {
        var descriptor = LightySheetColumnValidator.ValidateType("List<Ref:Item.Consumable>");

        Assert.Equal("List", descriptor.TypeName);
        Assert.True(descriptor.IsList);
        Assert.False(descriptor.IsDictionary);
    }

    [Fact]
    public void SheetColumnValidator_ShouldRejectMissingReferenceWorkbook()
    {
        var workspace = CreateWorkspace();

        var exception = Assert.Throws<LightyCoreException>(() =>
            LightySheetColumnValidator.ValidateType("Ref:Missing.Consumable", workspace, "Item"));

        Assert.Contains("workbook 'Missing' was not found", exception.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void SheetColumnValidator_ShouldRejectMissingReferenceSheet()
    {
        var workspace = CreateWorkspace();

        var exception = Assert.Throws<LightyCoreException>(() =>
            LightySheetColumnValidator.ValidateType("Ref:Item.MissingSheet", workspace, "Item"));

        Assert.Contains("sheet 'MissingSheet' was not found", exception.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void SheetColumnValidator_ShouldAcceptExistingReferenceTarget()
    {
        var workspace = CreateWorkspace();

        var descriptor = LightySheetColumnValidator.ValidateType("Ref:Item.Consumable", workspace, "Item");

        Assert.True(descriptor.IsReference);
        Assert.Equal("Item", descriptor.ReferenceTarget?.WorkbookName);
        Assert.Equal("Consumable", descriptor.ReferenceTarget?.SheetName);
    }

    [Fact]
    public void SheetColumnValidator_ShouldRejectInvalidExportScope()
    {
        var columns = new[]
        {
            new ColumnDefine("Id", "int", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "BrokenScope")),
        };

        var exception = Assert.Throws<LightyCoreException>(() => LightySheetColumnValidator.Validate(columns, "Sheet1"));

        Assert.Contains("invalid export scope", exception.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void SheetColumnValidator_ShouldRejectMissingExportScope()
    {
        var columns = new[]
        {
            new ColumnDefine("Id", "int"),
        };

        var exception = Assert.Throws<LightyCoreException>(() => LightySheetColumnValidator.Validate(columns, "Sheet1"));

        Assert.Contains("must define export scope", exception.Message, StringComparison.OrdinalIgnoreCase);
    }

    private static IReadOnlyDictionary<string, JsonElement> CreateAttributes(string key, string value)
    {
        return new Dictionary<string, JsonElement>
        {
            [key] = JsonSerializer.SerializeToElement(value),
        };
    }

    private static LightyWorkspace CreateWorkspace()
    {
        var columns = new[]
        {
            new ColumnDefine("Id", "int", attributes: CreateAttributes(LightyHeaderTypes.ExportScope, "All")),
        };

        var sheet = new LightySheet(
            "Consumable",
            @"D:\Workspace\Item\Consumable.txt",
            @"D:\Workspace\Item\Consumable_header.json",
            new LightySheetHeader(columns),
            Array.Empty<LightySheetRow>());

        var workbook = new LightyWorkbook("Item", @"D:\Workspace\Item", new[] { sheet });

        return new LightyWorkspace(
            @"D:\Workspace",
            @"D:\Workspace\config.json",
            @"D:\Workspace\headers.json",
            WorkspaceHeaderLayout.CreateDefault(),
            new[] { workbook });
    }
}

