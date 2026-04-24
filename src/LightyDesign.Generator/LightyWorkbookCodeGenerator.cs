using System.Globalization;
using System.Text;
using LightyDesign.Core;

namespace LightyDesign.Generator;

public sealed class LightyWorkbookCodeGenerator
{
    private const string GeneratedNamespace = "LightyDesignData";
    private const int DataChunkRowThreshold = 500;
    private static readonly HashSet<string> CSharpKeywords = new(StringComparer.Ordinal)
    {
        "abstract", "as", "base", "bool", "break", "byte", "case", "catch", "char", "checked",
        "class", "const", "continue", "decimal", "default", "delegate", "do", "double", "else", "enum",
        "event", "explicit", "extern", "false", "finally", "fixed", "float", "for", "foreach", "goto",
        "if", "implicit", "in", "int", "interface", "internal", "is", "lock", "long", "namespace",
        "new", "null", "object", "operator", "out", "override", "params", "private", "protected", "public",
        "readonly", "ref", "return", "sbyte", "sealed", "short", "sizeof", "stackalloc", "static", "string",
        "struct", "switch", "this", "throw", "true", "try", "typeof", "uint", "ulong", "unchecked", "unsafe",
        "ushort", "using", "virtual", "void", "volatile", "while",
    };

    public LightyGeneratedWorkbookPackage Generate(LightyWorkspace workspace, string workbookName)
    {
        ArgumentNullException.ThrowIfNull(workspace);
        ArgumentException.ThrowIfNullOrWhiteSpace(workbookName);

        if (!workspace.TryGetWorkbook(workbookName, out var workbook) || workbook is null)
        {
            throw new LightyCoreException($"Workbook '{workbookName}' was not found in the workspace.");
        }

        return Generate(workspace, workbook);
    }

    public LightyGeneratedWorkbookPackage Generate(LightyWorkspace workspace, LightyWorkbook workbook)
    {
        ArgumentNullException.ThrowIfNull(workspace);
        ArgumentNullException.ThrowIfNull(workbook);

        LightyWorkbookValidationService.ValidateWorkbookOrThrow(workspace, workbook);

        if (string.IsNullOrWhiteSpace(workspace.CodegenOptions.OutputRelativePath))
        {
            throw new LightyCoreException($"Workbook '{workbook.Name}' does not define a code generation output path.");
        }

        var files = new List<LightyGeneratedCodeFile>();
        files.Add(new LightyGeneratedCodeFile("DesignDataReference.cs", RenderReferenceSupportFile()));
        var generatedSheets = workbook.Sheets.Select(sheet => AnalyzeSheet(workspace, sheet)).ToList();

        foreach (var sheet in generatedSheets)
        {
            files.Add(new LightyGeneratedCodeFile($"{workbook.Name}/{sheet.RowTypeName}.cs", RenderRowFile(sheet)));
            files.Add(new LightyGeneratedCodeFile($"{workbook.Name}/{sheet.TableTypeName}.cs", RenderTableFile(sheet)));

            foreach (var indexNode in BuildIndexNodes(sheet))
            {
                files.Add(new LightyGeneratedCodeFile($"{workbook.Name}/{indexNode.TypeName}.cs", RenderIndexNodeFile(sheet, indexNode)));
            }

            foreach (var chunk in sheet.DataChunks)
            {
                files.Add(new LightyGeneratedCodeFile($"{workbook.Name}/{chunk.TypeName}.cs", RenderSheetDataChunkFile(sheet, chunk)));
            }
        }

        files.Add(new LightyGeneratedCodeFile($"{workbook.Name}/{ToTypeIdentifier(workbook.Name)}Workbook.cs", RenderWorkbookFile(workbook, generatedSheets)));

        return new LightyGeneratedWorkbookPackage(workspace.CodegenOptions.OutputRelativePath!, files);
    }

    public string GenerateEntryPointFile(IEnumerable<string> workbookNames)
    {
        return GenerateEntryPointFile(workbookNames, Array.Empty<string>());
    }

