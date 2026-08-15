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
