using System.Text.Json;
using System.Text.Json.Serialization;

namespace LightyDesign.Core;

public static class LightySheetHeaderSerializer
{
    public static void SaveToFile(string filePath, LightySheetHeader header, WorkspaceHeaderLayout? headerLayout = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(filePath);
        ArgumentNullException.ThrowIfNull(header);

        File.WriteAllText(filePath, Serialize(header, headerLayout));
    }

    public static string Serialize(LightySheetHeader header, WorkspaceHeaderLayout? headerLayout = null)
    {
        ArgumentNullException.ThrowIfNull(header);

        var rowTypes = BuildOrderedHeaderTypes(header, headerLayout);
        var rows = rowTypes
            .Select(headerType => new SerializedHeaderRow(headerType, BuildRowValues(header, headerType)))
            .ToList();

        return JsonSerializer.Serialize(new SerializedHeaderDocument(rows), new JsonSerializerOptions
        {
            WriteIndented = true,
        });
    }

    public static LightySheetHeader LoadFromFile(string filePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(filePath);

        return Deserialize(File.ReadAllText(filePath));
    }

    public static LightySheetHeader Deserialize(string json)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(json);

        using var document = JsonDocument.Parse(json);
        var rootElement = document.RootElement;

        return TryGetColumnArray(rootElement, out var columnArray)
            ? DeserializeColumnArray(columnArray)
            : DeserializeHeaderRows(rootElement);
    }

    private static LightySheetHeader DeserializeColumnArray(JsonElement columnArray)
    {
        var columns = new List<ColumnDefine>();

        foreach (var columnElement in columnArray.EnumerateArray())
        {
            if (columnElement.ValueKind != JsonValueKind.Object)
            {
                throw new LightyTextFormatException("Sheet header columns must be JSON objects.");
            }

            var fieldName = JsonElementHelper.GetRequiredString(columnElement, "fieldName", "FieldName");
            var type = JsonElementHelper.GetRequiredString(columnElement, "type", "Type");
            var displayName = JsonElementHelper.GetOptionalString(columnElement, "displayName", "DisplayName");
            var attributes = ExtractAttributes(columnElement, new[] { "fieldName", "FieldName", "type", "Type", "displayName", "DisplayName" });

            columns.Add(new ColumnDefine(fieldName, type, displayName, attributes));
        }

        return new LightySheetHeader(columns);
    }

    private static LightySheetHeader DeserializeHeaderRows(JsonElement rootElement)
    {
        var rowsElement = FindHeaderRowsElement(rootElement);
        var rowValues = new Dictionary<string, JsonElement>(StringComparer.Ordinal);

        foreach (var rowElement in rowsElement.EnumerateArray())
        {
            if (rowElement.ValueKind != JsonValueKind.Object)
            {
                throw new LightyTextFormatException("Sheet header rows must be JSON objects.");
            }

            var headerType = LightyHeaderTypes.Normalize(JsonElementHelper.GetRequiredString(rowElement, "headerType"));
            var valueElement = JsonElementHelper.GetOptionalProperty(rowElement, "value")
                ?? throw new LightyTextFormatException($"Sheet header row '{headerType}' must contain a value.");

            rowValues[headerType] = JsonSerializer.SerializeToElement(valueElement);
        }

        var fieldNames = GetRequiredStringArray(rowValues, LightyHeaderTypes.FieldName);
        var types = GetRequiredStringArray(rowValues, LightyHeaderTypes.Type);

        if (fieldNames.Count != types.Count)
        {
            throw new LightyTextFormatException("FieldName and Type row lengths must match.");
        }

        var displayNames = GetOptionalStringArray(rowValues, LightyHeaderTypes.DisplayName, fieldNames.Count);
        var columns = new List<ColumnDefine>(fieldNames.Count);

        for (var index = 0; index < fieldNames.Count; index++)
        {
            var attributes = new Dictionary<string, JsonElement>(StringComparer.Ordinal);

            foreach (var pair in rowValues)
            {
                if (string.Equals(pair.Key, LightyHeaderTypes.FieldName, StringComparison.Ordinal) ||
                    string.Equals(pair.Key, LightyHeaderTypes.Type, StringComparison.Ordinal) ||
                    string.Equals(pair.Key, LightyHeaderTypes.DisplayName, StringComparison.Ordinal))
                {
                    continue;
                }

                var indexedValue = GetIndexedValue(pair.Value, index);
                if (IsEmptyExtendedAttribute(indexedValue))
                {
                    continue;
                }

                attributes[pair.Key] = indexedValue;
            }

            columns.Add(new ColumnDefine(fieldNames[index], types[index], displayNames[index], attributes));
        }

        return new LightySheetHeader(columns);
    }

    private static bool TryGetColumnArray(JsonElement rootElement, out JsonElement columnArray)
    {
        if (rootElement.ValueKind == JsonValueKind.Array)
        {
            if (LooksLikeColumnArray(rootElement))
            {
                columnArray = rootElement;
                return true;
            }

            columnArray = default;
            return false;
        }

        if (rootElement.ValueKind != JsonValueKind.Object)
        {
            columnArray = default;
            return false;
        }

        var explicitColumns = JsonElementHelper.GetOptionalProperty(rootElement, "columns")
            ?? JsonElementHelper.GetOptionalProperty(rootElement, "Columns");

        if (explicitColumns is { ValueKind: JsonValueKind.Array })
        {
            columnArray = explicitColumns.Value;
            return true;
        }

        if (LooksLikeColumnObject(rootElement))
        {
            columnArray = JsonSerializer.SerializeToElement(new[] { rootElement });
            return true;
        }

        columnArray = default;
        return false;
    }

    private static JsonElement FindHeaderRowsElement(JsonElement rootElement)
    {
        if (rootElement.ValueKind == JsonValueKind.Array)
        {
            return rootElement;
        }

        if (rootElement.ValueKind != JsonValueKind.Object)
        {
            throw new LightyTextFormatException("Sheet header JSON must be a JSON array or object.");
        }

        return JsonElementHelper.GetOptionalProperty(rootElement, "rows")
            ?? JsonElementHelper.GetOptionalProperty(rootElement, "headers")
            ?? JsonElementHelper.GetOptionalProperty(rootElement, "items")
            ?? throw new LightyTextFormatException("Sheet header JSON must contain a 'columns' or 'rows' array.");
    }

    private static bool LooksLikeColumnArray(JsonElement arrayElement)
    {
        using var enumerator = arrayElement.EnumerateArray();
        if (!enumerator.MoveNext())
        {
            return true;
        }

        return LooksLikeColumnObject(enumerator.Current);
    }

    private static bool LooksLikeColumnObject(JsonElement element)
    {
        if (element.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        return JsonElementHelper.HasProperty(element, "fieldName") ||
               JsonElementHelper.HasProperty(element, "FieldName") ||
               JsonElementHelper.HasProperty(element, "type") ||
               JsonElementHelper.HasProperty(element, "Type");
    }

    private static IReadOnlyDictionary<string, JsonElement> ExtractAttributes(JsonElement columnElement, IEnumerable<string> reservedNames)
    {
        var reserved = new HashSet<string>(reservedNames, StringComparer.OrdinalIgnoreCase);
        var attributes = new Dictionary<string, JsonElement>(StringComparer.Ordinal);

        foreach (var property in columnElement.EnumerateObject())
        {
            if (reserved.Contains(property.Name))
            {
                continue;
            }

            attributes[property.Name] = JsonSerializer.SerializeToElement(property.Value);
        }

        return attributes;
    }

    private static IReadOnlyList<string> GetRequiredStringArray(IReadOnlyDictionary<string, JsonElement> rowValues, string headerType)
    {
        if (!rowValues.TryGetValue(headerType, out var value))
        {
            throw new LightyTextFormatException($"Required sheet header row '{headerType}' is missing.");
        }

        return GetStringArray(value, headerType);
    }

    private static IReadOnlyList<string?> GetOptionalStringArray(IReadOnlyDictionary<string, JsonElement> rowValues, string headerType, int expectedCount)
    {
        if (!rowValues.TryGetValue(headerType, out var value))
        {
            return Enumerable.Repeat<string?>(null, expectedCount).ToList().AsReadOnly();
        }

        var values = GetStringArray(value, headerType)
            .Select(item => string.IsNullOrWhiteSpace(item) ? null : item)
            .ToList();

        if (values.Count != expectedCount)
        {
            throw new LightyTextFormatException($"Sheet header row '{headerType}' length does not match FieldName row length.");
        }

        return values.AsReadOnly();
    }

    private static IReadOnlyList<string> GetStringArray(JsonElement valueElement, string headerType)
    {
        if (valueElement.ValueKind != JsonValueKind.Array)
        {
            throw new LightyTextFormatException($"Sheet header row '{headerType}' must contain an array value.");
        }

        var values = new List<string>();

        foreach (var item in valueElement.EnumerateArray())
        {
            values.Add(item.ValueKind switch
            {
                JsonValueKind.String => item.GetString() ?? string.Empty,
                JsonValueKind.Null => string.Empty,
                _ => item.GetRawText()
            });
        }

        return values.AsReadOnly();
    }

    private static JsonElement GetIndexedValue(JsonElement valueElement, int index)
    {
        if (valueElement.ValueKind != JsonValueKind.Array)
        {
            throw new LightyTextFormatException("Extended sheet header rows must contain array values.");
        }

        var length = valueElement.GetArrayLength();
        if (index >= length)
        {
            throw new LightyTextFormatException("Extended sheet header row length does not match FieldName row length.");
        }

        return JsonSerializer.SerializeToElement(valueElement[index]);
    }

    private static IReadOnlyList<string> BuildOrderedHeaderTypes(LightySheetHeader header, WorkspaceHeaderLayout? headerLayout)
    {
        var rowTypes = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);

        AddRowType(LightyHeaderTypes.FieldName, rowTypes, seen);
        AddRowType(LightyHeaderTypes.DisplayName, rowTypes, seen);
        AddRowType(LightyHeaderTypes.Type, rowTypes, seen);

        if (headerLayout is not null)
        {
            foreach (var row in headerLayout.Rows)
            {
                AddRowType(row.HeaderType, rowTypes, seen);
            }
        }

        var additionalAttributeKeys = header.Columns
            .SelectMany(column => column.Attributes.Keys)
            .Distinct(StringComparer.Ordinal)
            .OrderBy(key => key, StringComparer.Ordinal);

        foreach (var key in additionalAttributeKeys)
        {
            AddRowType(key, rowTypes, seen);
        }

        return rowTypes.AsReadOnly();
    }

    private static JsonElement[] BuildRowValues(LightySheetHeader header, string headerType)
    {
        return header.Columns.Select(column => GetHeaderValue(column, headerType)).ToArray();
    }

    private static JsonElement GetHeaderValue(ColumnDefine column, string headerType)
    {
        if (string.Equals(headerType, LightyHeaderTypes.FieldName, StringComparison.Ordinal))
        {
            return JsonSerializer.SerializeToElement(column.FieldName);
        }

        if (string.Equals(headerType, LightyHeaderTypes.Type, StringComparison.Ordinal))
        {
            return JsonSerializer.SerializeToElement(column.Type);
        }

        if (string.Equals(headerType, LightyHeaderTypes.DisplayName, StringComparison.Ordinal))
        {
            return column.DisplayName is null
                ? JsonSerializer.SerializeToElement<string?>(null)
                : JsonSerializer.SerializeToElement(column.DisplayName);
        }

        return column.TryGetAttribute(headerType, out var value)
            ? JsonSerializer.SerializeToElement(value)
            : JsonSerializer.SerializeToElement<string?>(null);
    }

    private static bool IsEmptyExtendedAttribute(JsonElement value)
    {
        return value.ValueKind switch
        {
            JsonValueKind.Null => true,
            JsonValueKind.String => string.IsNullOrWhiteSpace(value.GetString()),
            _ => false,
        };
    }

    private static void AddRowType(string headerType, ICollection<string> rowTypes, ISet<string> seen)
    {
        if (string.IsNullOrWhiteSpace(headerType) || !seen.Add(headerType))
        {
            return;
        }

        rowTypes.Add(headerType);
    }

    private sealed class SerializedHeaderDocument
    {
        public SerializedHeaderDocument(IReadOnlyList<SerializedHeaderRow> rows)
        {
            Rows = rows;
        }

        [JsonPropertyName("rows")]
        public IReadOnlyList<SerializedHeaderRow> Rows { get; }
    }

    private sealed class SerializedHeaderRow
    {
        public SerializedHeaderRow(string headerType, JsonElement[] value)
        {
            HeaderType = headerType;
            Value = value;
        }

        [JsonPropertyName("headerType")]
        public string HeaderType { get; }

        [JsonPropertyName("value")]
        public JsonElement[] Value { get; }
    }
}