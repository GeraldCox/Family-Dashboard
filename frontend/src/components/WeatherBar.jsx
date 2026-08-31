import { useEffect, useState, useRef } from 'react';
import { api } from '../api';
import { useScreenSize } from '../hooks/useScreenSize';
import CountdownWidget from './CountdownWidget';
import ReminderPopup from './ReminderPopup';
import Icon from './Icon';

const WMO = {
  0:  { label: 'Clear',         icon: 'sun',             tint: '#f59e0b' },
  1:  { label: 'Mostly clear',  icon: 'cloud-sun',       tint: '#f59e0b' },
  2:  { label: 'Partly cloudy', icon: 'cloud-sun',       tint: '#64a8d8' },
  3:  { label: 'Overcast',      icon: 'cloud',           tint: '#8aa2ad' },
  45: { label: 'Foggy',         icon: 'cloud-fog',       tint: '#8aa2ad' },
  48: { label: 'Foggy',         icon: 'cloud-fog',       tint: '#8aa2ad' },
  51: { label: 'Drizzle',       icon: 'cloud-drizzle',   tint: '#5a9fd4' },
  61: { label: 'Rain',          icon: 'cloud-rain',      tint: '#3c7ec3' },
  71: { label: 'Snow',          icon: 'snowflake',       tint: '#7fc4e8' },
  80: { label: 'Showers',       icon: 'cloud-drizzle',   tint: '#5a9fd4' },
  95: { label: 'Thunderstorm',  icon: 'cloud-lightning', tint: '#7c6fd4' },
};

function wmo(code) {
  return WMO[code] || WMO[Math.floor(code / 10) * 10] || { label: 'Unknown', icon: 'thermometer', tint: 'var(--text-2)' };
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Same scroll+fade pattern as CountdownWidget: touch-scrollable, with edge
// fades that only show when there's actually more to scroll to.
function ForecastStrip({ daily }) {
  const scrollRef = useRef(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

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
  }, []);

  return (
    <div style={styles.forecastWrap}>
      <div ref={scrollRef} style={styles.forecast} className="no-scrollbar">
        {daily.time.slice(1, 6).map((date, i) => {
          const d = new Date(date);
          const fw = wmo(daily.weathercode[i + 1]);
          return (
            <div key={date} style={styles.fcDay}>
              <div style={styles.fcDow}>{DAYS[d.getDay()]}</div>
              <Icon name={fw.icon} size={24} style={{ color: fw.tint, margin: '3px 0' }} />
              <div style={styles.fcTemps}>
                <span style={{ color: 'var(--text-1)', fontWeight: 500 }}>{Math.round(daily.temperature_2m_max[i + 1])}°</span>
                <span style={{ color: 'var(--text-3)' }}>{Math.round(daily.temperature_2m_min[i + 1])}°</span>
              </div>
            </div>
          );
        })}
      </div>
      {canScroll.left && <div style={{ ...styles.fade, ...styles.fadeLeft }} />}
      {canScroll.right && <div style={{ ...styles.fade, ...styles.fadeRight }} />}
    </div>
  );
}

