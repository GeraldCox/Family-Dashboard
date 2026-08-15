import { useState, useEffect } from 'react';
import { api } from '../api';

export default function ShoppingList() {
  const [data, setData] = useState(null);
  const [people, setPeople] = useState([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemAmount, setNewItemAmount] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    api.people().then(res => setPeople(res.people || [])).catch(console.error);
  }, []);

  function refresh() {
    api.getShoppingList().then(setData).catch(console.error);
  }

  function personColorFor(mealSource) {
    const match = people.find(p => p.name.toLowerCase() === (mealSource || '').toLowerCase());
    return match?.color;
  }

  async function toggle(id) {
    await api.toggleShoppingItem(id);
    setData(prev => ({
      items: prev.items.map(i => i.id !== id ? i : { ...i, checked: !i.checked })
    }));
  }

  async function clearChecked() {
    await api.clearCheckedItems();
    setData(prev => ({ items: prev.items.filter(i => !i.checked) }));
  }

  async function addManualItem() {
    if (!newItemName.trim()) return;
    setAdding(true);
    try {
      await api.addToShoppingList(
        [{ name: newItemName.trim(), amount: newItemAmount.trim() || '', unit: '' }],
        'General'
      );
      setNewItemName('');
      setNewItemAmount('');
      refresh();
    } finally {
      setAdding(false);
    }
  }

  if (!data) return <div style={s.empty}>Loading shopping list…</div>;

  const groups = groupByMeal(data.items);
  const checkedCount = data.items.filter(i => i.checked).length;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.title}>Shopping List</div>
          <div style={s.countBadge}>{data.items.length} item{data.items.length === 1 ? '' : 's'}</div>
        </div>
        <button style={s.clearBtn} onClick={clearChecked} disabled={checkedCount === 0}>
          Clear checked {checkedCount > 0 ? `(${checkedCount})` : ''}
        </button>
      </div>

      <div style={s.addRow}>
        <input
          style={s.addNameInput}
          type="text"
          placeholder="Add an item…"
          value={newItemName}
          onChange={e => setNewItemName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addManualItem(); }}
        />
        <input
          style={s.addAmountInput}
          type="text"
          placeholder="Qty (optional)"
          value={newItemAmount}
          onChange={e => setNewItemAmount(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addManualItem(); }}
        />
        <button style={s.addBtn} onClick={addManualItem} disabled={adding || !newItemName.trim()}>
          {adding ? 'Adding…' : 'Add'}
        </button>
      </div>

      {data.items.length === 0 && <div style={s.empty}>Your shopping list is empty.</div>}

      <div style={s.groups}>
        {groups.map(([mealSource, items]) => {
          const personColor = personColorFor(mealSource);
          return (
            <div
              key={mealSource}
              style={{ ...s.group, ...(personColor ? { borderLeft: `4px solid ${personColor}` } : {}) }}
            >
              <div style={{ ...s.groupTitle, ...(personColor ? { color: personColor } : {}) }}>
                {mealSource || 'Other'}
              </div>
              <div style={s.itemList}>
                {items.map(item => (
                  <label key={item.id} style={s.item}>
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => toggle(item.id)}
                      style={{ ...s.checkbox, ...(personColor ? { accentColor: personColor } : {}) }}
                    />
                    <span style={{ ...s.itemName, ...(item.checked ? s.itemChecked : {}) }}>
                      {item.name}
                      {(item.amount || item.unit) && (
                        <span style={s.itemQty}>
                          {' '}— {item.amount ?? ''} {item.unit || ''}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function groupByMeal(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.mealSource || '';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return Array.from(map.entries());
}

const s = {
  wrap: { padding: 20, overflowY: 'auto', height: '100%' },
  empty: { padding: 20, color: 'var(--text-3)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  title: { fontSize: 21, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-heading)' },
  countBadge: {
    fontSize: 13, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
    background: 'var(--bg)', border: '0.5px solid var(--border)', color: 'var(--text-2)',
  },
  clearBtn: {
    padding: '8px 14px', borderRadius: 8, border: '0.5px solid var(--border)',
    background: 'var(--bg)', color: 'var(--text-1)', fontSize: 15, fontWeight: 600,
    cursor: 'pointer',
  },
  addRow: { display: 'flex', gap: 8, marginBottom: 18, maxWidth: 640 },
  addNameInput: {
    flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-md)',
    fontSize: 15, background: 'var(--bg)', color: 'var(--text-1)', minWidth: 0,
  },
  addAmountInput: {
    width: 110, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-md)',
    fontSize: 15, background: 'var(--bg)', color: 'var(--text-1)', minWidth: 0,
  },
  addBtn: {
    padding: '9px 16px', borderRadius: 8, border: 'none',
    background: 'var(--blue)', color: 'white', fontSize: 15, fontWeight: 600,
    cursor: 'pointer', flexShrink: 0,
  },
  groups: { display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 },
  group: {
    background: 'var(--surface)', borderRadius: 16, padding: 14,
    border: '0.5px solid var(--border)', boxShadow: 'var(--shadow-sm)',
  },
  groupTitle: {
    fontSize: 14, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase',
    letterSpacing: '0.05em', marginBottom: 10, fontFamily: 'var(--font-heading)', fontStyle: 'italic',
  },
  itemList: { display: 'flex', flexDirection: 'column', gap: 4 },
  item: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px',
    cursor: 'pointer', borderRadius: 6,
  },
  checkbox: { width: 19, height: 19, flexShrink: 0, cursor: 'pointer' },
  itemName: { fontSize: 15, color: 'var(--text-1)' },
  itemChecked: { textDecoration: 'line-through', color: 'var(--text-3)' },
  itemQty: { fontSize: 14, color: 'var(--text-3)' },
};
