using System.Collections.Generic;
using System.Linq;

namespace LightyDesignData
{
    public sealed partial class TestByID1Index
    {
        private readonly IReadOnlyDictionary<int, TestRow> _byID2;

        internal TestByID1Index(IReadOnlyList<TestRow> rows)
        {
            _byID2 = rows.ToDictionary(row => row.ID2);
        }

        public TestRow this[int id2] => _byID2[id2];

        public bool TryGet(int id2, out TestRow row)
        {
            return _byID2.TryGetValue(id2, out row);
        }
    }

}
