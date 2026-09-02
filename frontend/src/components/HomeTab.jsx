import { useState, useEffect, useRef, useCallback } from 'react';
import Calendar from './Calendar';
import Routines from './Routines';
import Tasks from './Tasks';
import Chores from './Chores';
import { useScreenSize } from '../hooks/useScreenSize';

const PANELS = ['chores', 'routines', 'tasks'];
const TITLES = { routines: 'Routines', tasks: 'Tasks', chores: 'Chores' };
// Routines has no standalone sidebar page to jump to, so only these two
// panel titles act as links.
const PANEL_NAV_TARGET = { chores: 'chores', tasks: 'tasks' };
const SWIPE_THRESHOLD = 40;

const PANEL_WIDTH_KEY = 'homeTab.panelWidth';
const DEFAULT_PANEL_WIDTH = 360;
const MIN_PANEL_WIDTH = 220;
const MAX_PANEL_WIDTH = 500;

function loadPanelWidth() {
  const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY));
  if (saved && saved >= MIN_PANEL_WIDTH && saved <= MAX_PANEL_WIDTH) return saved;
  return DEFAULT_PANEL_WIDTH;
}

export default function HomeTab({ view, filters, onNavigate, hiddenPanels = [], navLabels = {} }) {
  const [panelIndex, setPanelIndex] = useState(0);
  const [panelWidth, setPanelWidth] = useState(loadPanelWidth);
  const touchStartX = useRef(null);
  const wrapRef = useRef(null);
  const isDraggingRef = useRef(false);
  const { isMobile } = useScreenSize();

  const visiblePanels = PANELS.filter(p => !hiddenPanels.includes(p));
  // Clamped rather than stored — if a panel toward the end gets hidden while
  // it's the active one, this just falls back to the new last panel instead
  // of pointing past the end of the (now shorter) list.
  const activeIndex = Math.min(panelIndex, Math.max(0, visiblePanels.length - 1));
  const activePanel = visiblePanels[activeIndex];
  // Chores/Tasks have a sidebar entry that can be relabeled from Manage →
  // General; Routines has no sidebar entry of its own, so it always shows
  // the default title.
  const activeTitle = navLabels[activePanel] || TITLES[activePanel];

  function go(dir) {
    setPanelIndex(i => Math.min(visiblePanels.length - 1, Math.max(0, i + dir)));
  }

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx <= -SWIPE_THRESHOLD) go(1);
    else if (dx >= SWIPE_THRESHOLD) go(-1);
    touchStartX.current = null;
  }

  const updateWidthFromClientX = useCallback((clientX) => {
    if (!wrapRef.current) return;
    const wrapRight = wrapRef.current.getBoundingClientRect().right;
    const next = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, wrapRight - clientX));
    setPanelWidth(next);
  }, []);

  const stopDrag = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    setPanelWidth(w => {
      localStorage.setItem(PANEL_WIDTH_KEY, String(w));
      return w;
    });
  }, []);

  const startDrag = useCallback(() => {
    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  function handleDividerMouseDown(e) {
    e.preventDefault();
    startDrag();
  }
  function handleDividerTouchStart() {
    startDrag();
  }

  useEffect(() => {
    function onMouseMove(e) {
      if (isDraggingRef.current) updateWidthFromClientX(e.clientX);
    }
    function onMouseUp() {
      stopDrag();
    }
    function onTouchMove(e) {
      if (isDraggingRef.current && e.touches.length) {
        e.preventDefault();
        updateWidthFromClientX(e.touches[0].clientX);
      }
    }
    function onTouchEnd() {
      stopDrag();
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [updateWidthFromClientX, stopDrag]);

  return (
    <div style={s.outer}>
      <div
        ref={wrapRef}
        style={{
          ...s.wrap,
          ...(isMobile ? s.wrapMobile : { gridTemplateColumns: `1fr 8px ${panelWidth}px` }),
        }}
      >
        <div style={s.calSide}>
          <Calendar view={view} filters={filters} showLegend />
        </div>

        {!isMobile && (
          <div
            style={s.divider}
            onMouseDown={handleDividerMouseDown}
            onTouchStart={handleDividerTouchStart}
          >
            <div style={s.dividerGrip}>
              <span style={s.dividerDot} />
              <span style={s.dividerDot} />
              <span style={s.dividerDot} />
            </div>
          </div>
        )}

        <div style={s.panelSide}>
          <div style={s.panelHeader}>
            <button style={s.arrowBtn} onClick={() => go(-1)} disabled={activeIndex === 0}>‹</button>
            {(() => {
              const navTarget = PANEL_NAV_TARGET[activePanel];
              return (
                <div
                  style={{ ...s.panelTitle, ...(navTarget ? s.panelTitleLink : {}) }}
                  onClick={navTarget ? () => onNavigate?.(navTarget) : undefined}
                  title={navTarget ? `Open ${activeTitle}` : undefined}
                >
                  {activeTitle}
                </div>
              );
            })()}
            <button style={s.arrowBtn} onClick={() => go(1)} disabled={activeIndex === visiblePanels.length - 1}>›</button>
          </div>

          <div
            style={s.panelBody}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {activePanel === 'routines' && <Routines />}
            {activePanel === 'tasks' && <Tasks compact />}
            {activePanel === 'chores' && <Chores compact />}
          </div>

          <div style={s.dots}>
            {visiblePanels.map((p, i) => (
              <span
                key={p}
                style={{ ...s.dot, ...(i === activeIndex ? s.dotActive : {}) }}
                onClick={() => setPanelIndex(i)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  outer: {
    display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden',
  },
  wrap: {
    display: 'grid', gridTemplateColumns: `1fr 8px ${DEFAULT_PANEL_WIDTH}px`, flex: 1, minHeight: 0,
    padding: 13,
  },
  wrapMobile: {
    gridTemplateColumns: '1fr', gridTemplateRows: '1fr 360px',
    gap: 9, padding: 7,
  },
  calSide: { overflow: 'hidden', minHeight: 0 },
  // Visible grip stays the actual 8px grid column width, but the div's own
  // hit area (where onMouseDown/onTouchStart fire) is widened with negative
  // margins bleeding into the calendar/panel on each side — much easier to
  // land a finger on without making the divider itself look any bigger.
  divider: {
    position: 'relative', zIndex: 2,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16,
    boxSizing: 'content-box',
    cursor: 'col-resize', touchAction: 'none',
  },
  dividerGrip: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
    width: 4, padding: '10px 0', borderRadius: 3,
  },
  dividerDot: {
    width: 3, height: 3, borderRadius: '50%', background: 'var(--border-md)',
  },
  panelSide: {
    background: 'var(--surface)', borderRadius: 'var(--radius-xl)',
    overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
    display: 'flex', flexDirection: 'column',
  },
  panelHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px', borderBottom: '0.5px solid var(--border)', flexShrink: 0,
  },
  panelTitle: { fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-heading)' },
  panelTitleLink: { cursor: 'pointer' },
  arrowBtn: {
    width: 32, height: 32, borderRadius: 8, background: 'var(--bg)',
    border: '0.5px solid var(--border)', color: 'var(--text-2)', fontSize: 18,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  panelBody: { flex: 1, overflow: 'hidden', touchAction: 'pan-y' },
  dots: {
    display: 'flex', justifyContent: 'center', gap: 6,
    padding: '10px 0', flexShrink: 0,
  },
  dot: {
    width: 6, height: 6, borderRadius: '50%', background: 'var(--border-md)', cursor: 'pointer',
  },
  dotActive: { background: 'var(--blue)', width: 16, borderRadius: 4 },
};
