using System;
using System.Collections.Generic;
using System.Linq;

namespace LightyDesignData
{
    public sealed partial class ConsumableTable : ILightyDesignEditableTable
    {
        private readonly List<ConsumableRow> _rows;
        private readonly IReadOnlyList<ConsumableRow> _rowsView;
        private IReadOnlyDictionary<int, ConsumableRow> _byID = new Dictionary<int, ConsumableRow>();

        private ConsumableTable(IEnumerable<ConsumableRow> rows)
        {
            _rows = new List<ConsumableRow>();
            _rowsView = _rows.AsReadOnly();
            LoadRows(rows);
            ((ILightyDesignEditableTable)this).RebuildIndexes();
        }

        public IReadOnlyList<ConsumableRow> Rows => _rowsView;

        public ConsumableRow this[int id] => _byID[id];
        public bool TryGet(int id, out ConsumableRow row) => _byID.TryGetValue(id, out row);

        public void Add(ConsumableRow row)
        {
            AddRow(row);
            MarkDirty();
        }

        public void AddRange(IEnumerable<ConsumableRow> rows)
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

        public bool Remove(ConsumableRow row)
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

        public void ReplaceAll(IEnumerable<ConsumableRow> rows)
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

        public bool RemoveByKey(int id)
        {
            return TryGet(id, out var row) && row != null && Remove(row);
        }

        public bool EditByKey(int id, Action<ConsumableRow> editAction)
        {
            if (editAction == null)
            {
                throw new ArgumentNullException(nameof(editAction));
            }

            if (!TryGet(id, out var row) || row == null)
            {
                return false;
            }

            using (new LDD.EditingScope())
            {
                editAction(row);
            }
            return true;
        }

        private void LoadRows(IEnumerable<ConsumableRow> rows)
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

        private void AddRow(ConsumableRow row)
        {
            if (row == null)
            {
                throw new ArgumentNullException(nameof(row));
            }
            row.SetEditNotifier(MarkDirty);
            _rows.Add(row);
        }

        private void RemoveRow(ConsumableRow row)
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
            _byID = _rows.ToDictionary(row => row.ID);
        }

        internal static ConsumableTable Create()
        {
            var rows = new List<ConsumableRow>();
            rows.Add(new ConsumableRow()
            {
                ID = 1,
            });
            return new ConsumableTable(rows);
        }
    }
}
