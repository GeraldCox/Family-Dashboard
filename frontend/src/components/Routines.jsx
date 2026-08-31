import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import Icon from './Icon';
import Avatar from './Avatar';

const TIME_ORDER = ['morning', 'afternoon', 'evening', 'bedtime'];
const TIME_LABELS = {
  morning: 'MORNING',
  afternoon: 'AFTERNOON',
  evening: 'EVENING',
  bedtime: 'BEDTIME',
};
const TIME_ICONS = {
  morning: 'sun',
  afternoon: 'cloud-sun',
  evening: 'sunrise',
  bedtime: 'moon',
};
const DEFAULT_ROUTINE_TIME_CUTOFFS = { morning: '11:00', afternoon: '17:00', evening: '21:00', bedtime: '23:59' };
const AUTO_COLLAPSE_CHECK_MS = 60000;

function toDateKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function isPastCutoffTime(timeOfDay, cutoffs) {
  const cutoff = cutoffs?.[timeOfDay];
  if (!cutoff) return false;
  const [h, m] = cutoff.split(':').map(Number);
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
}

function routineStatus(routine) {
  const total = routine.steps.length;
  const done = routine.steps.filter(st => st.done).length;
  return { total, done, isComplete: total > 0 && done === total };
}

function PersonAvatars({ peopleIds, personMap }) {
  if (!peopleIds || peopleIds.length === 0) return null;

  if (peopleIds.includes('family')) {
    return <div style={s.familyAvatar} title="Whole family"><Icon name="users" size={15} style={{ color: 'var(--text-2)' }} /></div>;
  }

  return (
    <div style={s.avatarStack}>
      {peopleIds.map((id, i) => {
        const person = personMap[id];
        if (!person) return null;
        return (
          <Avatar
            key={id}
            person={person}
            size={25}
            solid
            style={{
              border: '1.5px solid var(--bg)',
              marginLeft: i === 0 ? 0 : -8,
              zIndex: peopleIds.length - i,
            }}
            title={person.name}
          />
        );
      })}
    </div>
  );
}

