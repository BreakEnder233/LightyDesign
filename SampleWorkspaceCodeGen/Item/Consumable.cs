using System.Collections.Generic;
using System.Linq;

namespace LightyDesignData;

public sealed class ConsumableRow
{
    // 序号
    public required int ID { get; init; }
}

public sealed partial class ConsumableTable
{
    private readonly IReadOnlyList<ConsumableRow> _rows;
    private readonly IReadOnlyDictionary<int, ConsumableRow> _byID;

    private ConsumableTable(IReadOnlyList<ConsumableRow> rows)
    {
        _rows = rows;
        _byID = rows.ToDictionary(row => row.ID);
    }

    public IReadOnlyList<ConsumableRow> Rows => _rows;

    public ConsumableRow this[int id] => _byID[id];

    internal static ConsumableTable Create()
    {
        var rows = new List<ConsumableRow>();
        rows.Add(new()
        {
            ID = 1,
        });
        return new ConsumableTable(rows);
    }
}

