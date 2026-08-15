import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';

const CHECK_INTERVAL_MS = 60 * 1000;
const OVERRIDE_KEY = 'themeOverride';
const OVERRIDE_EVENT = 'themeOverridechange';

function getOverride() {
  try {
    const value = localStorage.getItem(OVERRIDE_KEY);
    return value === 'light' || value === 'dark' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

function computeIsDark(sunTimes) {
  const override = getOverride();
  const now = new Date();
  const sunrise = sunTimes ? new Date(sunTimes.sunrise) : null;
  const sunset = sunTimes ? new Date(sunTimes.sunset) : null;

  let isDark;
  if (override === 'light') isDark = false;
  else if (override === 'dark') isDark = true;
  else if (!sunTimes) isDark = false;
  else isDark = now >= sunset || now < sunrise;

  console.log('[useDayNight] check', { override, sunrise, sunset, now, isDark });

  return isDark;
}

export function useDayNight() {
  const [sunTimes, setSunTimes] = useState(null);
  const [isDark, setIsDark] = useState(() => computeIsDark(null));
  const lastFetchDateRef = useRef(null);

  const fetchSunTimes = useCallback(() => {
    lastFetchDateRef.current = new Date().toDateString();
    api.weather().then(data => {
      const sunrise = data?.daily?.sunrise?.[0];
      const sunset = data?.daily?.sunset?.[0];
      if (sunrise && sunset) setSunTimes({ sunrise, sunset });
    }).catch(console.error);
  }, []);

  const refetchIfNewDay = useCallback(() => {
    const today = new Date().toDateString();
    if (lastFetchDateRef.current !== today) {
      fetchSunTimes();
    }
  }, [fetchSunTimes]);

  useEffect(() => {
    fetchSunTimes();
  }, [fetchSunTimes]);

  useEffect(() => {
    setIsDark(computeIsDark(sunTimes));

    const id = setInterval(() => {
      // Checking the calendar date here (rather than trusting a 24h timer)
      // means a new day's sunrise/sunset gets fetched even if this tab/tablet
      // was asleep and missed ticks.
      refetchIfNewDay();
      setIsDark(computeIsDark(sunTimes));
    }, CHECK_INTERVAL_MS);

    function onVisible() {
      if (document.visibilityState === 'visible') {
        refetchIfNewDay();
        setIsDark(computeIsDark(sunTimes));
      }
    }
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sunTimes, refetchIfNewDay]);

  useEffect(() => {
    function recheck() { setIsDark(computeIsDark(sunTimes)); }
    window.addEventListener('storage', recheck);
    window.addEventListener(OVERRIDE_EVENT, recheck);
    return () => {
      window.removeEventListener('storage', recheck);
      window.removeEventListener(OVERRIDE_EVENT, recheck);
    };
  }, [sunTimes]);

  return { isDark };
}
