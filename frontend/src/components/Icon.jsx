// Lightweight inline-SVG icon set (Lucide-derived, ISC-licensed paths).
// Zero dependencies — every glyph inherits the current text color via
// `currentColor`, so icons pick up theme tokens automatically. Stroke icons
// use a shared 2px stroke; a few filled glyphs (star) are handled explicitly.

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

// Each entry is the inner markup of a 24x24 viewBox icon.
const PATHS = {
  // ── Navigation ────────────────────────────────────────────────
  home: <><path d="M3 9.5 12 3l9 6.5" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></>,
  calendar: <><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></>,
  'check-square': <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="m8 12 3 3 5-6" /></>,
  'clipboard-list': <><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" /><path d="M8.5 11h.01M8.5 15h.01M12 11h4M12 15h4" /></>,
  utensils: <><path d="M4 3v7a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3M6 12v9M18 3c-1.5 0-3 1.5-3 4v5h3V3z" /></>,
  'shopping-cart': <><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h2l2.4 12.4a1.5 1.5 0 0 0 1.5 1.2h9.1a1.5 1.5 0 0 0 1.5-1.2L20 7H5.2" /></>,
  dumbbell: <><path d="M6.5 6.5 17.5 17.5M3 8v8M6 5v14M18 5v14M21 8v8" /></>,
  'graduation-cap': <><path d="M22 9 12 5 2 9l10 4 10-4z" /><path d="M6 11v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5" /></>,
  timer: <><path d="M9 2h6M12 9v5l3 2" /><circle cx="12" cy="14" r="8" /></>,
  pencil: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,

  // ── Actions / chrome ──────────────────────────────────────────
  x: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="m5 13 4 4 10-11" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  link: <><path d="M9 15 15 9" /><path d="M10.5 6.5 12 5a4 4 0 0 1 6 6l-1.5 1.5" /><path d="M13.5 17.5 12 19a4 4 0 0 1-6-6l1.5-1.5" /></>,
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
  'chevron-left': <path d="m15 6-6 6 6 6" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
  'alert-triangle': <><path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6A2 2 0 0 0 22 18L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  camera: <><path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.5" /></>,
  upload: <><path d="M12 15V3M8 7l4-4 4 4" /><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></>,
  'rotate-ccw': <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
  pause: <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>,
  play: <path d="M7 4.5v15l13-7.5z" />,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 5.5a3.2 3.2 0 0 1 0 6M17.5 14c2.6.4 4.5 2.4 4.5 6" /></>,
  'map-pin': <><path d="M12 21s7-6.3 7-12a7 7 0 0 0-14 0c0 5.7 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></>,
  gift: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v8h14v-8M12 8v12" /><path d="M12 8S10.5 3 8 4.5 9 8 12 8zM12 8s1.5-5 4-3.5S15 8 12 8z" /></>,

  // ── Weather ───────────────────────────────────────────────────
  sun: <><circle cx="12" cy="12" r="4.5" /><path d="M12 1.5v2.5M12 20v2.5M3.5 12H1M23 12h-2.5M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19" /></>,
  'cloud-sun': <><path d="M7 6a4 4 0 0 1 7.3 1.5" /><path d="M4 5.5 5 6.5M9.5 2v1.5M2 9h1.5M14.5 6 15.5 5" /><path d="M17.5 12a3.5 3.5 0 0 0-3.4-3.5A5 5 0 0 0 4.6 12" /><path d="M6 16.5A3.5 3.5 0 0 1 6 9.5h10.5a3.5 3.5 0 0 1 0 7z" /></>,
  cloud: <path d="M6.5 18A4.5 4.5 0 0 1 6.5 9a6 6 0 0 1 11.6 1.5A3.75 3.75 0 0 1 17.5 18z" />,
  'cloud-fog': <><path d="M6.5 14A4.5 4.5 0 0 1 6.5 5a6 6 0 0 1 11.6 1.5A3.75 3.75 0 0 1 17.5 14z" /><path d="M4 18h10M8 22h10" /></>,
  'cloud-drizzle': <><path d="M6.5 13A4.5 4.5 0 0 1 6.5 4a6 6 0 0 1 11.6 1.5A3.75 3.75 0 0 1 17.5 13z" /><path d="M8 17v1.5M8 21v1M12 17v1.5M12 21v1M16 17v1.5M16 21v1" /></>,
  'cloud-rain': <><path d="M6.5 13A4.5 4.5 0 0 1 6.5 4a6 6 0 0 1 11.6 1.5A3.75 3.75 0 0 1 17.5 13z" /><path d="M8 16.5 7 21M12 16.5 11 21M16 16.5 15 21" /></>,
  snowflake: <><path d="M12 2v20M4 6l16 12M20 6 4 18" /><path d="M12 6l-2.5-2M12 6l2.5-2M12 18l-2.5 2M12 18l2.5 2M6 8.5 4 8m2 .5.5-2M18 15.5l2 .5m-2-.5-.5 2M6 15.5l-2 .5m2-.5.5 2M18 8.5l2-.5m-2 .5-.5-2" /></>,
  'cloud-lightning': <><path d="M6.5 13A4.5 4.5 0 0 1 6.5 4a6 6 0 0 1 11.6 1.5A3.75 3.75 0 0 1 17.5 13z" /><path d="M12 12l-2.5 5H12l-1 4 3.5-6H12z" /></>,
  thermometer: <><path d="M12 4a2.5 2.5 0 0 1 2.5 2.5V14a4 4 0 1 1-5 0V6.5A2.5 2.5 0 0 1 12 4z" /></>,
  droplet: <path d="M12 3s6 6.4 6 10.5A6 6 0 0 1 6 13.5C6 9.4 12 3 12 3z" />,
  wind: <><path d="M3 8h11a2.5 2.5 0 1 0-2.5-2.5" /><path d="M3 16h13a2.5 2.5 0 1 1-2.5 2.5" /><path d="M3 12h7a2 2 0 1 0-2-2" /></>,

  // ── Schedule activities ───────────────────────────────────────
  sunrise: <><path d="M12 3v5M5 12H2M22 12h-3M5.5 6 7 7.5M18.5 6 17 7.5" /><path d="M4 17h16M2 21h20" /><path d="M8 12a4 4 0 0 1 8 0" /></>,
  coffee: <><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" /><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 2c0 1-.5 1.5-.5 2.5M12 2c0 1-.5 1.5-.5 2.5" /></>,
  sandwich: <><path d="M3 9h18l-2-3H5zM3 15h18M5 15l1 3h12l1-3" /><path d="M3 9v3.5a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" /></>,
  footprints: <><path d="M5 4a2 2 0 0 1 4 0c0 2-1 3-1 5H6c0-2-1-3-1-5zM6 13h2c1 0 1 4-1 4s-1-2-1-4zM15 8a2 2 0 0 1 4 0c0 2-1 3-1 5h-2c0-2-1-3-1-5zM16 17h2c1 0 1 4-1 4s-1-2-1-4z" /></>,
  backpack: <><path d="M6 20V9a5 5 0 0 1 12 0v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z" /><path d="M9 7V5a3 3 0 0 1 6 0v2M8 13h8v4H8z" /></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 5v14" /></>,
  bath: <><path d="M4 12V6a2 2 0 0 1 4 0v.5M3 12h18v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z" /><path d="M6 20l-1 2M18 20l1 2" /></>,
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z" />,
  soccer: <><circle cx="12" cy="12" r="9" /><path d="m12 8 3 2-1 3.5h-4L9 10z" /></>,
  activity: <path d="M3 12h4l3 8 4-16 3 8h4" />,
  music: <><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>,
  waves: <><path d="M2 8c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 14c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 20c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" /></>,
  'trending-up': <><path d="M22 7 13.5 15.5 8.5 10.5 2 17" /><path d="M16 7h6v6" /></>,
  'trending-down': <><path d="M22 17 13.5 8.5 8.5 13.5 2 7" /><path d="M16 17h6v-6" /></>,
  'party-popper': <><path d="M4 20 9 8l7 7z" /><path d="M13 2s1.5 2 0 3.5M18 4s2 1 1.5 3M20 9s1.5.5 1.5 2M14 8l1-1M18 11l1.5-.5" /></>,
};

export default function Icon({ name, size = 20, strokeWidth, style, ...rest }) {
  const inner = PATHS[name];
  if (!inner) return null;
  const stroke = strokeWidth ? { ...STROKE, strokeWidth } : STROKE;
  const fillIcons = { play: true, moon: true, droplet: true, thermometer: true };
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flexShrink: 0, ...style }}
      {...(fillIcons[name] ? { fill: 'currentColor', stroke: 'none' } : stroke)}
      {...rest}
    >
      {inner}
    </svg>
  );
}

// Filled/outline star — favorites and ratings need an explicit fill toggle.
export function StarIcon({ filled = false, size = 20, style, ...rest }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0, ...style }}
      {...rest}
    >
      <path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 17.9 6.75 20.6l1-5.85L3.5 9.7l5.9-.9z" />
    </svg>
  );
}
