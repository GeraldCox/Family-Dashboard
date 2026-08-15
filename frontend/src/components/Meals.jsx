import { useState, useEffect } from 'react';
import { api } from '../api';
import { useScreenSize } from '../hooks/useScreenSize';
import MealLibrary from './MealLibrary';
import Icon, { StarIcon } from './Icon';
import { DOW_SHORT, toDateStr, addDays, formatDateRange, isSameDate, getThreeWeekRanges } from '../utils/weekDates';

const MEAL_COLORS = ['#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#06b6d4'];

function formatNoteDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const MEALS_SUB_TABS = [
  { id: 'week',    label: 'This Week' },
  { id: 'library', label: 'Library' },
];

export default function Meals() {
  const [subTab, setSubTab] = useState('week');

  return (
    <div style={s.tabWrap}>
      <div style={s.subNav}>
        {MEALS_SUB_TABS.map(t => (
          <button
            key={t.id}
            style={{ ...s.subNavTab, ...(subTab === t.id ? s.subNavActive : {}) }}
            onClick={() => setSubTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={s.tabBody}>
        {subTab === 'week' && <WeekPlanner />}
        {subTab === 'library' && <MealLibrary />}
      </div>
    </div>
  );
}

// ── Rolling 3-week planner ───────────────────────────────────────────────────

function WeekSection({ week, todayMidnight, days, isMobile, onSelectMeal, onEmptyClick }) {
  const dayDates = Array.from({ length: 7 }, (_, i) => addDays(week.start, i));

  return (
    <div style={s.weekSection}>
      <div style={s.weekHeading}>{week.label} · {formatDateRange(week.start, week.end)}</div>
      <div style={{ ...s.grid, ...(isMobile ? s.gridMobile : {}) }}>
        {dayDates.map((date, i) => {
          const dateKey = toDateStr(date);
          const dayData = days[dateKey] || { meals: [], mealData: {} };
          const isToday = isSameDate(date, todayMidnight);
          const isPast = date < todayMidnight;
          const color = MEAL_COLORS[i];
          return (
            <div
              key={dateKey}
              style={{
                ...s.dayCard,
                ...(isMobile ? s.dayCardMobile : {}),
                ...(isToday ? { border: `2px solid ${color}`, background: color + '0d' } : {}),
              }}
            >
              <div style={{ ...s.dayLabel, color }}>
                {DOW_SHORT[i]} {date.getDate()}
                {isToday && <span style={{ ...s.todayBadge, background: color, color: 'white' }}>Today</span>}
              </div>
              <div style={s.mealContent}>
                {dayData.meals.length ? (
                  dayData.meals.map((m, j) => {
                    const mealData = (dayData.mealData || {})[m];
                    return (
                      <div
                        key={j}
                        style={{ ...s.mealPill, background: color + '18', color, borderLeft: `3px solid ${color}` }}
                        onClick={() => onSelectMeal(dateKey, m, isPast)}
                      >
                        <span style={s.mealPillText}><Icon name="utensils" size={14} style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: 5 }} />{m}</span>
                        {isPast && mealData?.rated && (
                          <span style={s.ratedStars} title="Rated">
                            {(mealData.stars || 0) > 0
                              ? Array.from({ length: mealData.stars }).map((_, k) => (
                                  <StarIcon key={k} filled size={12} style={{ color: '#f59e0b' }} />
                                ))
                              : '—'}
                          </span>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div style={s.emptyMeal} onClick={onEmptyClick}>No meals planned</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekPlanner() {
  const [data, setData] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null); // { date, mealName, isPast }
  const [showEmptyNotice, setShowEmptyNotice] = useState(false);
  const { isMobile } = useScreenSize();

  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const weeks = getThreeWeekRanges(today);

  useEffect(() => {
    api.meals(toDateStr(weeks[0].start), toDateStr(weeks[2].end)).then(setData).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRated(date, mealName, stars) {
    setData(prev => ({
      days: {
        ...prev.days,
        [date]: {
          ...(prev.days[date] || { meals: [] }),
          mealData: { ...(prev.days[date]?.mealData || {}), [mealName]: { rated: true, stars } },
        },
      },
    }));
  }

  if (!data) return <div style={{ padding: 20, color: 'var(--text-3)' }}>Loading meals…</div>;

  return (
    <div style={s.wrap}>
      {weeks.map(week => (
        <WeekSection
          key={week.key}
          week={week}
          todayMidnight={todayMidnight}
          days={data.days}
          isMobile={isMobile}
          onSelectMeal={(date, mealName, isPast) => setDetailTarget({ date, mealName, isPast })}
          onEmptyClick={() => setShowEmptyNotice(true)}
        />
      ))}

      {detailTarget && (
        <RecipeDetailModal
          date={detailTarget.date}
          mealName={detailTarget.mealName}
          onClose={() => setDetailTarget(null)}
          onRated={handleRated}
        />
      )}

      {showEmptyNotice && (
        <div style={s.overlay} onClick={() => setShowEmptyNotice(false)}>
          <div style={s.noticeModal} onClick={e => e.stopPropagation()}>
            <div style={s.noticeText}>Add meals for this day in Edit → Meals</div>
            <button style={s.rateSubmitBtn} onClick={() => setShowEmptyNotice(false)}>Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Recipe detail modal ──────────────────────────────────────────────────────

function RecipeDetailModal({ date, mealName, onClose, onRated }) {
  const [full, setFull] = useState(undefined); // undefined = loading, null = not found
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [previousNotes, setPreviousNotes] = useState(null);

  useEffect(() => {
    api.getFullMeal(mealName).then(setFull).catch(() => setFull(null));
  }, [mealName]);

  useEffect(() => {
    api.getMealNotes(mealName).then(res => setPreviousNotes(res.notes || [])).catch(() => setPreviousNotes([]));
  }, [mealName]);

  async function submitRating() {
    setSaving(true);
    try {
      await api.rateWeeklyMeal(date, mealName, stars, note.trim());
      onRated(date, mealName, stars);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  const ingredients = full?.ingredients || [];
  const instructions = full?.instructions || [];

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.detailModal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHead}>
          <div style={s.modalTitle}>{full?.name || mealName}</div>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        </div>

        {full?.sourceUrl && (
          <a href={full.sourceUrl} target="_blank" rel="noreferrer" style={s.sourceLinkRow}>
            <Icon name="link" size={15} /> {full.sourceName || 'View source'}
          </a>
        )}

        <div style={s.detailSection}>
          <div style={s.label}>Ingredients</div>
          {ingredients.length > 0 ? (
            <ul style={s.ingredientList}>
              {ingredients.map((ing, i) => (
                <li key={i} style={s.ingredientItem}>
                  {[ing.amount, ing.unit, ing.name].filter(Boolean).join(' ')}
                </li>
              ))}
            </ul>
          ) : (
            <div style={s.notAvailable}>Not available</div>
          )}
        </div>

        <div style={s.detailSection}>
          <div style={s.label}>Instructions</div>
          {instructions.length > 0 ? (
            <div style={s.instructionsList}>
              {instructions.map(step => (
                <div key={step.number} style={s.instructionRow}>
                  <div style={s.instructionNumber}>{step.number}</div>
                  <div style={s.instructionText}>{step.step}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={s.notAvailable}>Not available</div>
          )}
        </div>

        <div style={s.ratingSection}>
          <div style={s.label}>Rate this meal</div>
          <div style={s.rateStarsRow}>
            {[1, 2, 3, 4, 5].map(n => (
              <span
                key={n}
                style={s.rateStarIcon}
                onClick={() => setStars(prev => (prev === n ? 0 : n))}
                role="button"
                aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
              >
                <StarIcon filled={n <= stars} size={30} style={{ color: n <= stars ? '#f59e0b' : 'var(--text-3)' }} />
              </span>
            ))}
          </div>

          <textarea
            style={s.noteTextarea}
            rows={3}
            placeholder="How did it go? Any changes for next time?"
            value={note}
            onChange={e => setNote(e.target.value)}
          />
          <div style={s.noteHelperText}>Notes help you remember what worked and what to adjust</div>

          {previousNotes && previousNotes.length > 0 && (
            <div style={s.previousNotesBlock}>
              <div style={s.previousNotesHeading}>Previous notes:</div>
              {previousNotes.slice(0, 3).map((n, i) => (
                <div key={i} style={s.previousNoteItem}>
                  {formatNoteDate(n.date)} ·{' '}
                  {Array.from({ length: n.stars || 0 }).map((_, k) => (
                    <StarIcon key={k} filled size={11} style={{ color: '#f59e0b', display: 'inline-block', verticalAlign: '-1px' }} />
                  ))} · {n.note}
                </div>
              ))}
            </div>
          )}

          <button style={s.rateSubmitBtn} onClick={submitRating} disabled={saving}>
            {saving ? 'Saving…' : 'Submit rating'}
          </button>
        </div>
      </div>
    </div>
  );
}

const s = {
  tabWrap: { display: 'flex', flexDirection: 'column', height: '100%' },
  subNav: { display: 'flex', gap: 4, padding: '10px 16px 0 16px', flexShrink: 0 },
  subNavTab: {
    padding: '9px 18px', fontSize: 15, fontWeight: 500,
    color: 'var(--text-2)', background: 'var(--surface)',
    border: '0.5px solid var(--border)', borderBottom: 'none',
    borderRadius: '10px 10px 0 0', cursor: 'pointer', fontFamily: 'inherit',
  },
  subNavActive: { color: 'var(--blue)', background: 'var(--bg)' },
  tabBody: { flex: 1, overflow: 'hidden' },

  wrap: { padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 22 },
  weekSection: { display: 'flex', flexDirection: 'column', minHeight: 0 },
  weekHeading: {
    fontWeight: 600, color: 'var(--text-2)', marginBottom: 14, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 13,
    fontFamily: 'var(--font-heading)', fontStyle: 'italic',
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 },
  gridMobile: { gridTemplateColumns: '1fr', gap: 8 },
  dayCard: { background: 'var(--surface)', borderRadius: 16, padding: 14, border: '0.5px solid var(--border)', minHeight: 130, boxShadow: 'var(--shadow-sm)' },
  dayCardMobile: { minHeight: 0 },
  dayLabel: { fontSize: 13, fontWeight: 700, letterSpacing: '0.07em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 },
  todayBadge: { fontSize: 10, padding: '2px 6px', borderRadius: 20, fontWeight: 700 },
  mealContent: { display: 'flex', flexDirection: 'column', gap: 5 },
  mealPill: { fontSize: 13, padding: '4px 7px', borderRadius: 5, fontWeight: 500, lineHeight: 1.3, display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: 4, cursor: 'pointer' },
  mealPillText: { flex: 1 },
  emptyMeal: { fontSize: 14, color: 'var(--text-3)', fontStyle: 'italic', paddingTop: 4, cursor: 'pointer' },
  ratedStars: { display: 'inline-flex', alignItems: 'center', gap: 1, flexShrink: 0 },

  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  detailModal: {
    background: 'var(--surface)', borderRadius: 16, padding: 20,
    width: 520, maxWidth: '92vw', maxHeight: '86vh', overflowY: 'auto',
    boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
  },
  noticeModal: {
    background: 'var(--surface)', borderRadius: 16, padding: 20,
    width: 320, maxWidth: '90vw', textAlign: 'center',
    boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
  },
  noticeText: { fontSize: 16, color: 'var(--text-1)', marginBottom: 14, lineHeight: 1.5 },

  modalHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: 700, color: 'var(--text-1)' },
  closeBtn: { border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center' },

  sourceLinkRow: {
    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--blue)', textDecoration: 'none', marginBottom: 14,
  },

  detailSection: { marginBottom: 18 },
  label: {
    display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8,
    fontFamily: 'var(--font-heading)', fontStyle: 'italic',
  },
  ingredientList: { margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 },
  ingredientItem: { fontSize: 15, color: 'var(--text-1)', lineHeight: 1.4 },

  instructionsList: { display: 'flex', flexDirection: 'column', gap: 14 },
  instructionRow: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  instructionNumber: {
    width: 28, height: 28, borderRadius: '50%', background: 'var(--blue)', color: 'white',
    fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  instructionText: { fontSize: 15, color: 'var(--text-1)', lineHeight: 1.6, paddingTop: 2 },

  notAvailable: { fontSize: 15, color: 'var(--text-3)', fontStyle: 'italic' },

  ratingSection: { marginTop: 8, paddingTop: 16, borderTop: '0.5px solid var(--border)' },
  rateStarsRow: { display: 'flex', gap: 8, marginBottom: 14, justifyContent: 'center' },
  rateStarIcon: { cursor: 'pointer', display: 'flex', transition: 'transform 0.15s' },
  noteTextarea: {
    width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-md)',
    fontSize: 15, background: 'var(--bg)', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  },
  noteHelperText: { fontSize: 13, color: 'var(--text-3)', marginTop: 5 },
  previousNotesBlock: {
    marginTop: 14, paddingTop: 12, borderTop: '0.5px solid var(--border)',
  },
  previousNotesHeading: {
    fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase',
    letterSpacing: '0.04em', marginBottom: 6, fontFamily: 'var(--font-heading)', fontStyle: 'italic',
  },
  previousNoteItem: { fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5 },
  rateSubmitBtn: {
    width: '100%', marginTop: 12, padding: '9px', borderRadius: 8, border: 'none',
    background: 'var(--blue)', color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer',
  },
};
