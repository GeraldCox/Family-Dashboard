import { useState, useEffect } from 'react';
import { api } from '../api';
import { useScreenSize } from '../hooks/useScreenSize';
import Icon from './Icon';

const RISING_COLOR = '#16a34a';
const FALLING_COLOR = '#dc2626';
const REFRESH_MS = 30 * 60 * 1000;

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatHeight(ft) {
  return `${ft.toFixed(1)} ft`;
}

export default function Beach() {
  const [data, setData] = useState(null);
  const { isMobile } = useScreenSize();

  useEffect(() => {
    api.tides().then(setData).catch(console.error);
    const t = setInterval(() => api.tides().then(setData).catch(console.error), REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  if (!data) return <div style={s.loading}>Loading tides…</div>;

  return (
    <div style={s.wrap}>
      <div style={{ ...s.grid, ...(isMobile ? s.gridMobile : {}) }}>
        {data.beaches.map(beach => <BeachCard key={beach.id} beach={beach} />)}
      </div>
    </div>
  );
}

function BeachCard({ beach }) {
  const rising = beach.state === 'rising';
  const tint = rising ? RISING_COLOR : FALLING_COLOR;

  return (
    <div style={s.card}>
      <div style={s.cardHead}>
        <Icon name="waves" size={22} style={{ color: '#3c7ec3' }} />
        <div style={s.name}>{beach.name}</div>
      </div>

      {beach.error ? (
        <div style={s.errorText}>Tide data unavailable</div>
      ) : (
        <>
          <div style={s.stateRow}>
            <Icon name={rising ? 'trending-up' : 'trending-down'} size={20} style={{ color: tint }} />
            <span style={{ ...s.stateLabel, color: tint }}>
              {rising ? 'Rising' : 'Falling'}
            </span>
          </div>

          <div style={s.events}>
            {beach.events.map((ev, i) => (
              <div key={i} style={s.eventRow}>
                <span style={{ ...s.eventBadge, ...(ev.type === 'high' ? s.eventBadgeHigh : s.eventBadgeLow) }}>
                  {ev.type === 'high' ? 'High' : 'Low'}
                </span>
                <span style={s.eventTime}>{formatTime(ev.time)}</span>
                <span style={s.eventHeight}>{formatHeight(ev.height)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const s = {
  loading: { padding: 20, color: 'var(--text-3)' },
  wrap: { padding: 20, overflowY: 'auto', height: '100%', boxSizing: 'border-box' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 },
  gridMobile: { gridTemplateColumns: '1fr' },

  card: {
    background: 'var(--bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
    padding: 16, boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: 12,
  },
  cardHead: { display: 'flex', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-heading)' },

  stateRow: { display: 'flex', alignItems: 'center', gap: 6 },
  stateLabel: { fontSize: 22, fontWeight: 600, lineHeight: 1, fontFamily: 'var(--font-heading)' },

  events: { display: 'flex', flexDirection: 'column', gap: 6 },
  eventRow: {
    display: 'flex', alignItems: 'center', gap: 10, fontSize: 14,
    padding: '6px 10px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)',
  },
  eventBadge: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
    padding: '2px 7px', borderRadius: 20, flexShrink: 0,
  },
  eventBadgeHigh: { background: RISING_COLOR + '22', color: RISING_COLOR },
  eventBadgeLow: { background: FALLING_COLOR + '22', color: FALLING_COLOR },
  eventTime: { color: 'var(--text-1)', fontWeight: 500, flex: 1 },
  eventHeight: { color: 'var(--text-3)' },

  errorText: { fontSize: 13, color: 'var(--text-3)', fontStyle: 'italic' },
};
