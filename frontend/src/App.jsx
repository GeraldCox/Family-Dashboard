import { useState, useEffect, useRef } from 'react';
import { api } from './api';
import WeatherBar from './components/WeatherBar';
import Sidebar from './components/Sidebar';
import HomeTab from './components/HomeTab';
import Calendar from './components/Calendar';
import Chores from './components/Chores';
import Tasks from './components/Tasks';
import Meals from './components/Meals';
import EditTab from './components/EditTab';
import ShoppingList from './components/ShoppingList';
import Homeschool from './components/Homeschool';
import Beach from './components/Beach';
import Timer from './components/Timer';
import Screensaver from './components/Screensaver';
import AddEventModal from './components/AddEventModal';
import Icon from './components/Icon';
import { useScreenSize } from './hooks/useScreenSize';
import { useDayNight } from './hooks/useDayNight';

const DEFAULT_SCREENSAVER_SETTINGS = { inactivityMinutes: 5, transitionSeconds: 6, brightness: 100 };
const DEFAULT_GENERAL_SETTINGS = { hiddenNavItems: [], homeCalendarView: 'month' };
const ACTIVITY_EVENTS = ['mousemove', 'touchstart', 'keydown', 'click'];

const VIEW_OPTIONS = [
  { id: 'day',   label: 'Day' },
  { id: 'week',  label: 'Week' },
  { id: '2week', label: '2-Week' },
  { id: 'month', label: 'Month' },
];
const VALID_CALENDAR_VIEWS = VIEW_OPTIONS.map(o => o.id);

function getStoredCalendarView() {
  const stored = localStorage.getItem('calendarView');
  return VALID_CALENDAR_VIEWS.includes(stored) ? stored : 'month';
}

// How long a chip needs to be held before it solos that calendar. Short
// enough to feel responsive but well past normal-tap length, matching the
// native long-press threshold most touch platforms use (~500ms).
const SOLO_HOLD_MS = 500;

