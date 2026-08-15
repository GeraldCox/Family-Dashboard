import { useState, useEffect } from 'react';
import { api } from '../api';
import Icon from './Icon';

const RECURRENCE_OPTIONS = [
  { id: 'none',    label: 'None' },
  { id: 'DAILY',   label: 'Daily' },
  { id: 'WEEKLY',  label: 'Weekly' },
  { id: 'MONTHLY', label: 'Monthly' },
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildRRule(freq, endType, count, untilDate) {
  if (freq === 'none') return null;
  let rule = `RRULE:FREQ=${freq}`;
  if (endType === 'count' && count) rule += `;COUNT=${count}`;
  else if (endType === 'until' && untilDate) rule += `;UNTIL=${untilDate.replace(/-/g, '')}`;
  return rule;
}

function isoToTime(iso) {
  if (!iso || iso.length < 16) return '09:00';
  return iso.slice(11, 16);
}

export default function AddEventModal({ onClose, onCreated, editEvent }) {
  const isEditMode = !!editEvent;
  const [accounts, setAccounts] = useState(null);
  const [title, setTitle] = useState(editEvent ? editEvent.title : '');
  const [date, setDate] = useState(editEvent ? (editEvent.start || '').slice(0, 10) : todayStr());
  const [allDay, setAllDay] = useState(editEvent ? !!editEvent.allDay : false);
  const [startTime, setStartTime] = useState(editEvent && !editEvent.allDay ? isoToTime(editEvent.start) : '09:00');
  const [endTime, setEndTime] = useState(editEvent && !editEvent.allDay ? isoToTime(editEvent.end) : '10:00');
  const [accountId, setAccountId] = useState(editEvent ? editEvent.accountId : '');
  const [calendars, setCalendars] = useState(null);
  const [calendarId, setCalendarId] = useState(editEvent ? editEvent.calendarId : '');
  const [recurrence, setRecurrence] = useState('none');
  const [recurrenceEndType, setRecurrenceEndType] = useState('count');
  const [recurrenceCount, setRecurrenceCount] = useState(10);
  const [recurrenceUntil, setRecurrenceUntil] = useState('');
  const [description, setDescription] = useState(editEvent ? (editEvent.description || '') : '');
  const [location, setLocation] = useState(editEvent ? (editEvent.location || '') : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getGoogleAccounts().then(res => {
      const list = res.accounts || [];
      setAccounts(list);
      if (!isEditMode && list.length > 0) setAccountId(list[0].id);
    }).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!accountId) return;
    setCalendars(null);
    api.getGoogleCalendars(accountId).then(res => {
      const list = res.calendars || [];
      setCalendars(list);
      if (!isEditMode) {
        const primary = list.find(c => c.primary) || list[0];
        setCalendarId(primary ? primary.id : 'primary');
      }
    }).catch(err => {
      console.error(err);
      setCalendars([]);
      if (!isEditMode) setCalendarId('primary');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  async function handleSave() {
    if (!title.trim() || !date || !accountId) return;
    setSaving(true);
    setError('');
    try {
      const startDateTime = allDay ? date : `${date}T${startTime}:00`;
      const endDateTime = allDay ? date : `${date}T${endTime}:00`;
      if (isEditMode) {
        await api.updateGoogleEvent(
          accountId, calendarId || 'primary', editEvent.googleEventId,
          title.trim(), startDateTime, endDateTime, allDay,
          description.trim(), location.trim()
        );
      } else {
        const rrule = buildRRule(recurrence, recurrenceEndType, recurrenceCount, recurrenceUntil);
        await api.createGoogleEvent(
          accountId, calendarId || 'primary', title.trim(), startDateTime, endDateTime, allDay, rrule,
          description.trim(), location.trim()
        );
      }
      onCreated();
      onClose();
    } catch (err) {
      console.error(err);
      setError(isEditMode ? 'Could not update event.' : 'Could not create event.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.box} onClick={e => e.stopPropagation()}>
        <div style={s.header}>
          <div style={s.title}>
            {!isEditMode && <Icon name="plus" size={18} />}
            {isEditMode ? 'Edit Event' : 'Add Event'}
          </div>
          <button style={s.close} onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        </div>

        {accounts === null && <div style={s.emptyMsg}>Loading…</div>}

        {accounts !== null && !isEditMode && accounts.length === 0 && (
          <div style={s.emptyMsg}>
            No Google accounts connected yet. Go to Edit → Connected Accounts to connect one first.
          </div>
        )}

        {accounts !== null && (isEditMode || accounts.length > 0) && (
          <div style={s.form}>
            <input
              style={s.input}
              type="text"
              placeholder="Event title"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />

            <select style={s.input} value={accountId} onChange={e => setAccountId(e.target.value)} disabled={isEditMode}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.email}</option>)}
              {isEditMode && !accounts.some(a => a.id === accountId) && (
                <option value={accountId}>{accountId}</option>
              )}
            </select>

            <select
              style={s.input}
              value={calendarId}
              onChange={e => setCalendarId(e.target.value)}
              disabled={isEditMode || !calendars || calendars.length === 0}
            >
              {calendars === null && <option value="">Loading calendars…</option>}
              {calendars !== null && calendars.length === 0 && <option value={calendarId || 'primary'}>Primary</option>}
              {calendars !== null && calendars.map(c => (
                <option key={c.id} value={c.id}>{c.summary}{c.primary ? ' (Primary)' : ''}</option>
              ))}
            </select>

            <input style={s.input} type="date" value={date} onChange={e => setDate(e.target.value)} />

            <label style={s.checkboxRow}>
              <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} /> All day
            </label>

            {!allDay && (
              <div style={s.row}>
                <input style={s.input} type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
                <input style={s.input} type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
              </div>
            )}

            {!isEditMode && (
              <select style={s.input} value={recurrence} onChange={e => setRecurrence(e.target.value)}>
                {RECURRENCE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            )}

            {!isEditMode && recurrence !== 'none' && (
              <div style={s.row}>
                <select style={s.input} value={recurrenceEndType} onChange={e => setRecurrenceEndType(e.target.value)}>
                  <option value="count"># of occurrences</option>
                  <option value="until">Until date</option>
                </select>
                {recurrenceEndType === 'count' ? (
                  <input
                    style={s.input}
                    type="number"
                    min={1}
                    value={recurrenceCount}
                    onChange={e => setRecurrenceCount(e.target.value)}
                  />
                ) : (
                  <input
                    style={s.input}
                    type="date"
                    value={recurrenceUntil}
                    onChange={e => setRecurrenceUntil(e.target.value)}
                  />
                )}
              </div>
            )}

            <input
              style={s.input}
              type="text"
              placeholder="Description (optional)"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
            <input
              style={s.input}
              type="text"
              placeholder="Location (optional)"
              value={location}
              onChange={e => setLocation(e.target.value)}
            />

            {error && <div style={s.error}>{error}</div>}

            <button style={s.saveBtn} onClick={handleSave} disabled={saving || !title.trim()}>
              {saving ? 'Saving…' : (isEditMode ? 'Save Changes' : 'Save Event')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  box: {
    background: 'var(--surface)', borderRadius: 'var(--radius-xl)', width: 420,
    maxWidth: '92vw', maxHeight: '86vh', overflow: 'auto', boxShadow: 'var(--shadow-md)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '18px 20px', borderBottom: '0.5px solid var(--border)',
  },
  title: { fontSize: 18, fontWeight: 700, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 },
  close: {
    width: 34, height: 34, borderRadius: 'var(--radius-sm)', background: 'var(--bg)',
    color: 'var(--text-2)', fontSize: 16, display: 'flex', alignItems: 'center',
    justifyContent: 'center', cursor: 'pointer', border: '0.5px solid var(--border)',
  },
  emptyMsg: { padding: '24px 20px', color: 'var(--text-3)', fontSize: 15, lineHeight: 1.5 },
  form: { display: 'flex', flexDirection: 'column', gap: 10, padding: 20 },
  row: { display: 'flex', gap: 10 },
  input: {
    flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-md)',
    fontSize: 15, background: 'var(--bg)', color: 'var(--text-1)', minWidth: 0,
  },
  checkboxRow: {
    display: 'flex', alignItems: 'center', gap: 8, fontSize: 15,
    color: 'var(--text-2)', fontWeight: 500, cursor: 'pointer',
  },
  error: { color: '#dc2626', fontSize: 14 },
  saveBtn: {
    padding: '10px 16px', borderRadius: 8, border: 'none',
    background: 'var(--blue)', color: 'white', fontSize: 15, fontWeight: 600,
    cursor: 'pointer', marginTop: 4,
  },
};
