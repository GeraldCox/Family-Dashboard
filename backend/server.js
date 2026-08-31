const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const cron = require('node-cron');
const multer = require('multer');
const { google } = require('googleapis');

const app = express();
app.use(cors());
app.use(express.json());

const DATA_DIR = '/app/data';
const PHOTOS_DIR = path.join(DATA_DIR, 'photos');

// Household timezone for all "what day is it" logic (chore/routine resets).
// Falls back to America/New_York if TZ isn't set in the environment.
const APP_TIMEZONE = process.env.TZ || 'America/New_York';
const FILES = {
  chores: path.join(DATA_DIR, 'chores.json'),
  meals: path.join(DATA_DIR, 'meals.json'),
  schedule: path.join(DATA_DIR, 'schedule.json'),
  calendars: path.join(DATA_DIR, 'calendars.json'),
  mealLibrary: path.join(DATA_DIR, 'meal-library.json'),
  shoppingList: path.join(DATA_DIR, 'shopping-list.json'),
  people: path.join(DATA_DIR, 'people.json'),
  tasks: path.join(DATA_DIR, 'tasks.json'),
  photosSettings: path.join(DATA_DIR, 'photos-settings.json'),
  countdowns: path.join(DATA_DIR, 'countdowns.json'),
  routines: path.join(DATA_DIR, 'routines.json'),
  exerciseLibrary: path.join(DATA_DIR, 'exercise-library.json'),
  workouts: path.join(DATA_DIR, 'workouts.json'),
  reminders: path.join(DATA_DIR, 'reminders.json'),
  googleTokens: path.join(DATA_DIR, 'google-tokens.json'),
  homeschool: path.join(DATA_DIR, 'homeschool.json'),
  mealieSettings: path.join(DATA_DIR, 'mealie-settings.json'),
  generalSettings: path.join(DATA_DIR, 'general-settings.json'),
};

// ── Homeschool defaults ───────────────────────────────────────────────────────
const HOMESCHOOL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const DEFAULT_DAY_THEMES = {
  Mon: 'Grow & Know Monday',
  Tue: 'Bake & Shake Tuesday',
  Wed: 'Community Wednesday',
  Thu: 'Thoughtful Thursday',
  Fri: 'Faithful Friday',
};
function homeschoolDefault() {
  return { dayThemes: { ...DEFAULT_DAY_THEMES }, schedules: {}, recentActivities: [] };
}

// ── Google OAuth ────────────────────────────────────────────────────────────

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const GOOGLE_DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000/';
const GOOGLE_ACCOUNT_COLORS = ['#3b82f6', '#db2777', '#16a34a', '#d97706', '#8b5cf6', '#059669', '#0891b2'];

function createGoogleOAuthClient() {
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

// Ensures the account's access token is valid, refreshing it via the stored
// refresh token if it's missing or past its expiry. Persists any refreshed
// token back to google-tokens.json so subsequent calls reuse it.
async function getFreshGoogleClient(account) {
  const oauth2Client = createGoogleOAuthClient();
  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
    expiry_date: account.expiryDate,
  });

  const isExpired = !account.expiryDate || account.expiryDate <= Date.now() + 60000;
  if (isExpired) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    account.accessToken = credentials.access_token;
    account.expiryDate = credentials.expiry_date;
    if (credentials.refresh_token) account.refreshToken = credentials.refresh_token;
    oauth2Client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
      expiry_date: account.expiryDate,
    });

    const tokensData = readJSON(FILES.googleTokens, { accounts: [] });
    const stored = tokensData.accounts.find(a => a.id === account.id);
    if (stored) {
      stored.accessToken = account.accessToken;
      stored.refreshToken = account.refreshToken;
      stored.expiryDate = account.expiryDate;
      writeJSON(FILES.googleTokens, tokensData);
    }
  }

  return oauth2Client;
}

async function fetchGoogleEvents(account, startDate, endDate) {
  try {
    const oauth2Client = await getFreshGoogleClient(account);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
    });

    return (response.data.items || [])
      .filter(ev => ev.start && (ev.start.date || ev.start.dateTime))
      .map(ev => {
        const allDay = !!ev.start.date;
        return {
          id: ev.id,
          title: ev.summary || '(No title)',
          allDay,
          description: ev.description || '',
          location: ev.location || '',
          source: `google_${account.id}`,
          color: account.color,
          start: allDay ? ev.start.date : ev.start.dateTime,
          end: allDay ? (ev.end && ev.end.date) : (ev.end && ev.end.dateTime),
          connectionType: 'oauth',
          editable: true,
          accountId: account.id,
          calendarId: 'primary',
          googleEventId: ev.id,
        };
      });
  } catch (err) {
    console.error(`Google Calendar fetch failed for ${account.email}:`, err.message);
    return [];
  }
}

// Same underlying calendar event can arrive via both CalDAV and OAuth when a
// household connects the same calendar both ways. CalDAV UIDs and Google
// event ids don't share a reliable format across protocols, so we match on
// normalized title + start time (minute precision, timezone offset ignored)
// instead, and prefer the OAuth copy since it's richer and write-capable.
function dedupeKey(ev) {
  const title = (ev.title || '').trim().toLowerCase();
  const start = (ev.start || '').slice(0, 16); // YYYY-MM-DDTHH:MM or YYYY-MM-DD
  return `${title}|${start}`;
}

function dedupeCaldavAgainstGoogle(caldavEvents, googleEvents) {
  const googleKeys = new Set(googleEvents.map(dedupeKey));
  let removed = 0;
  const deduped = caldavEvents.filter(ev => {
    if (googleKeys.has(dedupeKey(ev))) {
      removed++;
      return false;
    }
    return true;
  });
  return { events: deduped, removed };
}

const TIME_OF_DAY_ORDER = ['morning', 'afternoon', 'evening', 'bedtime'];

const PHOTO_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const PHOTO_EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};
const DEFAULT_PHOTO_SETTINGS = { inactivityMinutes: 5, transitionSeconds: 6, brightness: 100 };

// Sidebar nav items the household can hide from the "General" editor tab.
// Anything not in this list (home, calendar, chores, etc.) always shows.
const TOGGLEABLE_NAV_ITEMS = ['homeschool', 'beach', 'timer'];
const DEFAULT_GENERAL_SETTINGS = { hiddenNavItems: [] };

// Get a free key at https://spoonacular.com/food-api
const SPOONACULAR_API_KEY = process.env.SPOONACULAR_API_KEY || '';

// ── Helpers ──────────────────────────────────────────────────────────────────

function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { return fallback; }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ── Mealie (self-hosted recipe manager) fallback ───────────────────────────────
// Used when Spoonacular's search/scrape can't find a recipe. Configured via the
// Connected Accounts editor (stored in mealie-settings.json) or MEALIE_URL /
// MEALIE_API_TOKEN env vars as a fallback default.

function getMealieConfig() {
  const fileCfg = readJSON(FILES.mealieSettings, { url: '', apiToken: '' });
  return {
    url: (fileCfg.url || process.env.MEALIE_URL || '').replace(/\/+$/, ''),
    apiToken: fileCfg.apiToken || process.env.MEALIE_API_TOKEN || '',
  };
}

function mealieConfigured() {
  const { url, apiToken } = getMealieConfig();
  return !!(url && apiToken);
}

function mealieIngredientToItem(ing) {
  if (typeof ing === 'string') return { name: ing, amount: null, unit: '' };
  const name = ing.display || ing.originalText || ing.note || ing.food?.name || '';
  return { name, amount: ing.quantity ?? null, unit: ing.unit?.name || '' };
}

function mealieInstructionsToList(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.map(st => (typeof st === 'string' ? st : st.text || '')).filter(Boolean);
}

async function mealieFetch(pathname, options = {}) {
  const { url, apiToken } = getMealieConfig();
  if (!url || !apiToken) throw new Error('Mealie is not configured');
  const r = await fetch(`${url}${pathname}`, {
    ...options,
    headers: { Authorization: `Bearer ${apiToken}`, ...(options.headers || {}) },
  });
  if (!r.ok) throw new Error(`Mealie request failed: ${r.status}`);
  return r.json();
}

async function mealieRecipeToResult(recipe) {
  return {
    title: recipe.name || 'Recipe',
    sourceUrl: recipe.orgURL || '',
    sourceName: 'Mealie',
    ingredients: (recipe.recipeIngredient || []).map(mealieIngredientToItem),
    instructions: mealieInstructionsToList(recipe.recipeInstructions),
  };
}

async function mealieImportFromUrl(url) {
  const slug = await mealieFetch('/api/recipes/create/url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, includeTags: false }),
  });
  const recipe = await mealieFetch(`/api/recipes/${encodeURIComponent(slug)}`);
  return mealieRecipeToResult(recipe);
}

async function mealieSearch(q) {
  const data = await mealieFetch(`/api/recipes?search=${encodeURIComponent(q)}&perPage=5`);
  const items = data.items || (Array.isArray(data) ? data : []);
  return items.slice(0, 5).map(item => ({
    id: `mealie:${item.slug}`,
    mealieSlug: item.slug,
    title: item.name,
    image: undefined,
    sourceUrl: item.orgURL || '',
    sourceName: 'Mealie',
    ingredients: [],
    instructions: [],
  }));
}

