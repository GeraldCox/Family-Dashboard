import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { useScreenSize } from '../hooks/useScreenSize';
import { addDays, toDateStr, parseDateStr, isSameDate, formatDateRange, getForwardThreeWeekRanges } from '../utils/weekDates';
import Icon from './Icon';
import Avatar from './Avatar';

const DAYS = [
  { key: 'Mon', name: 'Monday', offset: 1, color: 'var(--blue)' },
  { key: 'Tue', name: 'Tuesday', offset: 2, color: 'var(--purple)' },
  { key: 'Wed', name: 'Wednesday', offset: 3, color: 'var(--green)' },
  { key: 'Thu', name: 'Thursday', offset: 4, color: 'var(--amber)' },
  { key: 'Fri', name: 'Friday', offset: 5, color: 'var(--pink)' },
];

// Only the kids get homeschool tabs — filter by id first, falling back to
// name in case ids ever drift from the expected "kid1"/"kid2".
function filterHomeschoolPeople(people) {
  const byId = people.filter(p => p.id === 'kid1' || p.id === 'kid2');
  if (byId.length > 0) return byId;
  return people.filter(p => p.name === 'Kid 1' || p.name === 'Kid 2');
}

// Section groups rendered top-to-bottom within each day column. Only groups
// that actually have activities are shown.
const GROUPS = [
  { type: 'scheduled', label: 'Scheduled' },
  { type: 'morning', label: 'Morning' },
  { type: 'afternoon', label: 'Afternoon' },
  { type: 'evening', label: 'Evening' },
  { type: 'anytime', label: 'Anytime Today' },
];

const TYPE_OPTIONS = [
  { value: 'scheduled', label: 'At a specific time' },
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'anytime', label: 'Anytime today' },
];

const EMOJI_QUICK = ['📖', '✏️', '🔬', '🎨', '🎵', '🧮', '🌍', '⚽', '📝', '🙏', '🍎', '🧪'];

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h)) return t;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Immutable update of a single person/date activity list within the store.
function setPersonDateList(prev, personId, dateKey, updater) {
  const schedules = { ...prev.schedules };
  const personSched = { ...(schedules[personId] || {}) };
  personSched[dateKey] = updater(personSched[dateKey] || []);
  schedules[personId] = personSched;
  return { ...prev, schedules };
}

