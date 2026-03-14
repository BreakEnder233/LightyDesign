using System.Collections.Generic;
using System.Linq;

namespace LightyDesignData;

public sealed class TestRow
{
    // ID1
    public required int ID1 { get; init; }
    // ID2
    public required int ID2 { get; init; }
}

public sealed partial class TestTable
{
    private readonly IReadOnlyList<TestRow> _rows;
    private readonly IReadOnlyDictionary<int, TestByID1Index> _byID1;

    private TestTable(IReadOnlyList<TestRow> rows)
    {
        _rows = rows;
        _byID1 = rows
            .GroupBy(row => row.ID1)
            .ToDictionary(group => group.Key, group => new TestByID1Index(group.ToList()));
    }

    public IReadOnlyList<TestRow> Rows => _rows;

    public TestByID1Index this[int id1] => _byID1[id1];

    internal static TestTable Create()
    {
        var rows = new List<TestRow>();
        rows.Add(new()
        {
            ID1 = 1,
            ID2 = 1,
        });
        rows.Add(new()
        {
            ID1 = 1,
            ID2 = 2,
        });
        rows.Add(new()
        {
            ID1 = 1,
            ID2 = 3,
        });
        rows.Add(new()
        {
            ID1 = 2,
            ID2 = 1,
        });
        return new TestTable(rows);
    }

    public sealed class TestByID1Index
    {
        private readonly IReadOnlyDictionary<int, TestRow> _byID2;

        internal TestByID1Index(IReadOnlyList<TestRow> rows)
        {
            _byID2 = rows.ToDictionary(row => row.ID2);
        }

        public TestRow this[int id2] => _byID2[id2];
    }

}

