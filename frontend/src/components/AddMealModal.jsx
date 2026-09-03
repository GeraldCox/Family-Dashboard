import { useState, useEffect } from 'react';
import { api } from '../api';
import Icon, { StarIcon } from './Icon';

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Opened by tapping empty space on a Planner day card. Browsing the library
// (with rating/last-planned context to help pick) or typing a brand-new name
// both add directly to `date` — no separate day-picker step, since the day
// is already the thing the user tapped.
export default function AddMealModal({ date, dateLabel, onClose, onAdd }) {
  const [library, setLibrary] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.getMealLibrary().then(res => setLibrary(res.meals || [])).catch(() => setLibrary([]));
  }, []);

  const term = search.trim().toLowerCase();
  const filtered = (library || [])
    .filter(m => !term || m.name.toLowerCase().includes(term))
    .sort((a, b) => a.name.localeCompare(b.name));
  const exactMatch = (library || []).some(m => m.name.toLowerCase() === term);

  function handleAdd(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    onClose();
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.head}>
          <div style={s.title}>Add a meal · {dateLabel}</div>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        </div>

        <div style={s.searchRow}>
          <Icon name="search" size={16} style={s.searchIcon} />
          <input
            style={s.searchInput}
            type="text"
            placeholder="Search or type a new meal…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {term && !exactMatch && (
          <button style={s.newMealBtn} onClick={() => handleAdd(search)}>
            <Icon name="plus" size={15} /> Add "{search.trim()}" as a new meal
          </button>
        )}

        <div style={s.list}>
          {library === null && <div style={s.emptySmall}>Loading…</div>}
          {library && library.length === 0 && (
            <div style={s.emptySmall}>No saved meals yet — type a name above to add one.</div>
          )}
          {library && library.length > 0 && filtered.length === 0 && (
            <div style={s.emptySmall}>No matches — add "{search.trim()}" above.</div>
          )}
          {library && filtered.map(meal => (
            <button key={meal.id} style={s.row} onClick={() => handleAdd(meal.name)}>
              <div style={s.rowMain}>
                <div style={s.rowName}>{meal.name}</div>
                <div style={s.rowMeta}>
                  {meal.averageRating != null && (
                    <span style={s.rowRating}>
                      <StarIcon filled size={12} style={{ color: '#f59e0b' }} /> {meal.averageRating.toFixed(1)}
                    </span>
                  )}
                  {meal.lastPlanned && <span>Last planned {formatShortDate(meal.lastPlanned)}</span>}
                </div>
              </div>
              <Icon name="plus" size={16} style={s.rowAddIcon} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: 'var(--surface)', borderRadius: 16,
    width: 440, maxWidth: '92vw', maxHeight: '78vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
  },
  head: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
    padding: '20px 20px 12px', borderBottom: '0.5px solid var(--border)',
  },
  title: { fontSize: 17, fontWeight: 700, color: 'var(--text-1)' },
  closeBtn: { border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center' },

  searchRow: {
    display: 'flex', alignItems: 'center', gap: 8, margin: '14px 20px 0',
    padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-md)', background: 'var(--bg)',
    flexShrink: 0,
  },
  searchIcon: { color: 'var(--text-3)', flexShrink: 0 },
  searchInput: {
    flex: 1, border: 'none', background: 'none', outline: 'none', fontSize: 15,
    color: 'var(--text-1)', fontFamily: 'inherit',
  },

  newMealBtn: {
    display: 'flex', alignItems: 'center', gap: 6, margin: '10px 20px 0',
    padding: '9px 12px', borderRadius: 10, border: '1px dashed var(--blue)', background: 'none',
    color: 'var(--blue)', fontSize: 14, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
  },

  list: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 12px 16px', display: 'flex', flexDirection: 'column', gap: 4 },
  emptySmall: { fontSize: 14, color: 'var(--text-3)', fontStyle: 'italic', padding: '12px 8px' },
  row: {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    padding: '10px 12px', borderRadius: 10, border: 'none', background: 'none',
    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', boxSizing: 'border-box',
  },
  rowMain: { minWidth: 0 },
  rowName: { fontSize: 15, fontWeight: 600, color: 'var(--text-1)' },
  rowMeta: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 2, fontSize: 12, color: 'var(--text-3)' },
  rowRating: { display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 600, color: 'var(--text-2)' },
  rowAddIcon: { color: 'var(--blue)', flexShrink: 0 },
};
