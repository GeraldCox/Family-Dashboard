import { useScreenSize } from '../hooks/useScreenSize';
import Icon from './Icon';

export const TABS = [
  { id: 'home',       icon: 'home',            label: 'Home' },
  { id: 'calendar',   icon: 'calendar',        label: 'Calendar' },
  { id: 'chores',     icon: 'check-square',    label: 'Chores' },
  { id: 'tasks',      icon: 'clipboard-list',  label: 'Tasks' },
  { id: 'meals',      icon: 'utensils',        label: 'Meals' },
  { id: 'shopping',   icon: 'shopping-cart',   label: 'Shopping' },
  { id: 'homeschool', icon: 'graduation-cap',  label: 'Homeschool' },
  { id: 'beach',      icon: 'waves',           label: 'Beach' },
  { id: 'timer',      icon: 'timer',           label: 'Timer' },
  { id: 'edit',       icon: 'pencil',          label: 'Edit' },
];

export default function Sidebar({ tab, onChange }) {
  const { isMobile } = useScreenSize();

  return (
    <nav style={{ ...s.wrap, width: isMobile ? 66 : 84 }} aria-label="Primary">
      {TABS.map(t => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            style={{ ...s.item, ...(isMobile ? s.itemMobile : {}) }}
            onClick={() => onChange(t.id)}
            aria-label={t.label}
            aria-current={active ? 'page' : undefined}
            title={t.label}
          >
            <div style={{ ...s.pill, ...(active ? s.pillActive : {}) }}>
              <Icon
                name={t.icon}
                size={isMobile ? 22 : 23}
                strokeWidth={active ? 2.2 : 2}
                style={{ color: active ? 'var(--sidebar-active-text)' : 'var(--sidebar-inactive)' }}
              />
            </div>
            {!isMobile && (
              <span style={{ ...s.label, ...(active ? s.labelActive : {}) }}>{t.label}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

const s = {
  wrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    flexShrink: 0, height: '100%',
    background: 'linear-gradient(var(--sidebar-top), var(--sidebar-bottom))',
    padding: '14px 0', gap: 2, overflowY: 'auto',
  },
  item: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 4, width: '100%',
    padding: '7px 0', background: 'transparent', border: 'none',
    cursor: 'pointer', borderRadius: 14,
  },
  itemMobile: { padding: '6px 0' },
  pill: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 48, height: 38, borderRadius: 14,
    background: 'transparent',
    transition: 'background var(--dur-mid) var(--ease), box-shadow var(--dur-mid) var(--ease)',
  },
  pillActive: {
    background: 'var(--sidebar-active-bg)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.14)',
  },
  label: {
    fontSize: 12, fontWeight: 500, color: 'var(--sidebar-inactive)',
    lineHeight: 1, textAlign: 'center',
    transition: 'color var(--dur-mid) var(--ease)',
  },
  labelActive: { color: 'var(--sidebar-active-text)', fontWeight: 700 },
};
