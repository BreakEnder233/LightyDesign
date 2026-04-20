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
                Assert.Equal("int / string / List<int> / Ref:Workbook.Sheet", type.Placeholder);
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
    public void SheetColumnValidator_ShouldRejectDictionaryReferenceKey()
    {
        var exception = Assert.Throws<LightyCoreException>(() =>
            LightySheetColumnValidator.ValidateType("Dictionary<Ref:Item.Consumable,string>"));

        Assert.Contains("Dictionary key type", exception.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("scalar types", exception.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void SheetColumnValidator_ShouldRejectDictionaryContainerKey()
    {
        var exception = Assert.Throws<LightyCoreException>(() =>
            LightySheetColumnValidator.ValidateType("Dictionary<List<int>,string>"));

        Assert.Contains("Dictionary key type", exception.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("scalar types", exception.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void TypeMetadataProvider_ShouldReturnSupportedTypesAndReferenceTargets()
    {
        var workspace = CreateWorkspace();

        var metadata = LightyTypeMetadataProvider.GetMetadata(workspace);

        Assert.Equal(new[] { "string", "int", "long", "float", "double", "bool" }, metadata.ScalarTypes);
        Assert.Collection(
            metadata.ContainerTypes,
            listType =>
            {
                Assert.Equal("List", listType.TypeName);
                Assert.Single(listType.Slots);
                Assert.Equal(new[] { "scalar", "reference", "container" }, listType.Slots[0].AllowedKinds);
            },
            dictionaryType =>
            {
                Assert.Equal("Dictionary", dictionaryType.TypeName);
                Assert.Equal(2, dictionaryType.Slots.Count);
                Assert.Equal(new[] { "scalar" }, dictionaryType.Slots[0].AllowedKinds);
                Assert.Equal(new[] { "scalar", "reference", "container" }, dictionaryType.Slots[1].AllowedKinds);
            });

        Assert.Equal("Ref:", metadata.ReferenceType.Prefix);
        Assert.Equal("Ref:Workbook.Sheet", metadata.ReferenceType.Format);

        var workbook = Assert.Single(metadata.ReferenceTargets);
        Assert.Equal("Item", workbook.WorkbookName);
        Assert.Equal(new[] { "Consumable" }, workbook.SheetNames);
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

    [Fact]
    public void ValidationSchemaProvider_ShouldExposeRegexAndPatternForString()
    {
        var schema = LightyValidationSchemaProvider.GetSchema("string");

        Assert.Equal("string", schema.MainTypeKey);
        Assert.Contains(schema.Properties, property => property.Name == "regex" && property.ValueType == "string" && !property.Deprecated);
        Assert.Contains(schema.Properties, property => property.Name == "pattern" && property.Deprecated && property.AliasOf == "regex");
    }

    [Fact]
    public void ValidationSchemaProvider_ShouldExposeNestedElementSchemaForList()
    {
        var schema = LightyValidationSchemaProvider.GetSchema("List<string>");

        Assert.Equal("List", schema.MainTypeKey);
        var nested = Assert.Single(schema.NestedSchemas, entry => entry.PropertyName == "elementValidation");
        Assert.Equal("string", nested.Schema.MainTypeKey);
        Assert.Contains(nested.Schema.Properties, property => property.Name == "regex");
    }

    [Fact]
    public void ValidationSchemaProvider_ShouldExposeKeyAndValueSchemaForDictionary()
    {
        var schema = LightyValidationSchemaProvider.GetSchema("Dictionary<int,string>");

        Assert.Equal("Dictionary", schema.MainTypeKey);
        Assert.Contains(schema.NestedSchemas, entry => entry.PropertyName == "keyValidation" && entry.Schema.MainTypeKey == "int");
        Assert.Contains(schema.NestedSchemas, entry => entry.PropertyName == "valueValidation" && entry.Schema.MainTypeKey == "string");
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

