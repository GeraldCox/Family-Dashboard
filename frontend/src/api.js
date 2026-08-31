const BASE = '/api';

async function get(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error || `GET ${path} failed: ${r.status}`);
  }
  return r.json();
}

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const errBody = await r.json().catch(() => ({}));
    throw new Error(errBody.error || `POST ${path} failed: ${r.status}`);
  }
  return r.json();
}

async function del(path) {
  const r = await fetch(BASE + path, { method: 'DELETE' });
  if (!r.ok) throw new Error(`DELETE ${path} failed: ${r.status}`);
  return r.json();
}

export const api = {
  events: (year, month) => get(`/events?year=${year}&month=${month}`),
  weather: () => get('/weather'),
  tides: () => get('/tides'),
  chores: () => get('/chores'),
  toggleChore: (personId, choreId) => post('/chores/toggle', { personId, choreId }),
  addChore: (personId, name, emoji, reset) => post('/chores/add', { personId, name, emoji, reset }),
  deleteChore: (personId, choreId) => del(`/chores/${personId}/${choreId}`),
  setRewardGoal: (personId, rewardName, rewardStars) => post('/chores/set-reward', { personId, rewardName, rewardStars }),
  setChoreStars: (personId, choreId, stars) => post('/chores/set-stars', { personId, choreId, stars }),
  adjustStars: (personId, amount) => post('/chores/adjust-stars', { personId, amount }),
  upForGrabsChores: () => get('/chores/up-for-grabs'),
  addUpForGrabsChore: (name, emoji, stars, reset) => post('/chores/up-for-grabs/add', { name, emoji, stars, reset }),
  claimUpForGrabs: (choreId, personId) => post('/chores/up-for-grabs/claim', { choreId, personId }),
  resetUpForGrabs: () => post('/chores/up-for-grabs/reset'),
  deleteUpForGrabsChore: (choreId) => del(`/chores/up-for-grabs/${choreId}`),
  setUpForGrabsStars: (choreId, stars) => post('/chores/up-for-grabs/set-stars', { choreId, stars }),
  redeemReward: (personId, rewardId) => post('/chores/redeem', { personId, rewardId }),
  addReward: (personId, name, starsRequired, emoji) => post('/chores/rewards/add', { personId, name, starsRequired, emoji }),
  deleteReward: (personId, rewardId) => del(`/chores/rewards/${personId}/${rewardId}`),
  meals: (start, end) => get(start && end ? `/meals?start=${start}&end=${end}` : '/meals'),
  updateMeal: (date, meals) => post('/meals/update', { date, meals }),
  rateWeeklyMeal: (date, mealName, stars, note) => post('/meals/rate-weekly', { date, mealName, stars, note }),
  schedule: () => get('/schedule'),
  addScheduleSlot: (slot) => post('/schedule/add', slot),
  deleteScheduleSlot: (index) => post('/schedule/delete', { index }),
  reorderSchedule: (slots) => post('/schedule/reorder', { slots }),
  calendars: () => get('/calendars'),
  searchRecipes: (q) => get(`/recipes/search?q=${encodeURIComponent(q)}`),
  scrapeRecipe: (url) => get(`/recipes/scrape?url=${encodeURIComponent(url)}`),
  getRecipeDetails: (id) => get(`/recipes/${encodeURIComponent(id)}/details`),
  getMealieRecipeDetails: (slug) => get(`/recipes/mealie/${encodeURIComponent(slug)}/details`),
  getMealieSettings: () => get('/mealie/settings'),
  saveMealieSettings: (url, apiToken) => post('/mealie/settings', { url, apiToken }),
  getMealLibrary: () => get('/meal-library'),
  saveMealToLibrary: (meal) => post('/meal-library/save', meal),
  rateMeal: (mealName, stars, note, date) => post('/meal-library/rate', { mealName, stars, note, date }),
  deleteMealFromLibrary: (name) => del(`/meal-library/${encodeURIComponent(name)}`),
  getMealNotes: (name) => get(`/meal-library/${encodeURIComponent(name)}/notes`),
  getFullMeal: (name) => get(`/meal-library/${encodeURIComponent(name)}/full`),
  getShoppingList: () => get('/shopping-list'),
  addToShoppingList: (ingredients, mealSource) => post('/shopping-list/add', { ingredients, mealSource }),
  toggleShoppingItem: (id) => post('/shopping-list/toggle', { id }),
  clearCheckedItems: () => post('/shopping-list/clear'),
  people: () => get('/people'),
  updatePerson: (id, name, color) => post('/people/update', { id, name, color }),
  tasks: () => get('/tasks'),
  addTaskList: (name, color) => post('/tasks/list/add', { name, color }),
  deleteTaskList: (listId) => post('/tasks/list/delete', { listId }),
  addTask: (listId, text) => post('/tasks/add', { listId, text }),
  toggleTask: (listId, taskId) => post('/tasks/toggle', { listId, taskId }),
  deleteTask: (listId, taskId) => post('/tasks/delete', { listId, taskId }),
  getPhotos: () => get('/photos'),
  uploadPhoto: async (formData) => {
    const r = await fetch(BASE + '/photos/upload', { method: 'POST', body: formData });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error(body.error || `POST /photos/upload failed: ${r.status}`);
    }
    return r.json();
  },
  deletePhoto: (filename) => del(`/photos/${encodeURIComponent(filename)}`),
  fetchPhotoFromUrl: (url) => get(`/photos/fetch-url?url=${encodeURIComponent(url)}`),
  getScreensaverSettings: () => get('/photos/settings'),
  saveScreensaverSettings: (settings) => post('/photos/settings', settings),
  getGeneralSettings: () => get('/settings/general'),
  saveGeneralSettings: (settings) => post('/settings/general', settings),
  getCountdowns: () => get('/countdowns'),
  addCountdown: (name, emoji, date, color) => post('/countdowns/add', { name, emoji, date, color }),
  deleteCountdown: (id) => del(`/countdowns/${id}`),
  updateCountdown: (id, name, emoji, date, color) => post('/countdowns/update', { id, name, emoji, date, color }),
  getRoutines: () => get('/routines'),
  addRoutine: (title, timeOfDay, people, steps) => post('/routines/add', { title, timeOfDay, people, steps }),
  deleteRoutine: (id) => del(`/routines/${id}`),
  toggleRoutineStep: (routineId, stepId) => post('/routines/toggle-step', { routineId, stepId }),
  addRoutineStep: (routineId, name) => post('/routines/add-step', { routineId, name }),
  deleteRoutineStep: (routineId, stepId) => del(`/routines/${routineId}/steps/${stepId}`),
  updateRoutine: (id, title, timeOfDay, people) => post('/routines/update', { id, title, timeOfDay, people }),
  getExerciseLibrary: () => get('/exercise-library'),
  addExercise: (name, equipment, type) => post('/exercise-library/add', { name, equipment, type }),
  deleteExercise: (id) => del(`/exercise-library/${encodeURIComponent(id)}`),
  getWorkouts: (start, end) => get(start && end ? `/workouts?start=${start}&end=${end}` : '/workouts'),
  addWorkoutExercise: (date, personId, exerciseId, fields) => post('/workouts/add-exercise', { date, personId, exerciseId, ...fields }),
  toggleWorkoutExercise: (date, personId, entryId) => post('/workouts/toggle', { date, personId, entryId }),
  deleteWorkoutExercise: (date, personId, entryId) => del(`/workouts/${date}/${personId}/${encodeURIComponent(entryId)}`),
  getHomeschool: (start, end) => get(start && end ? `/homeschool?start=${start}&end=${end}` : '/homeschool'),
  updateHomeschoolTheme: (day, theme) => post('/homeschool/theme', { day, theme }),
  addHomeschoolActivity: (personId, date, title, type, time, url) => post('/homeschool/activity/add', { personId, date, title, type, time, url }),
  toggleHomeschoolActivity: (personId, date, activityId) => post('/homeschool/activity/toggle', { personId, date, activityId }),
  deleteHomeschoolActivity: (personId, date, activityId) => del(`/homeschool/activity/${personId}/${date}/${activityId}`),
  getReminders: () => get('/reminders'),
  getActiveReminders: () => get('/reminders/active'),
  addReminder: (message, dayOfWeek, recurrence, startDate, displayHours) => post('/reminders/add', { message, dayOfWeek, recurrence, startDate, displayHours }),
  updateReminder: (id, message, dayOfWeek, recurrence, startDate, displayHours) => post('/reminders/update', { id, message, dayOfWeek, recurrence, startDate, displayHours }),
  deleteReminder: (id) => del(`/reminders/${id}`),
  startGoogleAuth: () => { window.location.href = '/api/auth/google/start'; },
  getGoogleAccounts: () => get('/auth/google/accounts'),
  disconnectGoogleAccount: (id) => del(`/auth/google/accounts/${id}`),
  getGoogleCalendars: (accountId) => get(`/google-events/calendars?accountId=${encodeURIComponent(accountId)}`),
  createGoogleEvent: (accountId, calendarId, title, startDateTime, endDateTime, allDay, recurrence, description, location) =>
    post('/google-events/create', { accountId, calendarId, title, startDateTime, endDateTime, allDay, recurrence, description, location }),
  updateGoogleEvent: (accountId, calendarId, eventId, title, startDateTime, endDateTime, allDay, description, location) =>
    post('/google-events/update', { accountId, calendarId, eventId, title, startDateTime, endDateTime, allDay, description, location }),
  deleteGoogleEvent: (accountId, calendarId, eventId) =>
    del(`/google-events/${encodeURIComponent(accountId)}/${encodeURIComponent(calendarId)}/${encodeURIComponent(eventId)}`),
};
