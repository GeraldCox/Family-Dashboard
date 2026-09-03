import { useState, useEffect } from 'react';
import { api } from '../api';
import RecipeDetailModal from './RecipeDetailModal';
import { toDateStr, addDays, isSameDate, getWeekBounds, formatDateRange } from '../utils/weekDates';

// Same weekday palette as the Planner's WeekSection, so a meal keeps the same
// color whether you're glancing at it from Home or editing it in Meals.
const MEAL_COLORS = ['#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#06b6d4'];

// A read-only, single-week echo of the Planner's day grid for the Home
// page — same columns/colors/pill styling, just without the drag/add/edit
// affordances that belong to the actual Meals tab. Tapping a meal still
// opens the same recipe modal used everywhere else in the app.
export default function HomeMealsCard({ onNavigate, hideRecipeSourceLinks }) {
  const [days, setDays] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null); // { date, mealName }

  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const { start, end } = getWeekBounds(today);
  const dayDates = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  useEffect(() => {
    api.meals(toDateStr(start), toDateStr(end)).then(res => setDays(res.days || {})).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={s.card}>
      <div style={s.header}>
        <div style={s.title} onClick={() => onNavigate?.('meals')} title="Open Meals">Meals</div>
        <div style={s.range}>{formatDateRange(start, end)}</div>
      </div>

      <div style={s.body} className="no-scrollbar">
        <div style={s.grid}>
          {dayDates.map((date, i) => {
            const dateKey = toDateStr(date);
            const dayData = days?.[dateKey] || { meals: [] };
            const isToday = isSameDate(date, todayMidnight);
            const color = MEAL_COLORS[i];
            return (
              <div
                key={dateKey}
                style={{
                  ...s.col,
                  ...(i === dayDates.length - 1 ? { borderRight: 'none' } : {}),
                  ...(isToday ? { background: color + '12' } : {}),
                }}
              >
                <div style={s.mealContent}>
                  {days === null ? null : dayData.meals.length ? (
                    dayData.meals.map((m, j) => (
                      <div
                        key={j}
                        style={{ ...s.mealPill, background: color + '18', color, borderLeft: `3px solid ${color}` }}
                        onClick={() => setDetailTarget({ date: dateKey, mealName: m })}
                      >
                        <span style={s.mealPillText}>{m}</span>
                      </div>
                    ))
                  ) : (
                    <div style={s.emptyMeal}>—</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {detailTarget && (
        <RecipeDetailModal
          date={detailTarget.date}
          mealName={detailTarget.mealName}
          onClose={() => setDetailTarget(null)}
          hideSourceLink={hideRecipeSourceLinks}
        />
      )}
    </div>
  );
}

const s = {
  card: {
    background: 'var(--surface)', borderRadius: 'var(--radius-xl)',
    border: '0.5px solid var(--border)', boxShadow: 'var(--shadow-sm)',
    // Sized to content (not a fixed height) so a light week takes only the
    // room it needs; maxHeight caps it and lets body scroll on a busy one.
    flexShrink: 0, maxHeight: 140, display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 14px 10px', flexShrink: 0,
  },
  title: { fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-heading)', cursor: 'pointer' },
  range: { fontSize: 12, fontWeight: 600, color: 'var(--text-3)' },

  body: { flexShrink: 1, minHeight: 0, overflowY: 'auto' },
  // Same column structure as the calendar's week view (WeekGrid in
  // Calendar.jsx): a single borderless grid divided by borderRight lines
  // between columns, rather than separate rounded day cards with gaps.
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', alignItems: 'stretch' },
  col: {
    borderRight: '1px solid var(--border)', padding: '8px 6px', minWidth: 0, overflow: 'hidden',
  },
  mealContent: { display: 'flex', flexDirection: 'column', gap: 4 },
  mealPill: {
    fontSize: 11, padding: '3px 5px', borderRadius: 5, fontWeight: 500, lineHeight: 1.25,
    cursor: 'pointer',
  },
  mealPillText: { whiteSpace: 'normal', wordBreak: 'break-word' },
  emptyMeal: { fontSize: 12, color: 'var(--text-3)' },
};
