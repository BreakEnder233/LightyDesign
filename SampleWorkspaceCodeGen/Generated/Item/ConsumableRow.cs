using System;
using System.Collections.Generic;

namespace LightyDesignData
{
    public sealed partial class ConsumableRow
    {
        private Action _editNotifier;

        internal void SetEditNotifier(Action editNotifier)
        {
            _editNotifier = editNotifier;
        }

        // 序号
        private int _ID;
        public int ID
        {
            get => _ID;
            set
            {
                _ID = value;
                _editNotifier?.Invoke();
            }
        }
    }

}
