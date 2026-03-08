namespace LightyDesign.Core;

public sealed class LightyCellValue
{
    private readonly Lazy<LightyValueParseResult> _parseResult;

    public LightyCellValue(
        ColumnDefine column,
        string rawText,
        ILightyValueParser parser,
        LightyValueParseContext context)
    {
        ArgumentNullException.ThrowIfNull(column);
        ArgumentNullException.ThrowIfNull(rawText);
        ArgumentNullException.ThrowIfNull(parser);
        ArgumentNullException.ThrowIfNull(context);

        Column = column;
        RawText = rawText;
        Parser = parser;
        Context = context;
        _parseResult = new Lazy<LightyValueParseResult>(() => Parser.Parse(Column, RawText, Context));
    }

    public ColumnDefine Column { get; }

    public string RawText { get; }

    public ILightyValueParser Parser { get; }

    public LightyValueParseContext Context { get; }

    public bool IsParsed => _parseResult.IsValueCreated;

    public LightyCellValueState State
    {
        get
        {
            if (!_parseResult.IsValueCreated)
            {
                return LightyCellValueState.Unparsed;
            }

            return _parseResult.Value.IsSuccess
                ? LightyCellValueState.Parsed
                : LightyCellValueState.Failed;
        }
    }

    public LightyValueParseResult Parse()
    {
        return _parseResult.Value;
    }
}