export default function Homeschool() {
  const [data, setData] = useState(null);
  const [people, setPeople] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editingTheme, setEditingTheme] = useState(null); // day key or null
  const [themeDraft, setThemeDraft] = useState('');
  const [addingDate, setAddingDate] = useState(null); // date key or null
  const [form, setForm] = useState({ title: '', url: '', type: 'anytime', time: '' });
  const [expandedWeeks, setExpandedWeeks] = useState({ this: true, next: false, after: false });
  const titleRef = useRef(null);
  const { isMobile } = useScreenSize();

  function toggleWeek(key) {
    setExpandedWeeks(prev => ({ ...prev, [key]: !prev[key] }));
  }

  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const weeks = getForwardThreeWeekRanges(today);

  useEffect(() => {
    api.getHomeschool(toDateStr(weeks[0].start), toDateStr(weeks[2].end)).then(setData).catch(console.error);
    api.people()
      .then(res => {
        const list = filterHomeschoolPeople(res.people || []);
        setPeople(list);
        setSelectedId(prev => prev || (list[0] && list[0].id) || null);
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refresh() {
    api.getHomeschool(toDateStr(weeks[0].start), toDateStr(weeks[2].end)).then(setData).catch(console.error);
  }

  function getList(personId, dateKey) {
    return (data.schedules[personId] && data.schedules[personId][dateKey]) || [];
  }

  // ── Themes (generic per weekday, shared across all weeks) ──────────────────
  function startEditTheme(dayKey) {
    setThemeDraft(data.dayThemes[dayKey] || '');
    setEditingTheme(dayKey);
  }

  async function saveTheme(dayKey) {
    const theme = themeDraft.trim();
    setEditingTheme(null);
    if (!theme || theme === data.dayThemes[dayKey]) return;
    setData(prev => ({ ...prev, dayThemes: { ...prev.dayThemes, [dayKey]: theme } }));
    try {
      await api.updateHomeschoolTheme(dayKey, theme);
    } catch (err) {
      console.error(err);
      refresh();
    }
  }

  // ── Activities ──────────────────────────────────────────────────────────────
  function openAddForm(dateKey) {
    setForm({ title: '', url: '', type: 'anytime', time: '' });
    setAddingDate(dateKey);
  }

  function insertEmoji(emoji) {
    const el = titleRef.current;
    const base = el ? el.value : form.title;
    const start = el && el.selectionStart != null ? el.selectionStart : base.length;
    const end = el && el.selectionEnd != null ? el.selectionEnd : base.length;
    const newTitle = base.slice(0, start) + emoji + base.slice(end);
    setForm(f => ({ ...f, title: newTitle }));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function submitActivity(dateKey) {
    const title = form.title.trim();
    if (!title) return;
    const type = form.type;
    const time = type === 'scheduled' ? form.time : '';
    const url = form.url.trim();
    try {
      const res = await api.addHomeschoolActivity(selectedId, dateKey, title, type, time, url);
      setData(prev => {
        const withList = setPersonDateList(prev, selectedId, dateKey, list => [...list, res.activity]);
        return { ...withList, recentActivities: res.recentActivities || prev.recentActivities };
      });
      setAddingDate(null);
    } catch (err) {
      console.error(err);
      refresh();
    }
  }

  async function toggleActivity(dateKey, activityId) {
    setData(prev => setPersonDateList(prev, selectedId, dateKey, list =>
      list.map(a => a.id === activityId ? { ...a, done: !a.done } : a)));
    try {
      await api.toggleHomeschoolActivity(selectedId, dateKey, activityId);
    } catch (err) {
      console.error(err);
      refresh();
    }
  }

  async function deleteActivity(dateKey, activityId) {
    setData(prev => setPersonDateList(prev, selectedId, dateKey, list =>
      list.filter(a => a.id !== activityId)));
    try {
      await api.deleteHomeschoolActivity(selectedId, dateKey, activityId);
    } catch (err) {
      console.error(err);
      refresh();
    }
  }

  if (!data) return <div style={s.empty}>Loading homeschool…</div>;
  if (people.length === 0) return <div style={s.empty}>No people yet — add someone in the Edit tab</div>;

  const selectedPerson = people.find(p => p.id === selectedId) || people[0];

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.title}><Icon name="graduation-cap" size={24} /> Homeschool</div>
      </div>

      <div className="hs-no-print" style={s.tabs}>
        {people.map(p => {
          const active = p.id === selectedPerson.id;
          return (
            <button
              key={p.id}
              style={{
                ...s.tab,
                ...(active ? { background: p.color, color: 'white', borderColor: p.color } : {}),
              }}
              onClick={() => { setSelectedId(p.id); setAddingDate(null); }}
            >
              <Avatar
                person={p}
                size={28}
                ring={active ? 'white' : undefined}
                style={active ? { background: 'rgba(255,255,255,0.25)', color: 'white' } : undefined}
              />
              {p.name}
            </button>
          );
        })}
      </div>

      <div style={s.scrollArea}>
        {weeks.map(week => (
          <WeekSection
            key={week.key}
            week={week}
            data={data}
            selectedPersonId={selectedPerson.id}
            todayMidnight={todayMidnight}
            isMobile={isMobile}
            getList={getList}
            isExpanded={expandedWeeks[week.key]}
            onToggleExpanded={() => toggleWeek(week.key)}
            editingTheme={editingTheme}
            themeDraft={themeDraft}
            onStartEditTheme={startEditTheme}
            onThemeDraftChange={setThemeDraft}
            onSaveTheme={saveTheme}
            onOpenAddForm={openAddForm}
            onToggleActivity={toggleActivity}
            onDeleteActivity={deleteActivity}
          />
        ))}
      </div>

      {addingDate && (
        <AddActivityModal
          dateKey={addingDate}
          form={form}
          setForm={setForm}
          titleRef={titleRef}
          recentActivities={data.recentActivities}
          onCancel={() => setAddingDate(null)}
          onSubmit={() => submitActivity(addingDate)}
          onInsertEmoji={insertEmoji}
        />
      )}
    </div>
  );
}

function WeekSection({
  week, data, selectedPersonId, todayMidnight, isMobile, getList,
  isExpanded, onToggleExpanded,
  editingTheme, themeDraft, onStartEditTheme, onThemeDraftChange, onSaveTheme,
  onOpenAddForm, onToggleActivity, onDeleteActivity,
}) {
  const weekdayStart = addDays(week.start, 1);
  const weekdayEnd = addDays(week.start, 5);

  return (
    <div style={s.weekSection}>
      <button className="hs-no-print" style={s.weekToggleBtn} onClick={onToggleExpanded}>
        <span>{week.label} · {formatDateRange(weekdayStart, weekdayEnd)}</span>
        <span>{isExpanded ? '▲' : '▼'}</span>
      </button>
      <div
        className="hs-week-grid"
        style={{
          ...s.week,
          ...(isMobile ? s.weekMobile : {}),
          ...(isExpanded ? {} : s.weekCollapsed),
        }}
      >
        {DAYS.map(day => {
          const date = addDays(week.start, day.offset);
          const dateKey = toDateStr(date);
          const isToday = isSameDate(date, todayMidnight);
          const list = getList(selectedPersonId, dateKey);
          const isEditing = editingTheme === day.key;
          return (
            <div
              key={dateKey}
              className="hs-day-col"
              style={{
                ...s.dayCol,
                borderTop: `3px solid ${day.color}`,
                ...(isMobile ? s.dayColMobile : {}),
                ...(isToday ? s.dayColToday : {}),
              }}
            >
              <div style={s.dayHeader}>
                {isEditing ? (
                  <input
                    autoFocus
                    value={themeDraft}
                    onChange={e => onThemeDraftChange(e.target.value)}
                    onBlur={() => onSaveTheme(day.key)}
                    onKeyDown={e => { if (e.key === 'Enter') onSaveTheme(day.key); }}
                    style={s.themeInput}
                  />
                ) : (
                  <div style={s.themeRow}>
                    <span style={s.themeName}>{data.dayThemes[day.key]}</span>
                    <button
                      className="hs-no-print"
                      style={s.editThemeBtn}
                      onClick={() => onStartEditTheme(day.key)}
                      title={`Rename day theme (applies to every ${day.name})`}
                      aria-label="Rename day theme"
                    >
                      <Icon name="pencil" size={13} />
                    </button>
                  </div>
                )}
                <div style={s.dayNameRow}>
                  <span style={s.dayName}>{day.name}</span>
                  <span style={{ ...s.dayDate, ...(isToday ? s.dayDateToday : {}) }}>
                    {date.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    {isToday && <span style={s.todayBadge}>Today</span>}
                  </span>
                </div>
              </div>

              <div className="hs-day-body" style={s.dayBody}>
                {list.length === 0 && (
                  <div style={s.nothing}>Nothing planned yet</div>
                )}

                {GROUPS.map(group => {
                  let items = list.filter(a => a.type === group.type);
                  if (items.length === 0) return null;
                  if (group.type === 'scheduled') {
                    items = [...items].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
                  }
                  return (
                    <div key={group.type} style={s.group}>
                      <div style={s.groupLabel}>{group.label}</div>
                      {items.map(activity => (
                        <div key={activity.id} style={s.activityRow}>
                          <button
                            style={{ ...s.check, ...(activity.done ? s.checkDone : {}) }}
                            onClick={() => onToggleActivity(dateKey, activity.id)}
                          >
                            {activity.done && <Icon name="check" size={14} style={{ color: 'white' }} />}
                          </button>
                          {activity.type === 'scheduled' && activity.time && (
                            <span style={s.timeBadge}>{formatTime(activity.time)}</span>
                          )}
                          <span style={{ ...s.activityTitle, ...(activity.done ? s.activityDone : {}) }}>
                            {activity.title}
                          </span>
                          {activity.url && (
                            <a
                              href={activity.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={s.linkIcon}
                              title="Open material"
                              aria-label="Open material"
                            >
                              <Icon name="link" size={15} />
                            </a>
                          )}
                          <button
                            className="hs-no-print"
                            style={s.deleteBtn}
                            onClick={() => onDeleteActivity(dateKey, activity.id)}
                            title="Delete"
                            aria-label="Delete activity"
                          >
                            <Icon name="x" size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>

              <button
                className="hs-no-print"
                style={s.addActivityBtn}
                onClick={() => onOpenAddForm(dateKey)}
              >
                + Add Activity
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddActivityModal({ dateKey, form, setForm, titleRef, recentActivities, onCancel, onSubmit, onInsertEmoji }) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  const date = parseDateStr(dateKey);

  return (
    <div className="hs-no-print" style={s.modalOverlay} onClick={onCancel}>
      <div style={s.modalCard} onClick={e => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <div style={s.modalTitle}>
            Add Activity
            <span style={s.modalSubtitle}>
              {date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
            </span>
          </div>
          <button style={s.modalCloseBtn} onClick={onCancel} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </div>

        {recentActivities.length > 0 && (
          <div style={s.chipRow}>
            {recentActivities.map((title, i) => (
              <button
                key={i}
                style={s.chip}
                onClick={() => setForm(f => ({ ...f, title }))}
                title="Reuse this activity"
              >
                {title}
              </button>
            ))}
          </div>
        )}

        <div style={s.emojiBar}>
          {EMOJI_QUICK.map(emoji => (
            <button key={emoji} style={s.emojiBtn} onClick={() => onInsertEmoji(emoji)}>
              {emoji}
            </button>
          ))}
        </div>

        <input
          ref={titleRef}
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') onSubmit(); }}
          placeholder="Activity title"
          style={s.input}
          autoFocus
        />

        <input
          value={form.url}
          onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
          placeholder="Link (optional) — paste a URL to view material"
          style={s.input}
        />

        <select
          value={form.type}
          onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
          style={s.input}
        >
          {TYPE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {form.type === 'scheduled' && (
          <input
            type="time"
            value={form.time}
            onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
            style={s.input}
          />
        )}

        <div style={s.formActions}>
          <button style={s.cancelBtn} onClick={onCancel}>Cancel</button>
          <button style={s.saveBtn} onClick={onSubmit}>Add</button>
        </div>
      </div>
    </div>
  );
}

const s = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%', gap: 10 },
  empty: { padding: 20, color: 'var(--text-3)', fontSize: 15 },

  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  title: {
    fontSize: 22, fontWeight: 700, color: 'var(--text-1)',
    fontFamily: 'var(--font-heading)',
    display: 'flex', alignItems: 'center', gap: 9,
  },
  tabs: { display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 },
  tab: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px 6px 6px',
    borderRadius: 22, fontSize: 14, fontWeight: 600, color: 'var(--text-1)',
    background: 'var(--surface)', border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-sm)',
  },
  tabAvatar: {
    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0,
  },

  scrollArea: {
    flex: 1, minHeight: 0, overflowY: 'auto',
    display: 'flex', flexDirection: 'column', gap: 20,
  },

  weekSection: { display: 'flex', flexDirection: 'column', flexShrink: 0 },
  weekToggleBtn: {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
    color: 'var(--text-2)', background: 'var(--surface)', border: '0.5px solid var(--border)',
    cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase',
    fontFamily: 'var(--font-heading)', fontStyle: 'italic', marginBottom: 10, flexShrink: 0,
  },

  week: {
    display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10,
  },
  weekMobile: {
    display: 'flex', overflowX: 'auto', gap: 10,
  },
  weekCollapsed: {
    display: 'none',
  },

  dayCol: {
    display: 'flex', flexDirection: 'column', minWidth: 0,
    background: 'var(--bg)', borderRadius: 14, border: '0.5px solid var(--border)',
    overflow: 'hidden',
  },
  dayColMobile: { minWidth: 240, flexShrink: 0 },
  dayColToday: { border: '2px solid var(--blue)' },

  dayHeader: {
    padding: '12px 12px 10px', borderBottom: '0.5px solid var(--border)',
    background: 'var(--surface)', flexShrink: 0,
  },
  themeRow: { display: 'flex', alignItems: 'flex-start', gap: 6 },
  themeName: {
    flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--text-1)',
    fontFamily: 'var(--font-heading)', lineHeight: 1.2,
  },
  editThemeBtn: {
    color: 'var(--text-3)', flexShrink: 0, padding: 2, lineHeight: 1, display: 'flex', alignItems: 'center',
  },
  themeInput: {
    width: '100%', fontSize: 15, fontWeight: 700, color: 'var(--text-1)',
    fontFamily: 'var(--font-heading)', padding: '2px 4px', borderRadius: 6,
    border: '1px solid var(--border-md)', background: 'var(--surface2)',
  },
  dayNameRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 3,
  },
  dayName: {
    fontSize: 11, fontWeight: 600, color: 'var(--text-2)',
    textTransform: 'uppercase', letterSpacing: '0.06em',
  },
  dayDate: {
    fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
    display: 'flex', alignItems: 'center', gap: 5,
  },
  dayDateToday: { color: 'var(--blue)', fontWeight: 700 },
  todayBadge: {
    fontSize: 9, padding: '1px 6px', borderRadius: 20, fontWeight: 700,
    background: 'var(--blue)', color: 'white', textTransform: 'uppercase',
  },

  dayBody: { flex: 1, overflowY: 'visible', padding: 10, display: 'flex', flexDirection: 'column', gap: 10 },
  nothing: { fontSize: 13, color: 'var(--text-3)', fontStyle: 'italic', padding: '4px 0' },

  group: { display: 'flex', flexDirection: 'column', gap: 5 },
  groupLabel: {
    fontSize: 11, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.08em',
    textTransform: 'uppercase', fontFamily: 'var(--font-heading)', fontStyle: 'italic',
  },

  activityRow: {
    display: 'flex', alignItems: 'center', gap: 7, padding: '6px 7px',
    background: 'var(--surface)', borderRadius: 9, border: '0.5px solid var(--border)',
  },
  check: {
    width: 22, height: 22, borderRadius: 6, border: '2px solid var(--border-md)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    background: 'transparent', transition: 'all 0.15s',
  },
  checkDone: { background: 'var(--green)', borderColor: 'var(--green)' },
  checkMark: { color: 'white', fontSize: 13, lineHeight: 1 },
  timeBadge: {
    fontSize: 11, fontWeight: 700, color: 'var(--blue-text)', background: 'var(--blue-bg)',
    padding: '2px 7px', borderRadius: 20, flexShrink: 0, whiteSpace: 'nowrap',
  },
  activityTitle: { flex: 1, fontSize: 14, color: 'var(--text-1)', minWidth: 0, wordBreak: 'break-word' },
  activityDone: { textDecoration: 'line-through', color: 'var(--text-3)' },
  linkIcon: { textDecoration: 'none', flexShrink: 0, color: 'var(--blue)', display: 'flex', alignItems: 'center' },
  deleteBtn: {
    lineHeight: 1, color: 'var(--text-3)', flexShrink: 0,
    width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },

  addActivityBtn: {
    margin: 10, marginTop: 0, padding: '8px', borderRadius: 9,
    background: 'var(--surface2)', color: 'var(--text-2)', fontSize: 13, fontWeight: 600,
    border: '1px dashed var(--border-md)', flexShrink: 0,
  },

  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: 20,
  },
  modalCard: {
    width: '100%', maxWidth: 420, maxHeight: '85vh', overflowY: 'auto',
    background: 'var(--surface)', borderRadius: 14, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 9,
    boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
    border: '0.5px solid var(--border)',
  },
  modalHeader: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 2,
  },
  modalTitle: {
    fontSize: 17, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-heading)',
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  modalSubtitle: { fontSize: 12, fontWeight: 600, color: 'var(--text-3)' },
  modalCloseBtn: {
    color: 'var(--text-3)', flexShrink: 0, padding: 4, lineHeight: 1, display: 'flex', alignItems: 'center',
  },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 5 },
  chip: {
    fontSize: 11, fontWeight: 600, color: 'var(--text-2)', background: 'var(--surface2)',
    border: '0.5px solid var(--border)', borderRadius: 14, padding: '3px 9px',
    maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  emojiBar: { display: 'flex', flexWrap: 'wrap', gap: 3 },
  emojiBtn: {
    fontSize: 17, width: 28, height: 28, borderRadius: 7, background: 'var(--surface2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  input: {
    width: '100%', fontSize: 13, padding: '7px 9px', borderRadius: 8,
    border: '1px solid var(--border-md)', background: 'var(--surface)', color: 'var(--text-1)',
  },
  formActions: { display: 'flex', gap: 6, justifyContent: 'flex-end' },
  cancelBtn: {
    padding: '6px 12px', borderRadius: 8, background: 'var(--surface2)',
    color: 'var(--text-2)', fontSize: 13, fontWeight: 600,
  },
  saveBtn: {
    padding: '6px 14px', borderRadius: 8, background: 'var(--accent-blue)',
    color: 'white', fontSize: 13, fontWeight: 600,
  },
};