    public string GenerateEntryPointFile(IEnumerable<string> workbookNames, IEnumerable<string> flowChartRelativePaths)
    {
        ArgumentNullException.ThrowIfNull(workbookNames);
        ArgumentNullException.ThrowIfNull(flowChartRelativePaths);

        var normalizedWorkbookNames = workbookNames
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Select(name => name.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .ToList();
        var normalizedFlowChartRelativePaths = flowChartRelativePaths
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Select(path => path.Trim().Replace('\\', '/').Trim('/'))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (normalizedWorkbookNames.Count == 0 && normalizedFlowChartRelativePaths.Count == 0)
        {
            throw new ArgumentException("At least one workbook name or FlowChart relative path is required to generate LDD entry point.");
        }

        return RenderEntryPointFile(normalizedWorkbookNames, normalizedFlowChartRelativePaths);
    }

    private static GeneratedSheetModel AnalyzeSheet(LightyWorkspace workspace, LightySheet sheet)
    {
        var typeName = ToTypeIdentifier(sheet.Name);
        var exportedColumns = sheet.Header.Columns
            .Select((column, index) => new { Column = column, Index = index })
            .Where(entry => !entry.Column.TryGetExportScope(out var exportScope) || exportScope != LightyExportScope.None)
            .Select(entry => AnalyzeField(entry.Column, entry.Index))
            .ToList();

        var primaryKeyFields = ResolvePrimaryKeyFields(exportedColumns);
        var rows = sheet.Rows
            .Select((row, rowIndex) => AnalyzeRow(workspace, sheet, row, rowIndex, exportedColumns))
            .ToList();
        var dataChunks = BuildDataChunks($"{typeName}Table", rows);

        return new GeneratedSheetModel(
            sheet.Name,
            typeName,
            $"{typeName}Row",
            $"{typeName}Table",
            exportedColumns,
            primaryKeyFields,
            rows,
            dataChunks);
    }

    private static GeneratedFieldModel AnalyzeField(ColumnDefine column, int sourceIndex)
    {
        EnsureSupportedType(column.TypeDescriptor);

        var exportScope = column.TryGetExportScope(out var parsedExportScope)
            ? parsedExportScope
            : LightyExportScope.All;

        return new GeneratedFieldModel(
            column.FieldName,
            ToPropertyIdentifier(column.FieldName),
            column.DisplayName,
            sourceIndex,
            column.TypeDescriptor,
            MapToCSharpType(column.TypeDescriptor),
            exportScope);
    }

    private static GeneratedRowModel AnalyzeRow(LightyWorkspace workspace, LightySheet sheet, LightySheetRow row, int rowIndex, IReadOnlyList<GeneratedFieldModel> fields)
    {
        var assignments = new List<GeneratedFieldAssignment>(fields.Count);

        foreach (var field in fields)
        {
            var column = sheet.Header[field.SourceIndex];
            var parseResult = row.ParseCell(field.SourceIndex, column, DefaultLightyValueParser.Instance);
            if (!parseResult.IsSuccess)
            {
                throw new LightyCoreException(parseResult.ErrorMessage ?? $"Failed to parse cell in sheet '{sheet.Name}' row {rowIndex} column '{field.FieldName}'.");
            }

            assignments.Add(new GeneratedFieldAssignment(field, BuildValueLiteral(workspace, field.TypeDescriptor, parseResult.Value)));
        }

        return new GeneratedRowModel($"{ToTypeIdentifier(sheet.Name)}Row", assignments);
    }

    private static IReadOnlyList<GeneratedFieldModel> ResolvePrimaryKeyFields(IReadOnlyList<GeneratedFieldModel> fields)
    {
        var singleIdField = fields.FirstOrDefault(field => string.Equals(field.FieldName, "ID", StringComparison.OrdinalIgnoreCase));
        if (singleIdField is not null)
        {
            return new[] { singleIdField };
        }

        var compositeFields = new List<GeneratedFieldModel>();
        for (var index = 1; index <= fields.Count; index += 1)
        {
            var expectedName = $"ID{index}";
            var field = fields.FirstOrDefault(candidate => string.Equals(candidate.FieldName, expectedName, StringComparison.OrdinalIgnoreCase));
            if (field is null)
            {
                break;
            }

            compositeFields.Add(field);
        }

        if (compositeFields.Count > 0)
        {
            return compositeFields;
        }

        return fields.Count > 0 ? new[] { fields[0] } : Array.Empty<GeneratedFieldModel>();
    }

    private static void EnsureSupportedType(LightyColumnTypeDescriptor descriptor)
    {
        if (descriptor.IsList)
        {
            EnsureSupportedType(LightyColumnTypeDescriptor.Parse(descriptor.ValueType));
            return;
        }

        if (descriptor.IsDictionary)
        {
            EnsureSupportedType(LightyColumnTypeDescriptor.Parse(descriptor.DictionaryKeyType!));
            EnsureSupportedType(LightyColumnTypeDescriptor.Parse(descriptor.DictionaryValueType!));
            return;
        }

        if (descriptor.IsReference && descriptor.ReferenceTarget is null)
        {
            throw new LightyCoreException($"Code generation does not yet support malformed reference type '{descriptor.RawType}'.");
        }
    }

    private static string MapToCSharpType(LightyColumnTypeDescriptor descriptor)
    {
        if (descriptor.IsList)
        {
            return $"List<{MapToCSharpType(LightyColumnTypeDescriptor.Parse(descriptor.ValueType))}>";
        }

        if (descriptor.IsDictionary)
        {
            return $"Dictionary<{MapToCSharpType(LightyColumnTypeDescriptor.Parse(descriptor.DictionaryKeyType!))}, {MapToCSharpType(LightyColumnTypeDescriptor.Parse(descriptor.DictionaryValueType!))}>";
        }

        if (descriptor.IsReference)
        {
            var target = descriptor.ReferenceTarget ?? throw new LightyCoreException($"Reference type '{descriptor.RawType}' does not define a valid target.");
            return $"DesignDataReference<{ToTypeIdentifier(target.SheetName)}Row>";
        }

        return descriptor.RawType switch
        {
            "string" => "string",
            "int" => "int",
            "long" => "long",
            "float" => "float",
            "double" => "double",
            "bool" => "bool",
            _ => throw new LightyCoreException($"Unsupported generated C# type for '{descriptor.RawType}'."),
        };
    }

    private static string BuildValueLiteral(LightyWorkspace workspace, LightyColumnTypeDescriptor descriptor, object? value)
    {
        if (descriptor.IsList)
        {
            var elementDescriptor = LightyColumnTypeDescriptor.Parse(descriptor.ValueType);
            var values = (IReadOnlyList<object?>)(value ?? Array.Empty<object?>());
            var items = string.Join(", ", values.Select(item => BuildValueLiteral(workspace, elementDescriptor, item)));
            return $"new List<{MapToCSharpType(elementDescriptor)}> {{ {items} }}";
        }

        if (descriptor.IsDictionary)
        {
            var keyDescriptor = LightyColumnTypeDescriptor.Parse(descriptor.DictionaryKeyType!);
            var valueDescriptor = LightyColumnTypeDescriptor.Parse(descriptor.DictionaryValueType!);
            var pairs = (IReadOnlyDictionary<object, object?>)(value ?? new Dictionary<object, object?>());
            var items = string.Join(", ", pairs.Select(pair => $"{{ {BuildValueLiteral(workspace, keyDescriptor, pair.Key)}, {BuildValueLiteral(workspace, valueDescriptor, pair.Value)} }}"));
            return $"new Dictionary<{MapToCSharpType(keyDescriptor)}, {MapToCSharpType(valueDescriptor)}> {{ {items} }}";
        }

        if (descriptor.IsReference)
        {
            var target = descriptor.ReferenceTarget ?? throw new LightyCoreException($"Reference type '{descriptor.RawType}' does not define a valid target.");
            var referenceValue = value as LightyReferenceValue
                ?? throw new LightyCoreException($"Reference value for '{descriptor.RawType}' could not be parsed.");
            return BuildReferenceLiteral(workspace, target, referenceValue);
        }

        return descriptor.RawType switch
        {
            "string" => ToStringLiteral((string?)value ?? string.Empty),
            "int" => Convert.ToInt32(value, CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture),
            "long" => $"{Convert.ToInt64(value, CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture)}L",
            "float" => $"{Convert.ToSingle(value, CultureInfo.InvariantCulture).ToString("R", CultureInfo.InvariantCulture)}f",
            "double" => Convert.ToDouble(value, CultureInfo.InvariantCulture).ToString("R", CultureInfo.InvariantCulture),
            "bool" => Convert.ToBoolean(value, CultureInfo.InvariantCulture) ? "true" : "false",
            _ => throw new LightyCoreException($"Unsupported literal generation for '{descriptor.RawType}'."),
        };
    }

    private static string RenderRowFile(GeneratedSheetModel sheet)
    {
        var writer = new CodeWriter();
        writer.AppendLine("using System;");
        writer.AppendLine("using System.Collections.Generic;");
        writer.AppendLine();
        AppendNamespaceStart(writer);
        writer.AppendLine($"public sealed partial class {sheet.RowTypeName}");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("private Action _editNotifier;");
        writer.AppendLine();
        writer.AppendLine("internal void SetEditNotifier(Action editNotifier)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("_editNotifier = editNotifier;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        AppendScopedItems(writer, sheet.Fields, field => field.ExportScope, (scopedWriter, field) =>
        {
            var backingFieldName = BuildBackingFieldName(field.PropertyName);
            if (!string.IsNullOrWhiteSpace(field.DisplayName))
            {
                scopedWriter.AppendLine($"// {field.DisplayName}");
            }

            scopedWriter.AppendLine($"private {field.CSharpTypeName} {backingFieldName};");
            scopedWriter.AppendLine($"public {field.CSharpTypeName} {field.PropertyName}");
            scopedWriter.AppendLine("{");
            scopedWriter.Indent();
            scopedWriter.AppendLine($"get => {backingFieldName};");
            scopedWriter.AppendLine("set");
            scopedWriter.AppendLine("{");
            scopedWriter.Indent();
            scopedWriter.AppendLine($"{backingFieldName} = value;");
            scopedWriter.AppendLine("_editNotifier?.Invoke();");
            scopedWriter.Outdent();
            scopedWriter.AppendLine("}");
            scopedWriter.Outdent();
            scopedWriter.AppendLine("}");
        });
        writer.AppendLine("}");
        writer.AppendLine();
        AppendNamespaceEnd(writer);

        return writer.ToString();
    }

    private static string RenderTableFile(GeneratedSheetModel sheet)
    {
        var writer = new CodeWriter();
        var indexAvailabilityScope = ResolveIndexAvailabilityScope(sheet.PrimaryKeyFields);
        writer.AppendLine("using System;");
        writer.AppendLine("using System.Collections.Generic;");
        writer.AppendLine("using System.Linq;");
        writer.AppendLine();
        AppendNamespaceStart(writer);
        writer.AppendLine($"public sealed partial class {sheet.TableTypeName} : ILightyDesignEditableTable");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine($"private readonly List<{sheet.RowTypeName}> _rows;");
        writer.AppendLine($"private readonly IReadOnlyList<{sheet.RowTypeName}> _rowsView;");

        AppendIndexMembers(writer, sheet, indexAvailabilityScope);

        writer.AppendLine();
        writer.AppendLine($"private {sheet.TableTypeName}(IEnumerable<{sheet.RowTypeName}> rows)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine($"_rows = new List<{sheet.RowTypeName}>();");
        writer.AppendLine("_rowsView = _rows.AsReadOnly();");
        writer.AppendLine("LoadRows(rows);");
        writer.AppendLine("((ILightyDesignEditableTable)this).RebuildIndexes();");

        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine($"public IReadOnlyList<{sheet.RowTypeName}> Rows => _rowsView;");

        AppendIndexAccessor(writer, sheet, indexAvailabilityScope);
        AppendMutationMembers(writer, sheet, indexAvailabilityScope);

        writer.AppendLine();
        writer.AppendLine($"private void LoadRows(IEnumerable<{sheet.RowTypeName}> rows)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (rows == null)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("throw new ArgumentNullException(nameof(rows));");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("foreach (var row in rows)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("AddRow(row);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine($"private void AddRow({sheet.RowTypeName} row)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (row == null)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("throw new ArgumentNullException(nameof(row));");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine("row.SetEditNotifier(MarkDirty);");
        writer.AppendLine("_rows.Add(row);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine($"private void RemoveRow({sheet.RowTypeName} row)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("row.SetEditNotifier(null);");
        writer.AppendLine("_ = _rows.Remove(row);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("private void MarkDirty()");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("LDD.MarkDirty(this);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("void ILightyDesignEditableTable.RebuildIndexes()");
        writer.AppendLine("{");
        writer.Indent();
        AppendIndexRebuildBody(writer, sheet, indexAvailabilityScope, "_rows");
        writer.Outdent();
        writer.AppendLine("}");

        writer.AppendLine();
        writer.AppendLine($"internal static {sheet.TableTypeName} Create()");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine($"var rows = new List<{sheet.RowTypeName}>();");
        if (sheet.UsesChunkedDataInitialization)
        {
            foreach (var chunk in sheet.DataChunks)
            {
                writer.AppendLine($"{chunk.TypeName}.Append(rows);");
            }
        }
        else
        {
            foreach (var row in sheet.Rows)
            {
                AppendRowAdd(writer, row, "rows.Add");
            }
        }
        writer.AppendLine($"return new {sheet.TableTypeName}(rows);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        AppendNamespaceEnd(writer);

        return writer.ToString();
    }

    private static string RenderSheetDataChunkFile(GeneratedSheetModel sheet, GeneratedSheetChunkModel chunk)
    {
        var writer = new CodeWriter();
        writer.AppendLine("using System.Collections.Generic;");
        writer.AppendLine();
        AppendNamespaceStart(writer);
        writer.AppendLine($"internal static class {chunk.TypeName}");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine($"internal static void Append(List<{sheet.RowTypeName}> rows)");
        writer.AppendLine("{");
        writer.Indent();
        foreach (var row in chunk.Rows)
        {
            AppendRowAdd(writer, row, "rows.Add");
        }
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        AppendNamespaceEnd(writer);
        return writer.ToString();
    }

    private static string RenderIndexNodeFile(GeneratedSheetModel sheet, GeneratedIndexNodeModel indexNode)
    {
        var writer = new CodeWriter();
        writer.AppendLine("using System.Collections.Generic;");
        writer.AppendLine("using System.Linq;");
        writer.AppendLine();
        AppendNamespaceStart(writer);
        AppendScopeBlock(writer, indexNode.AvailabilityScope, () =>
        {
            writer.Append(RenderIndexNodeClass(sheet, indexNode.Level));
        });
        AppendNamespaceEnd(writer);
        return writer.ToString();
    }

    private static string RenderReferenceSupportFile()
    {
        var writer = new CodeWriter();
        writer.AppendLine("using System;");
        writer.AppendLine("using System.Collections.Generic;");
        writer.AppendLine("using System.Globalization;");
        writer.AppendLine();
        AppendNamespaceStart(writer);
        writer.AppendLine("public sealed partial class DesignDataReference<TTarget>");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("private readonly IReadOnlyList<string> _identifiers;");
        writer.AppendLine("private readonly Func<IReadOnlyList<string>, TTarget> _resolver;");
        writer.AppendLine();
        writer.AppendLine("public DesignDataReference(string workbookName, string sheetName, Func<IReadOnlyList<string>, TTarget> resolver, params string[] identifiers)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (string.IsNullOrWhiteSpace(workbookName))");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("throw new ArgumentException(\"Value cannot be null or whitespace.\", nameof(workbookName));");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("if (string.IsNullOrWhiteSpace(sheetName))");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("throw new ArgumentException(\"Value cannot be null or whitespace.\", nameof(sheetName));");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("if (resolver is null)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("throw new ArgumentNullException(nameof(resolver));");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("if (identifiers is null)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("throw new ArgumentNullException(nameof(identifiers));");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("WorkbookName = workbookName;");
        writer.AppendLine("SheetName = sheetName;");
        writer.AppendLine("_resolver = resolver;");
        writer.AppendLine("_identifiers = Array.AsReadOnly(identifiers);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("public string WorkbookName { get; }");
        writer.AppendLine("public string SheetName { get; }");
        writer.AppendLine("public IReadOnlyList<string> Identifiers => _identifiers;");
        writer.AppendLine();
        writer.AppendLine("public TTarget GetValue() => _resolver(_identifiers);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("internal static partial class DesignDataReferenceHelper");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("public static int ParseInt32(string value) => int.Parse(value, NumberStyles.Integer, CultureInfo.InvariantCulture);");
        writer.AppendLine("public static long ParseInt64(string value) => long.Parse(value, NumberStyles.Integer, CultureInfo.InvariantCulture);");
        writer.AppendLine("public static float ParseSingle(string value) => float.Parse(value, NumberStyles.Float | NumberStyles.AllowThousands, CultureInfo.InvariantCulture);");
        writer.AppendLine("public static double ParseDouble(string value) => double.Parse(value, NumberStyles.Float | NumberStyles.AllowThousands, CultureInfo.InvariantCulture);");
        writer.AppendLine("public static bool ParseBoolean(string value)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("var trimmed = value.Trim();");
        writer.AppendLine("if (trimmed == \"1\")");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("return true;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("if (trimmed == \"0\")");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("return false;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("return bool.Parse(value);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        AppendNamespaceEnd(writer);
        return writer.ToString();
    }

    private static string RenderIndexNodeClass(GeneratedSheetModel sheet, int level)
    {
        var writer = new CodeWriter();
        var currentKeyField = sheet.PrimaryKeyFields[level];
        var currentTypeName = BuildIndexNodeTypeName(sheet, level);
        var isLeaf = level == sheet.PrimaryKeyFields.Count - 1;
        var valueTypeName = isLeaf ? sheet.RowTypeName : BuildIndexNodeTypeName(sheet, level + 1);
        var remainingKeyFields = sheet.PrimaryKeyFields.Skip(level + 1).ToList();

        writer.AppendLine($"public sealed partial class {currentTypeName}");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine($"private readonly IReadOnlyDictionary<{MapToCSharpType(currentKeyField.TypeDescriptor)}, {valueTypeName}> _by{currentKeyField.PropertyName};");
        writer.AppendLine();
        writer.AppendLine($"internal {currentTypeName}(IReadOnlyList<{sheet.RowTypeName}> rows)");
        writer.AppendLine("{");
        writer.Indent();
        if (isLeaf)
        {
            writer.AppendLine($"_by{currentKeyField.PropertyName} = rows.ToDictionary(row => row.{currentKeyField.PropertyName});");
        }
        else
        {
            writer.AppendLine($"_by{currentKeyField.PropertyName} = rows");
            writer.AppendLine($"    .GroupBy(row => row.{currentKeyField.PropertyName})");
            writer.AppendLine($"    .ToDictionary(group => group.Key, group => new {BuildIndexNodeTypeName(sheet, level + 1)}(group.ToList()));");
        }
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine($"public {valueTypeName} this[{MapToCSharpType(currentKeyField.TypeDescriptor)} {ToParameterIdentifier(currentKeyField.FieldName)}] => _by{currentKeyField.PropertyName}[{ToParameterIdentifier(currentKeyField.FieldName)}];");
        writer.AppendLine();
        if (isLeaf)
        {
            writer.AppendLine($"public bool TryGet({MapToCSharpType(currentKeyField.TypeDescriptor)} {ToParameterIdentifier(currentKeyField.FieldName)}, out {sheet.RowTypeName} row)");
            writer.AppendLine("{");
            writer.Indent();
            writer.AppendLine($"return _by{currentKeyField.PropertyName}.TryGetValue({ToParameterIdentifier(currentKeyField.FieldName)}, out row);");
            writer.Outdent();
            writer.AppendLine("}");
        }
        else
        {
            var signature = BuildMethodParameterList(new[] { currentKeyField }.Concat(remainingKeyFields));
            var nextArguments = BuildMethodArgumentList(remainingKeyFields);
            writer.AppendLine($"public bool TryGet({signature}, out {sheet.RowTypeName} row)");
            writer.AppendLine("{");
            writer.Indent();
            writer.AppendLine($"if (!_by{currentKeyField.PropertyName}.TryGetValue({ToParameterIdentifier(currentKeyField.FieldName)}, out var nextIndex))");
            writer.AppendLine("{");
            writer.Indent();
            writer.AppendLine("row = null;");
            writer.AppendLine("return false;");
            writer.Outdent();
            writer.AppendLine("}");
            writer.AppendLine();
            writer.AppendLine($"return nextIndex.TryGet({nextArguments}, out row);");
            writer.Outdent();
            writer.AppendLine("}");
        }
        writer.Outdent();
        writer.AppendLine("}");
        return writer.ToString();
    }

    private static string RenderWorkbookFile(LightyWorkbook workbook, IReadOnlyList<GeneratedSheetModel> sheets)
    {
        var writer = new CodeWriter();
        AppendNamespaceStart(writer);
        writer.AppendLine($"public sealed partial class {ToTypeIdentifier(workbook.Name)}Workbook");
        writer.AppendLine("{");
        writer.Indent();
        foreach (var sheet in sheets)
        {
            writer.AppendLine($"public {sheet.TableTypeName} {sheet.TypeName} {{ get; }}");
        }
        writer.AppendLine();
        writer.AppendLine($"private {ToTypeIdentifier(workbook.Name)}Workbook(");
        writer.Indent();
        for (var index = 0; index < sheets.Count; index += 1)
        {
            var suffix = index == sheets.Count - 1 ? string.Empty : ",";
            writer.AppendLine($"{sheets[index].TableTypeName} {ToParameterIdentifier(sheets[index].Name)}{suffix}");
        }
        writer.Outdent();
        writer.AppendLine(")");
        writer.AppendLine("{");
        writer.Indent();
        foreach (var sheet in sheets)
        {
            writer.AppendLine($"{sheet.TypeName} = {ToParameterIdentifier(sheet.Name)};");
        }
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine($"internal static {ToTypeIdentifier(workbook.Name)}Workbook Create()");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine($"return new {ToTypeIdentifier(workbook.Name)}Workbook(");
        writer.Indent();
        for (var index = 0; index < sheets.Count; index += 1)
        {
            var suffix = index == sheets.Count - 1 ? string.Empty : ",";
            writer.AppendLine($"{sheets[index].TableTypeName}.Create(){suffix}");
        }
        writer.Outdent();
        writer.AppendLine(");");
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        AppendNamespaceEnd(writer);
        return writer.ToString();
    }

    private static string RenderEntryPointFile(IReadOnlyList<string> workbookNames, IReadOnlyList<string> flowChartRelativePaths)
    {
        var writer = new CodeWriter();
        writer.AppendLine("using System;");
        writer.AppendLine("using System.Collections.Generic;");
        writer.AppendLine("using System.Linq;");
        writer.AppendLine();
        AppendNamespaceStart(writer);
        writer.AppendLine("internal interface ILightyDesignEditableTable");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("void RebuildIndexes();");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("public static partial class LDD");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("private static readonly object EditingSync = new object();");
        writer.AppendLine("private static readonly HashSet<ILightyDesignEditableTable> DirtyTables = new HashSet<ILightyDesignEditableTable>();");
        writer.AppendLine("private static int EditingScopeRefCount;");
        writer.AppendLine();
        writer.AppendLine("public sealed class EditingScope : IDisposable");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("private bool _disposed;");
        writer.AppendLine();
        writer.AppendLine("public EditingScope()");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("EnterEditingScope();");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("public void Dispose()");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (_disposed)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("return;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("_disposed = true;");
        writer.AppendLine("ExitEditingScope();");
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();

        foreach (var workbookName in workbookNames)
        {
            var workbookTypeName = $"{ToTypeIdentifier(workbookName)}Workbook";
            var workbookPropertyName = ToTypeIdentifier(workbookName);
            writer.AppendLine($"public static {workbookTypeName} {workbookPropertyName} {{ get; }} = {workbookTypeName}.Create();");
        }

        foreach (var flowChartRelativePath in flowChartRelativePaths)
        {
            var propertyName = LightyFlowChartCodegenNaming.BuildLddFlowChartPropertyName(flowChartRelativePath);
            var typeName = $"FlowCharts.Files.{BuildFlowChartTypePath(flowChartRelativePath)}.{LightyFlowChartFileCodeGenerator.BuildDefinitionTypeName(flowChartRelativePath)}";
            writer.AppendLine($"public static {typeName} {propertyName} {{ get; }} = {typeName}.Create();");
        }

        writer.AppendLine();
        writer.AppendLine("public static EditingScope BeginEditing()");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("return new EditingScope();");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("public static void Initialize()");
        writer.AppendLine("{");
        writer.Indent();
        foreach (var workbookName in workbookNames)
        {
            writer.AppendLine($"_ = {ToTypeIdentifier(workbookName)};");
        }
        foreach (var flowChartRelativePath in flowChartRelativePaths)
        {
            writer.AppendLine($"_ = {LightyFlowChartCodegenNaming.BuildLddFlowChartPropertyName(flowChartRelativePath)};");
        }
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("internal static void MarkDirty(ILightyDesignEditableTable table)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (table == null)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("throw new ArgumentNullException(nameof(table));");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("ILightyDesignEditableTable[] tablesToRebuild = null;");
        writer.AppendLine("lock (EditingSync)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (EditingScopeRefCount > 0)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("DirtyTables.Add(table);");
        writer.AppendLine("return;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("tablesToRebuild = new[] { table }; ");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("RebuildIndexes(tablesToRebuild);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("private static void EnterEditingScope()");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("lock (EditingSync)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("EditingScopeRefCount += 1;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("private static void ExitEditingScope()");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("ILightyDesignEditableTable[] tablesToRebuild = null;");
        writer.AppendLine("lock (EditingSync)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (EditingScopeRefCount == 0)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("return;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("EditingScopeRefCount -= 1;");
        writer.AppendLine("if (EditingScopeRefCount > 0 || DirtyTables.Count == 0)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("return;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("tablesToRebuild = DirtyTables.ToArray();");
        writer.AppendLine("DirtyTables.Clear();");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("RebuildIndexes(tablesToRebuild);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("private static void RebuildIndexes(IEnumerable<ILightyDesignEditableTable> tables)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (tables == null)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("return;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("foreach (var table in tables)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("table.RebuildIndexes();");
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        AppendNamespaceEnd(writer);
        return writer.ToString();
    }

    private static string BuildReferenceLiteral(LightyWorkspace workspace, LightyReferenceTarget target, LightyReferenceValue referenceValue)
    {
        if (!workspace.TryGetWorkbook(target.WorkbookName, out var targetWorkbook) || targetWorkbook is null)
        {
            throw new LightyCoreException($"Reference target workbook '{target.WorkbookName}' was not found during code generation.");
        }

        if (!targetWorkbook.TryGetSheet(target.SheetName, out var targetSheet) || targetSheet is null)
        {
            throw new LightyCoreException($"Reference target sheet '{target.WorkbookName}.{target.SheetName}' was not found during code generation.");
        }

        var targetFields = targetSheet.Header.Columns
            .Select((column, index) => new { Column = column, Index = index })
            .Where(entry => !entry.Column.TryGetExportScope(out var exportScope) || exportScope != LightyExportScope.None)
            .Select(entry => AnalyzeField(entry.Column, entry.Index))
            .ToList();
        var primaryKeyFields = ResolvePrimaryKeyFields(targetFields);

        if (primaryKeyFields.Count == 0)
        {
            throw new LightyCoreException($"Reference target '{target.WorkbookName}.{target.SheetName}' does not define any exportable key column.");
        }

        if (primaryKeyFields.Count != referenceValue.Identifiers.Count)
        {
            throw new LightyCoreException($"Reference target '{target.WorkbookName}.{target.SheetName}' expects {primaryKeyFields.Count} identifier(s), but got {referenceValue.Identifiers.Count}.");
        }

        var identifierLiterals = string.Join(", ", referenceValue.Identifiers.Select(ToStringLiteral));
        var targetRowTypeName = $"{ToTypeIdentifier(target.SheetName)}Row";
        var resolverExpression = BuildReferenceResolverExpression(target, primaryKeyFields);
        return $"new DesignDataReference<{targetRowTypeName}>(\"{target.WorkbookName}\", \"{target.SheetName}\", identifiers => {resolverExpression}, {identifierLiterals})";
    }

    private static string BuildReferenceResolverExpression(LightyReferenceTarget target, IReadOnlyList<GeneratedFieldModel> primaryKeyFields)
    {
        var expression = $"LDD.{ToTypeIdentifier(target.WorkbookName)}.{ToTypeIdentifier(target.SheetName)}";
        for (var index = 0; index < primaryKeyFields.Count; index += 1)
        {
            expression += $"[{BuildIdentifierAccessExpression(primaryKeyFields[index], index)}]";
        }

        return expression;
    }

    private static string BuildIdentifierAccessExpression(GeneratedFieldModel field, int identifierIndex)
    {
        var valueExpression = $"identifiers[{identifierIndex}]";
        return field.TypeDescriptor.RawType switch
        {
            "string" => valueExpression,
            "int" => $"DesignDataReferenceHelper.ParseInt32({valueExpression})",
            "long" => $"DesignDataReferenceHelper.ParseInt64({valueExpression})",
            "float" => $"DesignDataReferenceHelper.ParseSingle({valueExpression})",
            "double" => $"DesignDataReferenceHelper.ParseDouble({valueExpression})",
            "bool" => $"DesignDataReferenceHelper.ParseBoolean({valueExpression})",
            _ => throw new LightyCoreException($"Unsupported reference key type '{field.TypeDescriptor.RawType}'."),
        };
    }

    private static void AppendIndexMembers(CodeWriter writer, GeneratedSheetModel sheet, LightyExportScope? indexAvailabilityScope)
    {
        if (!indexAvailabilityScope.HasValue)
        {
            return;
        }

        AppendScopeBlock(writer, indexAvailabilityScope.Value, () =>
        {
            if (sheet.PrimaryKeyFields.Count == 1)
            {
                var keyField = sheet.PrimaryKeyFields[0];
                writer.AppendLine($"private IReadOnlyDictionary<{MapToCSharpType(keyField.TypeDescriptor)}, {sheet.RowTypeName}> _by{keyField.PropertyName} = new Dictionary<{MapToCSharpType(keyField.TypeDescriptor)}, {sheet.RowTypeName}>();");
            }
            else if (sheet.PrimaryKeyFields.Count > 1)
            {
                var rootKeyField = sheet.PrimaryKeyFields[0];
                writer.AppendLine($"private IReadOnlyDictionary<{MapToCSharpType(rootKeyField.TypeDescriptor)}, {BuildIndexNodeTypeName(sheet, 1)}> _by{rootKeyField.PropertyName} = new Dictionary<{MapToCSharpType(rootKeyField.TypeDescriptor)}, {BuildIndexNodeTypeName(sheet, 1)}>();");
            }
        });
    }

    private static void AppendIndexRebuildBody(CodeWriter writer, GeneratedSheetModel sheet, LightyExportScope? indexAvailabilityScope, string rowsExpression)
    {
        if (!indexAvailabilityScope.HasValue)
        {
            return;
        }

        AppendScopeBlock(writer, indexAvailabilityScope.Value, () =>
        {
            if (sheet.PrimaryKeyFields.Count == 1)
            {
                var keyField = sheet.PrimaryKeyFields[0];
                writer.AppendLine($"_by{keyField.PropertyName} = {rowsExpression}.ToDictionary(row => row.{keyField.PropertyName});");
            }
            else if (sheet.PrimaryKeyFields.Count > 1)
            {
                var rootKeyField = sheet.PrimaryKeyFields[0];
                writer.AppendLine($"_by{rootKeyField.PropertyName} = {rowsExpression}");
                writer.AppendLine($"    .GroupBy(row => row.{rootKeyField.PropertyName})");
                writer.AppendLine($"    .ToDictionary(group => group.Key, group => new {BuildIndexNodeTypeName(sheet, 1)}(group.ToList()));");
            }
        });
    }

    private static void AppendIndexAccessor(CodeWriter writer, GeneratedSheetModel sheet, LightyExportScope? indexAvailabilityScope)
    {
        if (!indexAvailabilityScope.HasValue)
        {
            return;
        }

        writer.AppendLine();
        AppendScopeBlock(writer, indexAvailabilityScope.Value, () =>
        {
            if (sheet.PrimaryKeyFields.Count == 1)
            {
                var keyField = sheet.PrimaryKeyFields[0];
                writer.AppendLine($"public {sheet.RowTypeName} this[{MapToCSharpType(keyField.TypeDescriptor)} {ToParameterIdentifier(keyField.FieldName)}] => _by{keyField.PropertyName}[{ToParameterIdentifier(keyField.FieldName)}];");
                writer.AppendLine($"public bool TryGet({MapToCSharpType(keyField.TypeDescriptor)} {ToParameterIdentifier(keyField.FieldName)}, out {sheet.RowTypeName} row) => _by{keyField.PropertyName}.TryGetValue({ToParameterIdentifier(keyField.FieldName)}, out row);");
            }
            else if (sheet.PrimaryKeyFields.Count > 1)
            {
                var rootKeyField = sheet.PrimaryKeyFields[0];
                writer.AppendLine($"public {BuildIndexNodeTypeName(sheet, 1)} this[{MapToCSharpType(rootKeyField.TypeDescriptor)} {ToParameterIdentifier(rootKeyField.FieldName)}] => _by{rootKeyField.PropertyName}[{ToParameterIdentifier(rootKeyField.FieldName)}];");
                writer.AppendLine($"public {sheet.RowTypeName} this[{BuildMethodParameterList(sheet.PrimaryKeyFields)}] => {BuildCompositeIndexerExpression(sheet.PrimaryKeyFields)};");
                writer.AppendLine($"public bool TryGet({BuildMethodParameterList(sheet.PrimaryKeyFields)}, out {sheet.RowTypeName} row)");
                writer.AppendLine("{");
                writer.Indent();
                writer.AppendLine($"if (!_by{rootKeyField.PropertyName}.TryGetValue({ToParameterIdentifier(rootKeyField.FieldName)}, out var nextIndex))");
                writer.AppendLine("{");
                writer.Indent();
                writer.AppendLine("row = null;");
                writer.AppendLine("return false;");
                writer.Outdent();
                writer.AppendLine("}");
                writer.AppendLine();
                writer.AppendLine($"return nextIndex.TryGet({BuildMethodArgumentList(sheet.PrimaryKeyFields.Skip(1))}, out row);");
                writer.Outdent();
                writer.AppendLine("}");
            }
        });
    }

    private static void AppendMutationMembers(CodeWriter writer, GeneratedSheetModel sheet, LightyExportScope? indexAvailabilityScope)
    {
        writer.AppendLine();
        writer.AppendLine($"public void Add({sheet.RowTypeName} row)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("AddRow(row);");
        writer.AppendLine("MarkDirty();");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine($"public void AddRange(IEnumerable<{sheet.RowTypeName}> rows)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (rows == null)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("throw new ArgumentNullException(nameof(rows));");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("var added = false;");
        writer.AppendLine("foreach (var row in rows)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("AddRow(row);");
        writer.AppendLine("added = true;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("if (added)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("MarkDirty();");
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine($"public bool Remove({sheet.RowTypeName} row)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (row == null)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("throw new ArgumentNullException(nameof(row));");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("if (!_rows.Contains(row))");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("return false;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("RemoveRow(row);");
        writer.AppendLine("MarkDirty();");
        writer.AppendLine("return true;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("public void Clear()");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (_rows.Count == 0)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("return;");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("foreach (var row in _rows)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("row.SetEditNotifier(null);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("_rows.Clear();");
        writer.AppendLine("MarkDirty();");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine($"public void ReplaceAll(IEnumerable<{sheet.RowTypeName}> rows)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("if (rows == null)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("throw new ArgumentNullException(nameof(rows));");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("foreach (var existingRow in _rows)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("existingRow.SetEditNotifier(null);");
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine("_rows.Clear();");
        writer.AppendLine("LoadRows(rows);");
        writer.AppendLine("MarkDirty();");
        writer.Outdent();
        writer.AppendLine("}");

        if (!indexAvailabilityScope.HasValue)
        {
            return;
        }

        writer.AppendLine();
        AppendScopeBlock(writer, indexAvailabilityScope.Value, () =>
        {
            var keyParameters = BuildMethodParameterList(sheet.PrimaryKeyFields);
            var keyArguments = BuildMethodArgumentList(sheet.PrimaryKeyFields);
            writer.AppendLine($"public bool RemoveByKey({keyParameters})");
            writer.AppendLine("{");
            writer.Indent();
            writer.AppendLine($"return TryGet({keyArguments}, out var row) && row != null && Remove(row);");
            writer.Outdent();
            writer.AppendLine("}");
            writer.AppendLine();
            writer.AppendLine($"public bool EditByKey({keyParameters}, Action<{sheet.RowTypeName}> editAction)");
            writer.AppendLine("{");
            writer.Indent();
            writer.AppendLine("if (editAction == null)");
            writer.AppendLine("{");
            writer.Indent();
            writer.AppendLine("throw new ArgumentNullException(nameof(editAction));");
            writer.Outdent();
            writer.AppendLine("}");
            writer.AppendLine();
            writer.AppendLine($"if (!TryGet({keyArguments}, out var row) || row == null)");
            writer.AppendLine("{");
            writer.Indent();
            writer.AppendLine("return false;");
            writer.Outdent();
            writer.AppendLine("}");
            writer.AppendLine();
            writer.AppendLine("using (new LDD.EditingScope())");
            writer.AppendLine("{");
            writer.Indent();
            writer.AppendLine("editAction(row);");
            writer.Outdent();
            writer.AppendLine("}");
            writer.AppendLine("return true;");
            writer.Outdent();
            writer.AppendLine("}");
        });
    }

    private static LightyExportScope? ResolveIndexAvailabilityScope(IReadOnlyList<GeneratedFieldModel> primaryKeyFields)
    {
        if (primaryKeyFields.Count == 0)
        {
            return null;
        }

        var currentScope = LightyExportScope.All;
        foreach (var field in primaryKeyFields)
        {
            currentScope = MergeAvailabilityScope(currentScope, field.ExportScope);
            if (currentScope == LightyExportScope.None)
            {
                return null;
            }
        }

        return currentScope;
    }

    private static LightyExportScope MergeAvailabilityScope(LightyExportScope left, LightyExportScope right)
    {
        if (left == LightyExportScope.None || right == LightyExportScope.None)
        {
            return LightyExportScope.None;
        }

        if (left == LightyExportScope.All)
        {
            return right;
        }

        if (right == LightyExportScope.All)
        {
            return left;
        }

        return left == right ? left : LightyExportScope.None;
    }

    private static void AppendScopedItems<T>(
        CodeWriter writer,
        IEnumerable<T> items,
        Func<T, LightyExportScope> scopeSelector,
        Action<CodeWriter, T> appendItem)
    {
        var materialized = items.ToList();
        AppendScopeGroup(writer, materialized, scopeSelector, LightyExportScope.All, appendItem);
        AppendScopeGroup(writer, materialized, scopeSelector, LightyExportScope.Client, appendItem);
        AppendScopeGroup(writer, materialized, scopeSelector, LightyExportScope.Server, appendItem);
    }

    private static void AppendScopeGroup<T>(
        CodeWriter writer,
        IReadOnlyList<T> items,
        Func<T, LightyExportScope> scopeSelector,
        LightyExportScope targetScope,
        Action<CodeWriter, T> appendItem)
    {
        var scopedItems = items.Where(item => scopeSelector(item) == targetScope).ToList();
        if (scopedItems.Count == 0)
        {
            return;
        }

        AppendScopeBlock(writer, targetScope, () =>
        {
            foreach (var item in scopedItems)
            {
                appendItem(writer, item);
            }
        });
    }

    private static void AppendScopeBlock(CodeWriter writer, LightyExportScope scope, Action appendBody)
    {
        if (scope == LightyExportScope.None)
        {
            return;
        }

        var symbolName = GetPreprocessorSymbol(scope);
        if (symbolName is null)
        {
            appendBody();
            return;
        }

        writer.AppendLine($"#if {symbolName}");
        appendBody();
        writer.AppendLine("#endif");
    }

    private static void AppendRowAdd(CodeWriter writer, GeneratedRowModel row, string addCall)
    {
        writer.AppendLine($"{addCall}(new {row.RowTypeName}()");
        writer.AppendLine("{");
        writer.Indent();
        AppendScopedItems(writer, row.Assignments, assignment => assignment.Field.ExportScope, (scopedWriter, assignment) =>
        {
            scopedWriter.AppendLine($"{assignment.Field.PropertyName} = {assignment.ValueLiteral},");
        });
        writer.Outdent();
        writer.AppendLine("});");
    }

    private static IReadOnlyList<GeneratedSheetChunkModel> BuildDataChunks(string typeName, IReadOnlyList<GeneratedRowModel> rows)
    {
        if (rows.Count <= DataChunkRowThreshold)
        {
            return Array.Empty<GeneratedSheetChunkModel>();
        }

        var chunks = new List<GeneratedSheetChunkModel>();
        var chunkNumber = 1;
        for (var startIndex = 0; startIndex < rows.Count; startIndex += DataChunkRowThreshold)
        {
            var chunkRows = rows.Skip(startIndex).Take(DataChunkRowThreshold).ToList();
            chunks.Add(new GeneratedSheetChunkModel(
                chunkNumber,
                $"{typeName}Data{chunkNumber}",
                chunkRows));
            chunkNumber += 1;
        }

        return chunks;
    }

    private static IReadOnlyList<GeneratedIndexNodeModel> BuildIndexNodes(GeneratedSheetModel sheet)
    {
        var availabilityScope = ResolveIndexAvailabilityScope(sheet.PrimaryKeyFields);
        if (!availabilityScope.HasValue || sheet.PrimaryKeyFields.Count <= 1)
        {
            return Array.Empty<GeneratedIndexNodeModel>();
        }

        var nodes = new List<GeneratedIndexNodeModel>(sheet.PrimaryKeyFields.Count - 1);
        for (var level = 1; level < sheet.PrimaryKeyFields.Count; level += 1)
        {
            nodes.Add(new GeneratedIndexNodeModel(level, BuildIndexNodeTypeName(sheet, level), availabilityScope.Value));
        }

        return nodes;
    }

    private static string? GetPreprocessorSymbol(LightyExportScope scope)
    {
        return scope switch
        {
            LightyExportScope.Client => "LDD_Client",
            LightyExportScope.Server => "LDD_Server",
            LightyExportScope.All => null,
            _ => null,
        };
    }

    private static void AppendNamespaceStart(CodeWriter writer)
    {
        writer.AppendLine($"namespace {GeneratedNamespace}");
        writer.AppendLine("{");
        writer.Indent();
    }

    private static void AppendNamespaceEnd(CodeWriter writer)
    {
        writer.Outdent();
        writer.AppendLine("}");
    }

    private static string BuildIndexNodeTypeName(GeneratedSheetModel sheet, int level)
    {
        return string.Join(string.Empty, sheet.PrimaryKeyFields.Take(level).Select(field => $"{sheet.TypeName}By{field.PropertyName}")) + "Index";
    }

    private static string BuildBackingFieldName(string propertyName)
    {
        return propertyName.StartsWith("@", StringComparison.Ordinal)
            ? $"_{propertyName[1..]}"
            : $"_{propertyName}";
    }

    private static string BuildMethodParameterList(IEnumerable<GeneratedFieldModel> fields)
    {
        return string.Join(", ", fields.Select(field => $"{MapToCSharpType(field.TypeDescriptor)} {ToParameterIdentifier(field.FieldName)}"));
    }

    private static string BuildMethodArgumentList(IEnumerable<GeneratedFieldModel> fields)
    {
        return string.Join(", ", fields.Select(field => ToParameterIdentifier(field.FieldName)));
    }

    private static string BuildCompositeIndexerExpression(IReadOnlyList<GeneratedFieldModel> primaryKeyFields)
    {
        var rootKeyField = primaryKeyFields[0];
        var expression = $"_by{rootKeyField.PropertyName}[{ToParameterIdentifier(rootKeyField.FieldName)}]";
        foreach (var keyField in primaryKeyFields.Skip(1))
        {
            expression += $"[{ToParameterIdentifier(keyField.FieldName)}]";
        }

        return expression;
    }

    private static string BuildFlowChartTypePath(string relativePath)
    {
        return string.Join('.', relativePath.Split('/').Where(segment => !string.IsNullOrWhiteSpace(segment)).Select(LightyFlowChartCodegenNaming.ToTypeIdentifier));
    }

    private static string ToTypeIdentifier(string value)
    {
        if (IsSimpleIdentifier(value))
        {
            return CSharpKeywords.Contains(value) ? $"@{value}" : value;
        }

        var tokens = TokenizeIdentifier(value);
        if (tokens.Count == 0)
        {
            return "GeneratedType";
        }

        var builder = new StringBuilder();
        foreach (var token in tokens)
        {
            builder.Append(char.ToUpperInvariant(token[0]));
            if (token.Length > 1)
            {
                builder.Append(token[1..]);
            }
        }

        var candidate = builder.ToString();
        if (char.IsDigit(candidate[0]))
        {
            candidate = $"_{candidate}";
        }

        return CSharpKeywords.Contains(candidate) ? $"@{candidate}" : candidate;
    }

    private static string ToPropertyIdentifier(string value)
    {
        if (IsSimpleIdentifier(value))
        {
            return CSharpKeywords.Contains(value) ? $"@{value}" : value;
        }

        return ToTypeIdentifier(value);
    }

    private static string ToParameterIdentifier(string value)
    {
        var propertyIdentifier = ToTypeIdentifier(value);
        var baseIdentifier = propertyIdentifier.StartsWith('@') ? propertyIdentifier[1..] : propertyIdentifier;
        var candidate = baseIdentifier.All(character => !char.IsLetter(character) || char.IsUpper(character))
            ? baseIdentifier.ToLowerInvariant()
            : char.ToLowerInvariant(baseIdentifier[0]) + baseIdentifier[1..];
        return CSharpKeywords.Contains(candidate) ? $"@{candidate}" : candidate;
    }

    private static IReadOnlyList<string> TokenizeIdentifier(string value)
    {
        var tokens = new List<string>();
        var current = new StringBuilder();

        foreach (var character in value)
        {
            if (char.IsLetterOrDigit(character) || character == '_')
            {
                current.Append(character);
                continue;
            }

            if (current.Length > 0)
            {
                tokens.Add(current.ToString());
                current.Clear();
            }
        }

        if (current.Length > 0)
        {
            tokens.Add(current.ToString());
        }

        return tokens;
    }

    private static bool IsSimpleIdentifier(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var trimmed = value.Trim();
        if (!(char.IsLetter(trimmed[0]) || trimmed[0] == '_'))
        {
            return false;
        }

        return trimmed.All(character => char.IsLetterOrDigit(character) || character == '_');
    }

    private static string ToStringLiteral(string value)
    {
        return "\"" + value
            .Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("\"", "\\\"", StringComparison.Ordinal)
            .Replace("\r", "\\r", StringComparison.Ordinal)
            .Replace("\n", "\\n", StringComparison.Ordinal)
            .Replace("\t", "\\t", StringComparison.Ordinal) + "\"";
    }

    private sealed record GeneratedSheetModel(
        string Name,
        string TypeName,
        string RowTypeName,
        string TableTypeName,
        IReadOnlyList<GeneratedFieldModel> Fields,
        IReadOnlyList<GeneratedFieldModel> PrimaryKeyFields,
        IReadOnlyList<GeneratedRowModel> Rows,
        IReadOnlyList<GeneratedSheetChunkModel> DataChunks)
    {
        public string FileName => TypeName;

        public bool UsesChunkedDataInitialization => DataChunks.Count > 0;
    }

    private sealed record GeneratedSheetChunkModel(
        int ChunkNumber,
        string TypeName,
        IReadOnlyList<GeneratedRowModel> Rows);

    private sealed record GeneratedIndexNodeModel(
        int Level,
        string TypeName,
        LightyExportScope AvailabilityScope);

    private sealed record GeneratedFieldModel(
        string FieldName,
        string PropertyName,
        string? DisplayName,
        int SourceIndex,
        LightyColumnTypeDescriptor TypeDescriptor,
        string CSharpTypeName,
        LightyExportScope ExportScope);

    private sealed record GeneratedFieldAssignment(GeneratedFieldModel Field, string ValueLiteral);

    private sealed record GeneratedRowModel(string RowTypeName, IReadOnlyList<GeneratedFieldAssignment> Assignments);

    private sealed class CodeWriter
    {
        private readonly StringBuilder _builder = new();
        private int _indentLevel;

        public void Indent() => _indentLevel += 1;

        public void Outdent() => _indentLevel = Math.Max(0, _indentLevel - 1);

        public void AppendLine(string value = "")
        {
            if (value.Length > 0)
            {
                _builder.Append(new string(' ', _indentLevel * 4));
                _builder.AppendLine(value);
                return;
            }

            _builder.AppendLine();
        }

        public void Append(string value)
        {
            var lines = value.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
            foreach (var line in lines)
            {
                if (line.Length == 0)
                {
                    _builder.AppendLine();
                    continue;
                }

                _builder.Append(new string(' ', _indentLevel * 4));
                _builder.AppendLine(line);
            }
        }

        public override string ToString() => _builder.ToString();
    }
}