function CalendarTab({ view, onViewChange, filters, onToggleFilter, onSoloFilter, sources, refreshToken, onAddEvent }) {
  const { isMobile } = useScreenSize();
  const holdTimerRef = useRef(null);
  const soloFiredRef = useRef(false);

  function handleChipPressStart(id) {
    soloFiredRef.current = false;
    clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      soloFiredRef.current = true;
      onSoloFilter(id);
    }, SOLO_HOLD_MS);
  }

  function handleChipPressEnd() {
    clearTimeout(holdTimerRef.current);
  }

  function handleChipClick(id) {
    // A long-press already handled this interaction — don't also fire the
    // normal single-chip toggle on release.
    if (soloFiredRef.current) { soloFiredRef.current = false; return; }
    onToggleFilter(id);
  }

  return (
    <div style={s.calendarTab}>
      <div style={{ ...s.calendarControls, ...(isMobile ? s.calendarControlsMobile : {}) }}>
        <div style={s.viewPills}>
          {VIEW_OPTIONS.map(o => (
            <button
              key={o.id}
              style={{ ...s.viewPill, ...(view === o.id ? s.viewPillActive : {}) }}
              onClick={() => onViewChange(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div style={s.filterChips}>
          {sources.map(src => {
            const enabled = filters[src.id] !== false;
            return (
              <button
                key={src.id}
                style={{ ...s.chip, ...(enabled ? {} : s.chipOff) }}
                onClick={() => handleChipClick(src.id)}
                onTouchStart={() => handleChipPressStart(src.id)}
                onTouchEnd={handleChipPressEnd}
                onTouchCancel={handleChipPressEnd}
                onMouseDown={() => handleChipPressStart(src.id)}
                onMouseUp={handleChipPressEnd}
                onMouseLeave={handleChipPressEnd}
                title={`Tap to show/hide ${src.name} — hold to show only ${src.name}`}
              >
                <span style={{ ...s.chipDot, background: src.color, opacity: enabled ? 1 : 0.35 }} />
                {src.name}
              </button>
            );
          })}
        </div>

        <button style={s.addEventBtn} onClick={onAddEvent}><Icon name="plus" size={17} /> Add Event</button>
      </div>

      <div style={s.calendarBody}>
        <Calendar view={view} filters={filters} refreshToken={refreshToken} />
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState('home');
  const [calendarView, setCalendarView] = useState(getStoredCalendarView);
  const [calendarFilters, setCalendarFilters] = useState({});
  const [calendarSources, setCalendarSources] = useState([]);
  const [calendarRefreshToken, setCalendarRefreshToken] = useState(0);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [screensaverSettings, setScreensaverSettings] = useState(DEFAULT_SCREENSAVER_SETTINGS);
  const [showScreensaver, setShowScreensaver] = useState(false);
  const [generalSettings, setGeneralSettings] = useState(DEFAULT_GENERAL_SETTINGS);
  const lastActivityRef = useRef(Date.now());
  const { isMobile } = useScreenSize();
  const { isDark } = useDayNight();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    api.calendarChips().then(res => setCalendarSources(res.sources || [])).catch(console.error);
  }, []);

  useEffect(() => {
    api.getScreensaverSettings().then(setScreensaverSettings).catch(console.error);
  }, []);

  useEffect(() => {
    api.getGeneralSettings().then(setGeneralSettings).catch(console.error);
  }, []);

  useEffect(() => {
    if (generalSettings.hiddenNavItems?.includes(tab)) setTab('home');
  }, [generalSettings, tab]);

  useEffect(() => {
    function markActivity() {
      lastActivityRef.current = Date.now();
      setShowScreensaver(prev => (prev ? false : prev));
    }
    ACTIVITY_EVENTS.forEach(ev => document.addEventListener(ev, markActivity));
    return () => ACTIVITY_EVENTS.forEach(ev => document.removeEventListener(ev, markActivity));
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      const thresholdMs = (screensaverSettings.inactivityMinutes || DEFAULT_SCREENSAVER_SETTINGS.inactivityMinutes) * 60000;
      if (idleMs >= thresholdMs) setShowScreensaver(true);
    }, 10000);
    return () => clearInterval(id);
  }, [screensaverSettings.inactivityMinutes]);

  function dismissScreensaver() {
    lastActivityRef.current = Date.now();
    setShowScreensaver(false);
  }

  function previewScreensaver() {
    setShowScreensaver(true);
  }

  function toggleFilter(id) {
    setCalendarFilters(prev => ({ ...prev, [id]: prev[id] === false ? true : false }));
  }

  // Long-pressing a chip isolates that calendar (hides all others); doing it
  // again when it's already the only one showing restores everyone instead
  // of leaving the household stuck manually re-enabling every other chip.
  function soloFilter(id) {
    setCalendarFilters(prev => {
      const isOnlySelected = calendarSources.every(src => (
        src.id === id ? prev[src.id] !== false : prev[src.id] === false
      ));
      if (isOnlySelected) return {};
      const next = {};
      calendarSources.forEach(src => { next[src.id] = src.id === id; });
      return next;
    });
  }

  function changeCalendarView(view) {
    localStorage.setItem('calendarView', view);
    setCalendarView(view);
  }

  return (
    <div style={s.app}>
      {showScreensaver && (
        <Screensaver
          transitionSeconds={screensaverSettings.transitionSeconds}
          brightness={screensaverSettings.brightness}
          onDismiss={dismissScreensaver}
        />
      )}

      {showAddEvent && (
        <AddEventModal
          onClose={() => setShowAddEvent(false)}
          onCreated={() => setCalendarRefreshToken(t => t + 1)}
        />
      )}

      <Sidebar tab={tab} onChange={setTab} hiddenNavItems={generalSettings.hiddenNavItems} />

      <div style={s.mainCol}>
        <WeatherBar />

        <div style={s.content}>
          {tab === 'home' && (
            <HomeTab view={generalSettings.homeCalendarView || 'month'} filters={calendarFilters} />
          )}

          {tab === 'calendar' && (
            <CalendarTab
              view={calendarView}
              onViewChange={changeCalendarView}
              filters={calendarFilters}
              onToggleFilter={toggleFilter}
              onSoloFilter={soloFilter}
              sources={calendarSources}
              refreshToken={calendarRefreshToken}
              onAddEvent={() => setShowAddEvent(true)}
            />
          )}

          {tab === 'chores' && (
            <div style={{ ...s.paneOuter, ...(isMobile ? s.paneOuterMobile : {}) }}>
              <div style={{ ...s.paneLayout, ...(isMobile ? s.paneLayoutMobile : {}) }}>
                <Chores />
              </div>
            </div>
          )}

          {tab === 'tasks' && (
            <div style={{ ...s.paneOuter, ...(isMobile ? s.paneOuterMobile : {}) }}>
              <div style={{ ...s.paneLayout, ...(isMobile ? s.paneLayoutMobile : {}) }}>
                <Tasks />
              </div>
            </div>
          )}

          {tab === 'meals' && (
            <div style={{ ...s.paneOuter, ...(isMobile ? s.paneOuterMobile : {}) }}>
              <div style={{ ...s.paneLayout, ...(isMobile ? s.paneLayoutMobile : {}) }}>
                <Meals />
              </div>
            </div>
          )}

          {tab === 'shopping' && (
            <div style={{ ...s.paneOuter, ...(isMobile ? s.paneOuterMobile : {}) }}>
              <div style={{ ...s.paneLayout, ...(isMobile ? s.paneLayoutMobile : {}) }}>
                <ShoppingList />
              </div>
            </div>
          )}

          {tab === 'homeschool' && (
            <div style={{ ...s.paneOuter, ...(isMobile ? s.paneOuterMobile : {}) }}>
              <div style={{ ...s.paneLayout, ...(isMobile ? s.paneLayoutMobile : {}) }}>
                <Homeschool />
              </div>
            </div>
          )}

          {tab === 'beach' && (
            <div style={{ ...s.paneOuter, ...(isMobile ? s.paneOuterMobile : {}) }}>
              <div style={{ ...s.paneLayout, ...(isMobile ? s.paneLayoutMobile : {}) }}>
                <Beach />
              </div>
            </div>
          )}

          {tab === 'timer' && (
            <div style={{ ...s.paneOuter, ...(isMobile ? s.paneOuterMobile : {}) }}>
              <div style={{ ...s.paneLayout, ...(isMobile ? s.paneLayoutMobile : {}) }}>
                <Timer />
              </div>
            </div>
          )}

          {tab === 'edit' && (
            <div style={{ ...s.paneOuter, ...(isMobile ? s.paneOuterMobile : {}) }}>
              <div style={{ ...s.paneLayout, ...(isMobile ? s.paneLayoutMobile : {}) }}>
                <EditTab
                  onPreviewScreensaver={previewScreensaver}
                  onScreensaverSettingsSaved={setScreensaverSettings}
                  onGeneralSettingsSaved={setGeneralSettings}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  app: {
    display: 'flex', flexDirection: 'row', height: '100vh',
    background: 'var(--bg)', overflow: 'hidden',
    transition: 'background-color 0.6s ease, color 0.6s ease',
  },
  mainCol: {
    display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0,
  },
  content: {
    flex: 1, overflow: 'hidden', minHeight: 0,
  },
  // Transparent spacer between the page edges and the pane's own card —
  // matches the outer gap Home (HomeTab's `wrap`) and Calendar
  // (`calendarTab`) already have. paneLayout's own padding is separate: the
  // space between the card's border and its content, not the space around
  // the card itself.
  paneOuter: {
    height: '100%', padding: 12, boxSizing: 'border-box',
  },
  paneOuterMobile: {
    padding: 7,
  },
  paneLayout: {
    height: '100%', padding: 12,
    background: 'var(--surface)', borderRadius: 'var(--radius-xl)',
    overflow: 'hidden', boxShadow: 'var(--shadow-md)',
    border: '1px solid var(--border)',
    boxSizing: 'border-box',
  },
  paneLayoutMobile: {
    padding: 6,
  },
  calendarTab: {
    display: 'flex', flexDirection: 'column', height: '100%', padding: 12, gap: 10,
  },
  calendarControls: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, flexWrap: 'wrap', flexShrink: 0,
  },
  calendarControlsMobile: {
    flexDirection: 'column', alignItems: 'stretch', gap: 8,
  },
  viewPills: {
    display: 'flex', gap: 4, background: 'var(--surface)', padding: 4,
    borderRadius: 12, boxShadow: 'var(--shadow-sm)', flexShrink: 0,
  },
  viewPill: {
    padding: '7px 14px', borderRadius: 9, fontSize: 14, fontWeight: 600,
    color: 'var(--text-2)', background: 'transparent',
  },
  viewPillActive: {
    background: 'var(--accent-blue)', color: 'white',
    boxShadow: '0 2px 6px rgba(60,126,195,0.35)',
  },
  filterChips: {
    display: 'flex', gap: 6, flexWrap: 'wrap',
  },
  chip: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
    borderRadius: 20, fontSize: 14, fontWeight: 600, color: 'var(--text-1)',
    background: 'var(--surface)', boxShadow: 'var(--shadow-sm)',
    // Holding the chip to solo it would otherwise trigger the browser's
    // native text-selection/callout instead of (or alongside) the gesture.
    userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
  },
  chipOff: {
    color: 'var(--text-3)', opacity: 0.6,
  },
  chipDot: {
    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
  },
  addEventBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 16px', borderRadius: 10, border: 'none',
    background: 'var(--accent-blue)', color: 'white', fontSize: 14, fontWeight: 600,
    cursor: 'pointer', flexShrink: 0, marginLeft: 'auto',
    boxShadow: '0 2px 8px rgba(60,126,195,0.35)',
  },
  calendarBody: {
    flex: 1, minHeight: 0,
  },
};
