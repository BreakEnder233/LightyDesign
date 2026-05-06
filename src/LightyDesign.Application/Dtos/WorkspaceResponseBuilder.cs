using System.Text.Json;
using LightyDesign.Core;
using LightyDesign.FileProcess;

namespace LightyDesign.Application.Dtos;

public static class WorkspaceResponseBuilder
{
    // ── 工作区响应 ──

    public static object ToWorkspaceResponse(LightyWorkspace workspace)
    {
        return new
        {
            workspace.RootPath,
            workspace.ConfigFilePath,
            workspace.HeadersFilePath,
            workspace.WorkbooksRootPath,
            workspace.FlowChartsRootPath,
            workspace.FlowChartNodesRootPath,
            workspace.FlowChartFilesRootPath,
            codegen = ToWorkspaceCodegenResponse(workspace),
            headerLayout = new
            {
                count = workspace.HeaderLayout.Count,
                rows = workspace.HeaderLayout.Rows.Select(row => new
                {
                    row.HeaderType,
                    configuration = JsonElementToObject(row.Configuration),
                }),
            },
            workbooks = workspace.Workbooks.Select(workbook => ToWorkbookResponse(workbook, previewOnly: false)),
            flowCharts = FlowChartResponseBuilder.ToFlowChartCatalogResponse(workspace, includeDocument: true),
        };
    }

    public static object ToWorkspaceNavigationResponse(LightyWorkspace workspace)
    {
        return new
        {
            workspace.RootPath,
            workspace.ConfigFilePath,
            workspace.HeadersFilePath,
            workspace.WorkbooksRootPath,
            workspace.FlowChartsRootPath,
            workspace.FlowChartNodesRootPath,
            workspace.FlowChartFilesRootPath,
            codegen = ToWorkspaceCodegenResponse(workspace),
            headerLayout = new
            {
                count = workspace.HeaderLayout.Count,
                rows = workspace.HeaderLayout.Rows.Select(row => new
                {
                    row.HeaderType,
                }),
            },
            workbooks = workspace.Workbooks.Select(workbook => new
            {
                workbook.Name,
                workbook.DirectoryPath,
                alias = ReadAliasFromConfig(Path.Combine(workbook.DirectoryPath, "config.json")),
                codegen = ToWorkbookCodegenResponse(workbook),
                sheetCount = workbook.Sheets.Count,
                sheets = workbook.Sheets.Select(sheet => ToSheetNavigationResponse(workbook.Name, workbook.DirectoryPath, sheet)),
            }),
            flowCharts = FlowChartResponseBuilder.ToFlowChartCatalogResponse(workspace, includeDocument: false),
        };
    }

    // ── 工作簿响应 ──

    public static object ToWorkbookResponse(LightyWorkbook workbook, bool previewOnly)
    {
        return new
        {
            workbook.Name,
            workbook.DirectoryPath,
            alias = ReadAliasFromConfig(Path.Combine(workbook.DirectoryPath, "config.json")),
            codegen = ToWorkbookCodegenResponse(workbook),
            previewOnly,
            sheets = workbook.Sheets.Select(sheet => ToSheetResponse(sheet, workbook.DirectoryPath, workbook.Name)),
        };
    }

    // ── Codegen 配置响应 ──

    public static object ToWorkspaceCodegenResponse(LightyWorkspace workspace)
    {
        return new
        {
            outputRelativePath = workspace.CodegenOptions.OutputRelativePath,
            i18n = new
            {
                outputRelativePath = workspace.CodegenOptions.I18n.OutputRelativePath,
                sourceLanguage = workspace.CodegenOptions.I18n.SourceLanguage,
            },
        };
    }

    public static object ToWorkbookCodegenResponse(LightyWorkbook workbook)
    {
        return new
        {
            outputRelativePath = workbook.CodegenOptions.OutputRelativePath,
            i18n = new
            {
                outputRelativePath = workbook.CodegenOptions.I18n.OutputRelativePath,
                sourceLanguage = workbook.CodegenOptions.I18n.SourceLanguage,
            },
        };
    }

    // ── Sheet 响应 ──

    public static object ToSheetResponse(LightySheet sheet, string? workbookDirectory = null, string? workbookName = null)
    {
        return new
        {
            metadata = ToSheetMetadataResponse(workbookName, sheet),
            alias = workbookDirectory is null ? null : ReadAliasFromConfig(Path.Combine(workbookDirectory, $"{sheet.Name}_config.json")),
            rows = sheet.Rows.Select(row => row.Cells.ToArray()),
        };
    }

    public static object ToSheetMetadataResponse(string? workbookName, LightySheet sheet)
    {
        return new
        {
            workbookName,
            sheet.Name,
            sheet.DataFilePath,
            sheet.HeaderFilePath,
            rowCount = sheet.RowCount,
            columnCount = sheet.Header.Count,
            columns = sheet.Header.Columns.Select(column => new
            {
                column.FieldName,
                column.Type,
                column.DisplayName,
                column.IsListType,
                column.IsReferenceType,
                attributes = column.Attributes.ToDictionary(
                    pair => pair.Key,
                    pair => JsonElementToObject(pair.Value)),
            }),
        };
    }

    public static object ToSheetNavigationResponse(string workbookName, string workbookDirectory, LightySheet sheet)
    {
        return new
        {
            workbookName,
            sheet.Name,
            sheet.DataFilePath,
            sheet.HeaderFilePath,
            rowCount = sheet.RowCount,
            columnCount = sheet.Header.Count,
            alias = ReadAliasFromConfig(Path.Combine(workbookDirectory, $"{sheet.Name}_config.json")),
        };
    }

