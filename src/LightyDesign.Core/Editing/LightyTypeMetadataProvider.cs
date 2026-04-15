namespace LightyDesign.Core;

public sealed class LightyTypeMetadata
{
    public required IReadOnlyList<string> ScalarTypes { get; init; }

    public required IReadOnlyList<LightyContainerTypeMetadata> ContainerTypes { get; init; }

    public required LightyReferenceTypeMetadata ReferenceType { get; init; }

    public IReadOnlyList<LightyReferenceWorkbookMetadata> ReferenceTargets { get; init; } = Array.Empty<LightyReferenceWorkbookMetadata>();
}

public sealed class LightyContainerTypeMetadata
{
    public required string TypeName { get; init; }

    public required string DisplayName { get; init; }

    public required IReadOnlyList<LightyTypeSlotMetadata> Slots { get; init; }
}

public sealed class LightyTypeSlotMetadata
{
    public required string SlotName { get; init; }

    public required IReadOnlyList<string> AllowedKinds { get; init; }
}

public sealed class LightyReferenceTypeMetadata
{
    public required string Prefix { get; init; }

    public required string Format { get; init; }

    public required string Example { get; init; }
}

public sealed class LightyReferenceWorkbookMetadata
{
    public required string WorkbookName { get; init; }

    public required IReadOnlyList<string> SheetNames { get; init; }
}

public static class LightyTypeMetadataProvider
{
    private static readonly string[] SupportedScalarTypes =
    {
        "string",
        "int",
        "long",
        "float",
        "double",
        "bool",
    };

    private static readonly HashSet<string> SupportedScalarTypeSet = new(SupportedScalarTypes, StringComparer.Ordinal);

    private static readonly LightyContainerTypeMetadata[] SupportedContainerTypes =
    {
        new()
        {
            TypeName = "List",
            DisplayName = "List<T>",
            Slots = new[]
            {
                new LightyTypeSlotMetadata
                {
                    SlotName = "element",
                    AllowedKinds = new[] { "scalar", "reference", "container" },
                },
            },
        },
        new()
        {
            TypeName = "Dictionary",
            DisplayName = "Dictionary<K,V>",
            Slots = new[]
            {
                new LightyTypeSlotMetadata
                {
                    SlotName = "key",
                    AllowedKinds = new[] { "scalar" },
                },
                new LightyTypeSlotMetadata
                {
                    SlotName = "value",
                    AllowedKinds = new[] { "scalar", "reference", "container" },
                },
            },
        },
    };

    private static readonly LightyReferenceTypeMetadata ReferenceType = new()
    {
        Prefix = "Ref:",
        Format = "Ref:Workbook.Sheet",
        Example = "Ref:Item.Consumable",
    };

    public static IReadOnlyList<string> GetSupportedScalarTypes()
    {
        return SupportedScalarTypes;
    }

    public static bool IsSupportedScalarType(string typeName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(typeName);
        return SupportedScalarTypeSet.Contains(typeName.Trim());
    }

    public static LightyTypeMetadata GetMetadata(LightyWorkspace? workspace = null)
    {
        return new LightyTypeMetadata
        {
            ScalarTypes = SupportedScalarTypes,
            ContainerTypes = SupportedContainerTypes,
            ReferenceType = ReferenceType,
            ReferenceTargets = workspace is null
                ? Array.Empty<LightyReferenceWorkbookMetadata>()
                : workspace.Workbooks
                    .OrderBy(workbook => workbook.Name, StringComparer.Ordinal)
                    .Select(workbook => new LightyReferenceWorkbookMetadata
                    {
                        WorkbookName = workbook.Name,
                        SheetNames = workbook.Sheets
                            .Select(sheet => sheet.Name)
                            .OrderBy(sheetName => sheetName, StringComparer.Ordinal)
                            .ToArray(),
                    })
                    .ToArray(),
        };
    }
}