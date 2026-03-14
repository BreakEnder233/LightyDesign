using System.Globalization;
using System.Text;
using LightyDesign.Core;

namespace LightyDesign.Generator;

public sealed class LightyWorkbookCodeGenerator
{
    private const string GeneratedNamespace = "LightyDesignData";
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

        if (string.IsNullOrWhiteSpace(workbook.CodegenOptions.OutputRelativePath))
        {
            throw new LightyCoreException($"Workbook '{workbook.Name}' does not define a code generation output path.");
        }

        var files = new List<LightyGeneratedCodeFile>();
        var generatedSheets = workbook.Sheets.Select(sheet => AnalyzeSheet(sheet)).ToList();

        foreach (var sheet in generatedSheets)
        {
            files.Add(new LightyGeneratedCodeFile($"{workbook.Name}/{sheet.FileName}.cs", RenderSheetFile(workbook, sheet)));
        }

        files.Add(new LightyGeneratedCodeFile($"{workbook.Name}/{workbook.Name}.cs", RenderWorkbookFile(workbook, generatedSheets)));
        files.Add(new LightyGeneratedCodeFile("LDD.cs", RenderEntryPointFile(new[] { workbook.Name })));

        return new LightyGeneratedWorkbookPackage(workbook.CodegenOptions.OutputRelativePath!, files);
    }

    public string GenerateEntryPointFile(IEnumerable<string> workbookNames)
    {
        ArgumentNullException.ThrowIfNull(workbookNames);

        var normalizedWorkbookNames = workbookNames
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Select(name => name.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (normalizedWorkbookNames.Count == 0)
        {
            throw new ArgumentException("At least one workbook name is required to generate LDD entry point.", nameof(workbookNames));
        }

        return RenderEntryPointFile(normalizedWorkbookNames);
    }

    private static GeneratedSheetModel AnalyzeSheet(LightySheet sheet)
    {
        var exportedColumns = sheet.Header.Columns
            .Select((column, index) => new { Column = column, Index = index })
            .Where(entry => !entry.Column.TryGetExportScope(out var exportScope) || exportScope != LightyExportScope.None)
            .Select(entry => AnalyzeField(entry.Column, entry.Index))
            .ToList();

        var primaryKeyFields = ResolvePrimaryKeyFields(exportedColumns);
        var rows = sheet.Rows
            .Select((row, rowIndex) => AnalyzeRow(sheet, row, rowIndex, exportedColumns))
            .ToList();

        return new GeneratedSheetModel(
            sheet.Name,
            ToTypeIdentifier(sheet.Name),
            $"{ToTypeIdentifier(sheet.Name)}Row",
            $"{ToTypeIdentifier(sheet.Name)}Table",
            exportedColumns,
            primaryKeyFields,
            rows);
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

    private static GeneratedRowModel AnalyzeRow(LightySheet sheet, LightySheetRow row, int rowIndex, IReadOnlyList<GeneratedFieldModel> fields)
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

            assignments.Add(new GeneratedFieldAssignment(field, BuildValueLiteral(field.TypeDescriptor, parseResult.Value)));
        }

        return new GeneratedRowModel(assignments);
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

        return compositeFields;
    }

    private static void EnsureSupportedType(LightyColumnTypeDescriptor descriptor)
    {
        if (descriptor.IsReference)
        {
            throw new LightyCoreException($"Code generation does not yet support reference type '{descriptor.RawType}'.");
        }

        if (descriptor.IsList)
        {
            EnsureSupportedType(LightyColumnTypeDescriptor.Parse(descriptor.ValueType));
            return;
        }

        if (descriptor.IsDictionary)
        {
            EnsureSupportedType(LightyColumnTypeDescriptor.Parse(descriptor.DictionaryKeyType!));
            EnsureSupportedType(LightyColumnTypeDescriptor.Parse(descriptor.DictionaryValueType!));
        }
    }

    private static string MapToCSharpType(LightyColumnTypeDescriptor descriptor)
    {
        if (descriptor.IsList)
        {
            return $"IReadOnlyList<{MapToCSharpType(LightyColumnTypeDescriptor.Parse(descriptor.ValueType))}>";
        }

        if (descriptor.IsDictionary)
        {
            return $"IReadOnlyDictionary<{MapToCSharpType(LightyColumnTypeDescriptor.Parse(descriptor.DictionaryKeyType!))}, {MapToCSharpType(LightyColumnTypeDescriptor.Parse(descriptor.DictionaryValueType!))}>";
        }

        if (descriptor.IsReference)
        {
            throw new LightyCoreException($"Code generation does not yet support reference type '{descriptor.RawType}'.");
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

    private static string BuildValueLiteral(LightyColumnTypeDescriptor descriptor, object? value)
    {
        if (descriptor.IsList)
        {
            var elementDescriptor = LightyColumnTypeDescriptor.Parse(descriptor.ValueType);
            var values = (IReadOnlyList<object?>)(value ?? Array.Empty<object?>());
            var items = string.Join(", ", values.Select(item => BuildValueLiteral(elementDescriptor, item)));
            return $"new List<{MapToCSharpType(elementDescriptor)}> {{ {items} }}";
        }

        if (descriptor.IsDictionary)
        {
            var keyDescriptor = LightyColumnTypeDescriptor.Parse(descriptor.DictionaryKeyType!);
            var valueDescriptor = LightyColumnTypeDescriptor.Parse(descriptor.DictionaryValueType!);
            var pairs = (IReadOnlyDictionary<object, object?>)(value ?? new Dictionary<object, object?>());
            var items = string.Join(", ", pairs.Select(pair => $"{{ {BuildValueLiteral(keyDescriptor, pair.Key)}, {BuildValueLiteral(valueDescriptor, pair.Value)} }}"));
            return $"new Dictionary<{MapToCSharpType(keyDescriptor)}, {MapToCSharpType(valueDescriptor)}> {{ {items} }}";
        }

        if (descriptor.IsReference)
        {
            throw new LightyCoreException($"Code generation does not yet support reference value '{descriptor.RawType}'.");
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

    private static string RenderSheetFile(LightyWorkbook workbook, GeneratedSheetModel sheet)
    {
        var writer = new CodeWriter();
        writer.AppendLine("using System.Collections.Generic;");
        writer.AppendLine("using System.Linq;");
        writer.AppendLine();
        writer.AppendLine($"namespace {GeneratedNamespace};");
        writer.AppendLine();
        writer.AppendLine($"public sealed class {sheet.RowTypeName}");
        writer.AppendLine("{");
        writer.Indent();
        AppendScopedItems(writer, sheet.Fields, field => field.ExportScope, (scopedWriter, field) =>
        {
            if (!string.IsNullOrWhiteSpace(field.DisplayName))
            {
                scopedWriter.AppendLine($"// {field.DisplayName}");
            }

            scopedWriter.AppendLine($"public required {field.CSharpTypeName} {field.PropertyName} {{ get; init; }}");
        });
        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();

        writer.Append(RenderTableClass(sheet));

        return writer.ToString();
    }

    private static string RenderTableClass(GeneratedSheetModel sheet)
    {
        var writer = new CodeWriter();
        var indexAvailabilityScope = ResolveIndexAvailabilityScope(sheet.PrimaryKeyFields);
        writer.AppendLine($"public sealed class {sheet.TableTypeName}");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine($"private readonly IReadOnlyList<{sheet.RowTypeName}> _rows;");

        AppendIndexMembers(writer, sheet, indexAvailabilityScope);

        writer.AppendLine();
        writer.AppendLine($"private {sheet.TableTypeName}(IReadOnlyList<{sheet.RowTypeName}> rows)");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine("_rows = rows;");

        AppendIndexConstructorBody(writer, sheet, indexAvailabilityScope);

        writer.Outdent();
        writer.AppendLine("}");
        writer.AppendLine();
        writer.AppendLine($"public IReadOnlyList<{sheet.RowTypeName}> Rows => _rows;");

        AppendIndexAccessor(writer, sheet, indexAvailabilityScope);

        writer.AppendLine();
        writer.AppendLine($"internal static {sheet.TableTypeName} Create()");
        writer.AppendLine("{");
        writer.Indent();
        writer.AppendLine($"return new {sheet.TableTypeName}(new List<{sheet.RowTypeName}>");
        writer.AppendLine("{");
        writer.Indent();
        foreach (var row in sheet.Rows)
        {
            writer.AppendLine("new()");
            writer.AppendLine("{");
            writer.Indent();
            AppendScopedItems(writer, row.Assignments, assignment => assignment.Field.ExportScope, (scopedWriter, assignment) =>
            {
                scopedWriter.AppendLine($"{assignment.Field.PropertyName} = {assignment.ValueLiteral},");
            });
            writer.Outdent();
            writer.AppendLine("},");
        }
        writer.Outdent();
        writer.AppendLine("});");
        writer.Outdent();
        writer.AppendLine("}");

        for (var level = 1; level < sheet.PrimaryKeyFields.Count && indexAvailabilityScope.HasValue; level += 1)
        {
            writer.AppendLine();
            AppendScopeBlock(writer, indexAvailabilityScope.Value, () =>
            {
                writer.Append(RenderIndexNodeClass(sheet, level));
            });
        }

        writer.Outdent();
        writer.AppendLine("}");
        return writer.ToString();
    }

    private static string RenderIndexNodeClass(GeneratedSheetModel sheet, int level)
    {
        var writer = new CodeWriter();
        var currentKeyField = sheet.PrimaryKeyFields[level];
        var currentTypeName = BuildIndexNodeTypeName(sheet, level);
        var isLeaf = level == sheet.PrimaryKeyFields.Count - 1;
        var valueTypeName = isLeaf ? sheet.RowTypeName : BuildIndexNodeTypeName(sheet, level + 1);

        writer.AppendLine($"public sealed class {currentTypeName}");
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
        writer.Outdent();
        writer.AppendLine("}");
        return writer.ToString();
    }

    private static string RenderWorkbookFile(LightyWorkbook workbook, IReadOnlyList<GeneratedSheetModel> sheets)
    {
        var writer = new CodeWriter();
        writer.AppendLine($"namespace {GeneratedNamespace};");
        writer.AppendLine();
        writer.AppendLine($"public sealed class {ToTypeIdentifier(workbook.Name)}Workbook");
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
        return writer.ToString();
    }

    private static string RenderEntryPointFile(IReadOnlyList<string> workbookNames)
    {
        var writer = new CodeWriter();
        writer.AppendLine($"namespace {GeneratedNamespace};");
        writer.AppendLine();
        writer.AppendLine("public static class LDD");
        writer.AppendLine("{");
        writer.Indent();

        foreach (var workbookName in workbookNames)
        {
            var workbookTypeName = $"{ToTypeIdentifier(workbookName)}Workbook";
            var workbookPropertyName = ToTypeIdentifier(workbookName);
            writer.AppendLine($"public static {workbookTypeName} {workbookPropertyName} {{ get; }} = {workbookTypeName}.Create();");
        }

        writer.AppendLine();
        writer.AppendLine("public static void Initialize()");
        writer.AppendLine("{");
        writer.Indent();
        foreach (var workbookName in workbookNames)
        {
            writer.AppendLine($"_ = {ToTypeIdentifier(workbookName)};");
        }
        writer.Outdent();
        writer.AppendLine("}");
        writer.Outdent();
        writer.AppendLine("}");
        return writer.ToString();
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
                writer.AppendLine($"private readonly IReadOnlyDictionary<{MapToCSharpType(keyField.TypeDescriptor)}, {sheet.RowTypeName}> _by{keyField.PropertyName};");
            }
            else if (sheet.PrimaryKeyFields.Count > 1)
            {
                var rootKeyField = sheet.PrimaryKeyFields[0];
                writer.AppendLine($"private readonly IReadOnlyDictionary<{MapToCSharpType(rootKeyField.TypeDescriptor)}, {BuildIndexNodeTypeName(sheet, 1)}> _by{rootKeyField.PropertyName};");
            }
        });
    }

    private static void AppendIndexConstructorBody(CodeWriter writer, GeneratedSheetModel sheet, LightyExportScope? indexAvailabilityScope)
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
                writer.AppendLine($"_by{keyField.PropertyName} = rows.ToDictionary(row => row.{keyField.PropertyName});");
            }
            else if (sheet.PrimaryKeyFields.Count > 1)
            {
                var rootKeyField = sheet.PrimaryKeyFields[0];
                writer.AppendLine($"_by{rootKeyField.PropertyName} = rows");
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
            }
            else if (sheet.PrimaryKeyFields.Count > 1)
            {
                var rootKeyField = sheet.PrimaryKeyFields[0];
                writer.AppendLine($"public {BuildIndexNodeTypeName(sheet, 1)} this[{MapToCSharpType(rootKeyField.TypeDescriptor)} {ToParameterIdentifier(rootKeyField.FieldName)}] => _by{rootKeyField.PropertyName}[{ToParameterIdentifier(rootKeyField.FieldName)}];");
            }
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

    private static string BuildIndexNodeTypeName(GeneratedSheetModel sheet, int level)
    {
        return string.Join(string.Empty, sheet.PrimaryKeyFields.Take(level).Select(field => $"{sheet.TypeName}By{field.PropertyName}")) + "Index";
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
        IReadOnlyList<GeneratedRowModel> Rows)
    {
        public string FileName => TypeName;
    }

    private sealed record GeneratedFieldModel(
        string FieldName,
        string PropertyName,
        string? DisplayName,
        int SourceIndex,
        LightyColumnTypeDescriptor TypeDescriptor,
        string CSharpTypeName,
        LightyExportScope ExportScope);

    private sealed record GeneratedFieldAssignment(GeneratedFieldModel Field, string ValueLiteral);

    private sealed record GeneratedRowModel(IReadOnlyList<GeneratedFieldAssignment> Assignments);

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