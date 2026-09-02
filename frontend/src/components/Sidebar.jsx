import { useScreenSize } from '../hooks/useScreenSize';
import Icon from './Icon';

export const TABS = [
  { id: 'home',       icon: 'home',            label: 'Home' },
  { id: 'calendar',   icon: 'calendar',        label: 'Calendar' },
  { id: 'chores',     icon: 'check-square',    label: 'Chores' },
  { id: 'tasks',      icon: 'clipboard-list',  label: 'Tasks' },
  { id: 'meals',      icon: 'chef-hat',        label: 'Meals' },
  { id: 'shopping',   icon: 'shopping-cart',   label: 'Shopping' },
  { id: 'homeschool', icon: 'graduation-cap',  label: 'Homeschool' },
  { id: 'beach',      icon: 'waves',           label: 'Beach' },
  { id: 'timer',      icon: 'timer',           label: 'Timer' },
  { id: 'edit',       icon: 'settings',        label: 'Manage' },
];

// Nav items the household can hide via Manage → General. Everything else
// (home, etc.) always shows so the dashboard can't be navigated into a corner.
export const TOGGLEABLE_TAB_IDS = ['chores', 'tasks', 'meals', 'shopping', 'homeschool', 'beach', 'timer'];

function TabButton({ t, active, isMobile, onClick }) {
  return (
    <button
      style={{ ...s.item, ...(isMobile ? s.itemMobile : {}) }}
      onClick={onClick}
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
}

export default function Sidebar({ tab, onChange, hiddenNavItems = [] }) {
  const { isMobile } = useScreenSize();
  const mainTabs = TABS.filter(t => t.id !== 'edit' && !(TOGGLEABLE_TAB_IDS.includes(t.id) && hiddenNavItems.includes(t.id)));
  const manageTab = TABS.find(t => t.id === 'edit');

  return (
    <nav style={{ ...s.wrap, width: isMobile ? 66 : 84 }} aria-label="Primary">
      {mainTabs.map(t => (
        <TabButton key={t.id} t={t} active={tab === t.id} isMobile={isMobile} onClick={() => onChange(t.id)} />
      ))}

      <div style={s.spacer} />

      <div style={s.divider} />
      <TabButton t={manageTab} active={tab === manageTab.id} isMobile={isMobile} onClick={() => onChange(manageTab.id)} />
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
  // Pushes Manage down to the bottom of the sidebar regardless of how many
  // toggleable items are shown/hidden above it.
  spacer: { flex: 1, minHeight: 8 },
  divider: { width: 28, height: 1, background: 'rgba(255,255,255,0.16)', marginBottom: 8, flexShrink: 0 },
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
  // Not var(--sidebar-active-text) — that color is tuned for the icon
  // sitting on its own white pill, not for text sitting directly on the
  // sidebar's blue/teal gradient, where (in light mode) it barely
  // contrasts. --sidebar-active-label is themed separately per mode:
  // white in light mode, the original cyan in dark mode (unchanged there).
  labelActive: { color: 'var(--sidebar-active-label)', fontWeight: 700 },
};
