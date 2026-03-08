namespace LightyDesign.Core;

public interface ILightyValueParser
{
    LightyValueParseResult Parse(ColumnDefine column, string rawText, LightyValueParseContext context);
}