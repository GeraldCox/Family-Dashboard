import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { useScreenSize } from '../hooks/useScreenSize';
import AddEventModal from './AddEventModal';
import Icon from './Icon';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 22;
// How long a legend item needs to be held before it solos that calendar —
// matches the same gesture on the Calendar page's filter chips.
const SOLO_HOLD_MS = 500;

function EventDetail({ events, date, onClose, onChanged }) {
  const [editingEvent, setEditingEvent] = useState(null);
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(ev) {
    setDeleting(true);
    try {
      await api.deleteGoogleEvent(ev.accountId, ev.calendarId, ev.googleEventId);
      setConfirmDeleteIdx(null);
      onChanged();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div style={modal.overlay} onClick={onClose}>
        <div style={modal.box} onClick={e => e.stopPropagation()}>
          <div style={modal.header}>
            <div style={modal.dateLabel}>
              {date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
            <button style={modal.close} onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
          </div>
          {events.length === 0 ? (
            <div style={modal.empty}>No events this day</div>
          ) : (
            <div style={modal.list}>
              {events.map((ev, i) => (
                <div key={i} style={{ ...modal.eventCard, borderLeft: `4px solid ${ev.color}` }}>
                  <div style={modal.eventCardTop}>
                    <div style={modal.eventInfo}>
                      <div style={modal.eventTitle}>{ev.title}</div>
                      {!ev.allDay && ev.start && (
                        <div style={modal.eventTime}>
                          {new Date(ev.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {ev.end ? ` – ${new Date(ev.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                        </div>
                      )}
                      {ev.allDay && <div style={modal.eventTime}>All day</div>}
                      {ev.location && <div style={modal.eventLocation}><Icon name="map-pin" size={13} /> {ev.location}</div>}
                      {ev.description && <div style={modal.eventDesc}>{ev.description}</div>}
                    </div>
                    <div style={{ ...modal.calBadge, background: ev.color + '22', color: ev.color }}>{ev.calendarName || ev.source}</div>
                  </div>

                  {!ev.editable && (
                    <div style={modal.readOnlyNote}>Synced from CalDAV — editing not available</div>
                  )}

                  {ev.editable && (
                    confirmDeleteIdx === i ? (
                      <div style={modal.confirmRow}>
                        <span style={modal.confirmText}>Delete this event? This cannot be undone.</span>
                        <button style={modal.confirmBtn} onClick={() => handleDelete(ev)} disabled={deleting}>
                          {deleting ? 'Deleting…' : 'Confirm'}
                        </button>
                        <button style={modal.cancelActionBtn} onClick={() => setConfirmDeleteIdx(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div style={modal.eventActions}>
                        <button style={modal.editBtn} onClick={() => setEditingEvent(ev)}><Icon name="pencil" size={15} /> Edit</button>
                        <button style={modal.deleteBtn} onClick={() => setConfirmDeleteIdx(i)}><Icon name="trash" size={15} /> Delete</button>
                      </div>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editingEvent && (
        <AddEventModal
          editEvent={editingEvent}
          onClose={() => setEditingEvent(null)}
          onCreated={() => onChanged()}
        />
      )}
    </>
  );
}

function toDateStr(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function dateToStr(d) {
  return toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(start, end) {
  return Math.round((new Date(end) - new Date(start)) / (1000*60*60*24));
}

function startOfWeek(d) {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  r.setHours(0,0,0,0);
  return r;
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function monthsInRange(start, end) {
  const months = [];
  let y = start.getFullYear(), m = start.getMonth();
  const endKey = end.getFullYear() * 12 + end.getMonth();
  while (y * 12 + m <= endKey) {
    months.push({ year: y, month: m });
    m++; if (m > 11) { m = 0; y++; }
  }
  return months;
}

function applyFilters(events, filters) {
  if (!filters) return events;
  return events.filter(ev => {
    // Merged multi-calendar events carry every source they came from; show
    // the event as long as at least one of those calendars is still enabled.
    const sources = ev.sources && ev.sources.length > 0 ? ev.sources : [ev.source];
    return sources.some(s => filters[s] !== false);
  });
}

// Solid tint for a normal single-calendar event — exactly what each call
// site used before, via its own `alpha` — or a diagonal multi-band tint
// when an event was merged from more than one calendar, as a visual cue
// that it's the same event on several calendars rather than a fully
// opaque block (which would lose the app's existing tinted-pill look this
// is meant to preserve for the single-calendar case).
function eventBackground(ev, alpha = '22') {
  const colors = ev.colors && ev.colors.length > 0 ? ev.colors : [ev.color];
  if (colors.length <= 1) return colors[0] + alpha;
  const step = 100 / colors.length;
  const stops = [];
  colors.forEach((c, i) => {
    stops.push(`${c}40 ${(i * step).toFixed(2)}%`);
    stops.push(`${c}40 ${((i + 1) * step).toFixed(2)}%`);
  });
  return `linear-gradient(135deg, ${stops.join(', ')})`;
}

export default function Calendar({ view = 'month', filters = {}, refreshToken, showLegend = false }) {
  const today = new Date();
  const [cur, setCur] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [anchor, setAnchor] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [localRefreshToken, setLocalRefreshToken] = useState(0);
  const [gridHeight, setGridHeight] = useState(0);
  const [legendItems, setLegendItems] = useState([]);
  // Independent of whatever `filters` this instance was handed — Home's
  // legend is its own self-contained filter control, deliberately not tied
  // to the Calendar page's chips (same reasoning as the view setting: Home
  // shouldn't change because of something toggled on the Calendar page, or
  // vice versa).
  const [legendFilters, setLegendFilters] = useState({});
  const legendHoldTimerRef = useRef(null);
  const legendSoloFiredRef = useRef(false);
  const gridWrapRef = useRef(null);
  const { isMobile } = useScreenSize();

  // Only fetched where there's no other way to tell calendars apart — Home
  // has no filter chips of its own, so it opts into this read-only color
  // key via showLegend. The dedicated Calendar page's chips already serve
  // this purpose, so it leaves showLegend off.
  useEffect(() => {
    if (!showLegend) return;
    api.calendarChips().then(res => setLegendItems(res.sources || [])).catch(console.error);
  }, [showLegend]);

  function toggleLegendFilter(id) {
    setLegendFilters(prev => ({ ...prev, [id]: prev[id] === false ? true : false }));
  }

  function soloLegendFilter(id) {
    setLegendFilters(prev => {
      const isOnlySelected = legendItems.every(item => (
        item.id === id ? prev[item.id] !== false : prev[item.id] === false
      ));
      if (isOnlySelected) return {};
      const next = {};
      legendItems.forEach(item => { next[item.id] = item.id === id; });
      return next;
    });
  }

  function handleLegendPressStart(id) {
    legendSoloFiredRef.current = false;
    clearTimeout(legendHoldTimerRef.current);
    legendHoldTimerRef.current = setTimeout(() => {
      legendSoloFiredRef.current = true;
      soloLegendFilter(id);
    }, SOLO_HOLD_MS);
  }

  function handleLegendPressEnd() {
    clearTimeout(legendHoldTimerRef.current);
  }

  function handleLegendClick(id) {
    if (legendSoloFiredRef.current) { legendSoloFiredRef.current = false; return; }
    toggleLegendFilter(id);
  }

  // Measure the actual available height for the month grid so row height fits
  // whatever chrome is above it (weather bar, controls that may wrap, header,
  // day-of-week row, legend) on any screen size — instead of a fixed guess.
  useEffect(() => {
    const el = gridWrapRef.current;
    if (!el) return;
    const update = () => setGridHeight(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  function refreshEvents() {
    setLocalRefreshToken(t => t + 1);
  }

  // Determine the visible date range for the active view
  let rangeStart, rangeEnd;
  if (view === 'day') {
    rangeStart = anchor; rangeEnd = anchor;
  } else if (view === 'week') {
    rangeStart = startOfWeek(anchor); rangeEnd = addDays(rangeStart, 6);
  } else if (view === '2week') {
    rangeStart = startOfWeek(anchor); rangeEnd = addDays(rangeStart, 13);
  } else {
    rangeStart = new Date(cur.year, cur.month, 1);
    rangeEnd = new Date(cur.year, cur.month + 1, 0);
  }

  useEffect(() => {
    setLoading(true);
    const months = monthsInRange(rangeStart, rangeEnd);
    Promise.all(months.map(({ year, month }) => api.events(year, month + 1)))
      .then(results => {
        setEvents(results.flatMap(r => r.events || []));
        setLoading(false);
      })
      .catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, cur.year, cur.month, anchor.getTime(), refreshToken, localRefreshToken]);

  const filteredEvents = applyFilters(events, showLegend ? legendFilters : filters);

  function changeMonth(dir) {
    setCur(c => {
      let m = c.month + dir, y = c.year;
      if (m < 0) { m = 11; y--; }
      if (m > 11) { m = 0; y++; }
      return { year: y, month: m };
    });
  }

  function changeAnchor(days) {
    setAnchor(a => addDays(a, days));
  }

  const firstDay = new Date(cur.year, cur.month, 1).getDay();
  const daysInMonth = new Date(cur.year, cur.month + 1, 0).getDate();
  const prevDays = new Date(cur.year, cur.month, 0).getDate();

  // Build flat cell list
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push({ day: prevDays - firstDay + i + 1, cur: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, cur: true });
  const remaining = 42 - cells.length;
  for (let i = 1; i <= remaining; i++) cells.push({ day: i, cur: false });

  // Separate multi-day and single-day events
  const multiDay = [];
  const singleDay = {};

  filteredEvents.forEach(ev => {
    if (!ev.start) return;
    const startStr = ev.start.split('T')[0];
    const endRaw = ev.end ? ev.end.split('T')[0] : startStr;
    // iCal all-day end is exclusive
    const endDate = new Date(endRaw);
    if (ev.allDay) endDate.setDate(endDate.getDate() - 1);
    const endStr = endDate.toISOString().split('T')[0];
    const span = daysBetween(startStr, endStr) + 1;

    if (ev.allDay && span > 1) {
      multiDay.push({ ...ev, startStr, endStr, span });
    } else {
      if (!singleDay[startStr]) singleDay[startStr] = [];
      singleDay[startStr].push(ev);
    }
  });

  // For each multi-day event, compute which cells it occupies
  function getMultiDayRows() {
    const rows = [];
    multiDay.forEach(ev => {
      // find start cell index
      const startIdx = cells.findIndex(c => {
        const ds = c.cur
          ? toDateStr(cur.year, cur.month, c.day)
          : null;
        return ds === ev.startStr;
      });
      if (startIdx === -1) return;

      const endIdx = cells.findIndex(c => {
        const ds = c.cur ? toDateStr(cur.year, cur.month, c.day) : null;
        return ds === ev.endStr;
      });
      const actualEnd = endIdx === -1 ? Math.min(startIdx + ev.span - 1, cells.length - 1) : endIdx;

      // Break into rows (weeks)
      let s = startIdx;
      while (s <= actualEnd) {
        const rowStart = Math.floor(s / 7) * 7;
        const rowEnd = rowStart + 6;
        const segEnd = Math.min(actualEnd, rowEnd);
        const colStart = s % 7;
        const colSpan = segEnd - s + 1;
        rows.push({ ev, colStart, colSpan, row: Math.floor(s / 7), startIdx: s, isStart: s === startIdx, isEnd: segEnd === actualEnd });
        s = rowEnd + 1;
      }
    });
    return rows;
  }

  const multiDayRows = view === 'month' ? getMultiDayRows() : [];

  // Group multi-day segments by row
  const multiByRow = {};
  multiDayRows.forEach(seg => {
    if (!multiByRow[seg.row]) multiByRow[seg.row] = [];
    multiByRow[seg.row].push(seg);
  });

  // Count multi-day slots per cell for offset
  const multiSlots = {}; // cellIdx -> slot number
  Object.values(multiByRow).forEach(segs => {
    segs.forEach((seg, i) => {
      for (let c = seg.colStart; c < seg.colStart + seg.colSpan; c++) {
        const ci = seg.row * 7 + c;
        if (!multiSlots[ci]) multiSlots[ci] = 0;
        multiSlots[ci] = Math.max(multiSlots[ci], i + 1);
      }
      seg.slotIndex = i;
    });
  });

  function eventsForDay(cellIdx, day, isCur) {
    if (!isCur) return [];
    const dateStr = toDateStr(cur.year, cur.month, day);
    return singleDay[dateStr] || [];
  }

  function allEventsForDay(day, isCur) {
    if (!isCur) return [];
    const dateStr = toDateStr(cur.year, cur.month, day);
    const single = singleDay[dateStr] || [];
    const multi = multiDay.filter(ev => {
      const d = new Date(dateStr);
      return d >= new Date(ev.startStr) && d <= new Date(ev.endStr);
    });
    return [...multi, ...single];
  }

  function eventsForDate(date) {
    const dateStr = dateToStr(date);
    return filteredEvents.filter(ev => {
      if (!ev.start) return false;
      const startStr = ev.start.split('T')[0];
      const endRaw = ev.end ? ev.end.split('T')[0] : startStr;
      const endDate = new Date(endRaw);
      if (ev.allDay) endDate.setDate(endDate.getDate() - 1);
      const endStr = endDate.toISOString().split('T')[0];
      return dateStr >= startStr && dateStr <= endStr;
    });
  }

  const numRows = cells.length / 7;
  // On desktop, size rows to the measured container so all weeks (5 or 6) fit
  // exactly; fall back to a rough estimate before the first measurement.
  const rowHeight = isMobile
    ? 55
    : Math.max(48, Math.floor((gridHeight || (window.innerHeight - 240)) / numRows));

  function headerTitle() {
    if (view === 'day') {
      return anchor.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    if (view === 'week' || view === '2week') {
      const end = view === 'week' ? addDays(rangeStart, 6) : addDays(rangeStart, 13);
      const sameMonth = rangeStart.getMonth() === end.getMonth();
      const startLabel = rangeStart.toLocaleDateString([], { month: 'short', day: 'numeric' });
      const endLabel = sameMonth
        ? `${end.getDate()}, ${end.getFullYear()}`
        : end.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      return `${startLabel} – ${endLabel}`;
    }
    return `${MONTHS[cur.month]} ${cur.year}`;
  }

  function handleNav(dir) {
    if (view === 'day') changeAnchor(dir);
    else if (view === 'week') changeAnchor(dir * 7);
    else if (view === '2week') changeAnchor(dir * 14);
    else changeMonth(dir);
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <button style={styles.navBtn} onClick={() => handleNav(-1)}>‹</button>
        <div style={{ ...styles.monthTitle, ...(isMobile ? styles.monthTitleMobile : {}) }}>
          {headerTitle()}
          {loading && <span style={styles.loading}> ⟳</span>}
        </div>
        <button style={styles.navBtn} onClick={() => handleNav(1)}>›</button>
      </div>

      {view === 'month' && (
        <>
          <div style={styles.dowRow}>
            {DAYS.map(d => <div key={d} style={styles.dow}>{d}</div>)}
          </div>

          <div ref={gridWrapRef} style={{ ...styles.gridWrap, position: 'relative', overflowY: 'auto' }}>
            {/* Day cells */}
            <div style={styles.grid}>
              {cells.map((cell, i) => {
                const isToday = cell.cur && cell.day === today.getDate() && cur.month === today.getMonth() && cur.year === today.getFullYear();
                const isSelected = selected === cell.day && cell.cur;
                const singleEvts = eventsForDay(i, cell.day, cell.cur);
                const slotCount = multiSlots[i] || 0;
                const topOffset = slotCount * 24 + 32;

                return (
                  <div
                    key={i}
                    style={{
                      ...styles.cell,
                      height: rowHeight,
                      ...(cell.cur ? {} : styles.otherMonth),
                      ...(isToday ? styles.todayCell : {}),
                      ...(isSelected ? styles.selectedCell : {}),
                    }}
                    onClick={() => cell.cur && setSelected(isSelected ? null : cell.day)}
                  >
                    <div style={{ ...styles.dayNum, ...(isToday ? styles.todayNum : {}) }}>{cell.day}</div>
                    {isMobile ? (
                      <div style={{ ...styles.dotsRow, marginTop: topOffset - 28 }}>
                        {singleEvts.slice(0, 6).map((ev, j) => (
                          <span key={j} style={{ ...styles.evDot, background: ev.color }} />
                        ))}
                        {singleEvts.length > 6 && <span style={styles.dotsMore}>+{singleEvts.length - 6}</span>}
                      </div>
                    ) : (
                      <div style={{ ...styles.pills, marginTop: topOffset - 28 }}>
                        {singleEvts.slice(0, Math.max(0, 3 - slotCount)).map((ev, j) => (
                          <div key={j} style={{ ...styles.pill, background: eventBackground(ev), color: ev.color, borderLeft: `4px solid ${ev.color}` }}>
                            {!ev.allDay && ev.start && ev.start.includes('T') && (
                              <span style={{ marginRight: 3, opacity: 0.8 }}>
                                {new Date(ev.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                            {ev.title}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Multi-day event overlays */}
            {Object.entries(multiByRow).map(([rowIdx, segs]) =>
              segs.map((seg, si) => {
                const top = parseInt(rowIdx) * rowHeight + 30 + seg.slotIndex * 24;
                const leftPct = (seg.colStart / 7) * 100;
                const widthPct = (seg.colSpan / 7) * 100;
                return (
                  <div
                    key={`${seg.ev.id}_${rowIdx}_${si}`}
                    style={{
                      position: 'absolute',
                      top,
                      left: `calc(${leftPct}% + ${seg.isStart ? 4 : 0}px)`,
                      width: `calc(${widthPct}% - ${seg.isStart ? 4 : 0}px - ${seg.isEnd ? 4 : 0}px)`,
                      height: 22,
                      background: eventBackground(seg.ev, '28'),
                      borderLeft: seg.isStart ? `3px solid ${seg.ev.color}` : 'none',
                      borderRight: seg.isEnd ? `1px solid ${seg.ev.color}44` : 'none',
                      borderRadius: seg.isStart && seg.isEnd ? 4 : seg.isStart ? '4px 0 0 4px' : seg.isEnd ? '0 4px 4px 0' : 0,
                      color: seg.ev.color,
                      fontSize: 13,
                      fontWeight: 600,
                      padding: '2px 6px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      cursor: 'pointer',
                      zIndex: 2,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    onClick={e => { e.stopPropagation(); setSelected(cells[parseInt(rowIdx) * 7 + seg.colStart].day); }}
                  >
                    {seg.isStart ? seg.ev.title : ''}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {view === 'day' && (
        <DayGrid date={anchor} events={eventsForDate(anchor)} onChanged={refreshEvents} />
      )}

      {(view === 'week' || view === '2week') && (
        <WeekGrid
          start={rangeStart}
          numDays={view === 'week' ? 7 : 14}
          eventsForDate={eventsForDate}
          today={today}
          onChanged={refreshEvents}
        />
      )}

      {selected && view === 'month' && (
        <EventDetail
          events={allEventsForDay(selected, true)}
          date={new Date(cur.year, cur.month, selected)}
          onClose={() => setSelected(null)}
          onChanged={refreshEvents}
        />
      )}

      {showLegend && legendItems.length > 0 && (
        <div style={{ ...styles.legend, ...(isMobile ? styles.legendMobile : {}) }}>
          {legendItems.map(item => {
            const enabled = legendFilters[item.id] !== false;
            return (
              <button
                key={item.id}
                style={{ ...styles.lgItem, ...(isMobile ? styles.lgItemMobile : {}), ...(enabled ? {} : styles.lgItemOff) }}
                onClick={() => handleLegendClick(item.id)}
                onTouchStart={() => handleLegendPressStart(item.id)}
                onTouchEnd={handleLegendPressEnd}
                onTouchCancel={handleLegendPressEnd}
                onMouseDown={() => handleLegendPressStart(item.id)}
                onMouseUp={handleLegendPressEnd}
                onMouseLeave={handleLegendPressEnd}
                title={`Tap to show/hide ${item.name} — hold to show only ${item.name}`}
              >
                <div style={{ ...styles.lgDot, background: item.color, opacity: enabled ? 1 : 0.35 }} />
                {item.name}
              </button>
            );
          })}
        </div>
      )}

    </div>
  );
}

function DayGrid({ date, events, onChanged }) {
  const [openDate, setOpenDate] = useState(null);
  const hours = [];
  for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) hours.push(h);
  const totalHours = DAY_END_HOUR - DAY_START_HOUR;

  const allDayEvents = events.filter(ev => ev.allDay);
  const timedEvents = events.filter(ev => !ev.allDay && ev.start && ev.start.includes('T'));

  function pctFor(iso) {
    const d = new Date(iso);
    const hrs = d.getHours() + d.getMinutes() / 60;
    return Math.min(100, Math.max(0, ((hrs - DAY_START_HOUR) / totalHours) * 100));
  }

  return (
    <div style={dayStyles.wrap}>
      {allDayEvents.length > 0 && (
        <div style={dayStyles.allDayRow}>
          {allDayEvents.map((ev, i) => (
            <div key={i} style={{ ...dayStyles.allDayPill, background: eventBackground(ev), color: ev.color, borderLeft: `3px solid ${ev.color}` }}>
              {ev.title}
            </div>
          ))}
        </div>
      )}
      <div style={dayStyles.gridScroll}>
        <div style={dayStyles.grid}>
          <div style={dayStyles.hourCol}>
            {hours.map(h => (
              <div key={h} style={dayStyles.hourLabel}>
                {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
              </div>
            ))}
          </div>
          <div style={dayStyles.eventsCol}>
            {hours.map(h => <div key={h} style={dayStyles.hourLine} />)}
            {timedEvents.map((ev, i) => {
              const top = pctFor(ev.start);
              const bottom = ev.end ? pctFor(ev.end) : Math.min(100, top + 8);
              const height = Math.max(3, bottom - top);
              return (
                <div
                  key={i}
                  style={{
                    ...dayStyles.eventBlock,
                    top: `${top}%`, height: `${height}%`,
                    background: eventBackground(ev, '26'), borderLeft: `3px solid ${ev.color}`, color: ev.color,
                  }}
                  onClick={() => setOpenDate(date)}
                >
                  <span style={dayStyles.eventTitle}>{ev.title}</span>
                  <span style={dayStyles.eventTime}>
                    {new Date(ev.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {openDate && (
        <EventDetail events={events} date={date} onClose={() => setOpenDate(null)} onChanged={onChanged} />
      )}
    </div>
  );
}

// Week view gives each row the full grid height; 2-Week splits that same
// height between two rows, so it only has about half as much room per day.
// One shared cap doesn't fit both — the 2-Week cap stays at its original,
// already-tuned value, and only the single-row Week view gets more.
const WEEK_VIEW_MAX_EVENTS = 9;
const TWO_WEEK_VIEW_MAX_EVENTS = 5;

function WeekGrid({ start, numDays, eventsForDate, today, onChanged }) {
  const [openDate, setOpenDate] = useState(null);
  const rows = numDays / 7;
  const maxVisible = rows === 1 ? WEEK_VIEW_MAX_EVENTS : TWO_WEEK_VIEW_MAX_EVENTS;
  const days = [];
  for (let i = 0; i < numDays; i++) days.push(addDays(start, i));

  return (
    <div style={weekStyles.wrap}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={weekStyles.row}>
          {days.slice(r * 7, r * 7 + 7).map((d, i) => {
            const isToday = dateToStr(d) === dateToStr(today);
            const dayEvents = eventsForDate(d);
            return (
              <div key={i} style={{ ...weekStyles.col, ...(isToday ? weekStyles.colToday : {}) }} onClick={() => setOpenDate(d)}>
                <div style={weekStyles.colHead}>
                  <div style={{ ...weekStyles.dow, ...(isToday ? weekStyles.dowToday : {}) }}>{DAYS[d.getDay()]}</div>
                  <div style={{ ...weekStyles.dayNum, ...(isToday ? weekStyles.dayNumToday : {}) }}>{d.getDate()}</div>
                </div>
                <div style={weekStyles.pills}>
                  {dayEvents.slice(0, maxVisible).map((ev, j) => (
                    <div key={j} style={{ ...weekStyles.pill, background: eventBackground(ev), color: ev.color, borderLeft: `3px solid ${ev.color}` }}>
                      {ev.title}
                    </div>
                  ))}
                  {dayEvents.length > maxVisible && (
                    <div style={{ ...weekStyles.more, ...(isToday ? weekStyles.moreToday : {}) }}>+{dayEvents.length - maxVisible} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {openDate && (
        <EventDetail events={eventsForDate(openDate)} date={openDate} onClose={() => setOpenDate(null)} onChanged={onChanged} />
      )}
    </div>
  );
}

const styles = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '0.5px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px', borderBottom: '0.5px solid var(--border)', flexShrink: 0 },
  monthTitle: { fontSize: 21, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-heading)' },
  monthTitleMobile: { fontSize: 16 },
  loading: { fontSize: 16, color: 'var(--text-3)' },
  navBtn: { width: 42, height: 42, borderRadius: 'var(--radius-sm)', background: 'var(--bg)', fontSize: 24, color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '0.5px solid var(--border)', cursor: 'pointer' },
  dowRow: { display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', padding: '0 0', flexShrink: 0 },
  dow: { textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text-3)', padding: '6px 0', letterSpacing: '0.06em', borderBottom: '0.5px solid var(--border)' },
  gridWrap: { flex: 1, minHeight: 0, overflow: 'hidden' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', height: '100%' },
  cell: { padding: '4px 4px 2px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.12s', overflow: 'hidden', position: 'relative' },
  otherMonth: { background: 'var(--surface2)', opacity: 0.5 },
  todayCell: { background: 'var(--accent)' },
  selectedCell: { background: 'rgba(60,126,195,0.15)', outline: '2px solid var(--accent-blue)', outlineOffset: -2 },
  dayNum: { fontSize: 14, fontWeight: 500, color: 'var(--text-2)', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', marginBottom: 2 },
  // Solid white + a fixed dark ink (not a theme variable) so the number stays
  // legible regardless of how bright/dark --accent is in either theme.
  todayNum: { background: 'white', color: '#0a1620', fontWeight: 700 },
  pills: { display: 'flex', flexDirection: 'column', gap: 2 },
  pill: { fontSize: 13, padding: '3px 6px', borderRadius: 4, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 2 },
  dotsRow: { display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' },
  evDot: { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
  dotsMore: { fontSize: 9, color: 'var(--text-3)', fontWeight: 600 },
  legend: { display: 'flex', gap: 14, padding: '8px 16px', borderTop: '0.5px solid var(--border)', flexWrap: 'wrap', flexShrink: 0 },
  legendMobile: { flexWrap: 'nowrap', overflowX: 'auto', gap: 10, padding: '6px 12px' },
  lgItem: {
    display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-2)', fontWeight: 500,
    border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
    // Holding an item to solo it would otherwise trigger the browser's
    // native text-selection/callout instead of (or alongside) the gesture.
    userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
  },
  lgItemOff: { color: 'var(--text-3)', opacity: 0.6 },
  lgItemMobile: { flexShrink: 0, whiteSpace: 'nowrap' },
  lgDot: { width: 9, height: 9, borderRadius: '50%' },
};

const dayStyles = {
  wrap: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  allDayRow: { display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 16px', borderBottom: '0.5px solid var(--border)' },
  allDayPill: { fontSize: 14, fontWeight: 600, padding: '4px 10px', borderRadius: 6 },
  gridScroll: { flex: 1, overflowY: 'auto' },
  grid: { display: 'flex', position: 'relative', minHeight: '100%' },
  hourCol: { width: 64, flexShrink: 0 },
  hourLabel: { height: 48, fontSize: 13, color: 'var(--text-3)', textAlign: 'right', paddingRight: 10, paddingTop: 2, fontWeight: 500 },
  eventsCol: { flex: 1, position: 'relative', borderLeft: '1px solid var(--border)' },
  hourLine: { height: 48, borderBottom: '1px solid var(--border)' },
  eventBlock: {
    position: 'absolute', left: 8, right: 8, borderRadius: 6, padding: '4px 8px',
    fontSize: 14, fontWeight: 600, overflow: 'hidden', cursor: 'pointer', display: 'flex',
    flexDirection: 'column', gap: 2, boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
  },
  eventTitle: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  eventTime: { fontSize: 12, opacity: 0.8, fontWeight: 500 },
};

const weekStyles = {
  wrap: { flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', gap: 1 },
  row: { display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', flex: 1, minHeight: 160 },
  col: {
    borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
    padding: '8px 6px', cursor: 'pointer', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 6,
  },
  // A flat var(--accent) wash was too saturated at this size (a whole day
  // column, not a small badge) — it fought with the event pills' own tinted
  // backgrounds and hurt text contrast. Mixing a small amount of accent into
  // the surface color keeps the "this is today" cue without drowning out
  // whatever's inside the column.
  colToday: { background: 'color-mix(in srgb, var(--accent) 22%, var(--surface))' },
  colHead: { display: 'flex', alignItems: 'center', gap: 6 },
  dow: { fontSize: 12, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.05em' },
  dowToday: { color: 'var(--text-1)' },
  dayNum: { fontSize: 15, fontWeight: 600, color: 'var(--text-1)', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' },
  dayNumToday: { background: 'var(--accent)', color: 'white' },
  pills: { display: 'flex', flexDirection: 'column', gap: 3 },
  pill: {
    fontSize: 11, fontWeight: 500, padding: '3px 6px', borderRadius: 4, lineHeight: 1.3,
    whiteSpace: 'normal', overflow: 'hidden', textOverflow: 'ellipsis',
    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
  },
  more: { fontSize: 12, color: 'var(--text-3)', fontWeight: 600 },
  moreToday: { color: 'white' },
};

const modal = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  box: { background: 'var(--surface)', borderRadius: 'var(--radius-xl)', width: 480, maxHeight: '70vh', overflow: 'auto', boxShadow: 'var(--shadow-md)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '0.5px solid var(--border)' },
  dateLabel: { fontSize: 18, fontWeight: 600, color: 'var(--text-1)' },
  close: { width: 34, height: 34, borderRadius: 'var(--radius-sm)', background: 'var(--bg)', color: 'var(--text-2)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '0.5px solid var(--border)' },
  empty: { padding: '32px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 16 },
  list: { padding: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  eventCard: { display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg)' },
  eventCardTop: { display: 'flex', alignItems: 'flex-start', gap: 12 },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: 17, fontWeight: 600, color: 'var(--text-1)', marginBottom: 3 },
  eventTime: { fontSize: 15, color: 'var(--text-2)' },
  eventLocation: { fontSize: 14, color: 'var(--text-3)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 },
  eventDesc: { fontSize: 14, color: 'var(--text-2)', marginTop: 5, lineHeight: 1.5 },
  calBadge: { fontSize: 13, padding: '3px 8px', borderRadius: 20, fontWeight: 600, textTransform: 'capitalize', alignSelf: 'flex-start' },
  readOnlyNote: { fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' },
  eventActions: { display: 'flex', gap: 8 },
  editBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 12px', borderRadius: 8, border: '0.5px solid var(--border-md)',
    background: 'var(--surface)', color: 'var(--text-1)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  deleteBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 12px', borderRadius: 8, border: '0.5px solid var(--border-md)',
    background: 'var(--surface)', color: '#dc2626', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  confirmRow: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  confirmText: { fontSize: 13, color: 'var(--text-2)', flex: '1 1 100%' },
  confirmBtn: {
    padding: '6px 12px', borderRadius: 8, border: 'none',
    background: '#dc2626', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  cancelActionBtn: {
    padding: '6px 12px', borderRadius: 8, border: '0.5px solid var(--border-md)',
    background: 'var(--surface)', color: 'var(--text-2)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
};
