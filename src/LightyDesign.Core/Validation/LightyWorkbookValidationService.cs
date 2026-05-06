using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace LightyDesign.Core;

public static class LightyWorkbookValidationService
{
    public static void ValidateValidationRule(string type, JsonElement? validation, LightyWorkspace workspace)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(type);
        ArgumentNullException.ThrowIfNull(workspace);

        ValidateValidationRule(new ColumnDefine(
            fieldName: "ValidationPreview",
            type: type,
            attributes: validation.HasValue
                ? new Dictionary<string, JsonElement>
                {
                    [LightyHeaderTypes.Validation] = validation.Value.Clone(),
                }
                : null),
            workspace);
    }

    public static void ValidateValidationRule(ColumnDefine column, LightyWorkspace workspace)
    {
        ArgumentNullException.ThrowIfNull(column);
        ArgumentNullException.ThrowIfNull(workspace);

        _ = LightyColumnValueValidatorFactory.Create(
            column,
            workspace,
            new Dictionary<string, ReferenceTargetInfo>(StringComparer.OrdinalIgnoreCase));
    }

    public static LightyValidationReport ValidateWorkbook(LightyWorkspace workspace, LightyWorkbook workbook)
    {
        ArgumentNullException.ThrowIfNull(workspace);
        ArgumentNullException.ThrowIfNull(workbook);

        return ValidateWorkbooks(workspace, new[] { workbook });
    }

    public static LightyValidationReport ValidateWorkbooks(LightyWorkspace workspace, IEnumerable<LightyWorkbook> workbooks)
    {
        ArgumentNullException.ThrowIfNull(workspace);
        ArgumentNullException.ThrowIfNull(workbooks);

        var diagnostics = new List<LightyValidationDiagnostic>();
        var referenceCache = new Dictionary<string, ReferenceTargetInfo>(StringComparer.OrdinalIgnoreCase);

        foreach (var workbook in workbooks)
        {
            ValidateWorkbookCore(workspace, workbook, diagnostics, referenceCache);
        }

        return new LightyValidationReport(diagnostics);
    }

    public static void ValidateWorkbookOrThrow(LightyWorkspace workspace, LightyWorkbook workbook)
    {
        var report = ValidateWorkbook(workspace, workbook);
        ThrowIfInvalid(report, $"Workbook '{workbook.Name}' validation failed.");
    }

    public static void ValidateWorkbooksOrThrow(LightyWorkspace workspace, IEnumerable<LightyWorkbook> workbooks)
    {
        ArgumentNullException.ThrowIfNull(workbooks);

        var report = ValidateWorkbooks(workspace, workbooks);
        ThrowIfInvalid(report, "Workspace validation failed.");
    }

    private static void ThrowIfInvalid(LightyValidationReport report, string messagePrefix)
    {
        if (report.IsSuccess)
        {
            return;
        }

        throw new LightyCoreException($"{messagePrefix}{Environment.NewLine}{report.ToDisplayString()}");
    }

    private static void ValidateWorkbookCore(
        LightyWorkspace workspace,
        LightyWorkbook workbook,
        ICollection<LightyValidationDiagnostic> diagnostics,
        IDictionary<string, ReferenceTargetInfo> referenceCache)
    {
        foreach (var sheet in workbook.Sheets)
        {
            var validatorEntries = BuildValidatorEntries(workspace, workbook, sheet, diagnostics, referenceCache);
            if (validatorEntries.Count == 0)
            {
                continue;
            }

            foreach (var row in sheet.Rows)
            {
                foreach (var entry in validatorEntries)
                {
                    ValidateCell(workbook, sheet, row, entry, diagnostics);
                }
            }
        }
    }

    private static IReadOnlyList<ColumnValidatorEntry> BuildValidatorEntries(
        LightyWorkspace workspace,
        LightyWorkbook workbook,
        LightySheet sheet,
        ICollection<LightyValidationDiagnostic> diagnostics,
        IDictionary<string, ReferenceTargetInfo> referenceCache)
    {
        var entries = new List<ColumnValidatorEntry>();

        foreach (var entry in sheet.Header.Columns.Select((column, index) => new { Column = column, Index = index }))
        {
            if (entry.Column.TryGetExportScope(out var exportScope) && exportScope == LightyExportScope.None)
            {
                continue;
            }

            try
            {
                entries.Add(new ColumnValidatorEntry(
                    entry.Column,
                    entry.Index,
                    LightyColumnValueValidatorFactory.Create(entry.Column, workspace, referenceCache)));
            }
            catch (Exception exception) when (exception is LightyCoreException or ArgumentException or InvalidOperationException or JsonException)
            {
                diagnostics.Add(new LightyValidationDiagnostic(
                    workbook.Name,
                    sheet.Name,
                    entry.Column.FieldName,
                    $"Invalid validation rule for type '{entry.Column.Type}': {exception.Message}",
                    columnIndex: entry.Index));
            }
        }

        return entries;
    }

    private static void ValidateCell(
        LightyWorkbook workbook,
        LightySheet sheet,
        LightySheetRow row,
        ColumnValidatorEntry entry,
        ICollection<LightyValidationDiagnostic> diagnostics)
    {
        var parseResult = row.ParseCell(entry.ColumnIndex, entry.Column, DefaultLightyValueParser.Instance);
        if (!parseResult.IsSuccess)
        {
            diagnostics.Add(new LightyValidationDiagnostic(
                workbook.Name,
                sheet.Name,
                entry.Column.FieldName,
                parseResult.ErrorMessage ?? $"Failed to parse value as '{entry.Column.Type}'.",
                row.RowIndex,
                entry.ColumnIndex));
            return;
        }

        try
        {
            entry.Validator.Validate(new LightyColumnValueValidationContext(workbook, sheet, row, entry.Column, entry.ColumnIndex), parseResult.Value);
        }
        catch (Exception exception) when (exception is LightyCoreException or ArgumentException or InvalidOperationException or FormatException)
        {
            diagnostics.Add(new LightyValidationDiagnostic(
                workbook.Name,
                sheet.Name,
                entry.Column.FieldName,
                exception.Message,
                row.RowIndex,
                entry.ColumnIndex));
        }
    }

    private sealed record ColumnValidatorEntry(ColumnDefine Column, int ColumnIndex, ILightyColumnValueValidator Validator);

    private sealed class LightyColumnValueValidationContext
    {
        public LightyColumnValueValidationContext(
            LightyWorkbook workbook,
            LightySheet sheet,
            LightySheetRow row,
            ColumnDefine column,
            int columnIndex)
        {
            Workbook = workbook;
            Sheet = sheet;
            Row = row;
            Column = column;
            ColumnIndex = columnIndex;
        }

        public LightyWorkbook Workbook { get; }

        public LightySheet Sheet { get; }

        public LightySheetRow Row { get; }

        public ColumnDefine Column { get; }

        public int ColumnIndex { get; }
    }

    private interface ILightyColumnValueValidator
    {
        void Validate(LightyColumnValueValidationContext context, object? value);
    }

    private static class LightyColumnValueValidatorFactory
    {
        public static ILightyColumnValueValidator Create(
            ColumnDefine column,
            LightyWorkspace workspace,
            IDictionary<string, ReferenceTargetInfo> referenceCache)
        {
            ArgumentNullException.ThrowIfNull(column);
            ArgumentNullException.ThrowIfNull(workspace);
            ArgumentNullException.ThrowIfNull(referenceCache);

            var validation = GetValidationObject(column.TryGetValidation(out var rawValidation) ? rawValidation : null);
            return Create(column.TypeDescriptor, validation, workspace, referenceCache);
        }

        private static ILightyColumnValueValidator Create(
            LightyColumnTypeDescriptor descriptor,
            JsonElement? validation,
            LightyWorkspace workspace,
            IDictionary<string, ReferenceTargetInfo> referenceCache)
        {
            var required = ReadBoolean(validation, "required", false);

            return descriptor.MainTypeKey switch
            {
                "string" or "LocalString" => new StringValidator(
                    required,
                    ReadBoolean(validation, "allowEmpty", true),
                    ReadNullableInt32(validation, "minLength"),
                    ReadNullableInt32(validation, "maxLength"),
                    ReadStringRegex(validation)),
                "int" => new Int32Validator(required, ReadRange(validation, TryReadInt32Value)),
                "long" => new Int64Validator(required, ReadRange(validation, TryReadInt64Value)),
                "float" => new SingleValidator(required, ReadRange(validation, TryReadSingleValue)),
                "double" => new DoubleValidator(required, ReadRange(validation, TryReadDoubleValue)),
                "bool" => new BooleanValidator(required),
                "List" => new ListValidator(
                    required,
                    ReadNullableInt32(validation, "minCount"),
                    ReadNullableInt32(validation, "maxCount"),
                    Create(LightyColumnTypeDescriptor.Parse(descriptor.ValueType), ReadNestedObject(validation, "elementValidation"), workspace, referenceCache)),
                "Dictionary" => new DictionaryValidator(
                    required,
                    ReadNullableInt32(validation, "minCount"),
                    ReadNullableInt32(validation, "maxCount"),
                    Create(LightyColumnTypeDescriptor.Parse(descriptor.DictionaryKeyType!), ReadNestedObject(validation, "keyValidation"), workspace, referenceCache),
                    Create(LightyColumnTypeDescriptor.Parse(descriptor.DictionaryValueType!), ReadNestedObject(validation, "valueValidation"), workspace, referenceCache)),
                "Reference" => new ReferenceValidator(
                    required,
                    ResolveReferenceTargetInfo(workspace, descriptor.ReferenceTarget, referenceCache),
                    ReadBoolean(validation, "targetMustExist", true),
                    ReadNullableInt32(validation, "expectedIdentifierCount")),
                _ => throw new LightyCoreException($"Validation is not supported for main type '{descriptor.MainTypeKey}'.")
            };
        }

        private static JsonElement? GetValidationObject(JsonElement? validation)
        {
            if (!validation.HasValue || validation.Value.ValueKind == JsonValueKind.Null || validation.Value.ValueKind == JsonValueKind.Undefined)
            {
                return null;
            }

            if (validation.Value.ValueKind != JsonValueKind.Object)
            {
                throw new LightyCoreException("Validation must be a JSON object.");
            }

            return validation.Value;
        }

        private static JsonElement? ReadNestedObject(JsonElement? validation, string propertyName)
        {
            if (!validation.HasValue || !validation.Value.TryGetProperty(propertyName, out var propertyValue))
            {
                return null;
            }

            if (propertyValue.ValueKind == JsonValueKind.Null || propertyValue.ValueKind == JsonValueKind.Undefined)
            {
                return null;
            }

            if (propertyValue.ValueKind != JsonValueKind.Object)
            {
                throw new LightyCoreException($"Validation property '{propertyName}' must be a JSON object.");
            }

            return propertyValue.Clone();
        }

        private static bool ReadBoolean(JsonElement? validation, string propertyName, bool defaultValue)
        {
            if (!validation.HasValue || !validation.Value.TryGetProperty(propertyName, out var propertyValue))
            {
                return defaultValue;
            }

            return propertyValue.ValueKind switch
            {
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                _ => throw new LightyCoreException($"Validation property '{propertyName}' must be a boolean.")
            };
        }

        private static int? ReadNullableInt32(JsonElement? validation, string propertyName)
        {
            if (!validation.HasValue || !validation.Value.TryGetProperty(propertyName, out var propertyValue))
            {
                return null;
            }

            if (propertyValue.ValueKind == JsonValueKind.Null)
            {
                return null;
            }

            if (propertyValue.ValueKind != JsonValueKind.Number || !propertyValue.TryGetInt32(out var intValue))
            {
                throw new LightyCoreException($"Validation property '{propertyName}' must be an int.");
            }

            return intValue;
        }

        private static string? ReadNullableString(JsonElement? validation, string propertyName)
        {
            if (!validation.HasValue || !validation.Value.TryGetProperty(propertyName, out var propertyValue))
            {
                return null;
            }

            if (propertyValue.ValueKind == JsonValueKind.Null)
            {
                return null;
            }

            if (propertyValue.ValueKind != JsonValueKind.String)
            {
                throw new LightyCoreException($"Validation property '{propertyName}' must be a string.");
            }

            return propertyValue.GetString();
        }

        private static string? ReadStringRegex(JsonElement? validation)
        {
            var regex = ReadNullableString(validation, "regex");
            var pattern = ReadNullableString(validation, "pattern");

            if (!string.IsNullOrWhiteSpace(regex) && !string.IsNullOrWhiteSpace(pattern) && !string.Equals(regex, pattern, StringComparison.Ordinal))
            {
                throw new LightyCoreException("Validation properties 'regex' and 'pattern' cannot define different values at the same time.");
            }

            return !string.IsNullOrWhiteSpace(regex) ? regex : pattern;
        }

        private static ValueRange<T>? ReadRange<T>(JsonElement? validation, Func<JsonElement, string, bool, T?> valueReader)
            where T : struct, IComparable<T>
        {
            if (!validation.HasValue)
            {
                return null;
            }

            T? minValue = null;
            T? maxValue = null;

            if (validation.Value.TryGetProperty("range", out var rangeElement))
            {
                if (rangeElement.ValueKind != JsonValueKind.Object)
                {
                    throw new LightyCoreException("Validation property 'range' must be a JSON object.");
                }

                minValue = valueReader(rangeElement, "min", false);
                maxValue = valueReader(rangeElement, "max", false);
            }

            minValue ??= valueReader(validation.Value, "min", false);
            maxValue ??= valueReader(validation.Value, "max", false);

            if (!minValue.HasValue && !maxValue.HasValue)
            {
                return null;
            }

            if (minValue.HasValue && maxValue.HasValue && minValue.Value.CompareTo(maxValue.Value) > 0)
            {
                throw new LightyCoreException("Validation range min cannot be greater than max.");
            }

            return new ValueRange<T>(minValue, maxValue);
        }

        private static int? TryReadInt32Value(JsonElement element, string propertyName, bool required)
        {
            if (!element.TryGetProperty(propertyName, out var propertyValue))
            {
                return required ? throw new LightyCoreException($"Validation property '{propertyName}' is required.") : null;
            }

            if (propertyValue.ValueKind == JsonValueKind.Null)
            {
                return null;
            }

            if (propertyValue.ValueKind != JsonValueKind.Number || !propertyValue.TryGetInt32(out var value))
            {
                throw new LightyCoreException($"Validation property '{propertyName}' must be an int.");
            }

            return value;
        }

        private static long? TryReadInt64Value(JsonElement element, string propertyName, bool required)
        {
            if (!element.TryGetProperty(propertyName, out var propertyValue))
            {
                return required ? throw new LightyCoreException($"Validation property '{propertyName}' is required.") : null;
            }

            if (propertyValue.ValueKind == JsonValueKind.Null)
            {
                return null;
            }

            if (propertyValue.ValueKind != JsonValueKind.Number || !propertyValue.TryGetInt64(out var value))
            {
                throw new LightyCoreException($"Validation property '{propertyName}' must be a long.");
            }

            return value;
        }

        private static float? TryReadSingleValue(JsonElement element, string propertyName, bool required)
        {
            if (!element.TryGetProperty(propertyName, out var propertyValue))
            {
                return required ? throw new LightyCoreException($"Validation property '{propertyName}' is required.") : null;
            }

            if (propertyValue.ValueKind == JsonValueKind.Null)
            {
                return null;
            }

            if (propertyValue.ValueKind != JsonValueKind.Number)
            {
                throw new LightyCoreException($"Validation property '{propertyName}' must be a float.");
            }

            return propertyValue.GetSingle();
        }

        private static double? TryReadDoubleValue(JsonElement element, string propertyName, bool required)
        {
            if (!element.TryGetProperty(propertyName, out var propertyValue))
            {
                return required ? throw new LightyCoreException($"Validation property '{propertyName}' is required.") : null;
            }

            if (propertyValue.ValueKind == JsonValueKind.Null)
            {
                return null;
            }

            if (propertyValue.ValueKind != JsonValueKind.Number)
            {
                throw new LightyCoreException($"Validation property '{propertyName}' must be a double.");
            }

            return propertyValue.GetDouble();
        }

        private static ReferenceTargetInfo ResolveReferenceTargetInfo(
            LightyWorkspace workspace,
            LightyReferenceTarget? target,
            IDictionary<string, ReferenceTargetInfo> referenceCache)
        {
            if (target is null)
            {
                throw new LightyCoreException("Reference validation requires a valid reference target.");
            }

            var cacheKey = $"{target.WorkbookName}.{target.SheetName}";
            if (referenceCache.TryGetValue(cacheKey, out var cached))
            {
                return cached;
            }

            if (!workspace.TryGetWorkbook(target.WorkbookName, out var targetWorkbook) || targetWorkbook is null)
            {
                throw new LightyCoreException($"Reference target workbook '{target.WorkbookName}' was not found.");
            }

            if (!targetWorkbook.TryGetSheet(target.SheetName, out var targetSheet) || targetSheet is null)
            {
                throw new LightyCoreException($"Reference target sheet '{target.WorkbookName}.{target.SheetName}' was not found.");
            }

            var primaryKeyColumns = ResolvePrimaryKeyColumns(targetSheet);
            if (primaryKeyColumns.Count == 0)
            {
                throw new LightyCoreException($"Reference target '{target.WorkbookName}.{target.SheetName}' does not define any exportable key column.");
            }

            foreach (var keyColumn in primaryKeyColumns)
            {
                if (!LightyTypeMetadataProvider.IsSupportedScalarType(keyColumn.Column.TypeDescriptor.RawType))
                {
                    throw new LightyCoreException($"Reference key type '{keyColumn.Column.TypeDescriptor.RawType}' is not supported.");
                }
            }

            var existingKeys = new HashSet<string>(StringComparer.Ordinal);
            foreach (var row in targetSheet.Rows)
            {
                var keyParts = new List<string>(primaryKeyColumns.Count);
                foreach (var keyColumn in primaryKeyColumns)
                {
                    var parseResult = row.ParseCell(keyColumn.ColumnIndex, keyColumn.Column, DefaultLightyValueParser.Instance);
                    if (!parseResult.IsSuccess)
                    {
                        throw new LightyCoreException(
                            $"Reference target '{target.WorkbookName}.{target.SheetName}' contains invalid key data. {parseResult.ErrorMessage}");
                    }

                    keyParts.Add(CanonicalizeScalarValue(keyColumn.Column.TypeDescriptor.RawType, parseResult.Value));
                }

                existingKeys.Add(BuildCompositeKey(keyParts));
            }

            var resolved = new ReferenceTargetInfo(target, primaryKeyColumns, existingKeys);
            referenceCache[cacheKey] = resolved;
            return resolved;
        }

        private static IReadOnlyList<PrimaryKeyColumnInfo> ResolvePrimaryKeyColumns(LightySheet sheet)
        {
            var exportedColumns = sheet.Header.Columns
                .Select((column, index) => new PrimaryKeyColumnInfo(column, index))
                .Where(entry => !entry.Column.TryGetExportScope(out var exportScope) || exportScope != LightyExportScope.None)
                .ToList();

            var singleIdField = exportedColumns.FirstOrDefault(entry => string.Equals(entry.Column.FieldName, "ID", StringComparison.OrdinalIgnoreCase));
            if (singleIdField is not null)
            {
                return new[] { singleIdField };
            }

            var compositeFields = new List<PrimaryKeyColumnInfo>();
            for (var index = 1; index <= exportedColumns.Count; index += 1)
            {
                var expectedName = $"ID{index}";
                var field = exportedColumns.FirstOrDefault(entry => string.Equals(entry.Column.FieldName, expectedName, StringComparison.OrdinalIgnoreCase));
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

            return exportedColumns.Count > 0 ? new[] { exportedColumns[0] } : Array.Empty<PrimaryKeyColumnInfo>();
        }
    }

    private abstract class LightyColumnValueValidatorBase : ILightyColumnValueValidator
    {
        protected LightyColumnValueValidatorBase(bool required)
        {
            Required = required;
        }

        protected bool Required { get; }

        public void Validate(LightyColumnValueValidationContext context, object? value)
        {
            if (IsMissing(value))
            {
                if (Required)
                {
                    throw new LightyCoreException("Value is required.");
                }

                ValidateMissingValue(context, value);
                return;
            }

            ValidateValue(context, value);
        }

        protected virtual void ValidateMissingValue(LightyColumnValueValidationContext context, object? value)
        {
        }

        protected abstract void ValidateValue(LightyColumnValueValidationContext context, object? value);

        protected static bool IsMissing(object? value)
        {
            return value switch
            {
                null => true,
                string stringValue => stringValue.Length == 0,
                IReadOnlyList<object?> listValue => listValue.Count == 0,
                IReadOnlyDictionary<object, object?> dictionaryValue => dictionaryValue.Count == 0,
                LightyReferenceValue referenceValue => referenceValue.Identifiers.Count == 0,
                _ => false
            };
        }
    }

    private sealed class StringValidator : LightyColumnValueValidatorBase
    {
        private readonly bool _allowEmpty;
        private readonly int? _minLength;
        private readonly int? _maxLength;
        private readonly Regex? _regex;

        public StringValidator(bool required, bool allowEmpty, int? minLength, int? maxLength, string? regex)
            : base(required)
        {
            if (minLength.HasValue && minLength.Value < 0)
            {
                throw new LightyCoreException("Validation property 'minLength' cannot be negative.");
            }

            if (maxLength.HasValue && maxLength.Value < 0)
            {
                throw new LightyCoreException("Validation property 'maxLength' cannot be negative.");
            }

            if (minLength.HasValue && maxLength.HasValue && minLength.Value > maxLength.Value)
            {
                throw new LightyCoreException("Validation property 'minLength' cannot be greater than 'maxLength'.");
            }

            _allowEmpty = allowEmpty;
            _minLength = minLength;
            _maxLength = maxLength;
            _regex = string.IsNullOrWhiteSpace(regex) ? null : new Regex(regex, RegexOptions.CultureInvariant);
        }

        protected override void ValidateValue(LightyColumnValueValidationContext context, object? value)
        {
            if (value is not string stringValue)
            {
                throw new LightyCoreException("Expected a string value.");
            }

            if (!_allowEmpty && stringValue.Length == 0)
            {
                throw new LightyCoreException("String value cannot be empty.");
            }

            if (_minLength.HasValue && stringValue.Length < _minLength.Value)
            {
                throw new LightyCoreException($"String length must be at least {_minLength.Value}.");
            }

            if (_maxLength.HasValue && stringValue.Length > _maxLength.Value)
            {
                throw new LightyCoreException($"String length must be at most {_maxLength.Value}.");
            }

            if (_regex is not null && !_regex.IsMatch(stringValue))
            {
                throw new LightyCoreException($"String value '{stringValue}' does not match validation regex '{_regex}'.");
            }
        }
    }

    private sealed class BooleanValidator : LightyColumnValueValidatorBase
    {
        public BooleanValidator(bool required)
            : base(required)
        {
        }

        protected override void ValidateValue(LightyColumnValueValidationContext context, object? value)
        {
            if (value is not bool)
            {
                throw new LightyCoreException("Expected a bool value.");
            }
        }
    }

    private sealed class Int32Validator : ComparableValidator<int>
    {
        public Int32Validator(bool required, ValueRange<int>? range)
            : base(required, range, "int")
        {
        }
    }

    private sealed class Int64Validator : ComparableValidator<long>
    {
        public Int64Validator(bool required, ValueRange<long>? range)
            : base(required, range, "long")
        {
        }
    }

    private sealed class SingleValidator : ComparableValidator<float>
    {
        public SingleValidator(bool required, ValueRange<float>? range)
            : base(required, range, "float")
        {
        }
    }

    private sealed class DoubleValidator : ComparableValidator<double>
    {
        public DoubleValidator(bool required, ValueRange<double>? range)
            : base(required, range, "double")
        {
        }
    }

    private abstract class ComparableValidator<T> : LightyColumnValueValidatorBase
        where T : struct, IComparable<T>
    {
        private readonly ValueRange<T>? _range;
        private readonly string _typeName;

        protected ComparableValidator(bool required, ValueRange<T>? range, string typeName)
            : base(required)
        {
            _range = range;
            _typeName = typeName;
        }

        protected override void ValidateValue(LightyColumnValueValidationContext context, object? value)
        {
            if (value is not T typedValue)
            {
                throw new LightyCoreException($"Expected a {_typeName} value.");
            }

            if (_range?.Min.HasValue == true && typedValue.CompareTo(_range.Min.Value) < 0)
            {
                throw new LightyCoreException($"Value must be greater than or equal to {_range.Min.Value.ToString()}.");
            }

            if (_range?.Max.HasValue == true && typedValue.CompareTo(_range.Max.Value) > 0)
            {
                throw new LightyCoreException($"Value must be less than or equal to {_range.Max.Value.ToString()}.");
            }
        }
    }

    private sealed class ListValidator : LightyColumnValueValidatorBase
    {
        private readonly int? _minCount;
        private readonly int? _maxCount;
        private readonly ILightyColumnValueValidator _elementValidator;

        public ListValidator(bool required, int? minCount, int? maxCount, ILightyColumnValueValidator elementValidator)
            : base(required)
        {
            if (minCount.HasValue && minCount.Value < 0)
            {
                throw new LightyCoreException("Validation property 'minCount' cannot be negative.");
            }

            if (maxCount.HasValue && maxCount.Value < 0)
            {
                throw new LightyCoreException("Validation property 'maxCount' cannot be negative.");
            }

            if (minCount.HasValue && maxCount.HasValue && minCount.Value > maxCount.Value)
            {
                throw new LightyCoreException("Validation property 'minCount' cannot be greater than 'maxCount'.");
            }

            _minCount = minCount;
            _maxCount = maxCount;
            _elementValidator = elementValidator;
        }

        protected override void ValidateValue(LightyColumnValueValidationContext context, object? value)
        {
            if (value is not IReadOnlyList<object?> listValue)
            {
                throw new LightyCoreException("Expected a list value.");
            }

            if (_minCount.HasValue && listValue.Count < _minCount.Value)
            {
                throw new LightyCoreException($"List item count must be at least {_minCount.Value}.");
            }

            if (_maxCount.HasValue && listValue.Count > _maxCount.Value)
            {
                throw new LightyCoreException($"List item count must be at most {_maxCount.Value}.");
            }

            foreach (var item in listValue)
            {
                _elementValidator.Validate(context, item);
            }
        }
    }

    private sealed class DictionaryValidator : LightyColumnValueValidatorBase
    {
        private readonly int? _minCount;
        private readonly int? _maxCount;
        private readonly ILightyColumnValueValidator _keyValidator;
        private readonly ILightyColumnValueValidator _valueValidator;

        public DictionaryValidator(
            bool required,
            int? minCount,
            int? maxCount,
            ILightyColumnValueValidator keyValidator,
            ILightyColumnValueValidator valueValidator)
            : base(required)
        {
            if (minCount.HasValue && minCount.Value < 0)
            {
                throw new LightyCoreException("Validation property 'minCount' cannot be negative.");
            }

            if (maxCount.HasValue && maxCount.Value < 0)
            {
                throw new LightyCoreException("Validation property 'maxCount' cannot be negative.");
            }

            if (minCount.HasValue && maxCount.HasValue && minCount.Value > maxCount.Value)
            {
                throw new LightyCoreException("Validation property 'minCount' cannot be greater than 'maxCount'.");
            }

            _minCount = minCount;
            _maxCount = maxCount;
            _keyValidator = keyValidator;
            _valueValidator = valueValidator;
        }

        protected override void ValidateValue(LightyColumnValueValidationContext context, object? value)
        {
            if (value is not IReadOnlyDictionary<object, object?> dictionaryValue)
            {
                throw new LightyCoreException("Expected a dictionary value.");
            }

            if (_minCount.HasValue && dictionaryValue.Count < _minCount.Value)
            {
                throw new LightyCoreException($"Dictionary entry count must be at least {_minCount.Value}.");
            }

            if (_maxCount.HasValue && dictionaryValue.Count > _maxCount.Value)
            {
                throw new LightyCoreException($"Dictionary entry count must be at most {_maxCount.Value}.");
            }

            foreach (var pair in dictionaryValue)
            {
                _keyValidator.Validate(context, pair.Key);
                _valueValidator.Validate(context, pair.Value);
            }
        }
    }

    private sealed class ReferenceValidator : LightyColumnValueValidatorBase
    {
        private readonly ReferenceTargetInfo _targetInfo;
        private readonly bool _targetMustExist;
        private readonly int? _expectedIdentifierCount;

        public ReferenceValidator(bool required, ReferenceTargetInfo targetInfo, bool targetMustExist, int? expectedIdentifierCount)
            : base(required)
        {
            _targetInfo = targetInfo;
            _targetMustExist = targetMustExist;
            _expectedIdentifierCount = expectedIdentifierCount;
        }

        protected override void ValidateValue(LightyColumnValueValidationContext context, object? value)
        {
            if (value is not LightyReferenceValue referenceValue)
            {
                throw new LightyCoreException("Expected a reference value.");
            }

            var expectedIdentifierCount = _expectedIdentifierCount ?? _targetInfo.PrimaryKeyColumns.Count;
            if (referenceValue.Identifiers.Count != expectedIdentifierCount)
            {
                throw new LightyCoreException(
                    $"Reference target '{_targetInfo.Target.WorkbookName}.{_targetInfo.Target.SheetName}' expects {expectedIdentifierCount} identifier(s), but got {referenceValue.Identifiers.Count}.");
            }

            var canonicalIdentifiers = new List<string>(referenceValue.Identifiers.Count);
            for (var index = 0; index < referenceValue.Identifiers.Count; index += 1)
            {
                var keyColumn = _targetInfo.PrimaryKeyColumns[index];
                var parsedIdentifier = ParseReferenceIdentifier(keyColumn.Column, referenceValue.Identifiers[index]);
                canonicalIdentifiers.Add(CanonicalizeScalarValue(keyColumn.Column.TypeDescriptor.RawType, parsedIdentifier));
            }

            if (_targetMustExist && !_targetInfo.ExistingKeys.Contains(BuildCompositeKey(canonicalIdentifiers)))
            {
                throw new LightyCoreException(
                    $"Reference target '{_targetInfo.Target.WorkbookName}.{_targetInfo.Target.SheetName}' does not contain identifier(s) [{string.Join(", ", referenceValue.Identifiers)}].");
            }
        }

        private static object ParseReferenceIdentifier(ColumnDefine keyColumn, string identifier)
        {
            var temporaryRow = new LightySheetRow(0, new[] { identifier });
            var parseResult = temporaryRow.ParseCell(0, keyColumn, DefaultLightyValueParser.Instance);
            if (!parseResult.IsSuccess)
            {
                throw new LightyCoreException(
                    $"Reference identifier '{identifier}' is not a valid '{keyColumn.Type}' value. {parseResult.ErrorMessage}");
            }

            return parseResult.Value ?? throw new LightyCoreException($"Reference identifier '{identifier}' could not be parsed.");
        }
    }

    private static string CanonicalizeScalarValue(string typeName, object? value)
    {
        return typeName switch
        {
            "string" => (string?)value ?? string.Empty,
            "int" => Convert.ToInt32(value, CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture),
            "long" => Convert.ToInt64(value, CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture),
            "float" => Convert.ToSingle(value, CultureInfo.InvariantCulture).ToString("R", CultureInfo.InvariantCulture),
            "double" => Convert.ToDouble(value, CultureInfo.InvariantCulture).ToString("R", CultureInfo.InvariantCulture),
            "bool" => Convert.ToBoolean(value, CultureInfo.InvariantCulture) ? "true" : "false",
            _ => throw new LightyCoreException($"Unsupported reference key type '{typeName}'.")
        };
    }

    private static string BuildCompositeKey(IEnumerable<string> parts)
    {
        return string.Join("\u001F", parts);
    }

    private sealed record ValueRange<T>(T? Min, T? Max)
        where T : struct, IComparable<T>;

    private sealed record PrimaryKeyColumnInfo(ColumnDefine Column, int ColumnIndex);

    private sealed record ReferenceTargetInfo(
        LightyReferenceTarget Target,
        IReadOnlyList<PrimaryKeyColumnInfo> PrimaryKeyColumns,
        IReadOnlySet<string> ExistingKeys);
}