import { useState, useEffect, useRef } from 'react';
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
  { id: 'week',    label: 'Planner' },
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

function WeekSection({
  week, todayMidnight, days, isMobile, onEmptyClick,
  dragMeal, dragOverDate, pressedMeal, onMealPointerDown, onDragPointerMove, onDragPointerUp, onMealClick,
}) {
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
          const isDragOver = dragOverDate === dateKey && dragMeal?.date !== dateKey;
          return (
            <div
              key={dateKey}
              data-day-date={dateKey}
              style={{
                ...s.dayCard,
                ...(isMobile ? s.dayCardMobile : {}),
                ...(isPast ? s.dayCardPast : {}),
                ...(isToday ? { border: `2px solid ${color}`, background: color + '0d' } : {}),
                ...(isDragOver ? s.dayCardDragOver : {}),
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
                    const isBeingDragged = dragMeal && dragMeal.date === dateKey && dragMeal.index === j;
                    const isPressed = pressedMeal && pressedMeal.date === dateKey && pressedMeal.index === j;
                    return (
                      <div
                        key={j}
                        style={{
                          ...s.mealPill, background: color + '18', color, borderLeft: `3px solid ${color}`,
                          ...(isPressed ? s.mealPillPressed : {}),
                          ...(isBeingDragged ? s.mealPillDragging : {}),
                        }}
                        onPointerDown={e => onMealPointerDown(e, dateKey, m, j, isPast)}
                        onPointerMove={onDragPointerMove}
                        onPointerUp={onDragPointerUp}
                        onPointerCancel={onDragPointerUp}
                        onClick={() => onMealClick(dateKey, m, isPast)}
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

// Below this, a drag is real (not just an imprecise tap) — matches the hold
// distance used for the calendar page's long-press gesture area.
const DRAG_THRESHOLD_PX = 8;
// How long a press has to hold still before we show the "this is draggable"
// lift, so a quick tap never flashes it.
const PRESS_AFFORDANCE_DELAY_MS = 180;

function WeekPlanner() {
  const [data, setData] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null); // { date, mealName, isPast }
  const [showEmptyNotice, setShowEmptyNotice] = useState(false);
  const { isMobile } = useScreenSize();

  // Drag-to-reschedule state. dragMeal (and the ghost) only appear once the
  // pointer has moved past DRAG_THRESHOLD_PX, so a plain tap still opens the
  // recipe detail modal instead of starting a drag every time.
  const [dragMeal, setDragMeal] = useState(null); // { date, mealName, index }
  const [dragOverDate, setDragOverDate] = useState(null);
  const [dragPos, setDragPos] = useState(null); // { x, y } for the ghost pill
  const [pressedMeal, setPressedMeal] = useState(null); // { date, index } — pre-drag "you can drag this" lift
  const dragInfoRef = useRef(null); // { date, mealName, index, isPast }
  const dragStartRef = useRef(null); // { x, y }
  const draggingRef = useRef(false);
  const pressTimerRef = useRef(null);

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

  // Tap-to-open uses the browser's native click event (fires identically for
  // mouse and touch, and bubbles correctly no matter which child — icon,
  // text, padding — was actually hit). Pointer events are only used to
  // detect and execute an actual cross-day drag; a real drag sets
  // suppressClickRef so the click that follows a drag doesn't also pop the
  // modal open.
  const suppressClickRef = useRef(false);

  function handleMealPointerDown(e, date, mealName, index, isPast) {
    if (e.button !== undefined && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragInfoRef.current = { date, mealName, index, isPast };
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    draggingRef.current = false;

    clearTimeout(pressTimerRef.current);
    pressTimerRef.current = setTimeout(() => {
      // Still held, and hasn't already turned into an actual drag — show the
      // "this can be dragged" lift.
      if (dragInfoRef.current && !draggingRef.current) {
        setPressedMeal({ date, index });
      }
    }, PRESS_AFFORDANCE_DELAY_MS);
  }

  function handleDragPointerMove(e) {
    if (!dragInfoRef.current) return;
    const { x, y } = dragStartRef.current;
    const dx = e.clientX - x, dy = e.clientY - y;
    if (!draggingRef.current) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      draggingRef.current = true;
      clearTimeout(pressTimerRef.current);
      setPressedMeal(null);
      setDragMeal(dragInfoRef.current);
    }
    setDragPos({ x: e.clientX, y: e.clientY });
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const dayEl = el && el.closest('[data-day-date]');
    setDragOverDate(dayEl ? dayEl.dataset.dayDate : null);
  }

  function handleDragPointerUp() {
    clearTimeout(pressTimerRef.current);
    const info = dragInfoRef.current;
    if (info && draggingRef.current) {
      const droppedOnDifferentDay = dragOverDate && dragOverDate !== info.date;
      if (droppedOnDifferentDay) {
        // A past day is history, not something to edit — dragging off of one
        // reuses that meal on the new day instead of removing it from the record.
        if (info.isPast) {
          copyMeal(dragOverDate, info.mealName);
        } else {
          moveMeal(info.date, dragOverDate, info.mealName, info.index);
        }
        suppressClickRef.current = true;
      }
    }
    dragInfoRef.current = null;
    dragStartRef.current = null;
    draggingRef.current = false;
    setDragMeal(null);
    setDragOverDate(null);
    setDragPos(null);
    setPressedMeal(null);
  }

  function handleMealClick(date, mealName, isPast) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setDetailTarget({ date, mealName, isPast });
  }

  function moveMeal(fromDate, toDate, mealName, index) {
    const fromDay = data.days[fromDate] || { meals: [], mealData: {} };
    const toDay = data.days[toDate] || { meals: [], mealData: {} };
    const newFromMeals = fromDay.meals.filter((_, i) => i !== index);
    const newToMeals = [...toDay.meals, mealName];

    setData(prev => ({
      days: {
        ...prev.days,
        [fromDate]: { ...(prev.days[fromDate] || { meals: [], mealData: {} }), meals: newFromMeals },
        [toDate]: { ...(prev.days[toDate] || { meals: [], mealData: {} }), meals: newToMeals },
      },
    }));

    api.updateMeal(fromDate, newFromMeals).catch(console.error);
    api.updateMeal(toDate, newToMeals).catch(console.error);
  }

  function copyMeal(toDate, mealName) {
    const toDay = data.days[toDate] || { meals: [], mealData: {} };
    const newToMeals = [...toDay.meals, mealName];

    setData(prev => ({
      days: {
        ...prev.days,
        [toDate]: { ...(prev.days[toDate] || { meals: [], mealData: {} }), meals: newToMeals },
      },
    }));

    api.updateMeal(toDate, newToMeals).catch(console.error);
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
          onEmptyClick={() => setShowEmptyNotice(true)}
          dragMeal={dragMeal}
          dragOverDate={dragOverDate}
          pressedMeal={pressedMeal}
          onMealPointerDown={handleMealPointerDown}
          onDragPointerMove={handleDragPointerMove}
          onDragPointerUp={handleDragPointerUp}
          onMealClick={handleMealClick}
        />
      ))}

      {dragMeal && dragPos && (
        <div style={{ ...s.dragGhost, left: dragPos.x, top: dragPos.y }}>
          <Icon name="utensils" size={13} style={{ marginRight: 5, flexShrink: 0 }} />
          {dragMeal.mealName}
          {dragMeal.isPast && <span style={s.dragGhostCopyTag}>copy</span>}
        </div>
      )}

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
    color: 'var(--blue)', background: 'var(--bg)',
    border: '0.5px solid var(--border)', borderBottom: 'none',
    borderRadius: '10px 10px 0 0', cursor: 'pointer', fontFamily: 'inherit',
  },
  subNavActive: { color: 'var(--text-2)', background: 'var(--surface)' },
  tabBody: { flex: 1, overflow: 'hidden' },

  wrap: { padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column' },
  // marginTop (not flex gap) separates sections — margins can't be squeezed by
  // a sibling that renders taller than expected at odd zoom levels the way a
  // flex gap can, so this is the harder guarantee against row/heading overlap.
  weekSection: { display: 'flex', flexDirection: 'column', flexShrink: 0, marginTop: 14 },
  weekHeading: {
    fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 13,
    fontFamily: 'var(--font-heading)', fontStyle: 'italic',
    // Belt-and-suspenders: sits above and paints over anything behind it, so
    // even if a taller row bleeds upward the label stays fully legible.
    position: 'relative', zIndex: 1, background: 'var(--surface)',
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8, alignItems: 'stretch' },
  gridMobile: { gridTemplateColumns: '1fr', gap: 8 },
  dayCard: { background: 'var(--surface)', borderRadius: 16, padding: 14, border: '0.5px solid var(--border)', minHeight: 130, boxShadow: 'var(--shadow-sm)' },
  dayCardMobile: { minHeight: 0 },
  dayCardDragOver: { outline: '2px dashed var(--blue)', outlineOffset: -2, background: 'rgba(60,126,195,0.12)' },
  dayCardPast: { opacity: 0.55 },
  dayLabel: { fontSize: 13, fontWeight: 700, letterSpacing: '0.07em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 },
  todayBadge: { fontSize: 10, padding: '2px 6px', borderRadius: 20, fontWeight: 700 },
  mealContent: { display: 'flex', flexDirection: 'column', gap: 5 },
  mealPill: {
    fontSize: 13, padding: '4px 7px', borderRadius: 5, fontWeight: 500, lineHeight: 1.3,
    display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: 4,
    cursor: 'pointer', touchAction: 'none',
    userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease',
  },
  mealPillPressed: {
    transform: 'scale(1.06)', boxShadow: '0 6px 16px rgba(0,0,0,0.28)', cursor: 'grab', position: 'relative', zIndex: 2,
  },
  mealPillDragging: { opacity: 0.35, cursor: 'grabbing' },
  dragGhost: {
    position: 'fixed', zIndex: 2000, pointerEvents: 'none',
    transform: 'translate(-50%, -130%)', background: 'var(--surface)', color: 'var(--text-1)',
    padding: '6px 10px', borderRadius: 8, fontSize: 13, fontWeight: 600,
    boxShadow: '0 8px 24px rgba(0,0,0,0.25)', border: '0.5px solid var(--border)',
    display: 'flex', alignItems: 'center', whiteSpace: 'nowrap',
  },
  dragGhostCopyTag: {
    marginLeft: 7, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
    color: 'var(--blue)', border: '1px solid var(--blue)', borderRadius: 4, padding: '1px 4px',
  },
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
