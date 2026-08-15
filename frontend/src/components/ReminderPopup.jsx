import { useEffect, useState } from 'react';
import { api } from '../api';
import Icon from './Icon';

export default function ReminderPopup() {
  const [reminders, setReminders] = useState([]);
  const [dismissed, setDismissed] = useState(() => new Set());

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  function refresh() {
    api.getActiveReminders().then(res => setReminders(res.reminders || [])).catch(console.error);
  }

  function dismiss(id) {
    setDismissed(prev => new Set(prev).add(id));
  }

  const visible = reminders.filter(r => !dismissed.has(r.id));
  if (visible.length === 0) return null;

  return (
    <div style={styles.popup}>
      {visible.map(r => (
        <div key={r.id} style={styles.card}>
          <span style={styles.message}><Icon name="bell" size={15} style={{ color: 'var(--accent)', marginTop: 1 }} /> {r.message}</span>
          <button style={styles.dismissBtn} onClick={() => dismiss(r.id)} title="Dismiss" aria-label="Dismiss"><Icon name="x" size={15} /></button>
        </div>
      ))}
    </div>
  );
}

const styles = {
  popup: {
    position: 'absolute', top: '100%', right: 0, marginTop: 8,
    display: 'flex', flexDirection: 'column', gap: 6, zIndex: 50, minWidth: 220,
  },
  card: {
    display: 'flex', alignItems: 'flex-start', gap: 8,
    background: 'var(--surface)', borderRadius: 'var(--radius-md)',
    border: '0.5px solid var(--border)', boxShadow: 'var(--shadow-sm)',
    padding: '10px 12px',
  },
  message: { flex: 1, fontSize: 14, color: 'var(--text-1)', fontWeight: 500, lineHeight: 1.4, display: 'flex', gap: 6, alignItems: 'flex-start' },
  dismissBtn: {
    border: 'none', background: 'transparent', cursor: 'pointer',
    color: 'var(--text-3)', padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center',
  },
};
