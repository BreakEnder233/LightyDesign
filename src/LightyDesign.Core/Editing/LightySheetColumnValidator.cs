namespace LightyDesign.Core;

public static class LightySheetColumnValidator
{
    private static readonly HashSet<string> SupportedScalarTypes = new(StringComparer.Ordinal)
    {
        "string",
        "int",
        "long",
        "float",
        "double",
        "bool",
    };

    public static void Validate(
        IEnumerable<ColumnDefine> columns,
        string? sheetName = null,
        LightyWorkspace? workspace = null,
        string? currentWorkbookName = null)
    {
        ArgumentNullException.ThrowIfNull(columns);

        var resolvedColumns = columns.ToList();
        var duplicateFieldName = resolvedColumns
            .GroupBy(column => column.FieldName, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault(group => group.Count() > 1)?
            .Key;

        if (!string.IsNullOrWhiteSpace(duplicateFieldName))
        {
            throw new LightyCoreException($"Sheet {FormatSheetName(sheetName)} contains duplicated field name '{duplicateFieldName}'.");
        }

        foreach (var column in resolvedColumns)
        {
            ValidateColumnType(column, sheetName, workspace, currentWorkbookName);
            ValidateExportScope(column, sheetName);
        }
    }

    public static LightyColumnTypeDescriptor ValidateType(
        string type,
        LightyWorkspace? workspace = null,
        string? currentWorkbookName = null)
    {
        var descriptor = LightyColumnTypeDescriptor.Parse(type);
        ValidateTypeDescriptor(descriptor, workspace, currentWorkbookName);
        return descriptor;
    }

    private static void ValidateColumnType(
        ColumnDefine column,
        string? sheetName,
        LightyWorkspace? workspace,
        string? currentWorkbookName)
    {
        try
        {
            ValidateType(column.Type, workspace, currentWorkbookName);
        }
        catch (Exception exception) when (exception is ArgumentException or LightyCoreException)
        {
            throw new LightyCoreException(
                $"Sheet {FormatSheetName(sheetName)} column '{column.FieldName}' has invalid type '{column.Type}'. {exception.Message}");
        }
    }

    private static void ValidateTypeDescriptor(
        LightyColumnTypeDescriptor descriptor,
        LightyWorkspace? workspace,
        string? currentWorkbookName)
    {
        if (descriptor.IsList)
        {
            ValidateTypeDescriptor(LightyColumnTypeDescriptor.Parse(descriptor.GenericArguments[0]), workspace, currentWorkbookName);
            return;
        }

        if (descriptor.IsDictionary)
        {
            ValidateTypeDescriptor(LightyColumnTypeDescriptor.Parse(descriptor.GenericArguments[0]), workspace, currentWorkbookName);
            ValidateTypeDescriptor(LightyColumnTypeDescriptor.Parse(descriptor.GenericArguments[1]), workspace, currentWorkbookName);
            return;
        }

        if (descriptor.RawType.StartsWith("Ref:", StringComparison.Ordinal) && !descriptor.IsReference)
        {
            throw new LightyCoreException($"Reference type '{descriptor.RawType}' must use the format Ref:Workbook.Sheet.");
        }

        if (descriptor.IsReference)
        {
            ValidateReferenceTarget(descriptor.ReferenceTarget, workspace, currentWorkbookName);
            return;
        }

        if (descriptor.GenericArguments.Count > 0)
        {
            throw new LightyCoreException($"Generic type '{descriptor.RawType}' is not supported.");
        }

        if (!SupportedScalarTypes.Contains(descriptor.RawType))
        {
            throw new LightyCoreException($"Scalar type '{descriptor.RawType}' is not supported.");
        }
    }

    private static void ValidateReferenceTarget(
        LightyReferenceTarget? referenceTarget,
        LightyWorkspace? workspace,
        string? currentWorkbookName)
    {
        if (referenceTarget is null || workspace is null)
        {
            return;
        }

        var workbookName = referenceTarget.WorkbookName;
        var sheetName = referenceTarget.SheetName;
        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            throw new LightyCoreException($"Reference target workbook '{workbookName}' was not found in the current workspace.");
        }

        if (!workbook.TryGetSheet(sheetName, out _))
        {
            throw new LightyCoreException(
                $"Reference target sheet '{sheetName}' was not found in workbook '{workbookName}' of the current workspace.");
        }
    }

    private static void ValidateExportScope(ColumnDefine column, string? sheetName)
    {
        if (!column.TryGetStringAttribute(LightyHeaderTypes.ExportScope, out var exportScopeValue) || string.IsNullOrWhiteSpace(exportScopeValue))
        {
            throw new LightyCoreException(
                $"Sheet {FormatSheetName(sheetName)} column '{column.FieldName}' must define export scope.");
        }

        if (!Enum.TryParse<LightyExportScope>(exportScopeValue, ignoreCase: true, out _))
        {
            throw new LightyCoreException(
                $"Sheet {FormatSheetName(sheetName)} column '{column.FieldName}' has invalid export scope '{exportScopeValue}'.");
        }
    }

    private static string FormatSheetName(string? sheetName)
    {
        return string.IsNullOrWhiteSpace(sheetName) ? "<unknown>" : $"'{sheetName}'";
    }
}
