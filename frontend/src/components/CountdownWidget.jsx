import { useState, useEffect, useRef } from 'react';
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
  const [hideAfterDays, setHideAfterDays] = useState(1);
  const scrollRef = useRef(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  useEffect(() => {
    function refresh() {
      api.getCountdowns().then(res => setCountdowns(res.countdowns || [])).catch(console.error);
    }
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    api.getGeneralSettings().then(res => setHideAfterDays(res.countdownHideAfterDays ?? 1)).catch(console.error);
  }, []);

  const visible = countdowns.filter(cd => daysUntil(cd.date) >= -hideAfterDays);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function update() {
      setCanScroll({
        left: el.scrollLeft > 2,
        right: el.scrollLeft < el.scrollWidth - el.clientWidth - 2,
      });
    }
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [visible.length]);

  if (visible.length === 0) return null;

  return (
    <div style={s.wrap}>
      <div ref={scrollRef} style={s.strip} className="no-scrollbar">
        {visible.map(cd => {
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
      {canScroll.left && <div style={{ ...s.fade, ...s.fadeLeft }} />}
      {canScroll.right && <div style={{ ...s.fade, ...s.fadeRight }} />}
    </div>
  );
}

const s = {
  // minWidth guarantees at least one full 160px card (plus a little breathing
  // room) stays visible even when the row is tight, instead of flex:1 letting
  // it shrink below one card's width.
  wrap: { position: 'relative', flex: 1, minWidth: 180, height: '100%' },
  strip: {
    display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 8,
    height: '100%', width: '100%',
    overflowX: 'auto', overflowY: 'hidden',
    scrollbarWidth: 'none',
  },
  fade: {
    position: 'absolute', top: 0, bottom: 0, width: 28, pointerEvents: 'none',
  },
  fadeLeft: { left: 0, background: 'linear-gradient(to right, var(--surface), transparent)' },
  fadeRight: { right: 0, background: 'linear-gradient(to left, var(--surface), transparent)' },
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
