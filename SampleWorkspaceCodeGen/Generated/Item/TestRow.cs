using System;
using System.Collections.Generic;

namespace LightyDesignData
{
    public sealed partial class TestRow
    {
        private Action _editNotifier;

        internal void SetEditNotifier(Action editNotifier)
        {
            _editNotifier = editNotifier;
        }

        // ID1
        private int _ID1;
        public int ID1
        {
            get => _ID1;
            set
            {
                _ID1 = value;
                _editNotifier?.Invoke();
            }
        }
        // ID2
        private int _ID2;
        public int ID2
        {
            get => _ID2;
            set
            {
                _ID2 = value;
                _editNotifier?.Invoke();
            }
        }
    }

}