export default function WeatherBar() {
  const [weather, setWeather] = useState(null);
  const { isMobile } = useScreenSize();

  useEffect(() => {
    api.weather().then(setWeather).catch(console.error);
    const t = setInterval(() => api.weather().then(setWeather).catch(console.error), 10 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  if (!weather) return (
    <div style={styles.bar}>
      <span style={{ color: 'var(--text-3)', fontSize: 16 }}>Loading weather…</span>
    </div>
  );

  const cur = weather.current;
  const daily = weather.daily;
  const w = wmo(cur.weathercode);
  const now = new Date();

  return (
    <div style={{ ...styles.bar, ...(isMobile ? styles.barMobile : {}) }}>
      {!isMobile && <CountdownWidget />}
      {!isMobile && <div style={styles.spacer} />}

      <div style={{ ...styles.current, ...(isMobile ? styles.currentMobile : {}) }}>
        <Icon name={w.icon} size={isMobile ? 34 : 42} style={{ color: w.tint }} />
        <div style={styles.tempCol}>
          <div style={styles.temp}>{Math.round(cur.temperature_2m)}°F</div>
          <div style={styles.desc}>{w.label}{weather.location ? ` · ${weather.location}` : ''}</div>
        </div>
        {!isMobile && (
          <div style={styles.meta}>
            <span style={styles.metaItem}><Icon name="droplet" size={15} style={{ color: '#5a9fd4' }} /> {cur.relative_humidity_2m}%</span>
            <span style={styles.metaItem}><Icon name="wind" size={15} style={{ color: 'var(--text-3)' }} /> {Math.round(cur.windspeed_10m)} mph</span>
          </div>
        )}
      </div>

      {!isMobile && <ForecastStrip daily={daily} />}

      <div style={styles.clockWrap}>
        <div style={{ ...styles.clock, ...(isMobile ? styles.clockMobile : {}) }}>
          {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          <div style={styles.date}>{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        </div>
        <ReminderPopup />
      </div>
    </div>
  );
}

const styles = {
  bar: {
    display: 'flex', alignItems: 'center', gap: 18,
    background: 'var(--surface)', borderBottom: '0.5px solid var(--border)',
    padding: '14px 22px', flexShrink: 0,
    boxShadow: 'var(--shadow-sm)',
  },
  barMobile: {
    gap: 10, padding: '8px 12px', justifyContent: 'space-between',
  },
  // Absorbs the banner's leftover space so weather/forecast/clock sit as a
  // tight group on the right, instead of the countdown strip stretching.
  spacer: { flex: 1, minWidth: 0 },
  // Shrinkable too (after forecast has already given up all its room) so
  // the clock still can't be pushed off-screen on extremely narrow
  // displays — humidity/wind and the location text clip first via
  // overflow:hidden, before the icon+temperature would ever be touched.
  current: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 140, flexShrink: 1, overflow: 'hidden' },
  currentMobile: { minWidth: 0, gap: 10 },
  // Icon (flexShrink:0 built into Icon.jsx) and this column never shrink —
  // meta below is the first thing to clip away when .current is squeezed.
  tempCol: { flexShrink: 0, minWidth: 0 },
  temp: { fontSize: 28, fontWeight: 600, lineHeight: 1, color: 'var(--text-1)', fontFamily: 'var(--font-heading)' },
  desc: {
    fontSize: 14, color: 'var(--text-2)', marginTop: 2,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220,
  },
  meta: {
    display: 'flex', flexDirection: 'column', gap: 3, fontSize: 13, color: 'var(--text-2)', marginLeft: 6,
    flexShrink: 1, minWidth: 0, overflow: 'hidden',
  },
  metaItem: { display: 'flex', alignItems: 'center', gap: 5 },
  // Shrinkable (unlike current/clock) — the least-essential info, so it's
  // first to give up room when the banner is tight. Scrolls with a fade
  // rather than hard-clipping, same as the countdown strip.
  forecastWrap: { position: 'relative', flexShrink: 1, minWidth: 0, height: '100%' },
  forecast: {
    display: 'flex', alignItems: 'center', gap: 8, height: '100%',
    overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
  },
  fade: { position: 'absolute', top: 0, bottom: 0, width: 28, pointerEvents: 'none' },
  fadeLeft: { left: 0, background: 'linear-gradient(to right, var(--surface), transparent)' },
  fadeRight: { right: 0, background: 'linear-gradient(to left, var(--surface), transparent)' },
  fcDay: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    padding: '8px 16px', borderRadius: 'var(--radius-md)',
    background: 'var(--bg)', minWidth: 78, flexShrink: 0,
    border: '1px solid var(--border)',
  },
  fcDow: { fontSize: 12, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' },
  fcTemps: { display: 'flex', gap: 6, fontSize: 15 },
  clockWrap: { position: 'relative', flexShrink: 0 },
  clock: {
    fontSize: 28, fontWeight: 600, color: 'var(--text-1)',
    textAlign: 'right', minWidth: 182, fontFamily: 'var(--font-heading)',
  },
  clockMobile: {
    fontSize: 17, minWidth: 0,
  },
  date: { fontSize: 14, fontWeight: 400, color: 'var(--text-2)', marginTop: 2 },
};
