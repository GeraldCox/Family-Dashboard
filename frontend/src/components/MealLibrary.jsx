import { useState, useEffect } from 'react';
import { api } from '../api';
import { getThreeWeekRanges, toDateStr, addDays, DOW_SHORT } from '../utils/weekDates';
import Icon, { StarIcon } from './Icon';

const SORT_OPTIONS = [
  { id: 'recent', label: 'Most recent' },
  { id: 'rating', label: 'Highest rated' },
  { id: 'az',     label: 'A-Z' },
];

function idTimestamp(id) {
  const n = parseInt(String(id).replace(/[^\d]/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

function renderStars(avg) {
  const rounded = Math.round(avg || 0);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <StarIcon key={n} filled={n <= rounded} size={15} style={{ color: n <= rounded ? '#f59e0b' : 'var(--text-3)' }} />
      ))}
    </span>
  );
}

function noteStars(count) {
  return Array.from({ length: count || 0 }).map((_, k) => (
    <StarIcon key={k} filled size={11} style={{ color: '#f59e0b', display: 'inline-block', verticalAlign: '-1px' }} />
  ));
}

function formatNoteDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function MealLibrary() {
  const [meals, setMeals] = useState(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [weekDays, setWeekDays] = useState(null);
  const [addingFor, setAddingFor] = useState(null); // meal name currently picking a day for
  const [toast, setToast] = useState('');
  const [expandedNotes, setExpandedNotes] = useState({}); // mealName -> bool
  const [notesByMeal, setNotesByMeal] = useState({}); // mealName -> 'loading' | array

  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    // Same window the Planner tab shows (through the end of "next week"), but
    // starting from today instead of the start of "this week" — no point
    // offering to add a meal to a day that's already passed.
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const rangeEnd = getThreeWeekRanges(today)[2].end;
    const dayCount = Math.round((rangeEnd - todayMidnight) / 86400000) + 1;
    api.meals(toDateStr(todayMidnight), toDateStr(rangeEnd)).then(res => {
      const days = Array.from({ length: dayCount }, (_, i) => {
        const date = addDays(todayMidnight, i);
        const dateKey = toDateStr(date);
        return { dateKey, label: `${DOW_SHORT[date.getDay()]} ${date.getDate()}`, meals: res.days[dateKey]?.meals || [] };
      });
      setWeekDays(days);
    }).catch(console.error);
  }, []);

  function refresh() {
    api.getMealLibrary().then(res => setMeals(res.meals || [])).catch(console.error);
  }

  async function removeMeal(name) {
    await api.deleteMealFromLibrary(name);
    setMeals(prev => prev.filter(m => m.name !== name));
  }

  async function addToDay(meal, dateKey) {
    const day = weekDays.find(d => d.dateKey === dateKey);
    const updated = [...day.meals, meal.name];
    await api.updateMeal(dateKey, updated);
    setWeekDays(prev => prev.map(d => d.dateKey === dateKey ? { ...d, meals: updated } : d));
    setAddingFor(null);
    setToast(`Added "${meal.name}" to ${day.label}`);
    setTimeout(() => setToast(''), 2000);
  }

  async function toggleNotes(meal) {
    const isOpen = !!expandedNotes[meal.name];
    setExpandedNotes(prev => ({ ...prev, [meal.name]: !isOpen }));
    if (!isOpen && !notesByMeal[meal.name]) {
      setNotesByMeal(prev => ({ ...prev, [meal.name]: 'loading' }));
      try {
        const res = await api.getMealNotes(meal.name);
        setNotesByMeal(prev => ({ ...prev, [meal.name]: res.notes || [] }));
      } catch (err) {
        console.error(err);
        setNotesByMeal(prev => ({ ...prev, [meal.name]: [] }));
      }
    }
  }

  if (!meals) return <div style={s.empty}>Loading meal library…</div>;

  if (meals.length === 0) {
    return (
      <div style={s.emptyState}>
        <div style={s.emptyEmoji}><Icon name="utensils" size={48} style={{ color: 'var(--text-3)' }} /></div>
        <div style={s.emptyText}>No saved meals yet — search for recipes in the Meals tab</div>
      </div>
    );
  }

  const filtered = meals.filter(m => m.name.toLowerCase().includes(search.trim().toLowerCase()));
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'rating') return (b.averageRating ?? -1) - (a.averageRating ?? -1);
    if (sortBy === 'az') return a.name.localeCompare(b.name);
    return idTimestamp(b.id) - idTimestamp(a.id);
  });

  return (
    <div style={s.wrap}>
      <div style={s.controls}>
        <div style={s.searchWrap}>
          <Icon name="search" size={17} style={{ ...s.searchIcon }} />
          <input
            style={s.searchInput}
            type="text"
            placeholder="Search meals…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={s.sortPills}>
          {SORT_OPTIONS.map(o => (
            <button
              key={o.id}
              style={{ ...s.sortPill, ...(sortBy === o.id ? s.sortPillActive : {}) }}
              onClick={() => setSortBy(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {toast && <div style={s.toast}>{toast}</div>}

      {sorted.length === 0 ? (
        <div style={s.emptySmall}>No meals match your search.</div>
      ) : (
        <div style={s.list}>
          {sorted.map(meal => {
            const preview = (meal.ingredients || []).slice(0, 5).map(i => i.name).filter(Boolean);
            const ratedCount = (meal.ratings || []).length;
            const notesCount = (meal.ratings || []).filter(r => r.note && r.note.trim()).length;
            const isNotesOpen = !!expandedNotes[meal.name];
            const notes = notesByMeal[meal.name];
            return (
              <div key={meal.id} style={s.card}>
                <div style={s.cardHead}>
                  <div style={s.cardTitle}>{meal.name}</div>
                  {meal.sourceUrl && (
                    <a href={meal.sourceUrl} target="_blank" rel="noreferrer" style={s.sourceLink}>
                      <Icon name="link" size={14} /> {meal.sourceName || 'source'}
                    </a>
                  )}
                </div>

                <div style={s.ratingRow}>
                  {meal.averageRating != null ? (
                    <>
                      <span style={s.stars}>{renderStars(meal.averageRating)}</span>
                      <span style={s.ratingValue}>{meal.averageRating.toFixed(1)}</span>
                      <span style={s.ratedCount}>Rated {ratedCount} time{ratedCount === 1 ? '' : 's'}</span>
                    </>
                  ) : (
                    <span style={s.notRated}>Not yet rated</span>
                  )}
                </div>

                {preview.length > 0 && (
                  <div style={s.ingredientsPreview}>{preview.join(', ')}</div>
                )}

                {notesCount > 0 && (
                  <div style={s.notesSection}>
                    <button style={s.notesToggleBtn} onClick={() => toggleNotes(meal)}>
                      <Icon name="clipboard-list" size={15} /> Notes ({notesCount})
                      <Icon name="chevron-right" size={15} style={{ transform: isNotesOpen ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform var(--dur-fast) var(--ease)' }} />
                    </button>
                    {isNotesOpen && (
                      <div style={s.notesList}>
                        {notes === 'loading' && <div style={s.emptySmall}>Loading notes…</div>}
                        {Array.isArray(notes) && notes.map((n, i) => (
                          <div key={i} style={s.noteItem}>
                            {formatNoteDate(n.date)} · {noteStars(n.stars)} · {n.note}
                          </div>
                        ))}
                        {Array.isArray(notes) && notes.length === 0 && (
                          <div style={s.emptySmall}>No notes yet.</div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div style={s.cardActions}>
                  {addingFor === meal.name ? (
                    <div style={s.dayPicker}>
                      {(weekDays || []).map(d => (
                        <button key={d.dateKey} style={s.dayPickerBtn} onClick={() => addToDay(meal, d.dateKey)}>
                          {d.label}
                          {d.meals.length > 0
                            ? <Icon name="check-square" size={13} style={s.dayPickerCheckIcon} />
                            : <span style={s.dayPickerCheckEmpty} />}
                        </button>
                      ))}
                      <button style={s.dayPickerCancel} onClick={() => setAddingFor(null)} aria-label="Cancel"><Icon name="x" size={15} /></button>
                    </div>
                  ) : (
                    <button style={s.addWeekBtn} onClick={() => setAddingFor(meal.name)}>
                      + Add to plan
                    </button>
                  )}
                  <button style={s.deleteBtn} onClick={() => removeMeal(meal.name)} title="Delete from library" aria-label="Delete from library">
                    <Icon name="trash" size={17} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const s = {
  wrap: { padding: 20, overflowY: 'auto', height: '100%' },
  empty: { padding: 20, color: 'var(--text-3)' },
  emptySmall: { fontSize: 14, color: 'var(--text-3)', fontStyle: 'italic', padding: '12px 0' },

  emptyState: {
    height: '100%', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20, textAlign: 'center',
  },
  emptyEmoji: { fontSize: 46 },
  emptyText: { fontSize: 16, color: 'var(--text-3)', maxWidth: 320 },

  controls: {
    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14,
  },
  searchWrap: { position: 'relative', flex: 1, minWidth: 180, display: 'flex', alignItems: 'center' },
  searchIcon: { position: 'absolute', left: 12, color: 'var(--text-3)', pointerEvents: 'none' },
  searchInput: {
    flex: 1, width: '100%', padding: '9px 12px 9px 36px', borderRadius: 10,
    border: '1px solid var(--border-md)', fontSize: 15, background: 'var(--surface)',
  },
  sortPills: { display: 'flex', gap: 4 },
  sortPill: {
    padding: '7px 12px', borderRadius: 8, fontSize: 14, fontWeight: 600,
    color: 'var(--text-2)', background: 'var(--surface)', border: '0.5px solid var(--border)',
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
  sortPillActive: { color: 'white', background: 'var(--blue)', borderColor: 'var(--blue)' },

  toast: {
    fontSize: 14, fontWeight: 600, color: 'var(--green-text)', background: 'var(--green-bg)',
    padding: '8px 12px', borderRadius: 8, marginBottom: 12,
  },

  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: {
    background: 'var(--surface)', borderRadius: 16, padding: 14,
    border: '0.5px solid var(--border)', boxShadow: 'var(--shadow-sm)',
  },
  cardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  cardTitle: { fontSize: 16, fontWeight: 700, color: 'var(--text-1)' },
  sourceLink: { fontSize: 13, color: 'var(--blue)', textDecoration: 'none', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5 },

  ratingRow: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  stars: { display: 'inline-flex', alignItems: 'center' },
  ratingValue: { fontSize: 14, fontWeight: 700, color: 'var(--text-2)' },
  ratedCount: { fontSize: 13, color: 'var(--text-3)' },
  notRated: { fontSize: 14, color: 'var(--text-3)', fontStyle: 'italic' },

  ingredientsPreview: {
    fontSize: 13, color: 'var(--text-3)', marginTop: 8,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },

  notesSection: { marginTop: 10 },
  notesToggleBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 13, fontWeight: 700, color: 'var(--text-2)', background: 'var(--bg)',
    border: '0.5px solid var(--border)', borderRadius: 20, padding: '4px 10px', cursor: 'pointer',
  },
  notesList: {
    marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6,
    paddingLeft: 4, borderLeft: '2px solid var(--border)',
  },
  noteItem: { fontSize: 14, color: 'var(--text-2)', paddingLeft: 8, lineHeight: 1.4 },

  cardActions: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 },
  addWeekBtn: {
    padding: '7px 14px', borderRadius: 8, border: '0.5px solid var(--border)',
    background: 'var(--bg)', color: 'var(--text-1)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  deleteBtn: {
    border: 'none', background: 'transparent', cursor: 'pointer',
    padding: 4, color: 'var(--text-3)', marginLeft: 'auto', display: 'flex', alignItems: 'center',
  },
  dayPicker: { display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' },
  // Matches the day pills in Manage → Meals (dayPill/dayPillCheckIcon/dayPillCheckEmpty).
  dayPickerBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '8px 16px', borderRadius: 20, fontSize: 14, fontWeight: 700,
    color: 'var(--text-2)', background: 'var(--surface)', border: '0.5px solid var(--border)',
    cursor: 'pointer',
  },
  dayPickerCheckIcon: { color: 'var(--green)', flexShrink: 0 },
  dayPickerCheckEmpty: {
    width: 13, height: 13, borderRadius: 3, border: '1.5px solid currentColor', opacity: 0.4, flexShrink: 0,
  },
  dayPickerCancel: {
    width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 13, color: 'var(--text-3)', background: 'var(--bg)',
    border: '0.5px solid var(--border)', cursor: 'pointer',
  },
};