// ── Date helpers (meal planner) ───────────────────────────────────────────────

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateStr(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Returns { start, end } Date objects (midnight, local time) for the
// Sunday-starting week that contains `date`.
function getWeekBounds(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function initDefaults() {
  if (!fs.existsSync(FILES.chores)) {
    writeJSON(FILES.chores, {
      people: [
        {
          id: 'parent1', name: 'Parent 1', color: '#3b82f6', totalStars: 0, rewardGoal: { name: 'Ice cream trip', stars: 20 }, rewards: [],
          chores: [
            { id: 'c1', name: 'Take out trash', emoji: '🗑️', reset: 'weekly', done: false, doneAt: null, stars: 1 },
            { id: 'c2', name: 'Mow the lawn', emoji: '🌿', reset: 'weekly', done: false, doneAt: null, stars: 1 },
            { id: 'c3', name: 'Dishes', emoji: '🍽️', reset: 'daily', done: false, doneAt: null, stars: 1 },
          ]
        },
        {
          id: 'parent2', name: 'Parent 2', color: '#8b5cf6', totalStars: 0, rewardGoal: { name: 'Ice cream trip', stars: 20 }, rewards: [],
          chores: [
            { id: 'c4', name: 'Laundry', emoji: '🧺', reset: 'weekly', done: false, doneAt: null, stars: 1 },
            { id: 'c5', name: 'Vacuum living room', emoji: '🧹', reset: 'weekly', done: false, doneAt: null, stars: 1 },
            { id: 'c6', name: 'Grocery run', emoji: '🛒', reset: 'weekly', done: false, doneAt: null, stars: 1 },
          ]
        },
        {
          id: 'kid1', name: 'Kid 1', color: '#db2777', totalStars: 0, rewardGoal: { name: 'Ice cream trip', stars: 20 },
          rewards: [
            { id: 'r1', name: 'Extra screen time', starsRequired: 5, emoji: '📱' },
            { id: 'r2', name: 'Ice cream trip', starsRequired: 15, emoji: '🍦' },
          ],
          chores: [
            { id: 'c7', name: 'Make bed', emoji: '🛏️', reset: 'daily', done: false, doneAt: null, stars: 1 },
            { id: 'c8', name: 'Pick up toys', emoji: '🧸', reset: 'daily', done: false, doneAt: null, stars: 1 },
            { id: 'c9', name: 'Feed pets', emoji: '🐾', reset: 'daily', done: false, doneAt: null, stars: 1 },
          ]
        },
        {
          id: 'kid2', name: 'Kid 2', color: '#ea580c', totalStars: 0, rewardGoal: { name: 'Ice cream trip', stars: 20 },
          rewards: [
            { id: 'r3', name: 'Extra screen time', starsRequired: 5, emoji: '📱' },
            { id: 'r4', name: 'Ice cream trip', starsRequired: 15, emoji: '🍦' },
          ],
          chores: [
            { id: 'c10', name: 'Make bed', emoji: '🛏️', reset: 'daily', done: false, doneAt: null, stars: 1 },
            { id: 'c11', name: 'Pick up toys', emoji: '🧸', reset: 'daily', done: false, doneAt: null, stars: 1 },
            { id: 'c12', name: 'Set the table', emoji: '🍴', reset: 'daily', done: false, doneAt: null, stars: 1 },
          ]
        }
      ],
      upForGrabs: [
        { id: 'u1', name: 'Wash the car', emoji: '🚗', stars: 3, reset: 'weekly', done: false, doneAt: null, doneBy: null },
      ]
    });
  }

  if (!fs.existsSync(FILES.meals)) {
    const sampleMeals = [
      'Grilled chicken tacos', 'Pasta primavera', '', 'Beef stir fry',
      'Pizza night 🍕', 'Salmon & rice', 'BBQ ribs',
    ];
    const { start } = getWeekBounds(new Date());
    const days = {};
    sampleMeals.forEach((name, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days[toDateStr(d)] = { meals: name ? [name] : [], mealData: {} };
    });
    writeJSON(FILES.meals, { days });
  }

  if (!fs.existsSync(FILES.schedule)) {
    writeJSON(FILES.schedule, {
      slots: [
        { time: '6:00 AM',  items: [{ label: 'Wake up', type: 'family' }] },
        { time: '7:00 AM',  items: [{ label: 'Gym', type: 'parent1' }, { label: 'Morning walk', type: 'parent2' }] },
        { time: '8:30 AM',  items: [{ label: 'Family breakfast', type: 'family' }] },
        { time: '9:00 AM',  items: [{ label: 'Work', type: 'parent1' }, { label: 'Work', type: 'parent2' }] },
        { time: '12:00 PM', items: [{ label: 'Lunch', type: 'family' }] },
        { time: '6:00 PM',  items: [{ label: 'Dinner', type: 'family' }] },
        { time: '9:30 PM',  items: [{ label: 'Wind down', type: 'family' }] },
      ]
    });
  }

  if (!fs.existsSync(FILES.mealLibrary)) {
    writeJSON(FILES.mealLibrary, { meals: [] });
  }

  if (!fs.existsSync(FILES.exerciseLibrary)) {
    let exId = 1;
    const ex = (name, equipment, type) => ({ id: `ex${exId++}`, name, equipment, type });
    writeJSON(FILES.exerciseLibrary, {
      exercises: [
        ex('Walk', 'Treadmill', 'cardio'),
        ex('Jog', 'Treadmill', 'cardio'),
        ex('Run', 'Treadmill', 'cardio'),
        ex('Incline Walk', 'Treadmill', 'cardio'),
        ex('Interval Sprints', 'Treadmill', 'cardio'),
        ex('Steady State Ride', 'Air Bike', 'cardio'),
        ex('Interval Sprints', 'Air Bike', 'cardio'),
        ex('Tabata Rounds', 'Air Bike', 'cardio'),
        ex('Goblet Squat', 'Dumbbells', 'strength'),
        ex('Dumbbell Deadlift', 'Dumbbells', 'strength'),
        ex('Bench Press', 'Dumbbells', 'strength'),
        ex('Shoulder Press', 'Dumbbells', 'strength'),
        ex('Bent-Over Row', 'Dumbbells', 'strength'),
        ex('Bicep Curl', 'Dumbbells', 'strength'),
        ex('Tricep Kickback', 'Dumbbells', 'strength'),
        ex('Lateral Raise', 'Dumbbells', 'strength'),
        ex('Lunges', 'Dumbbells', 'strength'),
        ex('Romanian Deadlift', 'Dumbbells', 'strength'),
        ex('Renegade Row', 'Dumbbells', 'strength'),
        ex('Dumbbell Snatch', 'Dumbbells', 'strength'),
        ex("Farmer's Carry", 'Dumbbells', 'strength'),
        ex('Chest Fly', 'Dumbbells', 'strength'),
        ex('Front Raise', 'Dumbbells', 'strength'),
      ],
    });
  }

  if (!fs.existsSync(FILES.workouts)) {
    writeJSON(FILES.workouts, { days: {} });
  }

  if (!fs.existsSync(FILES.shoppingList)) {
    writeJSON(FILES.shoppingList, { items: [] });
  }

  if (!fs.existsSync(FILES.people)) {
    writeJSON(FILES.people, {
      people: [
        { id: 'parent1', name: 'Parent 1', color: '#166534' },
        { id: 'parent2', name: 'Parent 2', color: '#1e3a5f' },
        { id: 'kid1',    name: 'Kid 1',    color: '#db2777' },
        { id: 'kid2',    name: 'Kid 2',    color: '#ea580c' },
        { id: 'family',  name: 'Family',   color: '#166534' },
      ]
    });
  }

  if (!fs.existsSync(FILES.tasks)) {
    writeJSON(FILES.tasks, {
      lists: [
        {
          id: 'l1', name: 'To Do', color: '#2563eb',
          tasks: [
            { id: 't1', text: 'Schedule dentist appointment', done: false },
            { id: 't2', text: 'Pay electric bill', done: false },
          ]
        },
        {
          id: 'l2', name: 'Errands', color: '#059669',
          tasks: [
            { id: 't3', text: 'Drop off dry cleaning', done: false },
          ]
        },
      ]
    });
  }

  if (!fs.existsSync(FILES.calendars)) {
    writeJSON(FILES.calendars, {
      sources: [
        {
          id: 'parent1',
          name: 'Parent 1',
          color: '#3b82f6',
          url: process.env.CALDAV_URL,
          username: process.env.CALDAV_USERNAME,
          password: process.env.CALDAV_PASSWORD,
          enabled: true
        }
      ]
    });
  }

  if (!fs.existsSync(PHOTOS_DIR)) {
    fs.mkdirSync(PHOTOS_DIR, { recursive: true });
  }

  if (!fs.existsSync(FILES.photosSettings)) {
    writeJSON(FILES.photosSettings, DEFAULT_PHOTO_SETTINGS);
  }

  if (!fs.existsSync(FILES.countdowns)) {
    writeJSON(FILES.countdowns, { countdowns: [] });
  }

  if (!fs.existsSync(FILES.routines)) {
    writeJSON(FILES.routines, { routines: [] });
  }

  if (!fs.existsSync(FILES.reminders)) {
    writeJSON(FILES.reminders, { reminders: [] });
  }

  if (!fs.existsSync(FILES.googleTokens)) {
    writeJSON(FILES.googleTokens, { accounts: [] });
  }

  if (!fs.existsSync(FILES.homeschool)) {
    writeJSON(FILES.homeschool, homeschoolDefault());
  }

  if (!fs.existsSync(FILES.generalSettings)) {
    writeJSON(FILES.generalSettings, DEFAULT_GENERAL_SETTINGS);
  }
}

// ── CalDAV Fetcher ────────────────────────────────────────────────────────────

async function fetchCalDAVEvents(source, startDate, endDate) {
  try {
    const start = startDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const end = endDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const reportBody = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${start}" end="${end}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;

    const auth = Buffer.from(`${source.username}:${source.password}`).toString('base64');
    const response = await fetch(source.url, {
      method: 'REPORT',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/xml',
        'Depth': '1',
      },
      body: reportBody,
    });

    if (!response.ok) {
      console.error(`CalDAV fetch failed for ${source.name}: ${response.status}`);
      return [];
    }

    const text = await response.text();
    const events = parseICalData(text, source);
    return events.filter(ev => {
      if (!ev.start) return false;
      const evDate = new Date(ev.start);
      return evDate >= startDate && evDate <= endDate;
    });
  } catch (err) {
    console.error(`CalDAV error for ${source.name}:`, err.message);
    return [];
  }
}

function parseICalData(xmlText, source) {
  const events = [];
  const calDataMatches = xmlText.match(/<[^:]*:?calendar-data[^>]*>([\s\S]*?)<\/[^:]*:?calendar-data>/gi) || [];

  for (const block of calDataMatches) {
    const icalContent = block.replace(/<[^>]+>/g, '').trim();
    if (!icalContent) continue;

    try {
      const lines = unfoldLines(icalContent.split(/\r?\n/));
      let inEvent = false;
      let inAlarm = false;
      let event = {};

      for (let line of lines) {
        line = line.trim();
        if (line === 'BEGIN:VEVENT') { inEvent = true; inAlarm = false; event = {}; continue; }
        if (line === 'BEGIN:VALARM') { inAlarm = true; continue; }
        if (line === 'END:VALARM') { inAlarm = false; continue; }
        if (line === 'END:VEVENT') {
          if (event.dtstart && event.summary) {
            const parsed = buildEvents(event, source);
            events.push(...parsed);
          }
          inEvent = false; inAlarm = false; continue;
        }
        if (!inEvent || inAlarm) continue;

        if (line.startsWith('SUMMARY')) event.summary = line.split(':').slice(1).join(':').replace(/\\n/g,'\n').replace(/\\,/g,',').trim();
        else if (line.startsWith('DTSTART')) { event.dtstart = line.split(':').slice(1).join(':').trim(); event.dtstart_raw = line; }
        else if (line.startsWith('DTEND')) event.dtend = line.split(':').slice(1).join(':').trim();
        else if (line.startsWith('DURATION')) event.duration = line.split(':').slice(1).join(':').trim();
        else if (line.startsWith('UID:')) event.uid = line.slice(4).trim();
        else if (line.startsWith('RRULE:')) event.rrule = line.slice(6).trim();
        else if (line.startsWith('DESCRIPTION')) event.description = line.split(':').slice(1).join(':').replace(/\\n/g,'\n').trim();
        else if (line.startsWith('LOCATION')) event.location = line.split(':').slice(1).join(':').trim();
      }
    } catch (e) { console.error('Parse error:', e.message); }
  }
  return events;
}

function buildEvents(event, source) {
  const allDay = !event.dtstart.includes('T');
  const start = parseICalDate(event.dtstart);
  const end = event.dtend ? parseICalDate(event.dtend) : start;

  const base = {
    id: event.uid || Math.random().toString(36),
    title: event.summary,
    allDay,
    description: event.description || '',
    location: event.location || '',
    source: source.id,
    color: source.color,
    connectionType: 'caldav',
    editable: false,
  };

  if (!event.rrule) {
    return [{ ...base, start, end }];
  }

  // Expand recurring events up to 2 years from now
  const results = [];
  const params = {};
  event.rrule.split(';').forEach(p => {
    const [k, v] = p.split('=');
    params[k] = v;
  });

  const freq = params.FREQ;
  const count = parseInt(params.COUNT) || 200;
  const until = params.UNTIL ? parseICalDate(params.UNTIL) : null;
  const interval = parseInt(params.INTERVAL) || 1;
  const byDay = params.BYDAY ? params.BYDAY.split(',') : null;
  const byMonthDay = params.BYMONTHDAY ? parseInt(params.BYMONTHDAY) : null;

  let cur = new Date(start);
  const endDate = until ? new Date(until) : new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000);
  const startDate = new Date(start);
  const duration = end ? new Date(end) - new Date(start) : 0;

  let iterations = 0;
  while (cur <= endDate && iterations < count) {
    iterations++;
    const curEnd = new Date(cur.getTime() + duration);
    results.push({
      ...base,
      id: `${base.id}_${iterations}`,
      start: cur.toISOString().split('T')[0] + (allDay ? '' : 'T' + cur.toISOString().split('T')[1].slice(0,5)),
      end: curEnd.toISOString().split('T')[0] + (allDay ? '' : 'T' + curEnd.toISOString().split('T')[1].slice(0,5)),
    });

    // Advance to next occurrence
    if (freq === 'DAILY') cur.setDate(cur.getDate() + interval);
    else if (freq === 'WEEKLY') cur.setDate(cur.getDate() + 7 * interval);
    else if (freq === 'MONTHLY') {
      cur.setMonth(cur.getMonth() + interval);
      if (byMonthDay) cur.setDate(byMonthDay);
    }
    else if (freq === 'YEARLY') cur.setFullYear(cur.getFullYear() + interval);
    else break;
  }

  return results;
}

