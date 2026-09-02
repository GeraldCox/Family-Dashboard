export const DOW_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateStr(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Returns { start, end } Date objects (midnight, local time) for the
// Sunday-starting week that contains `date`.
export function getWeekBounds(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const start = addDays(d, -d.getDay());
  const end = addDays(start, 6);
  return { start, end };
}

export function formatDateRange(start, end) {
  const opts = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString([], opts)} - ${end.toLocaleDateString([], opts)}`;
}

function ordinalSuffix(day) {
  if (day % 10 === 1 && day % 100 !== 11) return 'st';
  if (day % 10 === 2 && day % 100 !== 12) return 'nd';
  if (day % 10 === 3 && day % 100 !== 13) return 'rd';
  return 'th';
}

// "Tuesday, September 1st" — same long weekday/month format used across the
// app's full-date headers, with an ordinal suffix appended to the day since
// toLocaleDateString has no built-in way to produce one.
export function formatLongDateOrdinal(date, { weekday = true, year = false } = {}) {
  const parts = [];
  if (weekday) parts.push(date.toLocaleDateString([], { weekday: 'long' }));
  const month = date.toLocaleDateString([], { month: 'long' });
  const day = date.getDate();
  let monthDay = `${month} ${day}${ordinalSuffix(day)}`;
  if (year) monthDay += `, ${date.getFullYear()}`;
  parts.push(monthDay);
  return parts.join(', ');
}

export function isSameDate(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

// Builds the 3 rolling week ranges (last / this / next) relative to today's real date.
export function getThreeWeekRanges(today = new Date()) {
  const { start: thisStart, end: thisEnd } = getWeekBounds(today);
  return [
    { key: 'last', label: 'Last Week', start: addDays(thisStart, -7), end: addDays(thisEnd, -7) },
    { key: 'this', label: 'This Week', start: thisStart, end: thisEnd },
    { key: 'next', label: 'Next Week', start: addDays(thisStart, 7), end: addDays(thisEnd, 7) },
  ];
}

// Builds 3 forward-only week ranges (this / next / the week after) relative
// to today's real date — no past week, unlike getThreeWeekRanges().
export function getForwardThreeWeekRanges(today = new Date()) {
  const { start: thisStart, end: thisEnd } = getWeekBounds(today);
  return [
    { key: 'this', label: 'This Week', start: thisStart, end: thisEnd },
    { key: 'next', label: 'Next Week', start: addDays(thisStart, 7), end: addDays(thisEnd, 7) },
    { key: 'after', label: 'Week After', start: addDays(thisStart, 14), end: addDays(thisEnd, 14) },
  ];
}