    // ── Excel 错误响应 ──

    public static object ToExcelErrorResponse(LightyExcelProcessException exception)
    {
        return new
        {
            error = exception.Message,
            exception.WorksheetName,
            exception.CellAddress,
        };
    }

    // ── Header Property Schema ──

    public static object ToHeaderPropertySchemaResponse(LightyHeaderPropertySchema schema)
    {
        return new
        {
            schema.HeaderType,
            schema.BindingSource,
            schema.BindingKey,
            schema.FieldName,
            schema.Label,
            schema.EditorKind,
            schema.ValueType,
            schema.Required,
            schema.Placeholder,
            options = schema.Options,
        };
    }

    // ── Type Metadata 响应 ──

    public static object ToTypeMetadataResponse(LightyTypeMetadata metadata)
    {
        return new
        {
            scalarTypes = metadata.ScalarTypes,
            containerTypes = metadata.ContainerTypes.Select(container => new
            {
                container.TypeName,
                container.DisplayName,
                slots = container.Slots.Select(slot => new
                {
                    slot.SlotName,
                    allowedKinds = slot.AllowedKinds,
                }),
            }),
            referenceType = new
            {
                metadata.ReferenceType.Prefix,
                metadata.ReferenceType.Format,
                metadata.ReferenceType.Example,
            },
            referenceTargets = metadata.ReferenceTargets.Select(workbook => new
            {
                workbook.WorkbookName,
                sheetNames = workbook.SheetNames,
            }),
        };
    }

    // ── Type Descriptor 响应 ──

    public static object ToTypeDescriptorResponse(LightyColumnTypeDescriptor descriptor)
    {
        return new
        {
            rawType = descriptor.RawType,
            descriptor.TypeName,
            descriptor.GenericArguments,
            descriptor.ValueType,
            descriptor.IsList,
            descriptor.IsDictionary,
            descriptor.IsReference,
            referenceTarget = descriptor.ReferenceTarget is null
                ? null
                : new
                {
                    descriptor.ReferenceTarget.WorkbookName,
                    descriptor.ReferenceTarget.SheetName,
                },
            children = descriptor.GenericArguments
                .Select(LightyColumnTypeDescriptor.Parse)
                .Select(ToTypeDescriptorResponse),
        };
    }

    // ── Validation Schema 响应 ──

    public static object ToValidationRuleSchemaResponse(LightyValidationRuleSchema schema)
    {
        return new
        {
            schema.MainTypeKey,
            schema.TypeDisplayName,
            schema.Description,
            properties = schema.Properties.Select(property => new
            {
                property.Name,
                property.ValueType,
                property.Description,
                property.Required,
                defaultValue = property.DefaultValue,
                example = property.Example,
                property.Deprecated,
                property.AliasOf,
            }),
            nestedSchemas = schema.NestedSchemas.Select(nested => new
            {
                nested.PropertyName,
                nested.Label,
                nested.Description,
                schema = ToValidationRuleSchemaResponse(nested.Schema),
            }),
        };
    }

    // ── 辅助方法 ──

    public static string? ReadAliasFromConfig(string configFilePath)
    {
        try
        {
            if (!File.Exists(configFilePath)) return null;
            var raw = File.ReadAllText(configFilePath);
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.ValueKind == JsonValueKind.Object && doc.RootElement.TryGetProperty("alias", out var aliasProp) && aliasProp.ValueKind == JsonValueKind.String)
            {
                return aliasProp.GetString();
            }
        }
        catch
        {
            // ignore and return null on parse/IO errors
        }

        return null;
    }

    public static object? JsonElementToObject(JsonElement element)
    {
        return element.ValueKind switch
        {
            JsonValueKind.String => element.GetString(),
            JsonValueKind.Number => element.TryGetInt64(out var longValue)
                ? longValue
                : element.TryGetDouble(out var doubleValue)
                    ? doubleValue
                    : element.GetRawText(),
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Null => null,
            _ => element.GetRawText(),
        };
    }

    public static IReadOnlyList<string> GetFlowChartDirectoryPaths(string rootDirectoryPath)
    {
        if (!Directory.Exists(rootDirectoryPath))
        {
            return Array.Empty<string>();
        }

        return Directory
            .EnumerateDirectories(rootDirectoryPath, "*", SearchOption.AllDirectories)
            .Select(directoryPath => Path.GetRelativePath(rootDirectoryPath, directoryPath).Replace('\\', '/'))
            .Where(relativePath => !string.IsNullOrWhiteSpace(relativePath))
            .OrderBy(relativePath => relativePath, StringComparer.Ordinal)
            .ToArray();
    }

    public static bool ContainsSheetName(LightyWorkbook workbook, string candidateSheetName, string? excludedSheetName = null)
    {
        return workbook.Sheets.Any(sheet =>
            string.Equals(sheet.Name, candidateSheetName, StringComparison.OrdinalIgnoreCase)
            && (excludedSheetName is null || !string.Equals(sheet.Name, excludedSheetName, StringComparison.OrdinalIgnoreCase)));
    }

    public static string ResolveWorkbookName(string? workbookName, string fileName)
    {
        if (!string.IsNullOrWhiteSpace(workbookName))
        {
            return workbookName.Trim();
        }

        var resolvedName = Path.GetFileNameWithoutExtension(fileName);
        if (string.IsNullOrWhiteSpace(resolvedName))
        {
            throw new LightyExcelProcessException("Workbook name cannot be resolved from the uploaded file.");
        }

        return resolvedName;
    }
}