function unfoldLines(lines) {
  const result = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && result.length > 0) {
      result[result.length - 1] += line.slice(1);
    } else {
      result.push(line);
    }
  }
  return result;
}

function parseICalDate(str) {
  if (!str) return null;
  str = str.replace('Z', '').replace('VALUE=DATE:', '');
  if (str.length === 8) {
    return `${str.slice(0,4)}-${str.slice(4,6)}-${str.slice(6,8)}`;
  }
  return `${str.slice(0,4)}-${str.slice(4,6)}-${str.slice(6,8)}T${str.slice(9,11)}:${str.slice(11,13)}:${str.slice(13,15)}`;
}

// ── Auto-reset chores ─────────────────────────────────────────────────────────

// Returns the calendar date (YYYY-MM-DD) that `date` falls on in the household's
// local timezone, regardless of what timezone the Node process itself is in.
function localDateKey(date, timeZone = APP_TIMEZONE) {
  return date.toLocaleDateString('en-CA', { timeZone });
}

function calendarDaysBetween(fromDate, toDate) {
  const from = new Date(`${localDateKey(fromDate)}T00:00:00Z`);
  const to = new Date(`${localDateKey(toDate)}T00:00:00Z`);
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

// ── Reminder timezone helpers ─────────────────────────────────────────────────

// Milliseconds to add to a UTC instant to get that same instant's wall-clock
// reading in `timeZone`, i.e. wallClockUTC = instant.getTime() + offset.
function tzOffsetMs(instant, timeZone = APP_TIMEZONE) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(instant).map(p => [p.type, p.value]));
  const wallClockAsUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return wallClockAsUTC - instant.getTime();
}

// Returns the real UTC instant (ms) corresponding to local midnight of `dateKey`
// (a YYYY-MM-DD string, interpreted in `timeZone`).
function startOfLocalDayMs(dateKey, timeZone = APP_TIMEZONE) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const naiveUTC = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offset = tzOffsetMs(new Date(naiveUTC), timeZone);
  return naiveUTC - offset;
}

// Sunday-starting week-bounds, mirroring getWeekBounds() but for reminder date keys.
function weekStartFromDateKey(dateKey) {
  return getWeekBounds(parseDateStr(dateKey)).start;
}

// Whole weeks elapsed between the calendar week containing `startDateKey`
// and the calendar week containing `todayDateKey` (Sunday-starting weeks).
function weeksElapsedSince(startDateKey, todayDateKey) {
  const anchorWeekStart = weekStartFromDateKey(startDateKey);
  const todayWeekStart = weekStartFromDateKey(todayDateKey);
  const diffDays = Math.round((todayWeekStart - anchorWeekStart) / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7);
}

function isReminderActiveNow(reminder, now) {
  const todayDateKey = localDateKey(now);
  const todayDow = parseDateStr(todayDateKey).getDay();
  if (reminder.dayOfWeek !== todayDow) return false;

  if (reminder.recurrence === 'biweekly') {
    const weeksElapsed = weeksElapsedSince(reminder.startDate, todayDateKey);
    if (weeksElapsed % 2 !== 0) return false;
  }

  const displayHours = Number(reminder.displayHours) || 24;
  const startOfDayMs = startOfLocalDayMs(todayDateKey);
  const hoursSinceStart = (now.getTime() - startOfDayMs) / (1000 * 60 * 60);
  return hoursSinceStart >= 0 && hoursSinceStart < displayHours;
}

function resetChores() {
  const data = readJSON(FILES.chores, { people: [] });
  const now = new Date();
  let changed = false;
  let resetCount = 0;

  for (const person of data.people) {
    for (const chore of person.chores) {
      if (!chore.done || !chore.doneAt) continue;
      const doneDate = new Date(chore.doneAt);
      const daysPassed = calendarDaysBetween(doneDate, now);
      if (chore.reset === 'daily' && daysPassed >= 1) {
        chore.done = false; chore.doneAt = null; changed = true; resetCount++;
      } else if (chore.reset === 'weekly' && daysPassed >= 7) {
        chore.done = false; chore.doneAt = null; changed = true; resetCount++;
      }
    }
  }

  for (const chore of data.upForGrabs || []) {
    if (!chore.done || !chore.doneAt) continue;
    const doneDate = new Date(chore.doneAt);
    const daysPassed = calendarDaysBetween(doneDate, now);
    if (chore.reset === 'daily' && daysPassed >= 1) {
      chore.done = false; chore.doneAt = null; chore.doneBy = null; changed = true; resetCount++;
    } else if (chore.reset === 'weekly' && daysPassed >= 7) {
      chore.done = false; chore.doneAt = null; chore.doneBy = null; changed = true; resetCount++;
    }
  }

  console.log(`[resetChores] ran at ${now.toISOString()} — reset ${resetCount} chore(s)`);

  if (changed) writeJSON(FILES.chores, data);
}

cron.schedule('0 * * * *', resetChores);

// ── Auto-reset routines (once per calendar day) ──────────────────────────────

function isSameCalendarDay(a, b) {
  return localDateKey(a) === localDateKey(b);
}

function resetRoutines() {
  const data = readJSON(FILES.routines, { routines: [] });
  const now = new Date();
  let changed = false;

  for (const routine of data.routines) {
    for (const step of routine.steps) {
      if (!step.done || !step.doneAt) continue;
      const doneDate = new Date(step.doneAt);
      if (!isSameCalendarDay(doneDate, now)) {
        step.done = false; step.doneAt = null; changed = true;
      }
    }
  }

  if (changed) writeJSON(FILES.routines, data);
}

cron.schedule('0 * * * *', resetRoutines);

// ── Chore rewards migration ──────────────────────────────────────────────────

function migrateChoreRewards() {
  const data = readJSON(FILES.chores, { people: [] });
  let changed = false;

  if (data.upForGrabs === undefined) { data.upForGrabs = []; changed = true; }

  for (const person of data.people) {
    if (person.totalStars === undefined) { person.totalStars = 0; changed = true; }
    if (!person.rewardGoal) { person.rewardGoal = { name: 'Ice cream trip', stars: 20 }; changed = true; }
    if (!person.rewards) { person.rewards = []; changed = true; }
    for (const chore of person.chores) {
      if (chore.stars === undefined) { chore.stars = 1; changed = true; }
    }
  }

  if (changed) writeJSON(FILES.chores, data);
}

// ── Meals migration (legacy "week" array → date-keyed "days") ────────────────

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function migrateMealsToDays() {
  const data = readJSON(FILES.meals, null);
  if (!data || data.days) return; // already migrated (or nothing to migrate)

  if (Array.isArray(data.week)) {
    const { start } = getWeekBounds(new Date());
    const days = {};
    data.week.forEach((dayEntry, i) => {
      const offset = DOW_NAMES.indexOf(dayEntry.day);
      const d = new Date(start);
      d.setDate(start.getDate() + (offset >= 0 ? offset : i));
      days[toDateStr(d)] = {
        meals: dayEntry.meals || [],
        mealData: dayEntry.mealData || {},
      };
    });
    writeJSON(FILES.meals, { days });
    console.log(`[migrateMeals] migrated ${data.week.length} day(s) from legacy "week" array to date-keyed "days"`);
  } else {
    writeJSON(FILES.meals, { days: {} });
  }
}

// ── Homeschool migration (legacy Mon/Tue/... keyed schedules → date-keyed) ────

const HOMESCHOOL_DOW_OFFSET = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5 };

function migrateHomeschoolToDates() {
  const data = readJSON(FILES.homeschool, null);
  if (!data || !data.schedules) return;

  const hasLegacyDayKeys = Object.values(data.schedules).some(personSchedule =>
    Object.keys(personSchedule || {}).some(key => HOMESCHOOL_DAYS.includes(key))
  );
  if (!hasLegacyDayKeys) return;

  const { start } = getWeekBounds(new Date());
  const migrated = {};
  let count = 0;
  for (const [personId, personSchedule] of Object.entries(data.schedules)) {
    migrated[personId] = {};
    for (const [key, activities] of Object.entries(personSchedule || {})) {
      const offset = HOMESCHOOL_DOW_OFFSET[key];
      const dateKey = offset !== undefined
        ? toDateStr(new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset))
        : key; // already a date key
      migrated[personId][dateKey] = [...(migrated[personId][dateKey] || []), ...activities];
      count += activities.length;
    }
  }
  data.schedules = migrated;
  writeJSON(FILES.homeschool, data);
  console.log(`[migrateHomeschool] migrated ${count} activity(ies) from day-of-week keys to date keys`);
}

// ── Meal library ratings ──────────────────────────────────────────────────────

function computeAverageRating(ratings) {
  if (!ratings || ratings.length === 0) return null;
  const sum = ratings.reduce((a, r) => a + (r.stars || 0), 0);
  return Math.round((sum / ratings.length) * 10) / 10;
}

function migrateMealLibrary() {
  const data = readJSON(FILES.mealLibrary, { meals: [] });
  let changed = false;

  for (const meal of data.meals) {
    if (!meal.ratings) { meal.ratings = []; changed = true; }
    if (meal.averageRating === undefined) { meal.averageRating = computeAverageRating(meal.ratings); changed = true; }
    if (!meal.instructions) { meal.instructions = []; changed = true; }
  }

  if (changed) writeJSON(FILES.mealLibrary, data);
}

