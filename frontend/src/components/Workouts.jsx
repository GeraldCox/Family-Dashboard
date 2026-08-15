import { useState, useEffect } from 'react';
import { api } from '../api';
import { useScreenSize } from '../hooks/useScreenSize';
import { DOW_SHORT, toDateStr, addDays, formatDateRange, isSameDate, getThreeWeekRanges } from '../utils/weekDates';
import Icon from './Icon';

const DAY_COLORS = ['#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#06b6d4'];
const WORKOUT_PEOPLE = ['parent1', 'parent2'];
const EQUIPMENT_ICONS = { 'Treadmill': 'footprints', 'Air Bike': 'activity', 'Dumbbells': 'dumbbell' };

function equipmentIcon(name) {
  return EQUIPMENT_ICONS[name] || 'dumbbell';
}

function groupByEquipment(exercises) {
  const map = {};
  for (const ex of exercises) {
    if (!map[ex.equipment]) map[ex.equipment] = [];
    map[ex.equipment].push(ex);
  }
  return map;
}

function formatEntryDetail(entry) {
  if (entry.type === 'strength') {
    const parts = [];
    if (entry.sets) parts.push(`${entry.sets} sets`);
    if (entry.reps) parts.push(`× ${entry.reps} reps`);
    if (entry.weight) parts.push(`@ ${entry.weight} lbs`);
    return parts.join(' ') || 'Strength';
  }
  const parts = [];
  if (entry.duration) parts.push(`${entry.duration} min`);
  if (entry.distance) parts.push(`${entry.distance} mi`);
  return parts.join(' · ') || 'Cardio';
}

