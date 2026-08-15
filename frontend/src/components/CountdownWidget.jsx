import { useState, useEffect } from 'react';
import { api } from '../api';
import Icon from './Icon';

const REFRESH_MS = 60000;

export function daysUntil(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

export default function CountdownWidget() {
  const [countdowns, setCountdowns] = useState([]);

  useEffect(() => {
    function refresh() {
      api.getCountdowns().then(res => setCountdowns(res.countdowns || [])).catch(console.error);
    }
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  if (countdowns.length === 0) return null;

  return (
    <div style={s.strip} className="no-scrollbar">
      {countdowns.map(cd => {
        const days = daysUntil(cd.date);
        return (
          <div key={cd.id} style={{ ...s.card, borderLeft: `4px solid ${cd.color}` }}>
            <div style={s.emoji}>{cd.emoji}</div>
            <div style={s.name} title={cd.name}>{cd.name}</div>
            {days > 0 && (
              <>
                <div style={{ ...s.days, color: cd.color }}>{days}</div>
                <div style={s.label}>days to go</div>
              </>
            )}
            {days === 0 && <div style={s.today}><Icon name="party-popper" size={15} /> Today!</div>}
            {days < 0 && <div style={s.done}><Icon name="check" size={14} /> Done</div>}
          </div>
        );
      })}
    </div>
  );
}

const s = {
  strip: {
    display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 8,
    flex: 1, minWidth: 0, height: '100%',
    overflowX: 'auto', overflowY: 'hidden',
    scrollbarWidth: 'none',
  },
  card: {
    flexShrink: 0, width: 160, height: 86,
    background: 'var(--bg)', borderRadius: 10,
    padding: '6px 9px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    textAlign: 'center', gap: 0,
  },
  emoji: { fontSize: 20, lineHeight: 1 },
  name: {
    fontSize: 12, fontWeight: 700, color: 'var(--text-1)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    width: '100%', marginTop: 1,
  },
  days: { fontSize: 22, fontWeight: 800, lineHeight: 1.1, marginTop: 1 },
  label: { fontSize: 10, color: 'var(--text-3)', fontWeight: 500 },
  today: { fontSize: 14, fontWeight: 700, color: '#d97706', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 },
  done: { fontSize: 13, fontWeight: 600, color: 'var(--text-3)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 },
};