function rateMealInLibrary(mealName, stars, note, date) {
  const data = readJSON(FILES.mealLibrary, { meals: [] });
  let meal = data.meals.find(m => m.name.toLowerCase() === (mealName || '').toLowerCase());

  if (!meal) {
    meal = { id: `m${Date.now()}`, name: mealName, sourceUrl: '', sourceName: '', ingredients: [], instructions: [], ratings: [], averageRating: null };
    data.meals.push(meal);
  }
  if (!meal.ratings) meal.ratings = [];

  meal.ratings.push({ date: date || new Date().toISOString().slice(0, 10), stars: Number(stars), note: note || '' });
  meal.averageRating = computeAverageRating(meal.ratings);

  writeJSON(FILES.mealLibrary, data);
  return meal;
}

// ── Recipe instruction parsing ───────────────────────────────────────────────

function stripHtmlTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseInstructionsFromText(text) {
  if (!text) return [];
  const liMatches = [...text.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(m => stripHtmlTags(m[1])).filter(Boolean);
  if (liMatches.length > 0) return liMatches.map((step, i) => ({ number: i + 1, step }));

  const pMatches = [...text.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(m => stripHtmlTags(m[1])).filter(Boolean);
  if (pMatches.length > 0) return pMatches.map((step, i) => ({ number: i + 1, step }));

  return text
    .split(/\r?\n+/)
    .map(s => stripHtmlTags(s))
    .filter(Boolean)
    .map((step, i) => ({ number: i + 1, step }));
}

function flattenAnalyzedInstructions(analyzed) {
  if (!Array.isArray(analyzed)) return [];
  const steps = [];
  for (const group of analyzed) {
    for (const st of group.steps || []) {
      if (st && st.step) steps.push(String(st.step).trim());
    }
  }
  return steps.filter(Boolean).map((step, i) => ({ number: i + 1, step }));
}

function parseSchemaInstructions(value) {
  if (!value) return [];
  if (typeof value === 'string') {
    const step = value.trim();
    return step ? [{ number: 1, step }] : [];
  }
  if (Array.isArray(value)) {
    const steps = value.map(item => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object' && item.text) return String(item.text).trim();
      return '';
    }).filter(Boolean);
    return steps.map((step, i) => ({ number: i + 1, step }));
  }
  return [];
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Calendar events
app.get('/api/events', async (req, res) => {
  try {
    const { year, month } = req.query;
    const y = parseInt(year || new Date().getFullYear());
    const m = parseInt(month || new Date().getMonth() + 1) - 1;
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0, 23, 59, 59);

    const calData = readJSON(FILES.calendars, { sources: [] });
    const enabledSources = calData.sources.filter(s => s.enabled);
    const googleTokensData = readJSON(FILES.googleTokens, { accounts: [] });

    const [caldavResults, googleResults] = await Promise.all([
      Promise.all(enabledSources.map(source => fetchCalDAVEvents(source, start, end))),
      Promise.all(googleTokensData.accounts.map(account => fetchGoogleEvents(account, start, end))),
    ]);

    const caldavFlat = caldavResults.flat();
    const googleFlat = googleResults.flat();
    const { events: dedupedCaldav, removed } = dedupeCaldavAgainstGoogle(caldavFlat, googleFlat);
    console.log(`[/api/events] ${removed} duplicate event(s) removed (CalDAV vs OAuth) for ${y}-${m + 1}`);

    res.json({ events: [...dedupedCaldav, ...googleFlat] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Google OAuth-connected calendars
app.get('/api/auth/google/start', (req, res) => {
  const oauth2Client = createGoogleOAuthClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  });
  res.redirect(url);
});

app.get('/api/auth/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('Missing authorization code');

    const oauth2Client = createGoogleOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();
    const email = userInfo.email;

    const tokensData = readJSON(FILES.googleTokens, { accounts: [] });
    let account = tokensData.accounts.find(a => a.email === email);
    if (account) {
      account.accessToken = tokens.access_token;
      if (tokens.refresh_token) account.refreshToken = tokens.refresh_token;
      account.expiryDate = tokens.expiry_date;
    } else {
      account = {
        id: `g${Date.now()}`,
        email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date,
        color: GOOGLE_ACCOUNT_COLORS[tokensData.accounts.length % GOOGLE_ACCOUNT_COLORS.length],
      };
      tokensData.accounts.push(account);
    }
    writeJSON(FILES.googleTokens, tokensData);

    res.redirect(`${GOOGLE_DASHBOARD_URL}?connected=google`);
  } catch (err) {
    console.error('Google OAuth callback error:', err.message);
    res.status(500).send('Google authorization failed');
  }
});

app.get('/api/auth/google/accounts', (req, res) => {
  const data = readJSON(FILES.googleTokens, { accounts: [] });
  const safe = data.accounts.map(({ id, email, color }) => ({ id, email, color }));
  res.json({ accounts: safe });
});

app.delete('/api/auth/google/accounts/:id', (req, res) => {
  const data = readJSON(FILES.googleTokens, { accounts: [] });
  data.accounts = data.accounts.filter(a => a.id !== req.params.id);
  writeJSON(FILES.googleTokens, data);
  res.json({ ok: true });
});

app.get('/api/google-events', async (req, res) => {
  try {
    const { year, month } = req.query;
    const y = parseInt(year || new Date().getFullYear());
    const m = parseInt(month || new Date().getMonth() + 1) - 1;
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0, 23, 59, 59);

    const tokensData = readJSON(FILES.googleTokens, { accounts: [] });
    const allEvents = await Promise.all(tokensData.accounts.map(account => fetchGoogleEvents(account, start, end)));
    res.json({ events: allEvents.flat() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/google-events/calendars', async (req, res) => {
  try {
    const { accountId } = req.query;
    if (!accountId) return res.status(400).json({ error: 'Missing accountId' });

    const tokensData = readJSON(FILES.googleTokens, { accounts: [] });
    const account = tokensData.accounts.find(a => a.id === accountId);
    if (!account) return res.status(404).json({ error: 'Google account not found' });

    const oauth2Client = await getFreshGoogleClient(account);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const response = await calendar.calendarList.list();

    const calendars = (response.data.items || []).map(cal => ({
      id: cal.id,
      summary: cal.summary,
      backgroundColor: cal.backgroundColor,
      primary: !!cal.primary,
    }));

    res.json({ calendars });
  } catch (err) {
    console.error('Google calendarList error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/google-events/create', async (req, res) => {
  try {
    const { accountId, calendarId, title, startDateTime, endDateTime, allDay, recurrence, description, location } = req.body;
    if (!accountId) return res.status(400).json({ error: 'Missing accountId' });
    if (!title) return res.status(400).json({ error: 'Missing title' });
    if (!startDateTime || !endDateTime) return res.status(400).json({ error: 'Missing startDateTime/endDateTime' });

    const tokensData = readJSON(FILES.googleTokens, { accounts: [] });
    const account = tokensData.accounts.find(a => a.id === accountId);
    if (!account) return res.status(404).json({ error: 'Google account not found' });

    const oauth2Client = await getFreshGoogleClient(account);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const eventBody = {
      summary: title,
      description: description || '',
      location: location || '',
    };

    if (allDay) {
      eventBody.start = { date: startDateTime.slice(0, 10) };
      eventBody.end = { date: endDateTime.slice(0, 10) };
    } else {
      eventBody.start = { dateTime: startDateTime, timeZone: APP_TIMEZONE };
      eventBody.end = { dateTime: endDateTime, timeZone: APP_TIMEZONE };
    }

    if (recurrence) eventBody.recurrence = [recurrence];

    const response = await calendar.events.insert({
      calendarId: calendarId || 'primary',
      requestBody: eventBody,
    });

    res.json({ ok: true, event: response.data });
  } catch (err) {
    console.error('Google event create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/google-events/update', async (req, res) => {
  try {
    const { accountId, calendarId, eventId, title, startDateTime, endDateTime, allDay, description, location } = req.body;
    if (!accountId) return res.status(400).json({ error: 'Missing accountId' });
    if (!eventId) return res.status(400).json({ error: 'Missing eventId' });
    if (!title) return res.status(400).json({ error: 'Missing title' });
    if (!startDateTime || !endDateTime) return res.status(400).json({ error: 'Missing startDateTime/endDateTime' });

    const tokensData = readJSON(FILES.googleTokens, { accounts: [] });
    const account = tokensData.accounts.find(a => a.id === accountId);
    if (!account) return res.status(404).json({ error: 'Google account not found' });

    const oauth2Client = await getFreshGoogleClient(account);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const eventBody = {
      summary: title,
      description: description || '',
      location: location || '',
    };

    if (allDay) {
      eventBody.start = { date: startDateTime.slice(0, 10) };
      eventBody.end = { date: endDateTime.slice(0, 10) };
    } else {
      eventBody.start = { dateTime: startDateTime, timeZone: APP_TIMEZONE };
      eventBody.end = { dateTime: endDateTime, timeZone: APP_TIMEZONE };
    }

    const response = await calendar.events.patch({
      calendarId: calendarId || 'primary',
      eventId,
      requestBody: eventBody,
    });

    res.json({ ok: true, event: response.data });
  } catch (err) {
    console.error('Google event update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/google-events/:accountId/:calendarId/:eventId', async (req, res) => {
  try {
    const { accountId, calendarId, eventId } = req.params;

    const tokensData = readJSON(FILES.googleTokens, { accounts: [] });
    const account = tokensData.accounts.find(a => a.id === accountId);
    if (!account) return res.status(404).json({ error: 'Google account not found' });

    const oauth2Client = await getFreshGoogleClient(account);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    await calendar.events.delete({
      calendarId,
      eventId,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Google event delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Calendar sources
app.get('/api/calendars', (req, res) => {
  const data = readJSON(FILES.calendars, { sources: [] });
  const peopleData = readJSON(FILES.people, { people: [] });
  const nameById = {};
  (peopleData.people || []).forEach(p => { nameById[p.id] = p.name; });
  // Don't expose passwords; use the current person name where the source id matches a person
  const safe = data.sources.map(({ password, ...rest }) => (
    nameById[rest.id] ? { ...rest, name: nameById[rest.id] } : rest
  ));
  res.json({ sources: safe });
});

app.post('/api/calendars', (req, res) => {
  const data = readJSON(FILES.calendars, { sources: [] });
  const { id, name, color, url, username, password } = req.body;
  data.sources.push({ id: id || Date.now().toString(), name, color, url, username, password, enabled: true });
  writeJSON(FILES.calendars, data);
  res.json({ ok: true });
});

// Weather (Open-Meteo, no API key needed)
app.get('/api/weather', async (req, res) => {
  try {
    const lat = process.env.WEATHER_LAT || '40.7128';
    const lon = process.env.WEATHER_LON || '-74.0060';
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode,windspeed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,weathercode,sunrise,sunset&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=6`;
    const r = await fetch(url);
    const data = await r.json();
    res.json({ ...data, location: process.env.WEATHER_LOCATION_LABEL || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tides (NOAA CO-OPS, no API key needed). Configure your own beaches/stations
// via the TIDE_BEACHES env var (JSON array of { id, name, station }) — find
// station IDs at https://tidesandcurrents.noaa.gov/map/. Falls back to a
// couple of well-known public stations if unset.
function loadTideBeaches() {
  if (process.env.TIDE_BEACHES) {
    try { return JSON.parse(process.env.TIDE_BEACHES); } catch { /* fall through to default */ }
  }
  return [
    { id: 'battery-park', name: 'Battery Park, NY', station: '8518750' },
    { id: 'santa-monica', name: 'Santa Monica, CA', station: '9410840' },
  ];
}
const TIDE_BEACHES = loadTideBeaches();
const TIDE_CACHE_MS = 3 * 60 * 60 * 1000; // predictions don't change intraday
const tideCache = new Map(); // station -> { fetchedAt, events }

function noaaDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

async function getStationEvents(station) {
  const cached = tideCache.get(station);
  if (cached && Date.now() - cached.fetchedAt < TIDE_CACHE_MS) return cached.events;

  const begin = new Date(); begin.setDate(begin.getDate() - 1);
  const end = new Date(); end.setDate(end.getDate() + 3);
  const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&application=family-dashboard&begin_date=${noaaDateStr(begin)}&end_date=${noaaDateStr(end)}&datum=MLLW&station=${station}&time_zone=lst_ldt&units=english&interval=hilo&format=json`;
  const r = await fetch(url);
  const data = await r.json();
  if (data.error) throw new Error(data.error.message || 'NOAA tide fetch failed');

  const events = (data.predictions || []).map(p => ({
    time: p.t.replace(' ', 'T'),
    type: p.type === 'H' ? 'high' : 'low',
    height: parseFloat(p.v),
  }));
  tideCache.set(station, { fetchedAt: Date.now(), events });
  return events;
}

app.get('/api/tides', async (req, res) => {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const stations = [...new Set(TIDE_BEACHES.map(b => b.station))];

  const eventsByStation = {};
  await Promise.all(stations.map(async station => {
    try {
      eventsByStation[station] = await getStationEvents(station);
    } catch (err) {
      console.error(`Tide fetch failed for station ${station}:`, err.message);
      eventsByStation[station] = null;
    }
  }));

  const beaches = TIDE_BEACHES.map(b => {
    const events = eventsByStation[b.station];
    if (!events) return { id: b.id, name: b.name, station: b.station, error: 'Unavailable' };

    // All high/low events in the next 24 hours (not just the next 2).
    const next24h = events.filter(e => {
      const t = new Date(e.time);
      return t >= now && t <= in24h;
    });
    const state = next24h[0] ? (next24h[0].type === 'high' ? 'rising' : 'falling') : null;

    return { id: b.id, name: b.name, station: b.station, state, events: next24h };
  });

  res.json({ beaches });
});

// Chores
app.get('/api/chores', (req, res) => {
  const data = readJSON(FILES.chores, { people: [] });
  const peopleData = readJSON(FILES.people, { people: [] });
  const nameById = {};
  (peopleData.people || []).forEach(p => { nameById[p.id] = p.name; });
  const people = (data.people || []).map(p => nameById[p.id] ? { ...p, name: nameById[p.id] } : p);
  res.json({ ...data, people });
});

app.post('/api/chores/toggle', (req, res) => {
  const { personId, choreId } = req.body;
  const data = readJSON(FILES.chores, { people: [] });
  const person = data.people.find(p => p.id === personId);
  if (!person) return res.status(404).json({ error: 'Person not found' });
  const chore = person.chores.find(c => c.id === choreId);
  if (!chore) return res.status(404).json({ error: 'Chore not found' });
  chore.done = !chore.done;
  chore.doneAt = chore.done ? new Date().toISOString() : null;

  const stars = chore.stars || 1;
  if (person.totalStars === undefined) person.totalStars = 0;
  if (chore.done) {
    person.totalStars += stars;
  } else {
    person.totalStars = Math.max(0, person.totalStars - stars);
  }

  writeJSON(FILES.chores, data);
  res.json({ ok: true, done: chore.done, totalStars: person.totalStars });
});

app.post('/api/chores/add', (req, res) => {
  const { personId, name, emoji, reset } = req.body;
  const data = readJSON(FILES.chores, { people: [] });
  const person = data.people.find(p => p.id === personId);
  if (!person) return res.status(404).json({ error: 'Person not found' });
  const newChore = { id: `c${Date.now()}`, name, emoji: emoji || '✅', reset: reset || 'weekly', done: false, doneAt: null, stars: 1 };
  person.chores.push(newChore);
  writeJSON(FILES.chores, data);
  res.json({ ok: true, chore: newChore });
});

// Up for grabs chores (registered before the generic :personId/:choreId route below,
// since Express matches routes in registration order and both shapes have 2 segments)
app.get('/api/chores/up-for-grabs', (req, res) => {
  const data = readJSON(FILES.chores, { people: [], upForGrabs: [] });
  res.json({ upForGrabs: data.upForGrabs || [] });
});

app.post('/api/chores/up-for-grabs/add', (req, res) => {
  const { name, emoji, stars, reset } = req.body;
  const data = readJSON(FILES.chores, { people: [], upForGrabs: [] });
  if (!data.upForGrabs) data.upForGrabs = [];
  const chore = {
    id: `u${Date.now()}`,
    name,
    emoji: emoji || '⭐',
    stars: Number(stars) || 1,
    reset: reset || 'weekly',
    done: false,
    doneAt: null,
    doneBy: null,
  };
  data.upForGrabs.push(chore);
  writeJSON(FILES.chores, data);
  res.json({ ok: true, chore });
});

app.post('/api/chores/up-for-grabs/claim', (req, res) => {
  const { choreId, personId } = req.body;
  const data = readJSON(FILES.chores, { people: [], upForGrabs: [] });
  const chore = (data.upForGrabs || []).find(c => c.id === choreId);
  if (!chore) return res.status(404).json({ error: 'Chore not found' });
  if (chore.done) return res.status(400).json({ error: 'Already claimed' });
  const person = data.people.find(p => p.id === personId);
  if (!person) return res.status(404).json({ error: 'Person not found' });

  chore.done = true;
  chore.doneAt = new Date().toISOString();
  chore.doneBy = personId;

  if (person.totalStars === undefined) person.totalStars = 0;
  person.totalStars += (chore.stars || 1);

  writeJSON(FILES.chores, data);
  res.json({ ok: true, chore, totalStars: person.totalStars });
});

app.post('/api/chores/up-for-grabs/reset', (req, res) => {
  const data = readJSON(FILES.chores, { people: [], upForGrabs: [] });
  (data.upForGrabs || []).forEach(c => {
    if (c.done) { c.done = false; c.doneAt = null; c.doneBy = null; }
  });
  writeJSON(FILES.chores, data);
  res.json({ ok: true });
});

app.delete('/api/chores/up-for-grabs/:choreId', (req, res) => {
  const data = readJSON(FILES.chores, { people: [], upForGrabs: [] });
  data.upForGrabs = (data.upForGrabs || []).filter(c => c.id !== req.params.choreId);
  writeJSON(FILES.chores, data);
  res.json({ ok: true });
});

app.post('/api/chores/up-for-grabs/set-stars', (req, res) => {
  const { choreId, stars } = req.body;
  const data = readJSON(FILES.chores, { people: [], upForGrabs: [] });
  const chore = (data.upForGrabs || []).find(c => c.id === choreId);
  if (!chore) return res.status(404).json({ error: 'Chore not found' });
  chore.stars = stars;
  writeJSON(FILES.chores, data);
  res.json({ ok: true, chore });
});

// Reward redemption
app.post('/api/chores/redeem', (req, res) => {
  const { personId, rewardId } = req.body;
  const data = readJSON(FILES.chores, { people: [] });
  const person = data.people.find(p => p.id === personId);
  if (!person) return res.json({ ok: false, error: 'Person not found' });
  const reward = (person.rewards || []).find(r => r.id === rewardId);
  if (!reward) return res.json({ ok: false, error: 'Reward not found' });

  const totalStars = person.totalStars || 0;
  if (totalStars < reward.starsRequired) {
    return res.json({ ok: false, error: 'Not enough stars' });
  }

  person.totalStars = totalStars - reward.starsRequired;
  writeJSON(FILES.chores, data);
  res.json({ ok: true, remainingStars: person.totalStars });
});

app.post('/api/chores/rewards/add', (req, res) => {
  const { personId, name, starsRequired, emoji } = req.body;
  const data = readJSON(FILES.chores, { people: [] });
  const person = data.people.find(p => p.id === personId);
  if (!person) return res.status(404).json({ error: 'Person not found' });
  if (!person.rewards) person.rewards = [];
  const reward = { id: `r${Date.now()}`, name, starsRequired: Number(starsRequired) || 0, emoji: emoji || '🎁' };
  person.rewards.push(reward);
  writeJSON(FILES.chores, data);
  res.json({ ok: true, reward });
});

app.delete('/api/chores/rewards/:personId/:rewardId', (req, res) => {
  const data = readJSON(FILES.chores, { people: [] });
  const person = data.people.find(p => p.id === req.params.personId);
  if (!person) return res.status(404).json({ error: 'Person not found' });
  person.rewards = (person.rewards || []).filter(r => r.id !== req.params.rewardId);
  writeJSON(FILES.chores, data);
  res.json({ ok: true });
});

app.delete('/api/chores/:personId/:choreId', (req, res) => {
  const data = readJSON(FILES.chores, { people: [] });
  const person = data.people.find(p => p.id === req.params.personId);
  if (!person) return res.status(404).json({ error: 'Person not found' });
  person.chores = person.chores.filter(c => c.id !== req.params.choreId);
  writeJSON(FILES.chores, data);
  res.json({ ok: true });
});

app.post('/api/chores/set-reward', (req, res) => {
  const { personId, rewardName, rewardStars } = req.body;
  const data = readJSON(FILES.chores, { people: [] });
  const person = data.people.find(p => p.id === personId);
  if (!person) return res.status(404).json({ error: 'Person not found' });
  person.rewardGoal = { name: rewardName, stars: rewardStars };
  writeJSON(FILES.chores, data);
  res.json({ ok: true, rewardGoal: person.rewardGoal });
});

app.post('/api/chores/set-stars', (req, res) => {
  const { personId, choreId, stars } = req.body;
  const data = readJSON(FILES.chores, { people: [] });
  const person = data.people.find(p => p.id === personId);
  if (!person) return res.status(404).json({ error: 'Person not found' });
  const chore = person.chores.find(c => c.id === choreId);
  if (!chore) return res.status(404).json({ error: 'Chore not found' });
  chore.stars = stars;
  writeJSON(FILES.chores, data);
  res.json({ ok: true, chore });
});

app.post('/api/chores/adjust-stars', (req, res) => {
  const { personId, amount } = req.body;
  const data = readJSON(FILES.chores, { people: [] });
  const person = data.people.find(p => p.id === personId);
  if (!person) return res.status(404).json({ error: 'Person not found' });
  if (person.totalStars === undefined) person.totalStars = 0;
  person.totalStars = Math.max(0, person.totalStars + (Number(amount) || 0));
  writeJSON(FILES.chores, data);
  res.json({ ok: true, totalStars: person.totalStars });
});

// People config
app.get('/api/people', (req, res) => res.json(readJSON(FILES.people, { people: [] })));

app.post('/api/people/update', (req, res) => {
  const { id, name, color } = req.body;
  const data = readJSON(FILES.people, { people: [] });
  const person = data.people.find(p => p.id === id);
  if (!person) return res.status(404).json({ error: 'Person not found' });
  if (name !== undefined) person.name = name;
  if (color !== undefined) person.color = color;
  writeJSON(FILES.people, data);
  res.json({ ok: true, person });
});

// Meals
app.get('/api/meals', (req, res) => {
  const data = readJSON(FILES.meals, { days: {} });
  const { start, end } = req.query;

  let startDate, endDate;
  if (start && end) {
    startDate = parseDateStr(start);
    endDate = parseDateStr(end);
  } else {
    const bounds = getWeekBounds(new Date());
    startDate = new Date(bounds.start);
    startDate.setDate(startDate.getDate() - 7);
    endDate = new Date(bounds.end);
    endDate.setDate(endDate.getDate() + 7);
  }

  const days = {};
  for (const d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const key = toDateStr(d);
    days[key] = data.days[key] || { meals: [], mealData: {} };
  }

  res.json({ days });
});

app.post('/api/meals/update', (req, res) => {
  const { date, meals } = req.body;
  if (!date) return res.status(400).json({ error: 'Missing date' });
  const data = readJSON(FILES.meals, { days: {} });
  if (!data.days[date]) data.days[date] = { meals: [], mealData: {} };
  data.days[date].meals = meals;
  writeJSON(FILES.meals, data);
  res.json({ ok: true });
});

app.post('/api/meals/rate-weekly', (req, res) => {
  const { date, mealName, stars, note } = req.body;
  if (!mealName) return res.status(400).json({ error: 'Missing mealName' });
  if (stars === undefined || stars === null) return res.status(400).json({ error: 'Missing stars' });
  if (!date) return res.status(400).json({ error: 'Missing date' });

  const meal = rateMealInLibrary(mealName, stars, note, date);

  const mealsData = readJSON(FILES.meals, { days: {} });
  if (!mealsData.days[date]) mealsData.days[date] = { meals: [], mealData: {} };
  const day = mealsData.days[date];
  if (!day.mealData) day.mealData = {};
  day.mealData[mealName] = { rated: true, stars: Number(stars) };
  writeJSON(FILES.meals, mealsData);

  res.json({ ok: true, meal });
});

// Exercise library
app.get('/api/exercise-library', (req, res) => {
  res.json(readJSON(FILES.exerciseLibrary, { exercises: [] }));
});

app.post('/api/exercise-library/add', (req, res) => {
  const { name, equipment, type } = req.body;
  if (!name) return res.status(400).json({ error: 'Missing name' });
  if (!equipment) return res.status(400).json({ error: 'Missing equipment' });
  if (!['strength', 'cardio'].includes(type)) return res.status(400).json({ error: 'Invalid type' });

  const data = readJSON(FILES.exerciseLibrary, { exercises: [] });
  const exercise = { id: `ex${Date.now()}`, name, equipment, type };
  data.exercises.push(exercise);
  writeJSON(FILES.exerciseLibrary, data);
  res.json({ ok: true, exercise });
});

app.delete('/api/exercise-library/:id', (req, res) => {
  const data = readJSON(FILES.exerciseLibrary, { exercises: [] });
  data.exercises = data.exercises.filter(e => e.id !== req.params.id);
  writeJSON(FILES.exerciseLibrary, data);
  res.json({ ok: true });
});

// Workouts
app.get('/api/workouts', (req, res) => {
  const data = readJSON(FILES.workouts, { days: {} });
  const { start, end } = req.query;

  let startDate, endDate;
  if (start && end) {
    startDate = parseDateStr(start);
    endDate = parseDateStr(end);
  } else {
    const bounds = getWeekBounds(new Date());
    startDate = new Date(bounds.start);
    startDate.setDate(startDate.getDate() - 7);
    endDate = new Date(bounds.end);
    endDate.setDate(endDate.getDate() + 7);
  }

  const days = {};
  for (const d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const key = toDateStr(d);
    days[key] = data.days[key] || {};
  }

  res.json({ days });
});

app.post('/api/workouts/add-exercise', (req, res) => {
  const { date, personId, exerciseId, sets, reps, weight, duration, distance } = req.body;
  if (!date) return res.status(400).json({ error: 'Missing date' });
  if (!personId) return res.status(400).json({ error: 'Missing personId' });
  if (!exerciseId) return res.status(400).json({ error: 'Missing exerciseId' });

  const library = readJSON(FILES.exerciseLibrary, { exercises: [] });
  const exercise = library.exercises.find(e => e.id === exerciseId);
  if (!exercise) return res.status(404).json({ error: 'Exercise not found' });

  const data = readJSON(FILES.workouts, { days: {} });
  if (!data.days[date]) data.days[date] = {};
  if (!data.days[date][personId]) data.days[date][personId] = [];

  const entry = {
    id: `we${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    type: exercise.type,
    sets: sets !== undefined ? Number(sets) : null,
    reps: reps !== undefined ? Number(reps) : null,
    weight: weight !== undefined ? Number(weight) : null,
    duration: duration !== undefined ? Number(duration) : null,
    distance: distance !== undefined && distance !== '' ? Number(distance) : null,
    done: false,
    doneAt: null,
  };
  data.days[date][personId].push(entry);
  writeJSON(FILES.workouts, data);
  res.json({ ok: true, entry });
});

app.post('/api/workouts/toggle', (req, res) => {
  const { date, personId, entryId } = req.body;
  const data = readJSON(FILES.workouts, { days: {} });
  const entry = (data.days[date]?.[personId] || []).find(e => e.id === entryId);
  if (!entry) return res.status(404).json({ error: 'Workout entry not found' });
  entry.done = !entry.done;
  entry.doneAt = entry.done ? new Date().toISOString() : null;
  writeJSON(FILES.workouts, data);
  res.json({ ok: true, done: entry.done });
});

app.delete('/api/workouts/:date/:personId/:entryId', (req, res) => {
  const { date, personId, entryId } = req.params;
  const data = readJSON(FILES.workouts, { days: {} });
  if (data.days[date]?.[personId]) {
    data.days[date][personId] = data.days[date][personId].filter(e => e.id !== entryId);
  }
  writeJSON(FILES.workouts, data);
  res.json({ ok: true });
});

// Recipe search (Spoonacular)
app.get('/api/recipes/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Missing query parameter q' });

    const url = `https://api.spoonacular.com/recipes/complexSearch?apiKey=${SPOONACULAR_API_KEY}&query=${encodeURIComponent(q)}&number=5&addRecipeInformation=true&fillIngredients=true&analyzedInstructions=true`;
    const r = await fetch(url);
    const data = await r.json();

    const results = (data.results || []).map(recipe => {
      let instructions = flattenAnalyzedInstructions(recipe.analyzedInstructions);
      if (instructions.length === 0 && recipe.instructions) {
        instructions = parseInstructionsFromText(recipe.instructions);
      }
      return {
        id: recipe.id,
        title: recipe.title,
        image: recipe.image,
        sourceUrl: recipe.sourceUrl,
        sourceName: recipe.sourceName || recipe.creditsText || '',
        ingredients: (recipe.extendedIngredients || recipe.missedIngredients || []).map(ing => ({
          name: ing.nameClean || ing.name || ing.originalName,
          amount: ing.amount,
          unit: ing.unit,
        })),
        instructions,
      };
    });

    if (results.length === 0 && mealieConfigured()) {
      try {
        results = await mealieSearch(q);
      } catch (err) {
        console.error('Mealie search fallback failed:', err.message);
      }
    }

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Recipe details (Mealie recipe — used when a search result came from the Mealie fallback)
app.get('/api/recipes/mealie/:slug/details', async (req, res) => {
  try {
    if (!mealieConfigured()) return res.status(400).json({ error: 'Mealie is not configured' });
    const { slug } = req.params;
    const recipe = await mealieFetch(`/api/recipes/${encodeURIComponent(slug)}`);
    res.json(await mealieRecipeToResult(recipe));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Mealie connection settings — url + long-lived API token, generated in the
// user's Mealie instance under /user/profile/api-tokens. The token is never
// echoed back to the client once saved.
app.get('/api/mealie/settings', (req, res) => {
  const { url, apiToken } = getMealieConfig();
  res.json({ url, hasToken: !!apiToken });
});

app.post('/api/mealie/settings', (req, res) => {
  const { url, apiToken } = req.body;
  const current = readJSON(FILES.mealieSettings, { url: '', apiToken: '' });
  const next = {
    url: typeof url === 'string' ? url.trim() : current.url,
    apiToken: typeof apiToken === 'string' && apiToken.trim() ? apiToken.trim() : current.apiToken,
  };
  writeJSON(FILES.mealieSettings, next);
  res.json({ ok: true, url: next.url, hasToken: !!next.apiToken });
});

// Recipe details (Spoonacular per-recipe information — includes real instructions)
app.get('/api/recipes/:id/details', async (req, res) => {
  try {
    const { id } = req.params;
    const url = `https://api.spoonacular.com/recipes/${encodeURIComponent(id)}/information?apiKey=${SPOONACULAR_API_KEY}`;
    const r = await fetch(url);
    const recipe = await r.json();
    if (!r.ok || !recipe || recipe.status === 'failure') {
      return res.status(r.status === 200 ? 502 : r.status).json({ error: recipe?.message || 'Failed to fetch recipe details' });
    }

    let instructions = flattenAnalyzedInstructions(recipe.analyzedInstructions);
    if (instructions.length === 0 && recipe.instructions) {
      instructions = parseInstructionsFromText(recipe.instructions);
    }

    res.json({
      title: recipe.title,
      image: recipe.image,
      sourceUrl: recipe.sourceUrl,
      sourceName: recipe.sourceName || recipe.creditsText || '',
      ingredients: (recipe.extendedIngredients || []).map(ing => ({
        name: ing.nameClean || ing.name || ing.originalName,
        amount: ing.amount,
        unit: ing.unit,
      })),
      instructions,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Recipe scrape (JSON-LD, with a Mealie fallback when the site has no usable schema)
app.get('/api/recipes/scrape', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  let title = 'Recipe';
  let ingredients = [];
  let instructions = [];

  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FamilyDashboard/1.0)' } });
    const html = await r.text();

    const scriptMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];

    for (const block of scriptMatches) {
      const jsonText = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
      let parsed;
      try { parsed = JSON.parse(jsonText); } catch { continue; }

      const candidates = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
      for (const item of candidates) {
        if (!item || !item['@type']) continue;
        const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
        if (!types.includes('Recipe')) continue;

        if (item.name) title = item.name;
        if (Array.isArray(item.recipeIngredient)) ingredients = item.recipeIngredient;
        else if (Array.isArray(item.ingredients)) ingredients = item.ingredients;
        try { instructions = parseSchemaInstructions(item.recipeInstructions); } catch { instructions = []; }
        break;
      }
      if (ingredients.length || instructions.length) break;
    }
  } catch (err) {
    console.error('Scrape error:', err.message);
  }

  if (ingredients.length === 0 && instructions.length === 0 && mealieConfigured()) {
    try {
      const mealieResult = await mealieImportFromUrl(url);
      if (mealieResult.ingredients.length || mealieResult.instructions.length) {
        return res.json(mealieResult);
      }
    } catch (err) {
      console.error('Mealie import fallback failed:', err.message);
    }
  }

  if (ingredients.length === 0 && instructions.length === 0) {
    return res.status(422).json({
      error: mealieConfigured()
        ? 'Could not find recipe data at that URL, even with the Mealie fallback.'
        : 'Could not find recipe data at that URL. Adding a Mealie API token in Connected Accounts may help.',
    });
  }

  res.json({ title, ingredients, instructions });
});

// Meal library
app.get('/api/meal-library', (req, res) => res.json(readJSON(FILES.mealLibrary, { meals: [] })));

app.post('/api/meal-library/save', (req, res) => {
  const { name, sourceUrl, sourceName, ingredients, instructions } = req.body;
  if (!name) return res.status(400).json({ error: 'Missing name' });

  const data = readJSON(FILES.mealLibrary, { meals: [] });
  const existing = data.meals.find(m => m.name.toLowerCase() === name.toLowerCase());
  const meal = {
    id: existing ? existing.id : `m${Date.now()}`,
    name,
    sourceUrl: sourceUrl || '',
    sourceName: sourceName || '',
    ingredients: ingredients || [],
    instructions: instructions || [],
    ratings: existing ? existing.ratings || [] : [],
    averageRating: existing ? existing.averageRating ?? null : null,
  };

  if (existing) Object.assign(existing, meal);
  else data.meals.push(meal);

  writeJSON(FILES.mealLibrary, data);
  res.json({ ok: true, meal });
});

app.post('/api/meal-library/rate', (req, res) => {
  const { mealName, stars, note, date } = req.body;
  if (!mealName) return res.status(400).json({ error: 'Missing mealName' });
  if (stars === undefined || stars === null) return res.status(400).json({ error: 'Missing stars' });

  const meal = rateMealInLibrary(mealName, stars, note, date);
  res.json({ ok: true, meal });
});

app.delete('/api/meal-library/:name', (req, res) => {
  const data = readJSON(FILES.mealLibrary, { meals: [] });
  const before = data.meals.length;
  data.meals = data.meals.filter(m => m.name.toLowerCase() !== req.params.name.toLowerCase());
  if (data.meals.length === before) return res.status(404).json({ error: 'Meal not found' });
  writeJSON(FILES.mealLibrary, data);
  res.json({ ok: true });
});

app.get('/api/meal-library/:name/full', (req, res) => {
  const data = readJSON(FILES.mealLibrary, { meals: [] });
  const meal = data.meals.find(m => m.name.toLowerCase() === req.params.name.toLowerCase());
  if (!meal) return res.status(404).json({ error: 'Meal not found' });
  res.json(meal);
});

app.get('/api/meal-library/:name/notes', (req, res) => {
  const data = readJSON(FILES.mealLibrary, { meals: [] });
  const meal = data.meals.find(m => m.name.toLowerCase() === req.params.name.toLowerCase());
  if (!meal) return res.status(404).json({ error: 'Meal not found' });

  const notes = (meal.ratings || [])
    .filter(r => r.note && r.note.trim())
    .map(r => ({ date: r.date, stars: r.stars, note: r.note }))
    .sort((a, b) => b.date.localeCompare(a.date));

  res.json({ notes });
});

// Shopping list
app.get('/api/shopping-list', (req, res) => res.json(readJSON(FILES.shoppingList, { items: [] })));

app.post('/api/shopping-list/add', (req, res) => {
  const { ingredients, mealSource } = req.body;
  const data = readJSON(FILES.shoppingList, { items: [] });

  const added = (ingredients || []).map((ing, i) => ({
    id: `i${Date.now()}${i}${Math.random().toString(36).slice(2, 6)}`,
    name: ing.name,
    amount: ing.amount ?? null,
    unit: ing.unit || '',
    checked: false,
    mealSource: mealSource || 'General',
  }));

  data.items.push(...added);
  writeJSON(FILES.shoppingList, data);
  res.json({ ok: true, items: added });
});

app.post('/api/shopping-list/toggle', (req, res) => {
  const { id } = req.body;
  const data = readJSON(FILES.shoppingList, { items: [] });
  const item = data.items.find(i => i.id === id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  item.checked = !item.checked;
  writeJSON(FILES.shoppingList, data);
  res.json({ ok: true, checked: item.checked });
});

app.post('/api/shopping-list/clear', (req, res) => {
  const data = readJSON(FILES.shoppingList, { items: [] });
  data.items = data.items.filter(i => !i.checked);
  writeJSON(FILES.shoppingList, data);
  res.json({ ok: true });
});

// Tasks
app.get('/api/tasks', (req, res) => res.json(readJSON(FILES.tasks, { lists: [] })));

app.post('/api/tasks/list/add', (req, res) => {
  const { name, color } = req.body;
  const data = readJSON(FILES.tasks, { lists: [] });
  const list = { id: `l${Date.now()}`, name: name || 'New List', color: color || '#2563eb', tasks: [] };
  data.lists.push(list);
  writeJSON(FILES.tasks, data);
  res.json({ ok: true, list });
});

app.post('/api/tasks/list/delete', (req, res) => {
  const { listId } = req.body;
  const data = readJSON(FILES.tasks, { lists: [] });
  data.lists = data.lists.filter(l => l.id !== listId);
  writeJSON(FILES.tasks, data);
  res.json({ ok: true });
});

app.post('/api/tasks/add', (req, res) => {
  const { listId, text } = req.body;
  const data = readJSON(FILES.tasks, { lists: [] });
  const list = data.lists.find(l => l.id === listId);
  if (!list) return res.status(404).json({ error: 'List not found' });
  const task = { id: `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`, text, done: false };
  list.tasks.push(task);
  writeJSON(FILES.tasks, data);
  res.json({ ok: true, task });
});

app.post('/api/tasks/toggle', (req, res) => {
  const { listId, taskId } = req.body;
  const data = readJSON(FILES.tasks, { lists: [] });
  const list = data.lists.find(l => l.id === listId);
  const task = list && list.tasks.find(t => t.id === taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  task.done = !task.done;
  writeJSON(FILES.tasks, data);
  res.json({ ok: true, done: task.done });
});

app.post('/api/tasks/delete', (req, res) => {
  const { listId, taskId } = req.body;
  const data = readJSON(FILES.tasks, { lists: [] });
  const list = data.lists.find(l => l.id === listId);
  if (!list) return res.status(404).json({ error: 'List not found' });
  list.tasks = list.tasks.filter(t => t.id !== taskId);
  writeJSON(FILES.tasks, data);
  res.json({ ok: true });
});

// Schedule
app.get('/api/schedule', (req, res) => res.json(readJSON(FILES.schedule, { slots: [] })));

app.post('/api/schedule/add', (req, res) => {
  const data = readJSON(FILES.schedule, { slots: [] });
  data.slots.push(req.body);
  data.slots.sort((a, b) => a.time.localeCompare(b.time));
  writeJSON(FILES.schedule, data);
  res.json({ ok: true });
});

app.post('/api/schedule/delete', (req, res) => {
  const { index } = req.body;
  const data = readJSON(FILES.schedule, { slots: [] });
  if (index < 0 || index >= data.slots.length) return res.status(404).json({ error: 'Slot not found' });
  data.slots.splice(index, 1);
  writeJSON(FILES.schedule, data);
  res.json({ ok: true });
});

app.post('/api/schedule/reorder', (req, res) => {
  const { slots } = req.body;
  writeJSON(FILES.schedule, { slots: slots || [] });
  res.json({ ok: true });
});

// Routines
app.get('/api/routines', (req, res) => {
  const data = readJSON(FILES.routines, { routines: [] });
  const sorted = [...data.routines].sort((a, b) => {
    const oa = TIME_OF_DAY_ORDER.indexOf(a.timeOfDay);
    const ob = TIME_OF_DAY_ORDER.indexOf(b.timeOfDay);
    return (oa === -1 ? TIME_OF_DAY_ORDER.length : oa) - (ob === -1 ? TIME_OF_DAY_ORDER.length : ob);
  });
  res.json({ routines: sorted });
});

app.post('/api/routines/add', (req, res) => {
  const { title, timeOfDay, people, steps } = req.body;
  if (!title) return res.status(400).json({ error: 'Missing title' });
  const data = readJSON(FILES.routines, { routines: [] });
  const routine = {
    id: `rt${Date.now()}`,
    title,
    timeOfDay: timeOfDay || 'morning',
    people: people || [],
    steps: (steps || []).filter(Boolean).map((name, i) => ({
      id: `rs${Date.now()}${i}${Math.random().toString(36).slice(2, 6)}`,
      name,
      done: false,
      doneAt: null,
    })),
  };
  data.routines.push(routine);
  writeJSON(FILES.routines, data);
  res.json({ ok: true, routine });
});

app.post('/api/routines/toggle-step', (req, res) => {
  const { routineId, stepId } = req.body;
  const data = readJSON(FILES.routines, { routines: [] });
  const routine = data.routines.find(r => r.id === routineId);
  if (!routine) return res.status(404).json({ error: 'Routine not found' });
  const step = routine.steps.find(s => s.id === stepId);
  if (!step) return res.status(404).json({ error: 'Step not found' });
  step.done = !step.done;
  step.doneAt = step.done ? new Date().toISOString() : null;
  writeJSON(FILES.routines, data);
  res.json({ ok: true, done: step.done });
});

app.post('/api/routines/add-step', (req, res) => {
  const { routineId, name } = req.body;
  if (!name) return res.status(400).json({ error: 'Missing name' });
  const data = readJSON(FILES.routines, { routines: [] });
  const routine = data.routines.find(r => r.id === routineId);
  if (!routine) return res.status(404).json({ error: 'Routine not found' });
  const step = { id: `rs${Date.now()}${Math.random().toString(36).slice(2, 6)}`, name, done: false, doneAt: null };
  routine.steps.push(step);
  writeJSON(FILES.routines, data);
  res.json({ ok: true, step });
});

app.post('/api/routines/update', (req, res) => {
  const { id, title, timeOfDay, people } = req.body;
  const data = readJSON(FILES.routines, { routines: [] });
  const routine = data.routines.find(r => r.id === id);
  if (!routine) return res.status(404).json({ error: 'Routine not found' });
  if (title !== undefined) routine.title = title;
  if (timeOfDay !== undefined) routine.timeOfDay = timeOfDay;
  if (people !== undefined) routine.people = people;
  writeJSON(FILES.routines, data);
  res.json({ ok: true, routine });
});

app.delete('/api/routines/:routineId/steps/:stepId', (req, res) => {
  const data = readJSON(FILES.routines, { routines: [] });
  const routine = data.routines.find(r => r.id === req.params.routineId);
  if (!routine) return res.status(404).json({ error: 'Routine not found' });
  routine.steps = routine.steps.filter(s => s.id !== req.params.stepId);
  writeJSON(FILES.routines, data);
  res.json({ ok: true });
});

app.delete('/api/routines/:id', (req, res) => {
  const data = readJSON(FILES.routines, { routines: [] });
  data.routines = data.routines.filter(r => r.id !== req.params.id);
  writeJSON(FILES.routines, data);
  res.json({ ok: true });
});

// ── Homeschool ────────────────────────────────────────────────────────────────

function readHomeschool() {
  const data = readJSON(FILES.homeschool, homeschoolDefault());
  // Ensure a full theme set (fall back to defaults for any missing day).
  data.dayThemes = { ...DEFAULT_DAY_THEMES, ...(data.dayThemes || {}) };
  data.schedules = data.schedules || {};
  data.recentActivities = data.recentActivities || [];
  return data;
}

app.get('/api/homeschool', (req, res) => {
  const data = readHomeschool();
  const { start, end } = req.query;

  let startDate, endDate;
  if (start && end) {
    startDate = parseDateStr(start);
    endDate = parseDateStr(end);
  } else {
    const bounds = getWeekBounds(new Date());
    startDate = new Date(bounds.start);
    endDate = new Date(bounds.end);
    endDate.setDate(endDate.getDate() + 14);
  }

  const schedules = {};
  for (const [personId, personSchedule] of Object.entries(data.schedules)) {
    schedules[personId] = {};
    for (const d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const key = toDateStr(d);
      schedules[personId][key] = (personSchedule && personSchedule[key]) || [];
    }
  }

  res.json({ dayThemes: data.dayThemes, schedules, recentActivities: data.recentActivities });
});

app.post('/api/homeschool/theme', (req, res) => {
  const { day, theme } = req.body;
  if (!HOMESCHOOL_DAYS.includes(day)) return res.status(400).json({ error: 'Invalid day' });
  if (typeof theme !== 'string' || !theme.trim()) return res.status(400).json({ error: 'Missing theme' });
  const data = readHomeschool();
  data.dayThemes[day] = theme.trim();
  writeJSON(FILES.homeschool, data);
  res.json({ ok: true, dayThemes: data.dayThemes });
});

app.post('/api/homeschool/activity/add', (req, res) => {
  const { personId, date, title, type, time, url } = req.body;
  if (!personId) return res.status(400).json({ error: 'Missing personId' });
  if (!date) return res.status(400).json({ error: 'Missing date' });
  if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'Missing title' });

  const data = readHomeschool();
  if (!data.schedules[personId]) data.schedules[personId] = {};
  if (!data.schedules[personId][date]) data.schedules[personId][date] = [];

  const activity = {
    id: `hs${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    title: title.trim(),
    type: type || 'anytime',
    time: type === 'scheduled' ? (time || '') : '',
    url: (url || '').trim(),
    done: false,
  };
  data.schedules[personId][date].push(activity);

  // Update shared recent-activities list: case-insensitive dedupe, most recent
  // first, capped at 12.
  const t = activity.title;
  data.recentActivities = [
    t,
    ...data.recentActivities.filter(r => r.toLowerCase() !== t.toLowerCase()),
  ].slice(0, 12);

  writeJSON(FILES.homeschool, data);
  res.json({ ok: true, activity, recentActivities: data.recentActivities });
});

app.post('/api/homeschool/activity/toggle', (req, res) => {
  const { personId, date, activityId } = req.body;
  const data = readHomeschool();
  const list = data.schedules[personId] && data.schedules[personId][date];
  if (!list) return res.status(404).json({ error: 'Not found' });
  const activity = list.find(a => a.id === activityId);
  if (!activity) return res.status(404).json({ error: 'Activity not found' });
  activity.done = !activity.done;
  writeJSON(FILES.homeschool, data);
  res.json({ ok: true, done: activity.done });
});

app.delete('/api/homeschool/activity/:personId/:date/:activityId', (req, res) => {
  const { personId, date, activityId } = req.params;
  const data = readHomeschool();
  const list = data.schedules[personId] && data.schedules[personId][date];
  if (!list) return res.status(404).json({ error: 'Not found' });
  data.schedules[personId][date] = list.filter(a => a.id !== activityId);
  writeJSON(FILES.homeschool, data);
  res.json({ ok: true });
});

// ── Reminders ─────────────────────────────────────────────────────────────────

app.get('/api/reminders', (req, res) => {
  res.json(readJSON(FILES.reminders, { reminders: [] }));
});

function parseDisplayHours(value, fallback) {
  const n = Number(value);
  return value !== undefined && value !== null && value !== '' && Number.isFinite(n) ? n : fallback;
}

app.post('/api/reminders/add', (req, res) => {
  const { message, dayOfWeek, recurrence, startDate, displayHours } = req.body;
  if (!message) return res.status(400).json({ error: 'Missing message' });
  const dow = Number(dayOfWeek);
  if (Number.isNaN(dow) || dow < 0 || dow > 6) return res.status(400).json({ error: 'Invalid dayOfWeek' });

  const data = readJSON(FILES.reminders, { reminders: [] });
  const reminder = {
    id: `rem${Date.now()}`,
    message,
    dayOfWeek: dow,
    recurrence: recurrence === 'biweekly' ? 'biweekly' : 'weekly',
    startDate: startDate || toDateStr(new Date()),
    displayHours: parseDisplayHours(displayHours, 24),
  };
  data.reminders.push(reminder);
  writeJSON(FILES.reminders, data);
  res.json({ ok: true, reminder });
});

app.post('/api/reminders/update', (req, res) => {
  const { id, message, dayOfWeek, recurrence, startDate, displayHours } = req.body;
  const data = readJSON(FILES.reminders, { reminders: [] });
  const reminder = data.reminders.find(r => r.id === id);
  if (!reminder) return res.status(404).json({ error: 'Reminder not found' });

  if (message !== undefined) reminder.message = message;
  if (dayOfWeek !== undefined) reminder.dayOfWeek = Number(dayOfWeek);
  if (recurrence !== undefined) reminder.recurrence = recurrence === 'biweekly' ? 'biweekly' : 'weekly';
  if (startDate !== undefined) reminder.startDate = startDate;
  if (displayHours !== undefined) reminder.displayHours = parseDisplayHours(displayHours, reminder.displayHours);

  writeJSON(FILES.reminders, data);
  res.json({ ok: true, reminder });
});

app.delete('/api/reminders/:id', (req, res) => {
  const data = readJSON(FILES.reminders, { reminders: [] });
  data.reminders = data.reminders.filter(r => r.id !== req.params.id);
  writeJSON(FILES.reminders, data);
  res.json({ ok: true });
});

app.get('/api/reminders/active', (req, res) => {
  const data = readJSON(FILES.reminders, { reminders: [] });
  const now = new Date();
  const active = data.reminders.filter(r => isReminderActiveNow(r, now));
  res.json({ reminders: active });
});

// ── Photos / Screensaver ─────────────────────────────────────────────────────

const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PHOTOS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const photoUpload = multer({
  storage: photoStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!PHOTO_EXTS.includes(ext)) return cb(new Error('Unsupported file type'));
    cb(null, true);
  },
});

function listPhotos() {
  return fs.readdirSync(PHOTOS_DIR)
    .filter(f => PHOTO_EXTS.includes(path.extname(f).toLowerCase()))
    .map(filename => ({ filename, url: `/api/photos/file/${filename}` }));
}

app.get('/api/photos', (req, res) => {
  res.json(listPhotos());
});

app.get('/api/photos/file/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(PHOTOS_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Photo not found' });
  res.sendFile(filePath);
});

app.get('/api/photos/settings', (req, res) => {
  res.json(readJSON(FILES.photosSettings, DEFAULT_PHOTO_SETTINGS));
});

app.post('/api/photos/settings', (req, res) => {
  const { inactivityMinutes, transitionSeconds, brightness } = req.body;
  const settings = {
    inactivityMinutes: Number(inactivityMinutes) || DEFAULT_PHOTO_SETTINGS.inactivityMinutes,
    transitionSeconds: Number(transitionSeconds) || DEFAULT_PHOTO_SETTINGS.transitionSeconds,
    brightness: Number(brightness) || DEFAULT_PHOTO_SETTINGS.brightness,
  };
  writeJSON(FILES.photosSettings, settings);
  res.json({ ok: true, settings });
});

app.get('/api/settings/general', (req, res) => {
  res.json(readJSON(FILES.generalSettings, DEFAULT_GENERAL_SETTINGS));
});

app.post('/api/settings/general', (req, res) => {
  const { hiddenNavItems } = req.body;
  const settings = {
    hiddenNavItems: Array.isArray(hiddenNavItems)
      ? hiddenNavItems.filter(id => TOGGLEABLE_NAV_ITEMS.includes(id))
      : [],
  };
  writeJSON(FILES.generalSettings, settings);
  res.json({ ok: true, settings });
});

app.get('/api/photos/fetch-url', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url parameter' });

    const r = await fetch(url);
    if (!r.ok) return res.status(400).json({ error: `Failed to fetch image: ${r.status}` });

    const contentType = (r.headers.get('content-type') || '').split(';')[0].trim();
    const ext = PHOTO_EXT_BY_MIME[contentType];
    if (!ext) return res.status(400).json({ error: 'URL does not point to a supported image type' });

    const buffer = Buffer.from(await r.arrayBuffer());
    const filename = `url_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    fs.writeFileSync(path.join(PHOTOS_DIR, filename), buffer);
    res.json({ ok: true, filename });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/photos/upload', (req, res) => {
  photoUpload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ ok: true, filename: req.file.filename });
  });
});

app.delete('/api/photos/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(PHOTOS_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Photo not found' });
  fs.unlinkSync(filePath);
  res.json({ ok: true });
});

// ── Countdowns ────────────────────────────────────────────────────────────────

app.get('/api/countdowns', (req, res) => {
  const data = readJSON(FILES.countdowns, { countdowns: [] });
  const sorted = [...data.countdowns].sort((a, b) => a.date.localeCompare(b.date));
  res.json({ countdowns: sorted });
});

app.post('/api/countdowns/add', (req, res) => {
  const { name, emoji, date, color } = req.body;
  const data = readJSON(FILES.countdowns, { countdowns: [] });
  const countdown = {
    id: `cd${Date.now()}`,
    name,
    emoji: emoji || '📅',
    date,
    color: color || '#3b82f6',
  };
  data.countdowns.push(countdown);
  writeJSON(FILES.countdowns, data);
  res.json({ ok: true, countdown });
});

app.post('/api/countdowns/update', (req, res) => {
  const { id, name, emoji, date, color } = req.body;
  const data = readJSON(FILES.countdowns, { countdowns: [] });
  const countdown = data.countdowns.find(c => c.id === id);
  if (!countdown) return res.status(404).json({ error: 'Countdown not found' });
  if (name !== undefined) countdown.name = name;
  if (emoji !== undefined) countdown.emoji = emoji;
  if (date !== undefined) countdown.date = date;
  if (color !== undefined) countdown.color = color;
  writeJSON(FILES.countdowns, data);
  res.json({ ok: true, countdown });
});

app.delete('/api/countdowns/:id', (req, res) => {
  const data = readJSON(FILES.countdowns, { countdowns: [] });
  data.countdowns = data.countdowns.filter(c => c.id !== req.params.id);
  writeJSON(FILES.countdowns, data);
  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────────────────────

initDefaults();
migrateChoreRewards();
migrateMealsToDays();
migrateMealLibrary();
migrateHomeschoolToDates();
resetChores();

const PORT = process.env.PORT || 3001;
console.log(`[startup] using timezone "${APP_TIMEZONE}" — local time now: ${new Date().toLocaleString('en-US', { timeZone: APP_TIMEZONE })}`);

app.listen(PORT, () => console.log(`Family Dashboard backend running on port ${PORT}`));
