using System;
using System.Collections.Generic;
using System.Linq;

namespace LightyDesignData
{
    public sealed partial class TestTable : ILightyDesignEditableTable
    {
        private readonly List<TestRow> _rows;
        private readonly IReadOnlyList<TestRow> _rowsView;
        private IReadOnlyDictionary<int, TestByID1Index> _byID1 = new Dictionary<int, TestByID1Index>();

        private TestTable(IEnumerable<TestRow> rows)
        {
            _rows = new List<TestRow>();
            _rowsView = _rows.AsReadOnly();
            LoadRows(rows);
            ((ILightyDesignEditableTable)this).RebuildIndexes();
        }

        public IReadOnlyList<TestRow> Rows => _rowsView;

        public TestByID1Index this[int id1] => _byID1[id1];
        public TestRow this[int id1, int id2] => _byID1[id1][id2];
        public bool TryGet(int id1, int id2, out TestRow row)
        {
            if (!_byID1.TryGetValue(id1, out var nextIndex))
            {
                row = null;
                return false;
            }

            return nextIndex.TryGet(id2, out row);
        }

        public void Add(TestRow row)
        {
            AddRow(row);
            MarkDirty();
        }

        public void AddRange(IEnumerable<TestRow> rows)
        {
            if (rows == null)
            {
                throw new ArgumentNullException(nameof(rows));
            }

            var added = false;
            foreach (var row in rows)
            {
                AddRow(row);
                added = true;
            }

            if (added)
            {
                MarkDirty();
            }
        }

        public bool Remove(TestRow row)
        {
            if (row == null)
            {
                throw new ArgumentNullException(nameof(row));
            }

            if (!_rows.Contains(row))
            {
                return false;
            }

            RemoveRow(row);
            MarkDirty();
            return true;
        }

        public void Clear()
        {
            if (_rows.Count == 0)
            {
                return;
            }

            foreach (var row in _rows)
            {
                row.SetEditNotifier(null);
            }

            _rows.Clear();
            MarkDirty();
        }

        public void ReplaceAll(IEnumerable<TestRow> rows)
        {
            if (rows == null)
            {
                throw new ArgumentNullException(nameof(rows));
            }

            foreach (var existingRow in _rows)
            {
                existingRow.SetEditNotifier(null);
            }

            _rows.Clear();
            LoadRows(rows);
            MarkDirty();
        }

        public bool RemoveByKey(int id1, int id2)
        {
            return TryGet(id1, id2, out var row) && row != null && Remove(row);
        }

        public bool EditByKey(int id1, int id2, Action<TestRow> editAction)
        {
            if (editAction == null)
            {
                throw new ArgumentNullException(nameof(editAction));
            }

            if (!TryGet(id1, id2, out var row) || row == null)
            {
                return false;
            }

            using (new LDD.EditingScope())
            {
                editAction(row);
            }
            return true;
        }

        private void LoadRows(IEnumerable<TestRow> rows)
        {
            if (rows == null)
            {
                throw new ArgumentNullException(nameof(rows));
            }

            foreach (var row in rows)
            {
                AddRow(row);
            }
        }

        private void AddRow(TestRow row)
        {
            if (row == null)
            {
                throw new ArgumentNullException(nameof(row));
            }
            row.SetEditNotifier(MarkDirty);
            _rows.Add(row);
        }

        private void RemoveRow(TestRow row)
        {
            row.SetEditNotifier(null);
            _ = _rows.Remove(row);
        }

        private void MarkDirty()
        {
            LDD.MarkDirty(this);
        }

        void ILightyDesignEditableTable.RebuildIndexes()
        {
            _byID1 = _rows
                .GroupBy(row => row.ID1)
                .ToDictionary(group => group.Key, group => new TestByID1Index(group.ToList()));
        }

        internal static TestTable Create()
        {
            var rows = new List<TestRow>();
            rows.Add(new TestRow()
            {
                ID1 = 1,
                ID2 = 1,
            });
            rows.Add(new TestRow()
            {
                ID1 = 1,
                ID2 = 2,
            });
            rows.Add(new TestRow()
            {
                ID1 = 1,
                ID2 = 3,
            });
            rows.Add(new TestRow()
            {
                ID1 = 2,
                ID2 = 1,
            });
            return new TestTable(rows);
        }
    }
}
