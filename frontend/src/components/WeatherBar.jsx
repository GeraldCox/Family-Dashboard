import { useEffect, useState } from 'react';
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

      {!isMobile && (
        <div style={styles.forecast}>
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
      )}

      <div style={{ ...styles.current, ...(isMobile ? styles.currentMobile : {}) }}>
        <Icon name={w.icon} size={isMobile ? 34 : 42} style={{ color: w.tint }} />
        <div>
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
  current: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flexShrink: 0 },
  currentMobile: { minWidth: 0, gap: 10 },
  temp: { fontSize: 28, fontWeight: 600, lineHeight: 1, color: 'var(--text-1)', fontFamily: 'var(--font-heading)' },
  desc: { fontSize: 14, color: 'var(--text-2)', marginTop: 2, whiteSpace: 'nowrap' },
  meta: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 13, color: 'var(--text-2)', marginLeft: 6 },
  metaItem: { display: 'flex', alignItems: 'center', gap: 5 },
  forecast: { display: 'flex', gap: 8, flexShrink: 0, justifyContent: 'center' },
  fcDay: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    padding: '8px 16px', borderRadius: 'var(--radius-md)',
    background: 'var(--bg)', minWidth: 78,
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
