using System;
using System.Collections.Generic;
using System.Linq;

namespace LightyDesignData
{
    internal interface ILightyDesignEditableTable
    {
        void RebuildIndexes();
    }

    public static partial class LDD
    {
        private static readonly object EditingSync = new object();
        private static readonly HashSet<ILightyDesignEditableTable> DirtyTables = new HashSet<ILightyDesignEditableTable>();
        private static int EditingScopeRefCount;

        public sealed class EditingScope : IDisposable
        {
            private bool _disposed;

            public EditingScope()
            {
                EnterEditingScope();
            }

            public void Dispose()
            {
                if (_disposed)
                {
                    return;
                }

                _disposed = true;
                ExitEditingScope();
            }
        }

        public static ItemWorkbook Item { get; } = ItemWorkbook.Create();

        public static EditingScope BeginEditing()
        {
            return new EditingScope();
        }

        public static void Initialize()
        {
            _ = Item;
        }

        internal static void MarkDirty(ILightyDesignEditableTable table)
        {
            if (table == null)
            {
                throw new ArgumentNullException(nameof(table));
            }

            ILightyDesignEditableTable[] tablesToRebuild = null;
            lock (EditingSync)
            {
                if (EditingScopeRefCount > 0)
                {
                    DirtyTables.Add(table);
                    return;
                }

                tablesToRebuild = new[] { table }; 
            }

            RebuildIndexes(tablesToRebuild);
        }

        private static void EnterEditingScope()
        {
            lock (EditingSync)
            {
                EditingScopeRefCount += 1;
            }
        }

        private static void ExitEditingScope()
        {
            ILightyDesignEditableTable[] tablesToRebuild = null;
            lock (EditingSync)
            {
                if (EditingScopeRefCount == 0)
                {
                    return;
                }

                EditingScopeRefCount -= 1;
                if (EditingScopeRefCount > 0 || DirtyTables.Count == 0)
                {
                    return;
                }

                tablesToRebuild = DirtyTables.ToArray();
                DirtyTables.Clear();
            }

            RebuildIndexes(tablesToRebuild);
        }

        private static void RebuildIndexes(IEnumerable<ILightyDesignEditableTable> tables)
        {
            if (tables == null)
            {
                return;
            }

            foreach (var table in tables)
            {
                table.RebuildIndexes();
            }
        }
    }
}
