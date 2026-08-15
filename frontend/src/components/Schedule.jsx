import { useState, useEffect } from 'react';
import { api } from '../api';
import Icon from './Icon';

const DEFAULT_PERSON_COLOR = { bg: '#f1f5f9', color: '#334155', border: '#94a3b8' };

function toPersonColors(color) {
  return { bg: color + '18', color, border: color };
}

const ACTIVITY_ICONS = {
  'wake up': 'sunrise',
  'breakfast': 'coffee',
  'family breakfast': 'coffee',
  'lunch': 'sandwich',
  'dinner': 'utensils',
  'gym': 'dumbbell',
  'work': 'briefcase',
  'walk': 'footprints',
  'morning walk': 'footprints',
  'school': 'backpack',
  'homework': 'book',
  'bath': 'bath',
  'bedtime': 'moon',
  'wind down': 'moon',
  'soccer': 'soccer',
  'practice': 'activity',
  'reading': 'book',
  'piano': 'music',
  'dance': 'music',
  'swim': 'waves',
  'default': 'map-pin',
};

function getIcon(label) {
  const lower = label.toLowerCase();
  for (const [key, icon] of Object.entries(ACTIVITY_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return ACTIVITY_ICONS.default;
}

export default function Schedule() {
  const [data, setData] = useState(null);
  const [personColors, setPersonColors] = useState({});
  const [hoverIndex, setHoverIndex] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  useEffect(() => { api.schedule().then(setData).catch(console.error); }, []);
  useEffect(() => {
    api.people().then(res => {
      const map = {};
      (res.people || []).forEach(p => { map[p.id] = toPersonColors(p.color); });
      setPersonColors(map);
    }).catch(console.error);
  }, []);

  function resetDrag() {
    setDragIndex(null);
    setDragOverIndex(null);
  }

  function handleDragStart(e, i) {
    setDragIndex(i);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(i)); } catch { /* ignore */ }
  }

  function handleDragOver(e, i) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIndex === null || dragIndex === i) return;
    if (dragOverIndex !== i) setDragOverIndex(i);
  }

  function handleDrop(e, i) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === i) { resetDrag(); return; }

    const arr = [...data.slots];
    const [moved] = arr.splice(dragIndex, 1);
    const insertIndex = i > dragIndex ? i - 1 : i;
    arr.splice(insertIndex, 0, moved);

    setData({ slots: arr });
    resetDrag();
    api.reorderSchedule(arr).catch(err => console.error('Reorder failed:', err));
  }

  if (!data) return <div style={{ padding: 16, color: 'var(--text-3)', fontSize: 15 }}>Loading schedule…</div>;

  return (
    <div style={s.wrap}>
      <div style={s.label}>Daily Routine</div>
      <div style={s.list}>
        {data.slots.map((slot, i) => (
          <div
            key={i}
            style={s.slotWrapper}
            onDragOver={e => handleDragOver(e, i)}
            onDrop={e => handleDrop(e, i)}
            onMouseEnter={() => setHoverIndex(i)}
            onMouseLeave={() => setHoverIndex(prev => (prev === i ? null : prev))}
          >
            {dragOverIndex === i && dragIndex !== null && dragIndex !== i && (
              <div style={s.placeholder} />
            )}
            <div style={{ ...s.slot, opacity: dragIndex === i ? 0.4 : 1 }}>
              <div
                draggable
                onDragStart={e => handleDragStart(e, i)}
                onDragEnd={resetDrag}
                style={{ ...s.handle, opacity: hoverIndex === i || dragIndex === i ? 1 : 0 }}
                title="Drag to reorder"
              >
                ⠿
              </div>
              <div style={s.time}>{slot.time}</div>
              <div style={s.timeline}>
                <div style={s.dot} />
                {i < data.slots.length - 1 && <div style={s.line} />}
              </div>
              <div style={s.items}>
                {slot.items.map((item, j) => {
                  const c = personColors[item.type] || DEFAULT_PERSON_COLOR;
                  const icon = getIcon(item.label);
                  return (
                    <div key={j} style={{
                      ...s.item,
                      background: c.bg,
                      color: c.color,
                      borderLeft: `3px solid ${c.border}`,
                    }}>
                      <Icon name={icon} size={16} style={{ flexShrink: 0 }} />
                      <span style={s.itemLabel}>{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}

        <div
          style={s.trailingDrop}
          onDragOver={e => handleDragOver(e, data.slots.length)}
          onDrop={e => handleDrop(e, data.slots.length)}
        >
          {dragOverIndex === data.slots.length && dragIndex !== null && (
            <div style={s.placeholder} />
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  wrap: { padding: '16px 12px', overflowY: 'auto', height: '100%' },
  label: { fontSize: 13, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14, fontFamily: 'var(--font-heading)', fontStyle: 'italic' },
  list: { display: 'flex', flexDirection: 'column', gap: 0 },
  slotWrapper: { display: 'flex', flexDirection: 'column' },
  slot: { display: 'flex', alignItems: 'flex-start', gap: 6, paddingBottom: 12, transition: 'opacity 0.15s' },
  handle: {
    width: 14, flexShrink: 0, paddingTop: 5, textAlign: 'center',
    fontSize: 16, lineHeight: 1, color: 'var(--text-3)', cursor: 'grab',
    userSelect: 'none', transition: 'opacity 0.15s',
  },
  time: { fontSize: 13, color: 'var(--text-3)', minWidth: 48, paddingTop: 6, textAlign: 'right', fontWeight: 600 },
  timeline: { display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 6, width: 16, flexShrink: 0 },
  dot: { width: 8, height: 8, borderRadius: '50%', background: 'var(--border-md)', flexShrink: 0 },
  line: { width: 2, flex: 1, background: 'var(--border)', minHeight: 20, marginTop: 2 },
  items: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, paddingBottom: 4 },
  item: {
    fontSize: 14, padding: '5px 10px', borderRadius: 8,
    fontWeight: 500, display: 'flex', alignItems: 'center', gap: 7,
    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
  },
  icon: { fontSize: 17, flexShrink: 0 },
  itemLabel: { flex: 1 },
  placeholder: {
    height: 3, borderRadius: 2, background: 'var(--blue)',
    margin: '0 0 8px 22px', opacity: 0.6,
  },
  trailingDrop: { minHeight: 10 },
};