export default function Workouts() {
  const [people, setPeople] = useState([]);
  const [personId, setPersonId] = useState('parent1');
  const [library, setLibrary] = useState(null);
  const [data, setData] = useState(null);
  const [addTarget, setAddTarget] = useState(null); // dateKey
  const { isMobile } = useScreenSize();

  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const weeks = getThreeWeekRanges(today);

  useEffect(() => {
    api.people().then(res => {
      const filtered = WORKOUT_PEOPLE
        .map(id => (res.people || []).find(p => p.id === id))
        .filter(Boolean);
      setPeople(filtered.length ? filtered : WORKOUT_PEOPLE.map(id => ({ id, name: id[0].toUpperCase() + id.slice(1), color: '#3b82f6' })));
    }).catch(console.error);
  }, []);

  useEffect(() => {
    api.getExerciseLibrary().then(setLibrary).catch(console.error);
  }, []);

  useEffect(() => {
    api.getWorkouts(toDateStr(weeks[0].start), toDateStr(weeks[2].end)).then(setData).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleEntry(dateKey, entryId) {
    await api.toggleWorkoutExercise(dateKey, personId, entryId);
    setData(prev => ({
      days: {
        ...prev.days,
        [dateKey]: {
          ...prev.days[dateKey],
          [personId]: (prev.days[dateKey]?.[personId] || []).map(e =>
            e.id !== entryId ? e : { ...e, done: !e.done, doneAt: !e.done ? new Date().toISOString() : null }
          ),
        },
      },
    }));
  }

  async function deleteEntry(dateKey, entryId) {
    await api.deleteWorkoutExercise(dateKey, personId, entryId);
    setData(prev => ({
      days: {
        ...prev.days,
        [dateKey]: {
          ...prev.days[dateKey],
          [personId]: (prev.days[dateKey]?.[personId] || []).filter(e => e.id !== entryId),
        },
      },
    }));
  }

  async function addEntry(dateKey, exerciseId, fields) {
    const res = await api.addWorkoutExercise(dateKey, personId, exerciseId, fields);
    setData(prev => {
      const day = prev.days[dateKey] || {};
      const personEntries = day[personId] || [];
      return { days: { ...prev.days, [dateKey]: { ...day, [personId]: [...personEntries, res.entry] } } };
    });
  }

  if (!data || !library) return <div style={{ padding: 20, color: 'var(--text-3)' }}>Loading workouts…</div>;

  return (
    <div style={s.tabWrap}>
      <div style={s.subNav}>
        {people.map(p => (
          <button
            key={p.id}
            style={{ ...s.subNavTab, ...(personId === p.id ? s.subNavActive : {}) }}
            onClick={() => setPersonId(p.id)}
          >
            {p.name}'s Plan
          </button>
        ))}
      </div>

      <div style={s.wrap}>
        {weeks.map(week => (
          <WeekSection
            key={week.key}
            week={week}
            todayMidnight={todayMidnight}
            days={data.days}
            personId={personId}
            library={library}
            isMobile={isMobile}
            onToggle={toggleEntry}
            onDelete={deleteEntry}
            onAddClick={dateKey => setAddTarget(dateKey)}
          />
        ))}
      </div>

      {addTarget && (
        <ExercisePickerModal
          library={library}
          date={addTarget}
          onClose={() => setAddTarget(null)}
          onAdd={addEntry}
        />
      )}
    </div>
  );
}

function WeekSection({ week, todayMidnight, days, personId, library, isMobile, onToggle, onDelete, onAddClick }) {
  const dayDates = Array.from({ length: 7 }, (_, i) => addDays(week.start, i));
  const equipmentById = {};
  library.exercises.forEach(ex => { equipmentById[ex.id] = ex.equipment; });

  return (
    <div style={s.weekSection}>
      <div style={s.weekHeading}>{week.label} · {formatDateRange(week.start, week.end)}</div>
      <div style={{ ...s.grid, ...(isMobile ? s.gridMobile : {}) }}>
        {dayDates.map((date, i) => {
          const dateKey = toDateStr(date);
          const entries = days[dateKey]?.[personId] || [];
          const isToday = isSameDate(date, todayMidnight);
          const color = DAY_COLORS[i];
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
              <div style={s.exerciseList}>
                {entries.length ? (
                  entries.map(entry => (
                    <div
                      key={entry.id}
                      style={{ ...s.exerciseCard, ...(entry.done ? s.exerciseCardDone : {}) }}
                      onClick={() => onToggle(dateKey, entry.id)}
                    >
                      <span style={s.exerciseIcon}>{equipmentIcon(equipmentById[entry.exerciseId])}</span>
                      <div style={s.exerciseInfo}>
                        <div style={{ ...s.exerciseName, ...(entry.done ? s.doneText : {}) }}>{entry.exerciseName}</div>
                        <div style={s.exerciseDetail}>{formatEntryDetail(entry)}</div>
                      </div>
                      <button
                        style={s.exerciseDeleteBtn}
                        onClick={e => { e.stopPropagation(); onDelete(dateKey, entry.id); }}
                        title="Remove exercise"
                        aria-label="Remove exercise"
                      >
                        <Icon name="x" size={15} />
                      </button>
                      <div style={{ ...s.check, ...(entry.done ? s.checkDone : {}) }}>
                        {entry.done && <Icon name="check" size={14} style={{ color: 'white' }} />}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={s.emptyDay} onClick={() => onAddClick(dateKey)}>No workouts planned</div>
                )}
              </div>
              <button style={s.addExerciseBtn} onClick={() => onAddClick(dateKey)}>+ Add exercise</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExercisePickerModal({ library, date, onClose, onAdd }) {
  const [selected, setSelected] = useState(null);
  const [fields, setFields] = useState({ sets: 3, reps: 10, weight: '', duration: 20, distance: '' });
  const [saving, setSaving] = useState(false);

  function selectExercise(ex) {
    setSelected(ex);
    setFields(ex.type === 'strength'
      ? { sets: 3, reps: 10, weight: '' }
      : { duration: 20, distance: '' });
  }

  async function handleAdd() {
    if (!selected) return;
    setSaving(true);
    try {
      const payload = selected.type === 'strength'
        ? { sets: Number(fields.sets) || 0, reps: Number(fields.reps) || 0, weight: Number(fields.weight) || 0 }
        : { duration: Number(fields.duration) || 0, distance: fields.distance !== '' ? Number(fields.distance) : undefined };
      await onAdd(date, selected.id, payload);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  const grouped = groupByEquipment(library.exercises);

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.detailModal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHead}>
          <div style={s.modalTitle}>{selected ? selected.name : 'Add Exercise'}</div>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        </div>

        {!selected ? (
          <div>
            {Object.entries(grouped).map(([equipment, exercises]) => (
              <div key={equipment} style={s.detailSection}>
                <div style={s.label}><Icon name={equipmentIcon(equipment)} size={15} /> {equipment}</div>
                <div style={s.exercisePickList}>
                  {exercises.map(ex => (
                    <button key={ex.id} style={s.exercisePickItem} onClick={() => selectExercise(ex)}>
                      {ex.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {library.exercises.length === 0 && (
              <div style={s.emptySmall}>No exercises in your library yet. Add some in Edit → Workouts.</div>
            )}
          </div>
        ) : (
          <div>
            <button style={s.backBtn} onClick={() => setSelected(null)}><Icon name="chevron-left" size={16} /> Back to exercises</button>
            {selected.type === 'strength' ? (
              <div style={s.fieldsGrid}>
                <label style={s.fieldLabel}>
                  Sets
                  <input style={s.fieldInput} type="number" value={fields.sets} onChange={e => setFields(f => ({ ...f, sets: e.target.value }))} />
                </label>
                <label style={s.fieldLabel}>
                  Reps
                  <input style={s.fieldInput} type="number" value={fields.reps} onChange={e => setFields(f => ({ ...f, reps: e.target.value }))} />
                </label>
                <label style={s.fieldLabel}>
                  Weight (lbs)
                  <input style={s.fieldInput} type="number" value={fields.weight} onChange={e => setFields(f => ({ ...f, weight: e.target.value }))} />
                </label>
              </div>
            ) : (
              <div style={s.fieldsGrid}>
                <label style={s.fieldLabel}>
                  Duration (min)
                  <input style={s.fieldInput} type="number" value={fields.duration} onChange={e => setFields(f => ({ ...f, duration: e.target.value }))} />
                </label>
                <label style={s.fieldLabel}>
                  Distance (mi, optional)
                  <input style={s.fieldInput} type="number" value={fields.distance} onChange={e => setFields(f => ({ ...f, distance: e.target.value }))} />
                </label>
              </div>
            )}
            <button style={s.rateSubmitBtn} onClick={handleAdd} disabled={saving}>
              {saving ? 'Adding…' : 'Add to day'}
            </button>
          </div>
        )}
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

  wrap: { padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 22 },
  weekSection: { display: 'flex', flexDirection: 'column', minHeight: 0 },
  weekHeading: {
    fontWeight: 600, color: 'var(--text-2)', marginBottom: 14, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 13,
    fontFamily: 'var(--font-heading)', fontStyle: 'italic',
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 },
  gridMobile: { gridTemplateColumns: '1fr', gap: 8 },
  dayCard: { background: 'var(--surface)', borderRadius: 16, padding: 14, border: '0.5px solid var(--border)', minHeight: 130, boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column' },
  dayCardMobile: { minHeight: 0 },
  dayLabel: { fontSize: 13, fontWeight: 700, letterSpacing: '0.07em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 },
  todayBadge: { fontSize: 10, padding: '2px 6px', borderRadius: 20, fontWeight: 700 },

  exerciseList: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1 },
  exerciseCard: {
    display: 'flex', alignItems: 'center', gap: 5, padding: '5px 6px', borderRadius: 8,
    background: 'var(--bg)', border: '0.5px solid var(--border)', cursor: 'pointer',
  },
  exerciseCardDone: { background: 'var(--surface2)' },
  exerciseIcon: { fontSize: 14, flexShrink: 0 },
  exerciseInfo: { flex: 1, minWidth: 0 },
  exerciseName: { fontSize: 12, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.3 },
  exerciseDetail: { fontSize: 11, color: 'var(--text-3)', lineHeight: 1.3 },
  doneText: { textDecoration: 'line-through', color: 'var(--text-3)' },
  exerciseDeleteBtn: {
    border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)',
    padding: 2, lineHeight: 1, flexShrink: 0, display: 'flex', alignItems: 'center',
  },
  check: { width: 18, height: 18, borderRadius: 5, border: '2px solid var(--border-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' },
  checkDone: { background: '#22c55e', borderColor: '#22c55e' },

  emptyDay: { fontSize: 13, color: 'var(--text-3)', fontStyle: 'italic', paddingTop: 4, cursor: 'pointer', flex: 1 },
  addExerciseBtn: {
    marginTop: 8, padding: '6px 8px', borderRadius: 8, border: '1px dashed var(--border-md)',
    background: 'transparent', color: 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },

  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  detailModal: {
    background: 'var(--surface)', borderRadius: 16, padding: 20,
    width: 460, maxWidth: '92vw', maxHeight: '86vh', overflowY: 'auto',
    boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
  },
  modalHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: 700, color: 'var(--text-1)' },
  closeBtn: { border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center' },

  detailSection: { marginBottom: 18 },
  label: {
    display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8,
    fontFamily: 'var(--font-heading)', fontStyle: 'italic',
  },
  exercisePickList: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  exercisePickItem: {
    padding: '7px 12px', borderRadius: 20, border: '0.5px solid var(--border)',
    background: 'var(--bg)', color: 'var(--text-1)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
  },
  emptySmall: { fontSize: 14, color: 'var(--text-3)', fontStyle: 'italic', padding: '4px 0' },

  backBtn: {
    display: 'flex', alignItems: 'center', gap: 4,
    border: 'none', background: 'transparent', color: 'var(--blue)', fontSize: 14,
    cursor: 'pointer', padding: 0, marginBottom: 16, fontFamily: 'inherit', fontWeight: 600,
  },
  fieldsGrid: { display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 },
  fieldLabel: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600, color: 'var(--text-2)' },
  fieldInput: {
    padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-md)',
    fontSize: 15, background: 'var(--bg)', boxSizing: 'border-box',
  },
  rateSubmitBtn: {
    width: '100%', marginTop: 4, padding: '9px', borderRadius: 8, border: 'none',
    background: 'var(--blue)', color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer',
  },
};