function RoutineBubble({ routine, personMap, expanded, onToggleExpand, onToggleStep, isPastCutoff }) {
  const { total, done, isComplete } = routineStatus(routine);
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const isOverdue = total > 0 && !isComplete && isPastCutoff;

  return (
    <div style={{ ...s.bubble, ...(isComplete ? s.bubbleComplete : isOverdue ? s.bubbleOverdue : {}) }}>
      <div style={s.bubbleHead} onClick={onToggleExpand}>
        <PersonAvatars peopleIds={routine.people} personMap={personMap} />
        <div style={{ ...s.bubbleTitle, ...(isComplete ? s.bubbleTitleComplete : isOverdue ? s.bubbleTitleOverdue : {}) }}>{routine.title}</div>
        <div style={s.progressWrap}>
          <div style={s.progressTrack}>
            <div style={{ ...s.progressFill, width: `${pct}%`, background: isComplete ? 'var(--green)' : isOverdue ? 'var(--red)' : 'var(--blue)' }} />
          </div>
          <div style={s.progressLabel}>{done}/{total}</div>
        </div>
        <div style={{ ...s.chevron, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}><Icon name="chevron-right" size={18} /></div>
      </div>

      <div style={{ ...s.stepsOuter, maxHeight: expanded ? 600 : 0 }}>
        <div style={s.stepsList}>
          {routine.steps.map(step => (
            <div key={step.id} style={s.stepRow} onClick={() => onToggleStep(routine.id, step.id)}>
              <div style={{ ...s.stepCircle, ...(step.done ? s.stepCircleDone : {}) }}>
                {step.done && <Icon name="check" size={15} />}
              </div>
              <div style={{ ...s.stepName, ...(step.done ? s.stepNameDone : isOverdue ? s.stepNameOverdue : {}) }}>{step.name}</div>
            </div>
          ))}
          {total === 0 && <div style={s.noSteps}>No steps yet</div>}
        </div>
      </div>
    </div>
  );
}

export default function Routines() {
  const [routines, setRoutines] = useState(null);
  const [personMap, setPersonMap] = useState({});
  // null until the first load resolves, then a Set of expanded routine ids —
  // seeded with every id so bubbles start expanded instead of collapsed
  // (except ones already complete-and-past-cutoff, to avoid a flash-open).
  const [expandedIds, setExpandedIds] = useState(null);
  const [timeCutoffs, setTimeCutoffs] = useState(null);
  // routine:date keys already auto-collapsed, so a manual re-expand sticks
  // instead of the next periodic check immediately re-collapsing it.
  const autoCollapsedRef = useRef(new Set());
  const seededRef = useRef(false);
  const routinesRef = useRef(null);
  const cutoffsRef = useRef(null);
  routinesRef.current = routines;
  cutoffsRef.current = timeCutoffs;

  useEffect(() => {
    refresh();
    api.people().then(res => {
      const map = {};
      (res.people || []).forEach(p => { map[p.id] = p; });
      setPersonMap(map);
    }).catch(console.error);
    api.getGeneralSettings().then(res => setTimeCutoffs(res.routineTimeCutoffs || DEFAULT_ROUTINE_TIME_CUTOFFS)).catch(console.error);
  }, []);

  function refresh() {
    api.getRoutines().then(res => setRoutines(res.routines || [])).catch(console.error);
  }

  // One-time initial seed, once both routines and cutoffs are loaded.
  useEffect(() => {
    if (seededRef.current || !routines || !timeCutoffs) return;
    seededRef.current = true;
    const todayKey = toDateKey(new Date());
    const next = new Set();
    routines.forEach(r => {
      const { isComplete } = routineStatus(r);
      if (isComplete && isPastCutoffTime(r.timeOfDay, timeCutoffs)) {
        autoCollapsedRef.current.add(`${r.id}:${todayKey}`);
      } else {
        next.add(r.id);
      }
    });
    setExpandedIds(next);
  }, [routines, timeCutoffs]);

  // Ambient periodic check — deliberately not tied to `routines` changing,
  // so finishing a routine's last step never immediately collapses it out
  // from under the person checking it off. Reads the latest data via refs.
  useEffect(() => {
    const interval = setInterval(() => {
      const list = routinesRef.current;
      const cutoffs = cutoffsRef.current;
      if (!list || !cutoffs) return;
      const todayKey = toDateKey(new Date());
      setExpandedIds(prev => {
        if (!prev) return prev;
        let changed = false;
        const next = new Set(prev);
        list.forEach(r => {
          const { isComplete } = routineStatus(r);
          const key = `${r.id}:${todayKey}`;
          if (isComplete && isPastCutoffTime(r.timeOfDay, cutoffs) && next.has(r.id) && !autoCollapsedRef.current.has(key)) {
            next.delete(r.id);
            autoCollapsedRef.current.add(key);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, AUTO_COLLAPSE_CHECK_MS);
    return () => clearInterval(interval);
  }, []);

  function toggleExpand(id) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function toggleStep(routineId, stepId) {
    setRoutines(prev => prev.map(r => {
      if (r.id !== routineId) return r;
      return {
        ...r,
        steps: r.steps.map(st => st.id !== stepId ? st : { ...st, done: !st.done, doneAt: !st.done ? new Date().toISOString() : null }),
      };
    }));
    try {
      await api.toggleRoutineStep(routineId, stepId);
    } catch (err) {
      console.error(err);
      refresh();
    }
  }

  if (!routines) return <div style={s.empty}>Loading routines…</div>;

  if (routines.length === 0) {
    return <div style={s.empty}>No routines yet — add one in the Edit tab</div>;
  }

  // expandedIds seeding waits on the separate timeCutoffs fetch too.
  if (!expandedIds) return <div style={s.empty}>Loading routines…</div>;

  const groups = TIME_ORDER
    .map(tod => ({ tod, items: routines.filter(r => r.timeOfDay === tod) }))
    .filter(g => g.items.length > 0);

  return (
    <div style={s.wrap}>
      {groups.map(group => (
        <div key={group.tod} style={s.section}>
          <div style={s.sectionLabel}>
            <Icon name={TIME_ICONS[group.tod]} size={15} />
            {TIME_LABELS[group.tod]}
          </div>
          <div style={s.list}>
            {group.items.map(routine => (
              <RoutineBubble
                key={routine.id}
                routine={routine}
                personMap={personMap}
                expanded={expandedIds.has(routine.id)}
                onToggleExpand={() => toggleExpand(routine.id)}
                onToggleStep={toggleStep}
                isPastCutoff={isPastCutoffTime(group.tod, timeCutoffs)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const s = {
  wrap: { padding: '14px 12px', overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 },
  empty: { padding: 20, color: 'var(--text-3)', fontSize: 15 },

  section: { display: 'flex', flexDirection: 'column', gap: 8 },
  sectionLabel: {
    fontSize: 13, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.1em',
    textTransform: 'uppercase', fontFamily: 'var(--font-heading)', fontStyle: 'italic',
    display: 'flex', alignItems: 'center', gap: 7,
  },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },

  bubble: {
    background: 'var(--bg)', borderRadius: 12, overflow: 'hidden',
    border: '0.5px solid var(--border)', transition: 'background 0.2s, border-color 0.2s',
  },
  bubbleComplete: {
    background: 'var(--green-bg)', borderColor: 'var(--green)',
  },
  // Time window passed with steps still unchecked.
  bubbleOverdue: {
    background: 'var(--red-bg)', borderColor: 'var(--red)',
  },
  bubbleHead: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer',
  },
  bubbleTitle: {
    flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--text-1)', minWidth: 0,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  // --green-bg/--red-bg are fixed light colors regardless of theme, so
  // --text-1 (near white in dark mode) nearly disappears on either once a
  // bubble completes or goes overdue.
  bubbleTitleComplete: { color: 'var(--green-text)' },
  bubbleTitleOverdue: { color: 'var(--red-text)' },

  avatarStack: { display: 'flex', alignItems: 'center', flexShrink: 0 },
  avatarCircle: {
    width: 25, height: 25, borderRadius: '50%', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontWeight: 700, fontSize: 12, color: 'white',
    border: '1.5px solid var(--bg)', flexShrink: 0,
  },
  familyAvatar: {
    width: 25, height: 25, borderRadius: '50%', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 14, background: 'var(--surface2)', flexShrink: 0,
  },

  progressWrap: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
  progressTrack: {
    width: 44, height: 6, borderRadius: 99, background: 'var(--border-md)', overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 99, transition: 'width 0.2s ease' },
  progressLabel: { fontSize: 13, fontWeight: 700, color: 'var(--text-3)', minWidth: 26, textAlign: 'right' },

  chevron: {
    color: 'var(--text-3)', flexShrink: 0, transition: 'transform 0.2s ease',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },

  stepsOuter: { overflow: 'hidden', transition: 'max-height 0.25s ease' },
  stepsList: { display: 'flex', flexDirection: 'column', gap: 2, padding: '0 12px 10px 12px' },
  stepRow: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', cursor: 'pointer', borderRadius: 8,
  },
  stepCircle: {
    width: 24, height: 24, borderRadius: '50%', border: '2px solid var(--border-md)', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700,
    color: 'white', transition: 'background 0.15s, border-color 0.15s',
  },
  stepCircleDone: { background: 'var(--green)', borderColor: 'var(--green)' },
  stepName: { fontSize: 15, color: 'var(--text-1)', flex: 1 },
  stepNameDone: { color: 'var(--text-3)', textDecoration: 'line-through' },
  stepNameOverdue: { color: 'var(--red-text)' },
  noSteps: { fontSize: 14, color: 'var(--text-3)', fontStyle: 'italic', padding: '4px 4px' },
};
