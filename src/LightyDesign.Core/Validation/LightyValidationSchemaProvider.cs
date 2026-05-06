namespace LightyDesign.Core;

public static class LightyValidationSchemaProvider
{
    public static LightyValidationRuleSchema GetSchema(string type)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(type);

        return GetSchema(LightyColumnTypeDescriptor.Parse(type));
    }

    public static LightyValidationRuleSchema GetSchema(LightyColumnTypeDescriptor descriptor)
    {
        ArgumentNullException.ThrowIfNull(descriptor);

        return descriptor.MainTypeKey switch
        {
            "string" or "LocalString" => BuildStringSchema(descriptor),
            "int" or "long" or "float" or "double" => BuildNumericSchema(descriptor),
            "bool" => BuildBooleanSchema(descriptor),
            "List" => BuildListSchema(descriptor),
            "Dictionary" => BuildDictionarySchema(descriptor),
            "Reference" => BuildReferenceSchema(descriptor),
            _ => throw new LightyCoreException($"Validation schema is not supported for main type '{descriptor.MainTypeKey}'.")
        };
    }

    private static LightyValidationRuleSchema BuildStringSchema(LightyColumnTypeDescriptor descriptor)
    {
        return new LightyValidationRuleSchema(
            descriptor.MainTypeKey,
            descriptor.RawType,
            "字符串规则支持空值、长度和正则约束。",
            new[]
            {
                new LightyValidationRulePropertySchema("required", "boolean", "是否必须提供值。", defaultValue: false, example: true),
                new LightyValidationRulePropertySchema("allowEmpty", "boolean", "当值存在时，是否允许空字符串。", defaultValue: true, example: false),
                new LightyValidationRulePropertySchema("minLength", "int", "最小字符串长度。", example: 2),
                new LightyValidationRulePropertySchema("maxLength", "int", "最大字符串长度。", example: 32),
                new LightyValidationRulePropertySchema("regex", "string", "使用 .NET 正则表达式约束字符串内容。", example: "^[A-Z]{3}-\\d{3}$"),
                new LightyValidationRulePropertySchema("pattern", "string", "旧字段名，等价于 regex。", example: "^[A-Z]{3}-\\d{3}$", deprecated: true, aliasOf: "regex"),
            });
    }

    private static LightyValidationRuleSchema BuildNumericSchema(LightyColumnTypeDescriptor descriptor)
    {
        return new LightyValidationRuleSchema(
            descriptor.MainTypeKey,
            descriptor.RawType,
            $"{descriptor.RawType} 规则支持必填和范围约束。",
            new[]
            {
                new LightyValidationRulePropertySchema("required", "boolean", "是否必须提供值。", defaultValue: false, example: true),
                new LightyValidationRulePropertySchema("range", "object", "推荐写法，使用对象同时声明 min 与 max。", example: new { min = 1, max = 100 }),
                new LightyValidationRulePropertySchema("min", descriptor.RawType, "兼容写法，最小值。", example: 1, deprecated: true, aliasOf: "range.min"),
                new LightyValidationRulePropertySchema("max", descriptor.RawType, "兼容写法，最大值。", example: 100, deprecated: true, aliasOf: "range.max"),
            });
    }

    private static LightyValidationRuleSchema BuildBooleanSchema(LightyColumnTypeDescriptor descriptor)
    {
        return new LightyValidationRuleSchema(
            descriptor.MainTypeKey,
            descriptor.RawType,
            "布尔规则当前只支持必填约束。",
            new[]
            {
                new LightyValidationRulePropertySchema("required", "boolean", "是否必须提供值。", defaultValue: false, example: true),
            });
    }

    private static LightyValidationRuleSchema BuildListSchema(LightyColumnTypeDescriptor descriptor)
    {
        var elementSchema = GetSchema(LightyColumnTypeDescriptor.Parse(descriptor.ValueType));
        return new LightyValidationRuleSchema(
            descriptor.MainTypeKey,
            descriptor.RawType,
            "List 规则支持元素数量约束，并通过 elementValidation 递归约束元素类型。",
            new[]
            {
                new LightyValidationRulePropertySchema("required", "boolean", "是否必须提供至少一个元素。", defaultValue: false, example: true),
                new LightyValidationRulePropertySchema("minCount", "int", "最少元素数量。", example: 1),
                new LightyValidationRulePropertySchema("maxCount", "int", "最多元素数量。", example: 8),
            },
            new[]
            {
                new LightyValidationRuleNestedSchema("elementValidation", "元素规则", "会应用到 List 元素类型。", elementSchema),
            });
    }

    private static LightyValidationRuleSchema BuildDictionarySchema(LightyColumnTypeDescriptor descriptor)
    {
        var keySchema = GetSchema(LightyColumnTypeDescriptor.Parse(descriptor.DictionaryKeyType!));
        var valueSchema = GetSchema(LightyColumnTypeDescriptor.Parse(descriptor.DictionaryValueType!));
        return new LightyValidationRuleSchema(
            descriptor.MainTypeKey,
            descriptor.RawType,
            "Dictionary 规则支持键值对数量约束，并分别约束键和值。",
            new[]
            {
                new LightyValidationRulePropertySchema("required", "boolean", "是否必须提供至少一项。", defaultValue: false, example: true),
                new LightyValidationRulePropertySchema("minCount", "int", "最少键值对数量。", example: 1),
                new LightyValidationRulePropertySchema("maxCount", "int", "最多键值对数量。", example: 16),
            },
            new[]
            {
                new LightyValidationRuleNestedSchema("keyValidation", "键规则", "会应用到 Dictionary 键类型。", keySchema),
                new LightyValidationRuleNestedSchema("valueValidation", "值规则", "会应用到 Dictionary 值类型。", valueSchema),
            });
    }

    private static LightyValidationRuleSchema BuildReferenceSchema(LightyColumnTypeDescriptor descriptor)
    {
        var targetDisplay = descriptor.ReferenceTarget is null
            ? descriptor.RawType
            : $"{descriptor.ReferenceTarget.WorkbookName}.{descriptor.ReferenceTarget.SheetName}";

        return new LightyValidationRuleSchema(
            descriptor.MainTypeKey,
            descriptor.RawType,
            $"引用规则用于约束 Ref 值的标识数量以及目标表中是否存在对应主键。当前目标为 {targetDisplay}。",
            new[]
            {
                new LightyValidationRulePropertySchema("required", "boolean", "是否必须提供引用值。", defaultValue: false, example: true),
                new LightyValidationRulePropertySchema("targetMustExist", "boolean", "是否要求引用目标实际存在于目标表。", defaultValue: true, example: true),
                new LightyValidationRulePropertySchema("expectedIdentifierCount", "int", "覆盖默认主键维度，显式约束标识数量。", example: 2),
            });
    }
}