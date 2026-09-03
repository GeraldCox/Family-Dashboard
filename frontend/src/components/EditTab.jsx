import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { useScreenSize } from '../hooks/useScreenSize';
import { daysUntil } from './CountdownWidget';
import { DOW_SHORT, DOW_LONG, toDateStr, parseDateStr, addDays, formatDateRange, isSameDate, getThreeWeekRanges, formatLongDateOrdinal } from '../utils/weekDates';
import Icon from './Icon';
import Avatar from './Avatar';
import AvatarCropModal from './AvatarCropModal';
import { TABS as NAV_TABS, TOGGLEABLE_TAB_IDS } from './Sidebar';

const DEFAULT_COUNTDOWN_COLOR = '#3b82f6';

const SUB_TABS = [
  { id: 'general',     label: 'General' },
  { id: 'people',      label: 'Family' },
  { id: 'accounts',    label: 'Calendar' },
  { id: 'chores',      label: 'Chores' },
  { id: 'routines',    label: 'Routines' },
  { id: 'meals',       label: 'Meals' },
  { id: 'workouts',    label: 'Workouts' },
  { id: 'countdowns',  label: 'Countdowns' },
  { id: 'reminders',   label: 'Reminders' },
  { id: 'screensaver', label: 'Screensaver' },
];

const VALID_SUB_TAB_IDS = SUB_TABS.map(t => t.id);

// Reopens whatever Manage sub-tab was showing before a refresh.
function getStoredSubTab() {
  const stored = localStorage.getItem('manageSubTab');
  return VALID_SUB_TAB_IDS.includes(stored) ? stored : 'general';
}

export default function EditTab({ onPreviewScreensaver, onScreensaverSettingsSaved, onGeneralSettingsSaved }) {
  const [subTab, setSubTab] = useState(getStoredSubTab);
  const { isMobile } = useScreenSize();

  useEffect(() => {
    localStorage.setItem('manageSubTab', subTab);
  }, [subTab]);

  return (
    <div style={s.wrap}>
      <SubNav subTab={subTab} setSubTab={setSubTab} isMobile={isMobile} />
      <div style={{ ...s.body, ...(isMobile ? s.bodyMobile : {}) }}>
        {subTab === 'general' && <GeneralEditor isMobile={isMobile} onGeneralSettingsSaved={onGeneralSettingsSaved} />}
        {subTab === 'chores' && <ChoresEditor isMobile={isMobile} />}
        {subTab === 'routines' && <RoutinesEditor isMobile={isMobile} />}
        {subTab === 'meals' && <MealsEditor isMobile={isMobile} />}
        {subTab === 'workouts' && <WorkoutsEditor isMobile={isMobile} />}
        {subTab === 'people' && <PeopleEditor isMobile={isMobile} />}
        {subTab === 'countdowns' && <CountdownsEditor isMobile={isMobile} />}
        {subTab === 'reminders' && <RemindersEditor isMobile={isMobile} />}
        {subTab === 'accounts' && <ConnectedAccountsEditor isMobile={isMobile} onGeneralSettingsSaved={onGeneralSettingsSaved} />}
        {subTab === 'screensaver' && (
          <ScreensaverEditor
            isMobile={isMobile}
            onPreviewScreensaver={onPreviewScreensaver}
            onScreensaverSettingsSaved={onScreensaverSettingsSaved}
          />
        )}
      </div>
    </div>
  );
}

// ── Sub-tab nav ──────────────────────────────────────────────────────────────
// Always horizontally scrollable (not just on mobile) since the tab strip can
// overflow on tablets/narrow desktop windows too. Edge fades + arrow buttons
// make the overflow discoverable on touch screens, where there's no scrollbar.

function SubNav({ subTab, setSubTab, isMobile }) {
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
    // Re-measure once this element's actual size settles, in case the
    // initial measurement ran before layout finished.
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  function scrollByAmount(dir) {
    scrollRef.current?.scrollBy({ left: dir * 160, behavior: 'smooth' });
  }

  return (
    <div style={s.subNavWrap}>
      <div ref={scrollRef} style={{ ...s.subNav, ...(isMobile ? s.subNavMobile : {}) }}>
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            style={{
              ...s.subNavTab,
              ...(isMobile ? s.subNavTabMobile : {}),
              ...(subTab === t.id ? s.subNavActive : {}),
            }}
            onClick={() => setSubTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {canScroll.left && <div style={{ ...s.subNavFade, ...s.subNavFadeLeft }} />}
      {canScroll.right && <div style={{ ...s.subNavFade, ...s.subNavFadeRight }} />}
      {canScroll.left && (
        <button style={{ ...s.subNavArrow, ...s.subNavArrowLeft }} onClick={() => scrollByAmount(-1)} aria-label="Scroll tabs left">
          <Icon name="chevron-left" size={16} />
        </button>
      )}
      {canScroll.right && (
        <button style={{ ...s.subNavArrow, ...s.subNavArrowRight }} onClick={() => scrollByAmount(1)} aria-label="Scroll tabs right">
          <Icon name="chevron-right" size={16} />
        </button>
      )}
    </div>
  );
}

// ── General Editor ───────────────────────────────────────────────────────────

const NAV_TOGGLES = NAV_TABS.filter(t => TOGGLEABLE_TAB_IDS.includes(t.id));

const THEME_OPTIONS = [
  { id: 'auto',  label: 'Automatic (sunset/sunrise)' },
  { id: 'light', label: 'Always Light' },
  { id: 'dark',  label: 'Always Dark' },
];

function GeneralEditor({ isMobile, onGeneralSettingsSaved }) {
  const [hidden, setHidden] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [hiddenHomePanels, setHiddenHomePanels] = useState(null);
  const [savingHomePanel, setSavingHomePanel] = useState(false);
  const [navLabels, setNavLabels] = useState(null);
  const [themeOverride, setThemeOverride] = useState(() => localStorage.getItem('themeOverride') || 'auto');
  const [location, setLocation] = useState(null);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationResults, setLocationResults] = useState(null);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [savingLocation, setSavingLocation] = useState(null);
  const [locationError, setLocationError] = useState('');
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState('');
  const [countdownHideAfterDays, setCountdownHideAfterDays] = useState(null);
  const [savingCountdownDays, setSavingCountdownDays] = useState(false);

  useEffect(() => {
    api.getGeneralSettings().then(res => {
      setHidden(res.hiddenNavItems || []);
      setHiddenHomePanels(res.hiddenHomePanels || []);
      setNavLabels(res.navLabels || {});
      setCountdownHideAfterDays(res.countdownHideAfterDays ?? 1);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    api.getWeatherLocation().then(setLocation).catch(console.error);
  }, []);

  async function searchLocation() {
    if (!locationQuery.trim()) return;
    setSearchingLocation(true);
    setLocationError('');
    setLocationResults(null);
    try {
      const res = await api.geocodeLocation(locationQuery.trim());
      setLocationResults(res.results || []);
    } catch (err) {
      console.error(err);
      setLocationError('Search failed.');
    } finally {
      setSearchingLocation(false);
    }
  }

  async function selectLocation(result) {
    setSavingLocation(result.label);
    try {
      const res = await api.saveWeatherLocation(result.lat, result.lon, result.label);
      setLocation(res.settings);
      setLocationResults(null);
      setLocationQuery('');
    } catch (err) {
      console.error(err);
      setLocationError('Could not save that location.');
    } finally {
      setSavingLocation(null);
    }
  }

  function startEditLabel() {
    setLabelDraft(location.label || '');
    setEditingLabel(true);
  }

  async function saveLabel() {
    const name = labelDraft.trim();
    setEditingLabel(false);
    if (!name || name === location.label) return;
    try {
      const res = await api.saveWeatherLocation(location.lat, location.lon, name);
      setLocation(res.settings);
    } catch (err) {
      console.error(err);
      setLocationError('Could not rename that location.');
    }
  }

  async function toggleNavItem(id) {
    const next = hidden.includes(id) ? hidden.filter(x => x !== id) : [...hidden, id];
    setHidden(next);
    setSavingId(id);
    try {
      const res = await api.saveGeneralSettings({ hiddenNavItems: next });
      onGeneralSettingsSaved?.(res.settings);
    } finally {
      setSavingId(null);
    }
  }

  async function toggleHomePanel(id) {
    const next = hiddenHomePanels.includes(id) ? hiddenHomePanels.filter(x => x !== id) : [...hiddenHomePanels, id];
    setHiddenHomePanels(next);
    setSavingHomePanel(true);
    try {
      const res = await api.saveGeneralSettings({ hiddenHomePanels: next });
      onGeneralSettingsSaved?.(res.settings);
    } finally {
      setSavingHomePanel(false);
    }
  }

  function setNavLabelDraft(id, value) {
    setNavLabels(prev => ({ ...prev, [id]: value }));
  }

  async function saveNavLabel(id, value) {
    const trimmed = value.trim();
    const next = { ...navLabels };
    if (trimmed) next[id] = trimmed; else delete next[id];
    setNavLabels(next);
    const res = await api.saveGeneralSettings({ navLabels: next });
    onGeneralSettingsSaved?.(res.settings);
  }

  function selectThemeOverride(value) {
    localStorage.setItem('themeOverride', value);
    window.dispatchEvent(new Event('themeOverridechange'));
    setThemeOverride(value);
  }

  async function saveCountdownHideAfterDays() {
    const n = Number(countdownHideAfterDays);
    if (!Number.isFinite(n) || n < 0) return;
    setSavingCountdownDays(true);
    try {
      const res = await api.saveGeneralSettings({ countdownHideAfterDays: n });
      setCountdownHideAfterDays(res.settings.countdownHideAfterDays);
    } finally {
      setSavingCountdownDays(false);
    }
  }

  if (hidden === null || hiddenHomePanels === null || navLabels === null) return <div style={s.empty}>Loading settings…</div>;

  return (
    <>
      <div style={s.card}>
        <div style={{ ...s.personName, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="clipboard-list" size={18} /> Navigation
        </div>
        <div style={{ ...s.emptySmall, marginBottom: 10 }}>Choose which items show up in the sidebar.</div>
        <div style={s.list}>
          {NAV_TOGGLES.map(t => {
            const enabled = !hidden.includes(t.id);
            return (
              <label key={t.id} style={{ ...s.row, cursor: 'pointer', opacity: savingId === t.id ? 0.6 : 1 }}>
                <Icon name={t.icon} size={18} style={{ color: 'var(--text-2)' }} />
                <span style={s.rowName}>{t.label}</span>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => toggleNavItem(t.id)}
                  disabled={savingId !== null}
                  style={s.toggleCheckbox}
                />
              </label>
            );
          })}
        </div>
      </div>

      <div style={s.card}>
        <div style={{ ...s.personName, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="pencil" size={18} /> Rename Navigation Labels
        </div>
        <div style={{ ...s.emptySmall, marginBottom: 10 }}>Customize the text shown under each sidebar icon. Leave blank to use the default.</div>
        <div style={s.list}>
          {NAV_TABS.map(t => (
            <div key={t.id} style={s.row}>
              <Icon name={t.icon} size={18} style={{ color: 'var(--text-2)' }} />
              <span style={s.navLabelDefault}>{t.label}</span>
              <input
                style={s.nameInput}
                type="text"
                placeholder={t.label}
                value={navLabels[t.id] || ''}
                onChange={e => setNavLabelDraft(t.id, e.target.value)}
                onBlur={e => saveNavLabel(t.id, e.target.value)}
                maxLength={20}
              />
            </div>
          ))}
        </div>
      </div>

      <div style={s.card}>
        <div style={{ ...s.personName, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="timer" size={18} /> Home Panel
        </div>
        <div style={{ ...s.emptySmall, marginBottom: 10 }}>Choose which panels show in the Home page's side card.</div>
        <div style={s.list}>
          <label style={{ ...s.row, cursor: 'pointer', opacity: savingHomePanel ? 0.6 : 1 }}>
            <Icon name="timer" size={18} style={{ color: 'var(--text-2)' }} />
            <span style={s.rowName}>Routines</span>
            <input
              type="checkbox"
              checked={!hiddenHomePanels.includes('routines')}
              onChange={() => toggleHomePanel('routines')}
              disabled={savingHomePanel}
              style={s.toggleCheckbox}
            />
          </label>
        </div>
      </div>

      <div style={s.card}>
        <div style={{ ...s.personName, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="moon" size={17} /> Display</div>
        <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}) }}>
          {THEME_OPTIONS.map(opt => (
            <button
              key={opt.id}
              style={{ ...s.addBtn, background: themeOverride === opt.id ? 'var(--blue)' : 'var(--surface2)', color: themeOverride === opt.id ? 'white' : 'var(--text-2)' }}
              onClick={() => selectThemeOverride(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div style={s.card}>
        <div style={{ ...s.personName, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="calendar" size={17} /> Countdowns</div>
        <div style={{ ...s.emptySmall, marginBottom: 10 }}>How many days a countdown keeps showing on the Home banner after its date passes.</div>
        <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}) }}>
          <input
            style={{ ...s.starsNumberInput, ...(isMobile ? s.fullWidthInput : {}) }}
            type="number"
            min={0}
            value={countdownHideAfterDays ?? ''}
            onChange={e => setCountdownHideAfterDays(e.target.value)}
          />
          <button style={s.addBtn} onClick={saveCountdownHideAfterDays} disabled={savingCountdownDays}>
            {savingCountdownDays ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div style={s.card}>
        <div style={{ ...s.personName, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="map-pin" size={17} /> Location for Weather</div>
        {location?.lat != null ? (
          editingLabel ? (
            <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}), marginBottom: 10 }}>
              <input
                style={s.nameInput}
                type="text"
                autoFocus
                value={labelDraft}
                onChange={e => setLabelDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveLabel(); if (e.key === 'Escape') setEditingLabel(false); }}
                onBlur={saveLabel}
              />
            </div>
          ) : (
            <div style={{ ...s.emptySmall, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              Currently: <strong style={{ color: 'var(--text-1)' }}>{location.label || `${location.lat}, ${location.lon}`}</strong>
              <button style={s.trashBtn} onClick={startEditLabel} title="Rename this location's label">
                <Icon name="pencil" size={14} />
              </button>
            </div>
          )
        ) : (
          <div style={{ ...s.emptySmall, marginBottom: 10 }}>
            Not set yet — the weather widget is using a fallback location. Search below to set yours.
          </div>
        )}
        <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}) }}>
          <input
            style={s.nameInput}
            type="text"
            placeholder="City, State (e.g. Brooklyn, NY)"
            value={locationQuery}
            onChange={e => setLocationQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') searchLocation(); }}
          />
          <button style={s.addBtn} onClick={searchLocation} disabled={searchingLocation || !locationQuery.trim()}>
            {searchingLocation ? 'Searching…' : 'Search'}
          </button>
        </div>
        {locationError && <div style={s.errorText}>{locationError}</div>}
        {locationResults && (
          <div style={{ ...s.list, marginTop: 10 }}>
            {locationResults.length === 0 && <div style={s.emptySmall}>No matches found.</div>}
            {locationResults.map((r, i) => (
              <div key={i} style={s.row}>
                <span style={s.rowName}>{r.label}</span>
                <button
                  style={s.addBtn}
                  onClick={() => selectLocation(r)}
                  disabled={savingLocation !== null}
                >
                  {savingLocation === r.label ? 'Saving…' : 'Use this'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Chores Editor ────────────────────────────────────────────────────────────

const RESET_OPTIONS = ['daily', 'weekly', 'manual'];
const STAR_REWARD_PEOPLE = ['kid1', 'kid2'];

function ChoresEditor({ isMobile }) {
  const [data, setData] = useState(null);
  const [drafts, setDrafts] = useState({}); // personId -> { name, emoji, reset }
  const [grabsDraft, setGrabsDraft] = useState({ name: '', emoji: '', stars: 1, reset: 'weekly' });
  const [rewardItemDrafts, setRewardItemDrafts] = useState({}); // personId -> { name, emoji, starsRequired }
  const [adjustDrafts, setAdjustDrafts] = useState({}); // personId -> amount string
  // Reordering: listId is a personId, or the string 'grabs' for the Up for
  // Grabs list — a drag can only reorder within the list it started in.
  const [dragChore, setDragChore] = useState(null); // { listId, index }
  const [dragOverIndex, setDragOverIndex] = useState(null);

  useEffect(() => { api.chores().then(setData).catch(console.error); }, []);

  function resetChoreDrag() {
    setDragChore(null);
    setDragOverIndex(null);
  }

  function handleChoreDragStart(e, listId, index) {
    setDragChore({ listId, index });
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(index)); } catch { /* ignore */ }
  }

  function handleChoreDragOver(e, listId, index) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dragChore || dragChore.listId !== listId || dragChore.index === index) return;
    if (dragOverIndex !== index) setDragOverIndex(index);
  }

  function handleChoreDrop(e, listId, index) {
    e.preventDefault();
    if (!dragChore || dragChore.listId !== listId || dragChore.index === index) { resetChoreDrag(); return; }
    if (listId === 'grabs') reorderGrabsChores(dragChore.index, index);
    else reorderPersonChores(listId, dragChore.index, index);
    resetChoreDrag();
  }

  async function reorderPersonChores(personId, fromIndex, toIndex) {
    const person = data.people.find(p => p.id === personId);
    if (!person) return;
    const arr = [...person.chores];
    const [moved] = arr.splice(fromIndex, 1);
    const insertIndex = toIndex > fromIndex ? toIndex - 1 : toIndex;
    arr.splice(insertIndex, 0, moved);
    setData(prev => ({
      ...prev,
      people: prev.people.map(p => p.id !== personId ? p : { ...p, chores: arr })
    }));
    await api.reorderChores(personId, arr.map(c => c.id));
  }

  async function reorderGrabsChores(fromIndex, toIndex) {
    const arr = [...(data.upForGrabs || [])];
    const [moved] = arr.splice(fromIndex, 1);
    const insertIndex = toIndex > fromIndex ? toIndex - 1 : toIndex;
    arr.splice(insertIndex, 0, moved);
    setData(prev => ({ ...prev, upForGrabs: arr }));
    await api.reorderUpForGrabsChores(arr.map(c => c.id));
  }

  function getDraft(personId) {
    return drafts[personId] || { name: '', emoji: '', reset: 'weekly' };
  }

  function getAdjustDraft(personId) {
    return adjustDrafts[personId] ?? '1';
  }

  function setAdjustDraft(personId, value) {
    setAdjustDrafts(prev => ({ ...prev, [personId]: value }));
  }

  async function adjustStars(personId, direction) {
    const amount = Number(getAdjustDraft(personId)) || 1;
    const res = await api.adjustStars(personId, direction * amount);
    setData(prev => ({
      ...prev,
      people: prev.people.map(p => p.id !== personId ? p : { ...p, totalStars: res.totalStars })
    }));
  }

  function setDraft(personId, patch) {
    setDrafts(prev => ({ ...prev, [personId]: { ...getDraft(personId), ...patch } }));
  }

  function getRewardItemDraft(personId) {
    return rewardItemDrafts[personId] || { name: '', emoji: '', starsRequired: 5 };
  }

  function setRewardItemDraft(personId, patch) {
    setRewardItemDrafts(prev => ({ ...prev, [personId]: { ...getRewardItemDraft(personId), ...patch } }));
  }

  async function addGrabsChore() {
    if (!grabsDraft.name.trim()) return;
    const res = await api.addUpForGrabsChore(grabsDraft.name.trim(), grabsDraft.emoji.trim(), grabsDraft.stars, grabsDraft.reset);
    setData(prev => ({ ...prev, upForGrabs: [...(prev.upForGrabs || []), res.chore] }));
    setGrabsDraft({ name: '', emoji: '', stars: 1, reset: 'weekly' });
  }

  async function deleteGrabsChore(choreId) {
    await api.deleteUpForGrabsChore(choreId);
    setData(prev => ({ ...prev, upForGrabs: (prev.upForGrabs || []).filter(c => c.id !== choreId) }));
  }

  async function setGrabsStars(choreId, stars) {
    await api.setUpForGrabsStars(choreId, stars);
    setData(prev => ({
      ...prev,
      upForGrabs: (prev.upForGrabs || []).map(c => c.id !== choreId ? c : { ...c, stars })
    }));
  }

  function updateGrabsChoreField(choreId, patch) {
    setData(prev => ({
      ...prev,
      upForGrabs: (prev.upForGrabs || []).map(c => c.id !== choreId ? c : { ...c, ...patch })
    }));
  }

  async function saveGrabsChoreEdit(choreId, patch) {
    await api.editUpForGrabsChore(choreId, patch);
  }

  async function addRewardItem(personId) {
    const draft = getRewardItemDraft(personId);
    if (!draft.name.trim()) return;
    const res = await api.addReward(personId, draft.name.trim(), draft.starsRequired, draft.emoji.trim());
    setData(prev => ({
      ...prev,
      people: prev.people.map(p => p.id !== personId ? p : { ...p, rewards: [...(p.rewards || []), res.reward] })
    }));
    setRewardItemDrafts(prev => ({ ...prev, [personId]: { name: '', emoji: '', starsRequired: 5 } }));
  }

  async function deleteRewardItem(personId, rewardId) {
    await api.deleteReward(personId, rewardId);
    setData(prev => ({
      ...prev,
      people: prev.people.map(p => p.id !== personId ? p : { ...p, rewards: (p.rewards || []).filter(r => r.id !== rewardId) })
    }));
  }

  async function addChore(personId) {
    const draft = getDraft(personId);
    if (!draft.name.trim()) return;
    const res = await api.addChore(personId, draft.name.trim(), draft.emoji.trim(), draft.reset);
    setData(prev => ({
      ...prev,
      people: prev.people.map(p => p.id !== personId ? p : { ...p, chores: [...p.chores, res.chore] })
    }));
    setDrafts(prev => ({ ...prev, [personId]: { name: '', emoji: '', reset: 'weekly' } }));
  }

  async function deleteChore(personId, choreId) {
    await api.deleteChore(personId, choreId);
    setData(prev => ({
      ...prev,
      people: prev.people.map(p => p.id !== personId ? p : { ...p, chores: p.chores.filter(c => c.id !== choreId) })
    }));
  }

  function updateChoreField(personId, choreId, patch) {
    setData(prev => ({
      ...prev,
      people: prev.people.map(p => p.id !== personId ? p : {
        ...p,
        chores: p.chores.map(c => c.id !== choreId ? c : { ...c, ...patch })
      })
    }));
  }

  async function saveChoreEdit(personId, choreId, patch) {
    await api.editChore(personId, choreId, patch);
  }

  async function setStars(personId, choreId, stars) {
    await api.setChoreStars(personId, choreId, stars);
    setData(prev => ({
      ...prev,
      people: prev.people.map(p => p.id !== personId ? p : {
        ...p,
        chores: p.chores.map(c => c.id !== choreId ? c : { ...c, stars })
      })
    }));
  }

  async function togglePersonHidden(personId, hidden) {
    setData(prev => ({
      ...prev,
      people: prev.people.map(p => p.id !== personId ? p : { ...p, hidden })
    }));
    await api.setPersonHidden(personId, hidden);
  }

  if (!data) return <div style={s.empty}>Loading chores…</div>;

  const upForGrabs = data.upForGrabs || [];

  return (
    <>
      <div style={s.card}>
        <div style={s.personName}>🙌 Up for Grabs</div>
        <div style={s.list}>
          {upForGrabs.map((chore, i) => {
            const stars = chore.stars || 1;
            return (
              <div
                key={chore.id}
                style={s.choreRowWrap}
                onDragOver={e => handleChoreDragOver(e, 'grabs', i)}
                onDrop={e => handleChoreDrop(e, 'grabs', i)}
              >
                {dragOverIndex === i && dragChore?.listId === 'grabs' && dragChore.index !== i && (
                  <div style={s.choreDragPlaceholder} />
                )}
                <div style={{ ...s.row, opacity: dragChore?.listId === 'grabs' && dragChore.index === i ? 0.4 : 1 }}>
                  <div
                    draggable
                    onDragStart={e => handleChoreDragStart(e, 'grabs', i)}
                    onDragEnd={resetChoreDrag}
                    style={s.choreDragHandle}
                    title="Drag to reorder"
                  >
                    ⠿
                  </div>
                  <input
                    style={s.rowEmojiInput}
                    type="text"
                    value={chore.emoji}
                    onChange={e => updateGrabsChoreField(chore.id, { emoji: e.target.value })}
                    onBlur={e => saveGrabsChoreEdit(chore.id, { emoji: e.target.value })}
                    title="Emoji"
                  />
                  <input
                    style={s.rowNameInput}
                    type="text"
                    value={chore.name}
                    onChange={e => updateGrabsChoreField(chore.id, { name: e.target.value })}
                    onBlur={e => saveGrabsChoreEdit(chore.id, { name: e.target.value })}
                    title="Chore name"
                  />
                  <select
                    style={s.rowResetSelect}
                    value={chore.reset}
                    onChange={e => {
                      updateGrabsChoreField(chore.id, { reset: e.target.value });
                      saveGrabsChoreEdit(chore.id, { reset: e.target.value });
                    }}
                  >
                    {RESET_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <div style={s.starPicker}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <span
                        key={n}
                        style={{ ...s.starPickerIcon, opacity: n <= stars ? 1 : 0.25 }}
                        onClick={() => setGrabsStars(chore.id, n)}
                        title={`${n} star${n === 1 ? '' : 's'}`}
                      >
                        ⭐
                      </span>
                    ))}
                  </div>
                  <button style={s.trashBtn} onClick={() => deleteGrabsChore(chore.id)} title="Delete chore">
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
          {upForGrabs.length === 0 && <div style={s.emptySmall}>No up-for-grabs chores yet</div>}
        </div>

        <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}) }}>
          <input
            style={{ ...s.emojiInput, ...(isMobile ? s.fullWidthInput : {}) }}
            type="text"
            placeholder="🙂"
            value={grabsDraft.emoji}
            onChange={e => setGrabsDraft(prev => ({ ...prev, emoji: e.target.value }))}
          />
          <input
            style={s.nameInput}
            type="text"
            placeholder="New chore name"
            value={grabsDraft.name}
            onChange={e => setGrabsDraft(prev => ({ ...prev, name: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') addGrabsChore(); }}
          />
          <input
            style={{ ...s.starsNumberInput, ...(isMobile ? s.fullWidthInput : {}) }}
            type="number"
            min={1}
            max={5}
            value={grabsDraft.stars}
            onChange={e => setGrabsDraft(prev => ({ ...prev, stars: e.target.value }))}
          />
          <select
            style={{ ...s.select, ...(isMobile ? s.fullWidthInput : {}) }}
            value={grabsDraft.reset}
            onChange={e => setGrabsDraft(prev => ({ ...prev, reset: e.target.value }))}
          >
            {RESET_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button style={s.addBtn} onClick={addGrabsChore}>Add</button>
        </div>
      </div>

      <div style={{ ...s.grid, ...(isMobile ? s.gridMobile : {}) }}>
      {data.people.map(person => {
        const draft = getDraft(person.id);
        const showReward = STAR_REWARD_PEOPLE.includes(person.id);
        return (
          <div key={person.id} style={{ ...s.card, ...(person.hidden ? s.cardHidden : {}) }}>
            <div style={s.personHead}>
              <Avatar person={person} size={39} />
              <div style={s.personName}>{person.name}</div>
              <button
                style={s.visibilityBtn}
                onClick={() => togglePersonHidden(person.id, !person.hidden)}
                title={person.hidden ? 'Hidden from Chores page — click to show' : 'Visible on Chores page — click to hide'}
              >
                <Icon name={person.hidden ? 'eye-off' : 'eye'} size={18} />
                {person.hidden ? 'Hidden' : 'Visible'}
              </button>
            </div>

            <div style={s.starAdjustRow}>
              <span style={s.starAdjustTotal}>⭐ {person.totalStars || 0}</span>
              <button style={s.starAdjustBtn} onClick={() => adjustStars(person.id, -1)} title="Remove stars">−</button>
              <input
                style={s.starAdjustInput}
                type="number"
                min={1}
                value={getAdjustDraft(person.id)}
                onChange={e => setAdjustDraft(person.id, e.target.value)}
              />
              <button style={{ ...s.starAdjustBtn, ...s.starAdjustBtnPlus }} onClick={() => adjustStars(person.id, 1)} title="Add stars">+</button>
            </div>

            <div style={s.list}>
              {person.chores.map((chore, i) => {
                const stars = chore.stars || 1;
                return (
                  <div
                    key={chore.id}
                    style={s.choreRowWrap}
                    onDragOver={e => handleChoreDragOver(e, person.id, i)}
                    onDrop={e => handleChoreDrop(e, person.id, i)}
                  >
                    {dragOverIndex === i && dragChore?.listId === person.id && dragChore.index !== i && (
                      <div style={s.choreDragPlaceholder} />
                    )}
                    <div style={{ ...s.row, opacity: dragChore?.listId === person.id && dragChore.index === i ? 0.4 : 1 }}>
                      <div
                        draggable
                        onDragStart={e => handleChoreDragStart(e, person.id, i)}
                        onDragEnd={resetChoreDrag}
                        style={s.choreDragHandle}
                        title="Drag to reorder"
                      >
                        ⠿
                      </div>
                      <input
                        style={s.rowEmojiInput}
                        type="text"
                        value={chore.emoji}
                        onChange={e => updateChoreField(person.id, chore.id, { emoji: e.target.value })}
                        onBlur={e => saveChoreEdit(person.id, chore.id, { emoji: e.target.value })}
                        title="Emoji"
                      />
                      <input
                        style={s.rowNameInput}
                        type="text"
                        value={chore.name}
                        onChange={e => updateChoreField(person.id, chore.id, { name: e.target.value })}
                        onBlur={e => saveChoreEdit(person.id, chore.id, { name: e.target.value })}
                        title="Chore name"
                      />
                      <select
                        style={s.rowResetSelect}
                        value={chore.reset}
                        onChange={e => {
                          updateChoreField(person.id, chore.id, { reset: e.target.value });
                          saveChoreEdit(person.id, chore.id, { reset: e.target.value });
                        }}
                      >
                        {RESET_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <div style={s.starPicker}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <span
                            key={n}
                            style={{ ...s.starPickerIcon, opacity: n <= stars ? 1 : 0.25 }}
                            onClick={() => setStars(person.id, chore.id, n)}
                            title={`${n} star${n === 1 ? '' : 's'}`}
                          >
                            ⭐
                          </span>
                        ))}
                      </div>
                      <button style={s.trashBtn} onClick={() => deleteChore(person.id, chore.id)} title="Delete chore">
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
              {person.chores.length === 0 && <div style={s.emptySmall}>No chores yet</div>}
            </div>

            <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}) }}>
              <input
                style={{ ...s.emojiInput, ...(isMobile ? s.fullWidthInput : {}) }}
                type="text"
                placeholder="🙂"
                value={draft.emoji}
                onChange={e => setDraft(person.id, { emoji: e.target.value })}
              />
              <input
                style={s.nameInput}
                type="text"
                placeholder="New chore name"
                value={draft.name}
                onChange={e => setDraft(person.id, { name: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') addChore(person.id); }}
              />
              <select
                style={{ ...s.select, ...(isMobile ? s.fullWidthInput : {}) }}
                value={draft.reset}
                onChange={e => setDraft(person.id, { reset: e.target.value })}
              >
                {RESET_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <button style={{ ...s.addBtn, background: person.color }} onClick={() => addChore(person.id)}>
                Add
              </button>
            </div>

            {showReward && (
              <div style={s.rewardEditor}>
                <div style={s.rewardLabel}>Redeemable Rewards</div>
                <div style={s.list}>
                  {(person.rewards || []).map(reward => (
                    <div key={reward.id} style={s.row}>
                      <span style={s.rowEmoji}>{reward.emoji}</span>
                      <span style={s.rowName}>{reward.name}</span>
                      <span style={s.rowReset}>{reward.starsRequired} ⭐</span>
                      <button style={s.trashBtn} onClick={() => deleteRewardItem(person.id, reward.id)} title="Delete reward">
                        🗑️
                      </button>
                    </div>
                  ))}
                  {(person.rewards || []).length === 0 && <div style={s.emptySmall}>No rewards yet</div>}
                </div>

                <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}) }}>
                  <input
                    style={{ ...s.emojiInput, ...(isMobile ? s.fullWidthInput : {}) }}
                    type="text"
                    placeholder="🎁"
                    value={getRewardItemDraft(person.id).emoji}
                    onChange={e => setRewardItemDraft(person.id, { emoji: e.target.value })}
                  />
                  <input
                    style={s.nameInput}
                    type="text"
                    placeholder="Reward name"
                    value={getRewardItemDraft(person.id).name}
                    onChange={e => setRewardItemDraft(person.id, { name: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') addRewardItem(person.id); }}
                  />
                  <input
                    style={{ ...s.starsNumberInput, ...(isMobile ? s.fullWidthInput : {}) }}
                    type="number"
                    min={1}
                    value={getRewardItemDraft(person.id).starsRequired}
                    onChange={e => setRewardItemDraft(person.id, { starsRequired: e.target.value })}
                  />
                  <button
                    style={{ ...s.addBtn, background: person.color }}
                    onClick={() => addRewardItem(person.id)}
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      </div>
    </>
  );
}

// ── Routines Editor ──────────────────────────────────────────────────────────

const ROUTINE_TIME_OPTIONS = ['morning', 'afternoon', 'evening', 'bedtime'];

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const EMPTY_ROUTINE_DRAFT = { title: '', timeOfDay: 'morning', people: [], steps: [''] };
const DEFAULT_ROUTINE_TIME_CUTOFFS = { morning: '11:00', afternoon: '17:00', evening: '21:00', bedtime: '23:59' };

function RoutinesEditor({ isMobile }) {
  const [routines, setRoutines] = useState(null);
  const [peopleList, setPeopleList] = useState([]);
  const [newDraft, setNewDraft] = useState(EMPTY_ROUTINE_DRAFT);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ title: '', timeOfDay: 'morning', people: [] });
  const [stepDrafts, setStepDrafts] = useState({}); // routineId -> string
  const [timeCutoffs, setTimeCutoffs] = useState(null);
  const [savingCutoffs, setSavingCutoffs] = useState(false);

  useEffect(() => {
    refresh();
    api.people().then(res => setPeopleList((res.people || []).filter(p => p.id !== 'family'))).catch(console.error);
    api.getGeneralSettings().then(res => setTimeCutoffs(res.routineTimeCutoffs || DEFAULT_ROUTINE_TIME_CUTOFFS)).catch(console.error);
  }, []);

  function setCutoffDraft(period, value) {
    setTimeCutoffs(prev => ({ ...prev, [period]: value }));
  }

  async function saveCutoffs() {
    setSavingCutoffs(true);
    try {
      const res = await api.saveGeneralSettings({ routineTimeCutoffs: timeCutoffs });
      setTimeCutoffs(res.settings.routineTimeCutoffs);
    } finally {
      setSavingCutoffs(false);
    }
  }

  function refresh() {
    api.getRoutines().then(res => setRoutines(res.routines || [])).catch(console.error);
  }

  function addStepRow() {
    setNewDraft(prev => ({ ...prev, steps: [...prev.steps, ''] }));
  }

  function updateStepRow(i, value) {
    setNewDraft(prev => ({ ...prev, steps: prev.steps.map((st, idx) => idx === i ? value : st) }));
  }

  function removeStepRow(i) {
    setNewDraft(prev => ({ ...prev, steps: prev.steps.filter((_, idx) => idx !== i) }));
  }

  function toggleNewFamily() {
    setNewDraft(prev => ({ ...prev, people: prev.people.includes('family') ? [] : ['family'] }));
  }

  function toggleNewPerson(id) {
    setNewDraft(prev => {
      if (prev.people.includes('family')) return prev;
      const has = prev.people.includes(id);
      return { ...prev, people: has ? prev.people.filter(p => p !== id) : [...prev.people, id] };
    });
  }

  async function addRoutine() {
    if (!newDraft.title.trim()) return;
    const steps = newDraft.steps.map(st => st.trim()).filter(Boolean);
    await api.addRoutine(newDraft.title.trim(), newDraft.timeOfDay, newDraft.people, steps);
    setNewDraft(EMPTY_ROUTINE_DRAFT);
    refresh();
  }

  async function deleteRoutine(id) {
    await api.deleteRoutine(id);
    setRoutines(prev => prev.filter(r => r.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function startEdit(routine) {
    setEditingId(routine.id);
    setEditDraft({ title: routine.title, timeOfDay: routine.timeOfDay, people: routine.people || [] });
  }

  function toggleEditFamily() {
    setEditDraft(prev => ({ ...prev, people: prev.people.includes('family') ? [] : ['family'] }));
  }

  function toggleEditPerson(id) {
    setEditDraft(prev => {
      if (prev.people.includes('family')) return prev;
      const has = prev.people.includes(id);
      return { ...prev, people: has ? prev.people.filter(p => p !== id) : [...prev.people, id] };
    });
  }

  async function saveEdit() {
    if (!editDraft.title.trim()) return;
    await api.updateRoutine(editingId, editDraft.title.trim(), editDraft.timeOfDay, editDraft.people);
    setRoutines(prev => prev.map(r => r.id !== editingId ? r : {
      ...r, title: editDraft.title.trim(), timeOfDay: editDraft.timeOfDay, people: editDraft.people,
    }));
    setEditingId(null);
  }

  function getStepDraft(routineId) {
    return stepDrafts[routineId] || '';
  }

  function setStepDraft(routineId, value) {
    setStepDrafts(prev => ({ ...prev, [routineId]: value }));
  }

  async function addStep(routineId) {
    const name = getStepDraft(routineId).trim();
    if (!name) return;
    const res = await api.addRoutineStep(routineId, name);
    setRoutines(prev => prev.map(r => r.id !== routineId ? r : { ...r, steps: [...r.steps, res.step] }));
    setStepDraft(routineId, '');
  }

  async function removeStep(routineId, stepId) {
    await api.deleteRoutineStep(routineId, stepId);
    setRoutines(prev => prev.map(r => r.id !== routineId ? r : { ...r, steps: r.steps.filter(st => st.id !== stepId) }));
  }

  function renderPeopleCheckboxes(peopleValue, onToggleFamily, onTogglePerson) {
    const isFamily = peopleValue.includes('family');
    return (
      <div style={s.peopleCheckboxRow}>
        <label style={s.checkboxLabel}>
          <input type="checkbox" checked={isFamily} onChange={onToggleFamily} /> Whole Family
        </label>
        {peopleList.map(p => (
          <label key={p.id} style={s.checkboxLabel}>
            <input
              type="checkbox"
              disabled={isFamily}
              checked={peopleValue.includes(p.id)}
              onChange={() => onTogglePerson(p.id)}
            /> {p.name}
          </label>
        ))}
      </div>
    );
  }

  function renderPeopleBadges(peopleValue) {
    if (!peopleValue || peopleValue.length === 0) return <span style={s.emptySmall}>No one assigned</span>;
    if (peopleValue.includes('family')) return <span style={{ ...s.peopleBadge, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="users" size={13} /> Whole Family</span>;
    return peopleValue.map(pid => {
      const p = peopleList.find(pp => pp.id === pid);
      if (!p) return null;
      return <span key={pid} style={{ ...s.peopleBadge, borderColor: p.color, color: p.color }}>{p.name}</span>;
    });
  }

  if (!routines) return <div style={s.empty}>Loading routines…</div>;

  return (
    <>
      <div style={s.card}>
        <div style={{ ...s.personName, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="timer" size={18} /> Time Windows</div>
        <div style={{ ...s.emptySmall, marginBottom: 10 }}>
          Complete-by time for each period. Past this time, an unfinished routine is flagged; a finished one collapses automatically.
        </div>
        <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}), flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {ROUTINE_TIME_OPTIONS.map(t => (
            <label key={t} style={s.cutoffLabel}>
              {capitalize(t)}
              <input
                type="time"
                style={s.dateInput}
                value={timeCutoffs?.[t] || ''}
                onChange={e => setCutoffDraft(t, e.target.value)}
              />
            </label>
          ))}
          <button style={s.addBtn} onClick={saveCutoffs} disabled={savingCutoffs || !timeCutoffs}>
            {savingCutoffs ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div style={s.card}>
        <div style={{ ...s.personName, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="plus" size={18} /> Add Routine</div>
        <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}) }}>
          <input
            style={s.nameInput}
            type="text"
            placeholder="Routine title"
            value={newDraft.title}
            onChange={e => setNewDraft(prev => ({ ...prev, title: e.target.value }))}
          />
          <select
            style={{ ...s.select, ...(isMobile ? s.fullWidthInput : {}) }}
            value={newDraft.timeOfDay}
            onChange={e => setNewDraft(prev => ({ ...prev, timeOfDay: e.target.value }))}
          >
            {ROUTINE_TIME_OPTIONS.map(t => <option key={t} value={t}>{capitalize(t)}</option>)}
          </select>
        </div>

        {renderPeopleCheckboxes(newDraft.people, toggleNewFamily, toggleNewPerson)}

        <div style={s.rewardLabel}>Steps</div>
        <div style={s.list}>
          {newDraft.steps.map((step, i) => (
            <div key={i} style={s.row}>
              <input
                style={s.nameInput}
                type="text"
                placeholder={`Step ${i + 1}`}
                value={step}
                onChange={e => updateStepRow(i, e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addStepRow(); }}
              />
              {newDraft.steps.length > 1 && (
                <button style={s.trashBtn} onClick={() => removeStepRow(i)} title="Remove step"><Icon name="trash" size={16} /></button>
              )}
            </div>
          ))}
        </div>

        <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}) }}>
          <button style={s.cancelBtn} onClick={addStepRow}>+ Add step</button>
          <button style={s.addBtn} onClick={addRoutine}>Add Routine</button>
        </div>
      </div>

      {ROUTINE_TIME_OPTIONS.map(tod => {
        const items = routines.filter(r => r.timeOfDay === tod);
        if (items.length === 0) return null;
        return (
          <div key={tod} style={s.card}>
            <div style={s.personName}>{capitalize(tod)}</div>
            {items.map(routine => (
              <div key={routine.id} style={s.countdownEditBlock}>
                <div style={s.routineCardHead}>
                  <div style={s.rowName}>{routine.title}</div>
                  <span style={s.rowReset}>{routine.steps.length} step{routine.steps.length === 1 ? '' : 's'}</span>
                  <button style={s.trashBtn} onClick={() => startEdit(routine)} title="Edit routine"><Icon name="pencil" size={16} /></button>
                  <button style={s.trashBtn} onClick={() => deleteRoutine(routine.id)} title="Delete routine"><Icon name="trash" size={16} /></button>
                </div>
                <div style={s.peopleBadgesRow}>{renderPeopleBadges(routine.people)}</div>

                {editingId === routine.id && (
                  <div style={s.rewardEditor}>
                    <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}) }}>
                      <input
                        style={s.nameInput}
                        type="text"
                        value={editDraft.title}
                        onChange={e => setEditDraft(prev => ({ ...prev, title: e.target.value }))}
                      />
                      <select
                        style={{ ...s.select, ...(isMobile ? s.fullWidthInput : {}) }}
                        value={editDraft.timeOfDay}
                        onChange={e => setEditDraft(prev => ({ ...prev, timeOfDay: e.target.value }))}
                      >
                        {ROUTINE_TIME_OPTIONS.map(t => <option key={t} value={t}>{capitalize(t)}</option>)}
                      </select>
                    </div>
                    {renderPeopleCheckboxes(editDraft.people, toggleEditFamily, toggleEditPerson)}
                    <div style={s.addRow}>
                      <button style={s.addBtn} onClick={saveEdit}>Save</button>
                      <button style={s.cancelBtn} onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  </div>
                )}

                <div style={s.list}>
                  {routine.steps.map(step => (
                    <div key={step.id} style={s.row}>
                      <span style={s.rowName}>{step.name}</span>
                      <button style={s.trashBtn} onClick={() => removeStep(routine.id, step.id)} title="Delete step"><Icon name="trash" size={16} /></button>
                    </div>
                  ))}
                  {routine.steps.length === 0 && <div style={s.emptySmall}>No steps yet</div>}
                </div>

                <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}) }}>
                  <input
                    style={s.nameInput}
                    type="text"
                    placeholder="New step name"
                    value={getStepDraft(routine.id)}
                    onChange={e => setStepDraft(routine.id, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addStep(routine.id); }}
                  />
                  <button style={s.addBtn} onClick={() => addStep(routine.id)}>+ Step</button>
                </div>
              </div>
            ))}
          </div>
        );
      })}
      {routines.length === 0 && <div style={s.emptySmall}>No routines yet</div>}
    </>
  );
}

// ── Meals Editor ─────────────────────────────────────────────────────────────

function RecipeResultCard({ image, title, sourceName, ingredients, onSelect, disabled, loading }) {
  const preview = (ingredients || []).slice(0, 5).map(ing => ing.name).filter(Boolean);
  return (
    <div style={s.recipeResultCard}>
      {image && <img src={image} alt={title} style={s.recipeResultImg} />}
      <div style={s.recipeResultInfo}>
        <div style={s.rowName}>{title}</div>
        {sourceName && <div style={s.emptySmall}>{sourceName}</div>}
        {preview.length > 0 && <div style={s.recipeResultIngredients}>{preview.join(', ')}</div>}
      </div>
      <button style={s.addBtn} onClick={onSelect} disabled={disabled}>{loading ? 'Loading…' : 'Select'}</button>
    </div>
  );
}

function MealsEditor({ isMobile }) {
  const [data, setData] = useState(null);
  const [library, setLibrary] = useState([]);
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const weeks = getThreeWeekRanges(today);
  const [selectedDate, setSelectedDate] = useState(() => toDateStr(todayMidnight));
  const [expandedWeeks, setExpandedWeeks] = useState({ last: false, this: true, next: false });
  const [nameInput, setNameInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectingId, setSelectingId] = useState(null);
  const [error, setError] = useState('');
  const [shoppingPrompt, setShoppingPrompt] = useState(null); // { title, ingredients }
  const [editingMealIdx, setEditingMealIdx] = useState(null);
  const [mealEditDraft, setMealEditDraft] = useState('');

  useEffect(() => {
    api.meals(toDateStr(weeks[0].start), toDateStr(weeks[2].end)).then(setData).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { refreshLibrary(); }, []);

  function refreshLibrary() {
    api.getMealLibrary().then(res => setLibrary(res.meals || [])).catch(console.error);
  }

  function toggleWeek(key) {
    setExpandedWeeks(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function selectDay(dateKey) {
    setSelectedDate(dateKey);
    setNameInput('');
    setUrlInput('');
    setSearchResults(null);
    setError('');
    setEditingMealIdx(null);
  }

  const suggestions = nameInput.trim().length > 0
    ? library.filter(m => m.name.toLowerCase().includes(nameInput.trim().toLowerCase())).slice(0, 5)
    : [];
  const exactLibraryMatch = library.find(m => m.name.toLowerCase() === nameInput.trim().toLowerCase());

  async function removeMeal(mealIdx) {
    const meals = (data.days[selectedDate]?.meals || []).filter((_, i) => i !== mealIdx);
    await api.updateMeal(selectedDate, meals);
    setData(prev => ({ days: { ...prev.days, [selectedDate]: { ...(prev.days[selectedDate] || {}), meals } } }));
  }

  function startEditMeal(mealIdx, currentName) {
    setEditingMealIdx(mealIdx);
    setMealEditDraft(currentName);
  }

  async function saveMealEdit() {
    const name = mealEditDraft.trim();
    const idx = editingMealIdx;
    setEditingMealIdx(null);
    if (idx === null || !name) return;
    const existing = (data.days[selectedDate]?.meals || [])[idx];
    if (name === existing) return;
    const meals = (data.days[selectedDate]?.meals || []).map((m, i) => i === idx ? name : m);
    await api.updateMeal(selectedDate, meals);
    setData(prev => ({ days: { ...prev.days, [selectedDate]: { ...(prev.days[selectedDate] || {}), meals } } }));
  }

  async function addMealName(name) {
    const meals = [...(data.days[selectedDate]?.meals || []), name];
    await api.updateMeal(selectedDate, meals);
    setData(prev => ({ days: { ...prev.days, [selectedDate]: { ...(prev.days[selectedDate] || {}), meals } } }));
  }

  function addPlainName() {
    if (!nameInput.trim()) return;
    addMealName(nameInput.trim());
    setNameInput('');
  }

  async function runSearch() {
    if (!nameInput.trim()) return;
    setSearching(true);
    setError('');
    setSearchResults(null);
    try {
      const results = await api.searchRecipes(nameInput.trim());
      setSearchResults(results);
    } catch (err) {
      console.error(err);
      setError('Recipe search failed.');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function runImport() {
    if (!urlInput.trim()) return;
    setImporting(true);
    setError('');
    try {
      const scraped = await api.scrapeRecipe(urlInput.trim());
      let hostname = '';
      try { hostname = new URL(urlInput.trim()).hostname.replace(/^www\./, ''); } catch { /* ignore */ }

      const ingredients = (scraped.ingredients || []).map(ing =>
        typeof ing === 'string' ? { name: ing, amount: null, unit: '' } : ing
      );
      const title = scraped.title || 'Recipe';

      await api.saveMealToLibrary({
        name: title,
        sourceUrl: urlInput.trim(),
        sourceName: hostname,
        ingredients,
        instructions: scraped.instructions || [],
      });
      await addMealName(title);
      refreshLibrary();
      setUrlInput('');
      setNameInput('');

      if (ingredients.length) {
        setShoppingPrompt({ title, ingredients });
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not import recipe from that URL.');
    } finally {
      setImporting(false);
    }
  }

  async function selectCandidate(candidate) {
    setSelectingId(candidate.selectKey);
    setError('');
    try {
      let full = candidate;
      const isSpoonacularResult = !!candidate.spoonacularId;
      const isMealieResult = !!candidate.mealieSlug;
      if (isSpoonacularResult) {
        const details = await api.getRecipeDetails(candidate.spoonacularId);
        full = {
          title: details.title || candidate.title,
          sourceUrl: details.sourceUrl || candidate.sourceUrl,
          sourceName: details.sourceName || candidate.sourceName,
          ingredients: details.ingredients?.length ? details.ingredients : candidate.ingredients,
          instructions: details.instructions?.length ? details.instructions : candidate.instructions,
        };
      } else if (isMealieResult) {
        const details = await api.getMealieRecipeDetails(candidate.mealieSlug);
        full = {
          title: details.title || candidate.title,
          sourceUrl: details.sourceUrl || candidate.sourceUrl,
          sourceName: details.sourceName || candidate.sourceName,
          ingredients: details.ingredients?.length ? details.ingredients : candidate.ingredients,
          instructions: details.instructions?.length ? details.instructions : candidate.instructions,
        };
      }

      await api.saveMealToLibrary({
        name: full.title,
        sourceUrl: full.sourceUrl || '',
        sourceName: full.sourceName || '',
        ingredients: full.ingredients || [],
        instructions: full.instructions || [],
      });
      await addMealName(full.title);
      refreshLibrary();
      setNameInput('');
      setSearchResults(null);

      if ((isSpoonacularResult || isMealieResult) && full.ingredients?.length) {
        setShoppingPrompt({ title: full.title, ingredients: full.ingredients });
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not select that recipe.');
    } finally {
      setSelectingId(null);
    }
  }

  async function confirmAddToShoppingList() {
    if (!shoppingPrompt) return;
    await api.addToShoppingList(shoppingPrompt.ingredients, shoppingPrompt.title);
    setShoppingPrompt(null);
  }

  function selectLibraryMeal(meal) {
    selectCandidate({
      selectKey: meal.id,
      title: meal.name,
      sourceUrl: meal.sourceUrl,
      sourceName: meal.sourceName,
      ingredients: meal.ingredients,
      instructions: meal.instructions,
    });
  }

  if (!data) return <div style={s.empty}>Loading meals…</div>;

  const day = data.days[selectedDate] || { meals: [] };
  const selectedDateObj = parseDateStr(selectedDate);
  const selectedLabel = formatLongDateOrdinal(selectedDateObj, { month: 'short' });

  return (
    <div>
      {weeks.map(week => {
        const isExpanded = expandedWeeks[week.key];
        const dayDates = Array.from({ length: 7 }, (_, i) => addDays(week.start, i));
        return (
          <div key={week.key} style={s.weekBlock}>
            <button style={s.weekToggleBtn} onClick={() => toggleWeek(week.key)}>
              <span>{week.label} · {formatDateRange(week.start, week.end)}</span>
              <span style={{ ...s.weekToggleChevron, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                <Icon name="chevron-right" size={16} />
              </span>
            </button>
            {isExpanded && (
              <div style={{ ...s.daySelectorRow, ...(isMobile ? s.daySelectorRowMobile : {}) }}>
                {dayDates.map(date => {
                  const dateKey = toDateStr(date);
                  const isSelected = dateKey === selectedDate;
                  const isToday = isSameDate(date, todayMidnight);
                  const hasMeals = (data.days[dateKey]?.meals || []).length > 0;
                  return (
                    <button
                      key={dateKey}
                      style={{
                        ...s.dayPill,
                        ...(isToday && !isSelected ? s.dayPillToday : {}),
                        ...(isSelected ? s.dayPillActive : {}),
                      }}
                      onClick={() => selectDay(dateKey)}
                    >
                      {DOW_SHORT[date.getDay()]} {date.getDate()}
                      {hasMeals
                        ? <Icon name="check-square" size={13} style={{ ...s.dayPillCheckIcon, ...(isSelected ? s.dayPillCheckIconActive : {}) }} />
                        : <span style={s.dayPillCheckEmpty} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div style={s.card}>
        <div style={s.personName}>{selectedLabel}</div>

        {day.meals.length > 0 && (
          <div style={s.currentMeals}>
            {day.meals.map((m, i) => (
              editingMealIdx === i ? (
                <div key={i} style={s.currentPillEditing}>
                  <input
                    autoFocus
                    style={s.currentPillInput}
                    value={mealEditDraft}
                    onChange={e => setMealEditDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveMealEdit();
                      if (e.key === 'Escape') setEditingMealIdx(null);
                    }}
                    onBlur={saveMealEdit}
                  />
                </div>
              ) : (
                <div key={i} style={s.currentPill}>
                  <span
                    style={s.currentPillName}
                    onClick={() => startEditMeal(i, m)}
                    title="Click to rename"
                  >
                    {m}
                  </span>
                  <button style={s.removeBtn} onClick={() => startEditMeal(i, m)} aria-label="Rename meal" title="Rename meal"><Icon name="pencil" size={13} /></button>
                  <button style={s.removeBtn} onClick={() => removeMeal(i)} aria-label="Remove meal" title="Remove meal"><Icon name="x" size={14} /></button>
                </div>
              )
            ))}
          </div>
        )}

        <div style={s.rewardLabel}>Meal name</div>
        <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}) }}>
          <input
            style={s.nameInput}
            type="text"
            placeholder="e.g. Chicken tacos"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runSearch(); }}
          />
          <button style={s.addBtn} onClick={addPlainName} disabled={!nameInput.trim()}>Add</button>
        </div>
        {suggestions.length > 0 && (
          <div style={s.suggestions}>
            {suggestions.map(m => (
              <div key={m.id} style={s.suggestionItem} onClick={() => setNameInput(m.name)}>
                {m.name}
              </div>
            ))}
          </div>
        )}

        {exactLibraryMatch && (
          <div style={s.rewardEditor}>
            <div style={s.rewardLabel}>From your meal library</div>
            <RecipeResultCard
              title={exactLibraryMatch.name}
              sourceName={exactLibraryMatch.sourceName}
              ingredients={exactLibraryMatch.ingredients}
              onSelect={() => selectLibraryMeal(exactLibraryMatch)}
              disabled={selectingId !== null}
              loading={selectingId === exactLibraryMatch.id}
            />
          </div>
        )}

        <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}), marginTop: 10 }}>
          <button style={{ ...s.searchBtn, display: 'inline-flex', alignItems: 'center', gap: 7, justifyContent: 'center' }} onClick={runSearch} disabled={searching || !nameInput.trim()}>
            {searching ? 'Searching…' : <><Icon name="search" size={16} /> Search recipes</>}
          </button>
        </div>

        {searchResults && (
          <div style={s.rewardEditor}>
            <div style={s.rewardLabel}>Search results</div>
            {searchResults.length === 0 && <div style={s.emptySmall}>No recipes found.</div>}
            <div style={s.resultsList}>
              {searchResults.map(recipe => (
                <RecipeResultCard
                  key={recipe.id}
                  image={recipe.image}
                  title={recipe.title}
                  sourceName={recipe.sourceName}
                  ingredients={recipe.ingredients}
                  onSelect={() => selectCandidate({
                    selectKey: recipe.id,
                    spoonacularId: recipe.mealieSlug ? undefined : recipe.id,
                    mealieSlug: recipe.mealieSlug,
                    title: recipe.title,
                    sourceUrl: recipe.sourceUrl,
                    sourceName: recipe.sourceName,
                    ingredients: recipe.ingredients,
                    instructions: recipe.instructions,
                  })}
                  disabled={selectingId !== null}
                  loading={selectingId === recipe.id}
                />
              ))}
            </div>
          </div>
        )}

        <div style={s.rewardEditor}>
          <div style={s.rewardLabel}>Import from URL</div>
          <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}) }}>
            <input
              style={s.nameInput}
              type="text"
              placeholder="https://example.com/recipe"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') runImport(); }}
            />
            <button style={s.addBtn} onClick={runImport} disabled={importing || !urlInput.trim()}>
              {importing ? 'Importing…' : 'Import'}
            </button>
          </div>
        </div>

        {error && <div style={s.errorText}>{error}</div>}
      </div>

      {shoppingPrompt && (
        <div style={s.overlay} onClick={() => setShoppingPrompt(null)}>
          <div style={s.shoppingPromptModal} onClick={e => e.stopPropagation()}>
            <div style={s.noticeText}>
              Add ingredients from {shoppingPrompt.title} to your shopping list?
            </div>
            <div style={s.shoppingPromptActions}>
              <button style={s.skipBtn} onClick={() => setShoppingPrompt(null)}>Skip</button>
              <button style={s.addBtn} onClick={confirmAddToShoppingList}>Add</button>
            </div>
          </div>
        </div>
      )}

      <SpoonacularSettingsCard isMobile={isMobile} />
      <MealieSettingsCard isMobile={isMobile} />
    </div>
  );
}

// ── Workouts Editor ──────────────────────────────────────────────────────────

const EXERCISE_TYPE_OPTIONS = ['strength', 'cardio'];

function WorkoutsEditor({ isMobile }) {
  const [library, setLibrary] = useState(null);
  const [draft, setDraft] = useState({ name: '', equipment: '', type: 'strength' });

  useEffect(() => { refresh(); }, []);

  function refresh() {
    api.getExerciseLibrary().then(setLibrary).catch(console.error);
  }

  async function addExercise() {
    if (!draft.name.trim() || !draft.equipment.trim()) return;
    const res = await api.addExercise(draft.name.trim(), draft.equipment.trim(), draft.type);
    setLibrary(prev => ({ exercises: [...prev.exercises, res.exercise] }));
    setDraft(prev => ({ name: '', equipment: prev.equipment, type: prev.type }));
  }

  async function deleteExercise(id) {
    await api.deleteExercise(id);
    setLibrary(prev => ({ exercises: prev.exercises.filter(e => e.id !== id) }));
  }

  if (!library) return <div style={s.empty}>Loading exercise library…</div>;

  const grouped = {};
  library.exercises.forEach(ex => {
    if (!grouped[ex.equipment]) grouped[ex.equipment] = [];
    grouped[ex.equipment].push(ex);
  });

  return (
    <div style={s.card}>
      <div style={{ ...s.personName, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="dumbbell" size={18} /> Exercise Library</div>

      {Object.entries(grouped).map(([equipment, exercises]) => (
        <div key={equipment} style={s.rewardEditor}>
          <div style={s.rewardLabel}>{equipment}</div>
          <div style={s.list}>
            {exercises.map(ex => (
              <div key={ex.id} style={s.row}>
                <span style={s.rowReset}>{ex.type}</span>
                <span style={s.rowName}>{ex.name}</span>
                <button style={s.trashBtn} onClick={() => deleteExercise(ex.id)} title="Delete exercise" aria-label="Delete exercise">
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
      {library.exercises.length === 0 && <div style={s.emptySmall}>No exercises yet</div>}

      <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}), marginTop: 14 }}>
        <input
          style={s.nameInput}
          type="text"
          placeholder="Exercise name"
          value={draft.name}
          onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') addExercise(); }}
        />
        <input
          style={{ ...s.nameInput, ...(isMobile ? s.fullWidthInput : {}) }}
          type="text"
          placeholder="Equipment (e.g. Dumbbells)"
          value={draft.equipment}
          onChange={e => setDraft(prev => ({ ...prev, equipment: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') addExercise(); }}
        />
        <select
          style={{ ...s.select, ...(isMobile ? s.fullWidthInput : {}) }}
          value={draft.type}
          onChange={e => setDraft(prev => ({ ...prev, type: e.target.value }))}
        >
          {EXERCISE_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button style={s.addBtn} onClick={addExercise}>Add</button>
      </div>
    </div>
  );
}

// ── People Editor ────────────────────────────────────────────────────────────

function PeopleEditor({ isMobile }) {
  const [people, setPeople] = useState(null);
  const [drafts, setDrafts] = useState({}); // id -> { name, color }
  const [savingId, setSavingId] = useState(null);
  const [croppingId, setCroppingId] = useState(null);
  const [photoBusyId, setPhotoBusyId] = useState(null);

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    api.people().then(res => {
      setPeople(res.people);
      const init = {};
      res.people.forEach(p => { init[p.id] = { name: p.name, color: p.color }; });
      setDrafts(init);
    }).catch(console.error);
  }

  function setDraft(id, patch) {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function save(id) {
    const draft = drafts[id];
    setSavingId(id);
    try {
      await api.updatePerson(id, draft.name, draft.color);
      setPeople(prev => prev.map(p => p.id === id ? { ...p, name: draft.name, color: draft.color } : p));
    } finally {
      setSavingId(null);
    }
  }

  async function savePhoto(id, blob) {
    const res = await api.uploadPersonPhoto(id, blob);
    setPeople(prev => prev.map(p => p.id === id ? { ...p, photoUrl: res.person.photoUrl } : p));
    setCroppingId(null);
  }

  async function removePhoto(id) {
    setPhotoBusyId(id);
    try {
      await api.deletePersonPhoto(id);
      setPeople(prev => prev.map(p => p.id === id ? { ...p, photoUrl: null } : p));
    } finally {
      setPhotoBusyId(null);
    }
  }

  if (!people) return <div style={s.empty}>Loading people…</div>;

  const croppingPerson = people.find(p => p.id === croppingId);

  return (
    <div style={{ ...s.grid, ...(isMobile ? s.gridMobile : {}) }}>
      {people.map(person => {
        const draft = drafts[person.id] || { name: person.name, color: person.color };
        return (
          <div key={person.id} style={s.card}>
            <div style={s.personHead}>
              <Avatar person={{ ...person, color: draft.color }} size={48} />
              <input
                style={s.nameInput}
                type="text"
                value={draft.name}
                onChange={e => setDraft(person.id, { name: e.target.value })}
              />
            </div>
            <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}) }}>
              <button style={s.cancelBtn} onClick={() => setCroppingId(person.id)}>
                {person.photoUrl ? 'Change Photo' : 'Add Photo'}
              </button>
              {person.photoUrl && (
                <button
                  style={s.cancelBtn}
                  onClick={() => removePhoto(person.id)}
                  disabled={photoBusyId === person.id}
                >
                  {photoBusyId === person.id ? 'Removing…' : 'Remove Photo'}
                </button>
              )}
            </div>
            <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}) }}>
              <input
                style={{ ...s.colorInput, ...(isMobile ? s.fullWidthInput : {}) }}
                type="color"
                value={draft.color}
                onChange={e => setDraft(person.id, { color: e.target.value })}
              />
              <button
                style={{ ...s.addBtn, background: draft.color }}
                onClick={() => save(person.id)}
                disabled={savingId === person.id}
              >
                {savingId === person.id ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        );
      })}

      {croppingPerson && (
        <AvatarCropModal
          personName={croppingPerson.name}
          color={drafts[croppingPerson.id]?.color || croppingPerson.color}
          onClose={() => setCroppingId(null)}
          onSave={blob => savePhoto(croppingPerson.id, blob)}
        />
      )}
    </div>
  );
}

// ── Countdowns Editor ────────────────────────────────────────────────────────

function CountdownPreviewCard({ draft }) {
  const days = draft.date ? daysUntil(draft.date) : null;
  const color = draft.color || DEFAULT_COUNTDOWN_COLOR;

  return (
    <div style={{ ...s.previewCard, borderLeft: `4px solid ${color}` }}>
      <div style={s.previewEmoji}>{draft.emoji || '📅'}</div>
      <div style={s.previewName}>{draft.name || 'Event name'}</div>
      {days === null && <div style={s.previewMuted}>—</div>}
      {days !== null && days > 0 && (
        <>
          <div style={{ ...s.previewDays, color }}>{days}</div>
          <div style={s.previewDaysLabel}>days to go</div>
        </>
      )}
      {days === 0 && <div style={{ ...s.previewToday, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="party-popper" size={15} /> Today!</div>}
      {days !== null && days < 0 && <div style={{ ...s.previewDone, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="check" size={14} /> Done</div>}
    </div>
  );
}

function CountdownsEditor({ isMobile }) {
  const [countdowns, setCountdowns] = useState(null);
  const [draft, setDraft] = useState({ emoji: '', name: '', date: '', color: DEFAULT_COUNTDOWN_COLOR });
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ emoji: '', name: '', date: '', color: DEFAULT_COUNTDOWN_COLOR });

  useEffect(() => { refresh(); }, []);

  function refresh() {
    api.getCountdowns().then(res => setCountdowns(res.countdowns || [])).catch(console.error);
  }

  async function addCountdown() {
    if (!draft.name.trim() || !draft.date) return;
    await api.addCountdown(draft.name.trim(), draft.emoji.trim() || '📅', draft.date, draft.color);
    setDraft({ emoji: '', name: '', date: '', color: DEFAULT_COUNTDOWN_COLOR });
    refresh();
  }

  function startEdit(cd) {
    setEditingId(cd.id);
    setEditDraft({ emoji: cd.emoji, name: cd.name, date: cd.date, color: cd.color });
  }

  async function saveEdit() {
    if (!editDraft.name.trim() || !editDraft.date) return;
    await api.updateCountdown(editingId, editDraft.name.trim(), editDraft.emoji.trim() || '📅', editDraft.date, editDraft.color);
    setEditingId(null);
    refresh();
  }

  async function removeCountdown(id) {
    await api.deleteCountdown(id);
    setCountdowns(prev => prev.filter(c => c.id !== id));
    if (editingId === id) setEditingId(null);
  }

  if (!countdowns) return <div style={s.empty}>Loading countdowns…</div>;

  return (
    <div style={s.card}>
      <div style={{ ...s.personName, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="calendar" size={18} /> Countdowns</div>

      <div style={s.list}>
        {countdowns.map(cd => (
          editingId === cd.id ? (
            <div key={cd.id} style={s.countdownEditBlock}>
              <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}) }}>
                <input
                  style={{ ...s.emojiInput, ...(isMobile ? s.fullWidthInput : {}) }}
                  type="text"
                  value={editDraft.emoji}
                  onChange={e => setEditDraft(prev => ({ ...prev, emoji: e.target.value }))}
                />
                <input
                  style={s.nameInput}
                  type="text"
                  value={editDraft.name}
                  onChange={e => setEditDraft(prev => ({ ...prev, name: e.target.value }))}
                />
                <input
                  style={{ ...s.dateInput, ...(isMobile ? s.fullWidthInput : {}) }}
                  type="date"
                  value={editDraft.date}
                  onChange={e => setEditDraft(prev => ({ ...prev, date: e.target.value }))}
                />
                <input
                  style={{ ...s.colorInput, ...(isMobile ? s.fullWidthInput : {}) }}
                  type="color"
                  value={editDraft.color}
                  onChange={e => setEditDraft(prev => ({ ...prev, color: e.target.value }))}
                />
              </div>
              <div style={s.countdownEditFooter}>
                <CountdownPreviewCard draft={editDraft} />
                <div style={s.countdownEditButtons}>
                  <button style={s.addBtn} onClick={saveEdit}>Save</button>
                  <button style={s.cancelBtn} onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            </div>
          ) : (
            <div key={cd.id} style={s.row}>
              <span style={s.rowEmoji}>{cd.emoji}</span>
              <span style={s.rowName}>{cd.name}</span>
              <span style={s.rowReset}>{cd.date}</span>
              <div style={{ ...s.colorSwatchSmall, background: cd.color }} />
              <button style={s.trashBtn} onClick={() => startEdit(cd)} title="Edit countdown"><Icon name="pencil" size={16} /></button>
              <button style={s.trashBtn} onClick={() => removeCountdown(cd.id)} title="Delete countdown"><Icon name="trash" size={16} /></button>
            </div>
          )
        ))}
        {countdowns.length === 0 && <div style={s.emptySmall}>No countdowns yet</div>}
      </div>

      <div style={s.rewardEditor}>
        <div style={s.rewardLabel}>Add Countdown</div>
        <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}) }}>
          <input
            style={{ ...s.emojiInput, ...(isMobile ? s.fullWidthInput : {}) }}
            type="text"
            placeholder="🎢"
            value={draft.emoji}
            onChange={e => setDraft(prev => ({ ...prev, emoji: e.target.value }))}
          />
          <input
            style={s.nameInput}
            type="text"
            placeholder="Event name"
            value={draft.name}
            onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') addCountdown(); }}
          />
          <input
            style={{ ...s.dateInput, ...(isMobile ? s.fullWidthInput : {}) }}
            type="date"
            value={draft.date}
            onChange={e => setDraft(prev => ({ ...prev, date: e.target.value }))}
          />
          <input
            style={{ ...s.colorInput, ...(isMobile ? s.fullWidthInput : {}) }}
            type="color"
            value={draft.color}
            onChange={e => setDraft(prev => ({ ...prev, color: e.target.value }))}
          />
          <button style={s.addBtn} onClick={addCountdown}>Add</button>
        </div>

        {(draft.name || draft.date) && (
          <div style={s.countdownPreviewWrap}>
            <div style={s.previewLabelText}>Preview</div>
            <CountdownPreviewCard draft={draft} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reminders Editor ─────────────────────────────────────────────────────────

const RECURRENCE_OPTIONS = [
  { id: 'weekly', label: 'Weekly' },
  { id: 'biweekly', label: 'Biweekly' },
];

const EMPTY_REMINDER_DRAFT = { message: '', dayOfWeek: 0, recurrence: 'weekly', startDate: toDateStr(new Date()), displayHours: 24 };

function RemindersEditor({ isMobile }) {
  const [reminders, setReminders] = useState(null);
  const [draft, setDraft] = useState(EMPTY_REMINDER_DRAFT);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(EMPTY_REMINDER_DRAFT);

  useEffect(() => { refresh(); }, []);

  function refresh() {
    api.getReminders().then(res => setReminders(res.reminders || [])).catch(console.error);
  }

  async function addReminder() {
    if (!draft.message.trim()) return;
    await api.addReminder(
      draft.message.trim(),
      Number(draft.dayOfWeek),
      draft.recurrence,
      draft.recurrence === 'biweekly' ? draft.startDate : toDateStr(new Date()),
      Number(draft.displayHours) || 24,
    );
    setDraft(EMPTY_REMINDER_DRAFT);
    refresh();
  }

  function startEdit(reminder) {
    setEditingId(reminder.id);
    setEditDraft({
      message: reminder.message,
      dayOfWeek: reminder.dayOfWeek,
      recurrence: reminder.recurrence,
      startDate: reminder.startDate || toDateStr(new Date()),
      displayHours: reminder.displayHours ?? 24,
    });
  }

  async function saveEdit() {
    if (!editDraft.message.trim()) return;
    await api.updateReminder(
      editingId,
      editDraft.message.trim(),
      Number(editDraft.dayOfWeek),
      editDraft.recurrence,
      editDraft.recurrence === 'biweekly' ? editDraft.startDate : toDateStr(new Date()),
      Number(editDraft.displayHours) || 24,
    );
    setEditingId(null);
    refresh();
  }

  async function removeReminder(id) {
    await api.deleteReminder(id);
    setReminders(prev => prev.filter(r => r.id !== id));
    if (editingId === id) setEditingId(null);
  }

  if (!reminders) return <div style={s.empty}>Loading reminders…</div>;

  return (
    <div style={s.card}>
      <div style={{ ...s.personName, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="bell" size={18} /> Reminders</div>

      <div style={s.list}>
        {reminders.map(reminder => (
          editingId === reminder.id ? (
            <div key={reminder.id} style={s.countdownEditBlock}>
              <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}) }}>
                <input
                  style={s.nameInput}
                  type="text"
                  value={editDraft.message}
                  onChange={e => setEditDraft(prev => ({ ...prev, message: e.target.value }))}
                />
                <select
                  style={{ ...s.select, ...(isMobile ? s.fullWidthInput : {}) }}
                  value={editDraft.dayOfWeek}
                  onChange={e => setEditDraft(prev => ({ ...prev, dayOfWeek: Number(e.target.value) }))}
                >
                  {DOW_LONG.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
                <select
                  style={{ ...s.select, ...(isMobile ? s.fullWidthInput : {}) }}
                  value={editDraft.recurrence}
                  onChange={e => setEditDraft(prev => ({ ...prev, recurrence: e.target.value }))}
                >
                  {RECURRENCE_OPTIONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>
              <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}), marginTop: 8 }}>
                {editDraft.recurrence === 'biweekly' && (
                  <input
                    style={{ ...s.dateInput, ...(isMobile ? s.fullWidthInput : {}) }}
                    type="date"
                    value={editDraft.startDate}
                    onChange={e => setEditDraft(prev => ({ ...prev, startDate: e.target.value }))}
                  />
                )}
                <input
                  style={{ ...s.starsNumberInput, ...(isMobile ? s.fullWidthInput : {}) }}
                  type="number"
                  min={1}
                  value={editDraft.displayHours}
                  onChange={e => setEditDraft(prev => ({ ...prev, displayHours: e.target.value }))}
                  title="Display duration (hours)"
                />
                <button style={s.addBtn} onClick={saveEdit}>Save</button>
                <button style={s.cancelBtn} onClick={() => setEditingId(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div key={reminder.id} style={s.row}>
              <span style={s.rowName}>{reminder.message}</span>
              <span style={s.rowReset}>{DOW_LONG[reminder.dayOfWeek]}</span>
              <span style={s.rowReset}>{reminder.recurrence}</span>
              <button style={s.trashBtn} onClick={() => startEdit(reminder)} title="Edit reminder"><Icon name="pencil" size={16} /></button>
              <button style={s.trashBtn} onClick={() => removeReminder(reminder.id)} title="Delete reminder"><Icon name="trash" size={16} /></button>
            </div>
          )
        ))}
        {reminders.length === 0 && <div style={s.emptySmall}>No reminders yet</div>}
      </div>

      <div style={s.rewardEditor}>
        <div style={s.rewardLabel}>Add Reminder</div>
        <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}) }}>
          <input
            style={s.nameInput}
            type="text"
            placeholder="Reminder message"
            value={draft.message}
            onChange={e => setDraft(prev => ({ ...prev, message: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') addReminder(); }}
          />
          <select
            style={{ ...s.select, ...(isMobile ? s.fullWidthInput : {}) }}
            value={draft.dayOfWeek}
            onChange={e => setDraft(prev => ({ ...prev, dayOfWeek: Number(e.target.value) }))}
          >
            {DOW_LONG.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
          <select
            style={{ ...s.select, ...(isMobile ? s.fullWidthInput : {}) }}
            value={draft.recurrence}
            onChange={e => setDraft(prev => ({ ...prev, recurrence: e.target.value }))}
          >
            {RECURRENCE_OPTIONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
        <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}), marginTop: 8 }}>
          {draft.recurrence === 'biweekly' && (
            <input
              style={{ ...s.dateInput, ...(isMobile ? s.fullWidthInput : {}) }}
              type="date"
              value={draft.startDate}
              onChange={e => setDraft(prev => ({ ...prev, startDate: e.target.value }))}
            />
          )}
          <input
            style={{ ...s.starsNumberInput, ...(isMobile ? s.fullWidthInput : {}) }}
            type="number"
            min={1}
            value={draft.displayHours}
            onChange={e => setDraft(prev => ({ ...prev, displayHours: e.target.value }))}
            title="Display duration (hours)"
          />
          <button style={s.addBtn} onClick={addReminder}>Add</button>
        </div>
      </div>
    </div>
  );
}

// ── Connected Accounts Editor ────────────────────────────────────────────────

// Google OAuth Client ID/Secret, configurable here instead of requiring a
// .env edit + container restart — mirrors the old PHP dashboard's settings
// screen, which stored the same credentials directly in its own UI.
function GoogleOAuthConfigCard({ isMobile, onSaved }) {
  const [config, setConfig] = useState(null);
  const [clientIdDraft, setClientIdDraft] = useState('');
  const [clientSecretDraft, setClientSecretDraft] = useState('');
  const [redirectUriDraft, setRedirectUriDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getGoogleOAuthConfig().then(res => {
      setConfig(res);
      setClientIdDraft(res.clientId || '');
      setRedirectUriDraft(res.redirectUri || `${window.location.origin}/api/auth/google/callback`);
    }).catch(console.error);
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await api.saveGoogleOAuthConfig(clientIdDraft.trim(), clientSecretDraft.trim(), redirectUriDraft.trim());
      setConfig(res);
      setClientSecretDraft('');
      setSaved(true);
      onSaved?.();
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  if (!config) return null;

  return (
    <div style={s.card}>
      <div style={{ ...s.personName, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="link" size={18} /> Google OAuth Setup</div>
      <div style={s.emptySmall}>
        1. Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">console.cloud.google.com</a> → create a project → enable the Google Calendar API.<br />
        2. Credentials → Create → OAuth 2.0 Client ID → Web application.<br />
        3. Add the redirect URI below to "Authorized redirect URIs", save, and wait a couple minutes.<br />
        4. Paste the Client ID and Client Secret here and save.
      </div>

      <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}), marginTop: 10 }}>
        <input
          style={s.nameInput}
          type="text"
          placeholder="Client ID"
          value={clientIdDraft}
          onChange={e => setClientIdDraft(e.target.value)}
        />
      </div>
      <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}), marginTop: 8 }}>
        <input
          style={s.nameInput}
          type="password"
          placeholder={config.hasClientSecret ? 'Client Secret saved — enter a new one to replace it' : 'Client Secret'}
          value={clientSecretDraft}
          onChange={e => setClientSecretDraft(e.target.value)}
        />
      </div>
      <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}), marginTop: 8 }}>
        <input
          style={s.nameInput}
          type="text"
          placeholder="Redirect URI"
          value={redirectUriDraft}
          onChange={e => setRedirectUriDraft(e.target.value)}
        />
        <button style={s.addBtn} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
      <div style={{ ...s.emptySmall, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        {config.hasClientSecret
          ? <><Icon name="check" size={14} style={{ color: 'var(--green)' }} /> Client Secret configured</>
          : 'No Client Secret saved yet'}
        {saved && <span style={{ color: 'var(--green)' }}>· Saved</span>}
      </div>
    </div>
  );
}

const HOME_CALENDAR_VIEW_OPTIONS = [
  { id: 'day',   label: 'Day' },
  { id: 'week',  label: 'Week' },
  { id: '2week', label: '2-Week' },
  { id: 'month', label: 'Month' },
];

// The Home tab's mini calendar always shows this fixed view — unlike the
// full Calendar page, where switching views is just a live, per-visit
// choice that doesn't change what Home shows.
function HomeCalendarViewCard({ isMobile, onGeneralSettingsSaved }) {
  const [view, setView] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getGeneralSettings().then(res => setView(res.homeCalendarView || 'month')).catch(console.error);
  }, []);

  async function selectView(id) {
    if (id === view) return;
    setView(id);
    setSaving(true);
    try {
      const res = await api.saveGeneralSettings({ homeCalendarView: id });
      onGeneralSettingsSaved?.(res.settings);
    } finally {
      setSaving(false);
    }
  }

  if (view === null) return null;

  return (
    <div style={s.card}>
      <div style={{ ...s.personName, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="calendar" size={18} /> Home Calendar View</div>
      <div style={{ ...s.emptySmall, marginBottom: 10 }}>
        Which view the Home tab's calendar always shows. Switching views on the Calendar page itself is just a live, per-visit choice and doesn't change this.
      </div>
      <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}) }}>
        {HOME_CALENDAR_VIEW_OPTIONS.map(opt => (
          <button
            key={opt.id}
            style={{ ...s.addBtn, background: view === opt.id ? 'var(--blue)' : 'var(--surface2)', color: view === opt.id ? 'white' : 'var(--text-2)' }}
            onClick={() => selectView(opt.id)}
            disabled={saving}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ConnectedAccountsEditor({ isMobile, onGeneralSettingsSaved }) {
  const [accounts, setAccounts] = useState(null);
  const [toast, setToast] = useState('');
  const [authError, setAuthError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    refresh();
    const params = new URLSearchParams(window.location.search);
    let touched = false;
    if (params.get('connected') === 'google') {
      setToast('Google account connected!');
      params.delete('connected');
      touched = true;
      setTimeout(() => setToast(''), 3000);
    }
    if (params.get('googleAuthError') === 'missing_config') {
      setAuthError('Set a Google OAuth Client ID (and Secret) below before connecting an account.');
      params.delete('googleAuthError');
      touched = true;
    }
    if (touched) {
      const newSearch = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (newSearch ? `?${newSearch}` : ''));
    }
  }, []);

  function refresh() {
    api.getGoogleAccounts().then(res => setAccounts(res.accounts || [])).catch(console.error);
  }

  async function disconnect(id) {
    await api.disconnectGoogleAccount(id);
    setAccounts(prev => prev.filter(a => a.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  if (!accounts) return <div style={s.empty}>Loading connected accounts…</div>;

  return (
    <>
      <HomeCalendarViewCard isMobile={isMobile} onGeneralSettingsSaved={onGeneralSettingsSaved} />

      <GoogleOAuthConfigCard isMobile={isMobile} onSaved={() => setAuthError('')} />

      <div style={s.card}>
        <div style={{ ...s.personName, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="link" size={18} /> Connected Google Accounts</div>
        {toast && <div style={{ ...s.noticeText, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="check" size={15} style={{ color: 'var(--green)' }} /> {toast}</div>}
        {authError && <div style={{ ...s.noticeText, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="alert-triangle" size={15} /> {authError}</div>}

        <div style={s.list}>
          {accounts.map(acc => (
            <div key={acc.id}>
              <div style={s.row}>
                <div style={{ ...s.colorSwatchSmall, background: acc.color }} />
                <span style={s.rowName}>{acc.email}</span>
                <button
                  style={s.trashBtn}
                  onClick={() => setExpandedId(prev => prev === acc.id ? null : acc.id)}
                  title="Choose which calendars to show"
                >
                  <Icon name="calendar" size={16} />
                </button>
                <button style={s.trashBtn} onClick={() => disconnect(acc.id)} title="Disconnect account"><Icon name="trash" size={16} /></button>
              </div>
              {expandedId === acc.id && <AccountCalendarsPicker accountId={acc.id} isMobile={isMobile} />}
            </div>
          ))}
          {accounts.length === 0 && <div style={s.emptySmall}>No Google accounts connected yet</div>}
        </div>

        <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}), marginTop: 14 }}>
          <button style={s.addBtn} onClick={() => api.startGoogleAuth()}>+ Connect Google Account</button>
        </div>
      </div>
    </>
  );
}

// Per-account calendar picker: a Google account often has access to several
// calendars (its own, shared family members', subscribed holiday/task
// feeds) beyond just its primary one. Lets the user pick which show up on
// the dashboard, and override each one's display name/color.
function AccountCalendarsPicker({ accountId, isMobile }) {
  const [calendars, setCalendars] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hoverIndex, setHoverIndex] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  useEffect(() => {
    api.getGoogleCalendars(accountId)
      .then(res => setCalendars(res.calendars || []))
      .catch(err => setError(err.message || 'Failed to load calendars'));
  }, [accountId]);

  function updateCal(id, patch) {
    setCalendars(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  }

  function resetDrag() {
    setDragIndex(null);
    setDragOverIndex(null);
  }

  function handleDragStart(e, i) {
    setDragIndex(i);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(i)); } catch { /* ignore */ }
  }

  function handleDragOver(e, i) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIndex === null || dragIndex === i) return;
    if (dragOverIndex !== i) setDragOverIndex(i);
  }

  function handleDrop(e, i) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === i) { resetDrag(); return; }

    setCalendars(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(dragIndex, 1);
      const insertIndex = i > dragIndex ? i - 1 : i;
      arr.splice(insertIndex, 0, moved);
      // Reassign order to match the new positions — this is what actually
      // drives all-day event sort order on the dashboard, not array position
      // alone, since the saved order is what gets sent back to the server.
      return arr.map((c, idx) => ({ ...c, order: idx }));
    });
    resetDrag();
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await api.saveGoogleCalendars(accountId, calendars);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  if (error) return <div style={{ ...s.emptySmall, padding: '8px 11px' }}>{error}</div>;
  if (!calendars) return <div style={{ ...s.emptySmall, padding: '8px 11px' }}>Loading calendars…</div>;

  return (
    <div style={s.calPicker}>
      {calendars.length > 1 && (
        <div style={{ ...s.emptySmall, marginBottom: 2 }}>
          Drag to reorder — controls which calendar's all-day events show first. Timed events always sort by time.
        </div>
      )}
      {calendars.map((cal, i) => (
        <div
          key={cal.id}
          style={s.calPickerRowWrap}
          onDragOver={e => handleDragOver(e, i)}
          onDrop={e => handleDrop(e, i)}
          onMouseEnter={() => setHoverIndex(i)}
          onMouseLeave={() => setHoverIndex(prev => (prev === i ? null : prev))}
        >
          {dragOverIndex === i && dragIndex !== null && dragIndex !== i && (
            <div style={s.calDragPlaceholder} />
          )}
          <div style={{ ...s.calPickerRow, opacity: dragIndex === i ? 0.4 : 1 }}>
            <div
              draggable
              onDragStart={e => handleDragStart(e, i)}
              onDragEnd={resetDrag}
              style={{ ...s.calDragHandle, opacity: hoverIndex === i || dragIndex === i ? 1 : 0 }}
              title="Drag to reorder"
            >
              ⠿
            </div>
            <input
              type="checkbox"
              checked={cal.enabled}
              onChange={e => updateCal(cal.id, { enabled: e.target.checked })}
              style={{ ...s.toggleCheckbox, marginLeft: 0 }}
            />
            <input
              type="color"
              style={s.calColorInput}
              value={cal.color}
              onChange={e => updateCal(cal.id, { color: e.target.value })}
            />
            <div style={s.calPickerNames}>
              <input
                style={{ ...s.nameInput, ...(isMobile ? s.fullWidthInput : {}) }}
                type="text"
                value={cal.displayName}
                onChange={e => updateCal(cal.id, { displayName: e.target.value })}
              />
              {cal.displayName !== cal.summary && <span style={s.calOriginalName}>{cal.summary}</span>}
            </div>
          </div>
        </div>
      ))}
      {calendars.length === 0 && <div style={s.emptySmall}>No calendars found for this account</div>}
      <div style={{ ...s.addRow, marginTop: 10 }}>
        <button style={s.addBtn} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        {saved && <span style={{ color: 'var(--green)', fontSize: 13, fontWeight: 600 }}>Saved</span>}
      </div>
    </div>
  );
}

function SpoonacularSettingsCard({ isMobile }) {
  const [settings, setSettings] = useState(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getSpoonacularSettings().then(setSettings).catch(console.error);
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await api.saveSpoonacularSettings(keyDraft.trim());
      setSettings(res);
      setKeyDraft('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return null;

  return (
    <div style={s.card}>
      <div style={{ ...s.personName, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="search" size={18} /> Spoonacular</div>
      <div style={s.emptySmall}>
        Primary recipe search/import source. Get a free key at{' '}
        <a href="https://spoonacular.com/food-api" target="_blank" rel="noreferrer">spoonacular.com/food-api</a>.
      </div>
      <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}), marginTop: 10 }}>
        <input
          style={s.nameInput}
          type="password"
          placeholder={settings.hasKey ? 'API key saved — enter a new one to replace it' : 'API key'}
          value={keyDraft}
          onChange={e => setKeyDraft(e.target.value)}
        />
        <button style={s.addBtn} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
      <div style={{ ...s.emptySmall, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        {settings.hasKey
          ? <><Icon name="check" size={14} style={{ color: 'var(--green)' }} /> Key configured</>
          : 'No key saved yet'}
        {saved && <span style={{ color: 'var(--green)' }}>· Saved</span>}
      </div>
    </div>
  );
}

function MealieSettingsCard({ isMobile }) {
  const [settings, setSettings] = useState(null);
  const [urlDraft, setUrlDraft] = useState('');
  const [tokenDraft, setTokenDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getMealieSettings().then(res => {
      setSettings(res);
      setUrlDraft(res.url || '');
    }).catch(console.error);
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await api.saveMealieSettings(urlDraft.trim(), tokenDraft.trim());
      setSettings(res);
      setTokenDraft('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return null;

  return (
    <div style={s.card}>
      <div style={{ ...s.personName, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="link" size={18} /> Mealie</div>
      <div style={s.emptySmall}>
        Used as a fallback for recipe search/import when Spoonacular doesn't have the recipe.
        Generate a long-lived API token in your Mealie instance under Profile → API Tokens.
      </div>
      <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}), marginTop: 10 }}>
        <input
          style={s.nameInput}
          type="text"
          placeholder="https://mealie.example.com"
          value={urlDraft}
          onChange={e => setUrlDraft(e.target.value)}
        />
      </div>
      <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}), marginTop: 8 }}>
        <input
          style={s.nameInput}
          type="password"
          placeholder={settings.hasToken ? 'API token saved — enter a new one to replace it' : 'API token'}
          value={tokenDraft}
          onChange={e => setTokenDraft(e.target.value)}
        />
        <button style={s.addBtn} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
      <div style={{ ...s.emptySmall, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        {settings.hasToken
          ? <><Icon name="check" size={14} style={{ color: 'var(--green)' }} /> Token configured</>
          : 'No token saved yet'}
        {saved && <span style={{ color: 'var(--green)' }}>· Saved</span>}
      </div>
    </div>
  );
}

// ── Screensaver Editor ───────────────────────────────────────────────────────

function ScreensaverEditor({ isMobile, onPreviewScreensaver, onScreensaverSettingsSaved }) {
  const [photos, setPhotos] = useState([]);
  const [settings, setSettings] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [urlDraft, setUrlDraft] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => { refreshPhotos(); }, []);
  useEffect(() => { api.getScreensaverSettings().then(setSettings).catch(console.error); }, []);

  function refreshPhotos() {
    api.getPhotos().then(setPhotos).catch(console.error);
  }

  function uploadFileWithProgress(file) {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('photo', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/photos/upload');
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          let message = `Upload failed (${xhr.status})`;
          try { message = JSON.parse(xhr.responseText).error || message; } catch { /* non-JSON error body, e.g. nginx 413 page */ }
          reject(new Error(message));
        }
      };
      xhr.onerror = () => reject(new Error('Upload failed — network error'));
      xhr.send(formData);
    });
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setUploading(true);
    setProgress(0);
    setUploadError('');
    const failures = [];
    for (const file of files) {
      try {
        await uploadFileWithProgress(file);
        refreshPhotos();
      } catch (err) {
        console.error(err);
        failures.push(`${file.name}: ${err.message}`);
      }
    }
    setUploading(false);
    setProgress(0);
    if (failures.length > 0) {
      setUploadError(`${failures.length} of ${files.length} photo(s) failed to upload — ${failures.join('; ')}`);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  async function deletePhoto(filename) {
    await api.deletePhoto(filename);
    setPhotos(prev => prev.filter(p => p.filename !== filename));
  }

  async function addFromUrl() {
    if (!urlDraft.trim()) return;
    setUrlBusy(true);
    try {
      await api.fetchPhotoFromUrl(urlDraft.trim());
      setUrlDraft('');
      refreshPhotos();
    } catch (err) {
      console.error(err);
    } finally {
      setUrlBusy(false);
    }
  }

  async function saveSettings() {
    const res = await api.saveScreensaverSettings(settings);
    if (onScreensaverSettingsSaved) onScreensaverSettingsSaved(res.settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  if (!settings) return <div style={s.empty}>Loading screensaver settings…</div>;

  return (
    <div style={{ ...s.grid, ...(isMobile ? s.gridMobile : {}) }}>
      <div style={s.card}>
        <div style={{ ...s.personName, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="camera" size={18} /> Photos</div>

        <div
          style={{ ...s.dropZone, ...(dragOver ? s.dropZoneActive : {}) }}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            style={{ display: 'none' }}
            onChange={e => handleFiles(e.target.files)}
          />
          <div style={{ ...s.dropZoneText, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {uploading ? `Uploading… ${progress}%` : <><Icon name="upload" size={18} /> Drag photos here, or click to browse</>}
          </div>
          {uploading && (
            <div style={s.progressBarTrack}>
              <div style={{ ...s.progressBarFill, width: `${progress}%` }} />
            </div>
          )}
        </div>

        {uploadError && (
          <div style={{ ...s.uploadError, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="alert-triangle" size={15} /> {uploadError}
            <button style={s.uploadErrorDismiss} onClick={() => setUploadError('')} title="Dismiss" aria-label="Dismiss"><Icon name="x" size={14} /></button>
          </div>
        )}

        <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}) }}>
          <input
            style={s.nameInput}
            type="text"
            placeholder="https://example.com/photo.jpg"
            value={urlDraft}
            onChange={e => setUrlDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addFromUrl(); }}
          />
          <button style={s.addBtn} onClick={addFromUrl} disabled={urlBusy}>
            {urlBusy ? 'Fetching…' : 'Add from URL'}
          </button>
        </div>

        <div style={s.photoGrid}>
          {photos.map(photo => (
            <div key={photo.filename} style={s.photoThumbWrap}>
              <img src={photo.url} alt="" style={s.photoThumb} />
              <button style={s.photoDeleteBtn} onClick={() => deletePhoto(photo.filename)} title="Delete photo" aria-label="Delete photo">
                <Icon name="trash" size={15} />
              </button>
            </div>
          ))}
          {photos.length === 0 && <div style={s.emptySmall}>No photos uploaded yet</div>}
        </div>
      </div>

      <div style={s.card}>
        <div style={{ ...s.personName, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="timer" size={18} /> Screensaver Settings</div>

        <div style={s.settingRow}>
          <div style={s.settingLabel}>Inactivity timeout: {settings.inactivityMinutes} min</div>
          <input
            type="range" min={1} max={30} step={1}
            value={settings.inactivityMinutes}
            onChange={e => setSettings(prev => ({ ...prev, inactivityMinutes: Number(e.target.value) }))}
            style={s.slider}
          />
        </div>

        <div style={s.settingRow}>
          <div style={s.settingLabel}>Transition speed: {settings.transitionSeconds}s</div>
          <input
            type="range" min={3} max={15} step={1}
            value={settings.transitionSeconds}
            onChange={e => setSettings(prev => ({ ...prev, transitionSeconds: Number(e.target.value) }))}
            style={s.slider}
          />
        </div>

        <div style={s.settingRow}>
          <div style={s.settingLabel}>Brightness: {settings.brightness}%</div>
          <input
            type="range" min={20} max={100} step={5}
            value={settings.brightness}
            onChange={e => setSettings(prev => ({ ...prev, brightness: Number(e.target.value) }))}
            style={s.slider}
          />
        </div>

        <div style={{ ...s.addRow, ...(isMobile ? s.addRowMobile : {}) }}>
          <button
            style={{ ...s.previewBtn, display: 'inline-flex', alignItems: 'center', gap: 7 }}
            onClick={e => { e.stopPropagation(); if (onPreviewScreensaver) onPreviewScreensaver(); }}
          >
            <Icon name="play" size={15} /> Preview Screensaver
          </button>
          <button style={s.addBtn} onClick={saveSettings}>{saved ? 'Saved ✓' : 'Save Settings'}</button>
        </div>
      </div>
    </div>
  );
}

const s = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%' },
  subNavWrap: { position: 'relative', flexShrink: 0 },
  subNav: {
    display: 'flex', gap: 4, padding: '10px 16px 0 16px',
    overflowX: 'auto', WebkitOverflowScrolling: 'touch',
  },
  subNavMobile: {
    padding: '8px 8px 0 8px',
  },
  subNavTab: {
    padding: '9px 18px', fontSize: 15, fontWeight: 500,
    color: 'var(--blue)', background: 'var(--bg)',
    border: '0.5px solid var(--border)', borderBottom: 'none',
    borderRadius: '10px 10px 0 0', cursor: 'pointer',
    fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
  },
  subNavTabMobile: {
    padding: '8px 12px', fontSize: 14,
  },
  // The active tab matches the content panel below it (var(--surface)) so it
  // visually merges with its own content instead of standing apart from it.
  subNavActive: {
    color: 'var(--text-2)', background: 'var(--surface)',
  },
  subNavFade: {
    position: 'absolute', top: 0, bottom: 0, width: 28, pointerEvents: 'none',
  },
  subNavFadeLeft: { left: 0, background: 'linear-gradient(to right, var(--bg), transparent)' },
  subNavFadeRight: { right: 0, background: 'linear-gradient(to left, var(--bg), transparent)' },
  subNavArrow: {
    position: 'absolute', top: 4, width: 24, height: 24, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    background: 'var(--surface)', border: '0.5px solid var(--border)',
    color: 'var(--text-2)', cursor: 'pointer', boxShadow: 'var(--shadow-sm)',
  },
  subNavArrowLeft: { left: 4 },
  subNavArrowRight: { right: 4 },
  body: { flex: 1, overflowY: 'auto', padding: 16 },
  bodyMobile: { padding: 8 },

  empty: { padding: 20, color: 'var(--text-3)' },
  emptySmall: { fontSize: 14, color: 'var(--text-3)', fontStyle: 'italic', padding: '4px 0' },

  // minmax(0, 1fr) rather than a bare 1fr — a bare 1fr track still won't
  // shrink narrower than its content's intrinsic min-width, so a card whose
  // rows (drag handle + inputs + select + stars + trash) add up to more
  // than half the available width pushes the whole grid wider than the
  // viewport instead of the row's own text input shrinking to fit.
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 },
  gridMobile: { gridTemplateColumns: '1fr' },
  card: {
    background: 'var(--surface)', borderRadius: 16, padding: 16,
    boxShadow: 'var(--shadow-sm)', border: '0.5px solid var(--border)',
    marginBottom: 16,
  },
  cardHidden: { opacity: 0.55 },
  personHead: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 },
  avatar: { width: 39, height: 39, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, flexShrink: 0 },
  visibilityBtn: {
    display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto',
    padding: '6px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600,
    color: 'var(--text-2)', background: 'var(--bg)', border: '0.5px solid var(--border)',
    cursor: 'pointer', flexShrink: 0,
  },
  personName: { fontSize: 17, fontWeight: 700, color: 'var(--text-1)', marginBottom: 10, fontFamily: 'var(--font-heading)' },
  swatch: { width: 39, height: 39, borderRadius: '50%', flexShrink: 0, border: '1px solid var(--border)' },
  colorInput: {
    width: 48, height: 39, padding: 2, borderRadius: 8,
    border: '1px solid var(--border-md)', background: 'var(--bg)', cursor: 'pointer',
  },

  list: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 },
  row: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '9px 11px', borderRadius: 10,
    background: 'var(--bg)', border: '0.5px solid var(--border)',
  },
  choreRowWrap: { display: 'flex', flexDirection: 'column' },
  choreDragHandle: {
    width: 14, flexShrink: 0, textAlign: 'center',
    fontSize: 16, lineHeight: 1, color: 'var(--text-3)', cursor: 'grab',
    userSelect: 'none',
  },
  choreDragPlaceholder: {
    height: 3, borderRadius: 2, background: 'var(--blue)',
    margin: '0 0 6px 0', opacity: 0.6,
  },
  rowEmoji: { fontSize: 21, width: 28, textAlign: 'center', flexShrink: 0 },
  rowName: { flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text-1)' },
  // Fixed-width sibling to rowName for the nav-relabeling row, where the
  // default label just labels the row and the input (flex:1) does the work.
  navLabelDefault: { width: 100, flexShrink: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-1)' },
  rowReset: {
    fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase',
    fontWeight: 600, letterSpacing: '0.04em',
  },
  // Editable counterparts to rowEmoji/rowName/rowReset — same sizing so
  // swapping a row from display to edit mode doesn't reflow, with a subtle
  // border/background so it reads as editable without shouting over the row.
  rowEmojiInput: {
    fontSize: 21, width: 30, textAlign: 'center', flexShrink: 0,
    background: 'var(--surface)', border: '0.5px solid var(--border-md)', borderRadius: 6, padding: '2px 0',
  },
  rowNameInput: {
    flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text-1)', minWidth: 0,
    background: 'var(--surface)', border: '0.5px solid var(--border-md)', borderRadius: 6, padding: '2px 6px',
  },
  rowResetSelect: {
    fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase',
    fontWeight: 600, letterSpacing: '0.04em', flexShrink: 0, cursor: 'pointer',
    background: 'var(--surface)', border: '0.5px solid var(--border-md)', borderRadius: 6, padding: '2px 4px',
  },
  starPicker: { display: 'flex', gap: 1, flexShrink: 0 },
  starPickerIcon: { fontSize: 15, cursor: 'pointer', transition: 'opacity 0.15s' },

  starAdjustRow: {
    display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14,
    padding: '6px 8px', borderRadius: 10, background: 'var(--bg)', border: '0.5px solid var(--border)',
  },
  starAdjustTotal: { fontSize: 14, fontWeight: 700, color: 'var(--text-1)', flex: 1 },
  starAdjustBtn: {
    width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border-md)',
    background: 'var(--surface)', color: 'var(--text-1)', fontSize: 16, fontWeight: 700,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  starAdjustBtnPlus: { color: 'var(--blue)', borderColor: 'var(--blue)' },
  starAdjustInput: {
    width: 48, padding: '5px 6px', borderRadius: 8, border: '1px solid var(--border-md)',
    fontSize: 14, textAlign: 'center', background: 'var(--surface)', flexShrink: 0,
  },
  trashBtn: {
    border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)',
    padding: 4, lineHeight: 1, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },

  rewardEditor: {
    marginTop: 14, paddingTop: 14, borderTop: '0.5px solid var(--border)',
  },
  rewardLabel: {
    fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase',
    letterSpacing: '0.04em', marginBottom: 8, fontFamily: 'var(--font-heading)', fontStyle: 'italic',
  },
  starsNumberInput: {
    width: 64, padding: '7px 8px', borderRadius: 8, border: '1px solid var(--border-md)',
    fontSize: 15, background: 'var(--bg)',
  },

  addRow: { display: 'flex', gap: 6, alignItems: 'center' },
  addRowMobile: { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  fullWidthInput: { width: '100%' },
  emojiInput: {
    width: 42, padding: '7px 6px', borderRadius: 8, border: '1px solid var(--border-md)',
    fontSize: 16, textAlign: 'center', background: 'var(--bg)',
  },
  timeInput: {
    width: 100, padding: '7px 8px', borderRadius: 8, border: '1px solid var(--border-md)',
    fontSize: 15, background: 'var(--bg)',
  },
  nameInput: {
    flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-md)',
    fontSize: 15, background: 'var(--bg)', minWidth: 0,
  },
  select: {
    padding: '7px 8px', borderRadius: 8, border: '1px solid var(--border-md)',
    fontSize: 15, background: 'var(--bg)',
  },
  addBtn: {
    padding: '7px 16px', borderRadius: 8, border: 'none',
    background: 'var(--blue)', color: 'white', fontSize: 15, fontWeight: 600,
    cursor: 'pointer', flexShrink: 0,
  },

  toggleCheckbox: { width: 20, height: 20, cursor: 'pointer', flexShrink: 0, marginLeft: 'auto' },

  calPicker: {
    display: 'flex', flexDirection: 'column', gap: 6,
    padding: '10px 11px 11px 39px', marginTop: -2, marginBottom: 6,
  },
  calPickerRowWrap: { display: 'flex', flexDirection: 'column' },
  calPickerRow: { display: 'flex', alignItems: 'center', gap: 8, transition: 'opacity 0.15s' },
  calDragHandle: {
    width: 14, flexShrink: 0, textAlign: 'center',
    fontSize: 16, lineHeight: 1, color: 'var(--text-3)', cursor: 'grab',
    userSelect: 'none', transition: 'opacity 0.15s',
  },
  calDragPlaceholder: {
    height: 3, borderRadius: 2, background: 'var(--blue)',
    margin: '0 0 6px 22px', opacity: 0.6,
  },
  calColorInput: {
    width: 34, height: 30, padding: 2, borderRadius: 6, flexShrink: 0,
    border: '1px solid var(--border-md)', background: 'var(--bg)', cursor: 'pointer',
  },
  calPickerNames: { flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  calOriginalName: { fontSize: 12, color: 'var(--text-3)', flexShrink: 0, whiteSpace: 'nowrap' },

  cutoffLabel: {
    display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13,
    color: 'var(--text-2)', fontWeight: 600,
  },
  peopleCheckboxRow: {
    display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 14,
  },
  checkboxLabel: {
    display: 'flex', alignItems: 'center', gap: 6, fontSize: 14,
    color: 'var(--text-2)', fontWeight: 500, cursor: 'pointer',
  },
  peopleBadgesRow: {
    display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10,
  },
  peopleBadge: {
    fontSize: 13, padding: '3px 9px', borderRadius: 20,
    border: '1px solid var(--border-md)', fontWeight: 600,
    background: 'var(--surface)',
  },
  routineCardHead: {
    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6,
  },

  weekBlock: { marginBottom: 10 },
  weekToggleBtn: {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
    color: 'var(--text-2)', background: 'var(--surface)', border: '0.5px solid var(--border)',
    cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em',
    fontFamily: 'var(--font-heading)', fontStyle: 'italic', marginBottom: 8,
  },
  // Same chevron-rotate treatment as the Home panel's collapsible cards.
  weekToggleChevron: {
    color: 'var(--text-3)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'transform 0.2s ease',
  },

  daySelectorRow: { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' },
  daySelectorRowMobile: { gap: 4 },
  dayPill: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '8px 16px', borderRadius: 20, fontSize: 14, fontWeight: 700,
    color: 'var(--text-2)', background: 'var(--surface)', border: '0.5px solid var(--border)',
    cursor: 'pointer',
  },
  dayPillToday: { border: '0.5px solid var(--blue)', color: 'var(--blue)' },
  dayPillActive: { color: 'white', background: 'var(--blue)', border: '0.5px solid var(--blue)' },
  // Marks whether a day has meals planned, independent of selected/today
  // styling (which both use blue) so it reads clearly in every state.
  dayPillCheckIcon: { color: 'var(--green)', flexShrink: 0 },
  // The selected pill has a solid blue background — green loses contrast
  // there, so switch to white (matching the pill's own selected text color).
  dayPillCheckIconActive: { color: 'white' },
  dayPillCheckEmpty: {
    width: 13, height: 13, borderRadius: 3, border: '1.5px solid currentColor', opacity: 0.4, flexShrink: 0,
  },

  currentMeals: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  currentPill: {
    display: 'flex', alignItems: 'center', gap: 6, fontSize: 14,
    padding: '5px 8px', borderRadius: 20, background: 'var(--bg)',
    border: '0.5px solid var(--border)', color: 'var(--text-2)',
  },
  currentPillName: { cursor: 'pointer' },
  currentPillEditing: {
    display: 'flex', alignItems: 'center', padding: '2px 4px', borderRadius: 20,
    background: 'var(--bg)', border: '1px solid var(--border-md)',
  },
  currentPillInput: {
    fontSize: 14, padding: '3px 6px', borderRadius: 16, border: 'none',
    background: 'transparent', color: 'var(--text-1)', minWidth: 120,
  },
  removeBtn: { border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'inline-flex', alignItems: 'center' },

  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  shoppingPromptModal: {
    background: 'var(--surface)', borderRadius: 16, padding: 20,
    width: 340, maxWidth: '90vw', textAlign: 'center',
    boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
  },
  noticeText: { fontSize: 16, color: 'var(--text-1)', marginBottom: 16, lineHeight: 1.5 },
  shoppingPromptActions: { display: 'flex', gap: 10, justifyContent: 'center' },
  skipBtn: {
    padding: '7px 16px', borderRadius: 8, border: '0.5px solid var(--border)',
    background: 'var(--bg)', color: 'var(--text-2)', fontSize: 15, fontWeight: 600,
    cursor: 'pointer', flexShrink: 0,
  },

  suggestions: {
    marginTop: 6, border: '0.5px solid var(--border)', borderRadius: 8,
    overflow: 'hidden', background: 'var(--bg)',
  },
  suggestionItem: {
    padding: '7px 10px', fontSize: 14, cursor: 'pointer', color: 'var(--text-2)',
    borderBottom: '0.5px solid var(--border)',
  },

  searchBtn: {
    width: '100%', padding: '9px', borderRadius: 8, border: '0.5px solid var(--border)',
    background: 'var(--bg)', color: 'var(--text-1)', fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
  resultsList: { display: 'flex', flexDirection: 'column', gap: 8 },

  recipeResultCard: {
    display: 'flex', alignItems: 'center', gap: 10, padding: 10,
    borderRadius: 10, background: 'var(--bg)', border: '0.5px solid var(--border)',
  },
  recipeResultImg: { width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 },
  recipeResultInfo: { flex: 1, minWidth: 0 },
  recipeResultIngredients: {
    fontSize: 13, color: 'var(--text-3)', marginTop: 4,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },

  errorText: { color: '#dc2626', fontSize: 14, marginTop: 8 },

  dropZone: {
    border: '2px dashed var(--border-md)', borderRadius: 12, padding: '28px 16px',
    textAlign: 'center', cursor: 'pointer', marginBottom: 12, transition: 'all 0.15s',
    background: 'var(--bg)',
  },
  dropZoneActive: { borderColor: 'var(--accent-blue)', background: 'rgba(60,126,195,0.08)' },
  dropZoneText: { fontSize: 15, fontWeight: 600, color: 'var(--text-2)' },
  progressBarTrack: {
    marginTop: 12, height: 6, borderRadius: 99, background: 'var(--border)', overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%', borderRadius: 99, background: 'var(--blue)', transition: 'width 0.15s ease',
  },
  uploadError: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    fontSize: 13, fontWeight: 600, color: '#b42318', background: '#fef3f2',
    padding: '8px 12px', borderRadius: 8, marginBottom: 12,
  },
  uploadErrorDismiss: {
    border: 'none', background: 'transparent', color: '#b42318', cursor: 'pointer', lineHeight: 1,
    display: 'inline-flex', alignItems: 'center', marginLeft: 'auto',
  },
  photoGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8, marginTop: 14,
  },
  photoThumbWrap: {
    position: 'relative', borderRadius: 10, overflow: 'hidden', aspectRatio: '1', background: 'var(--bg)',
  },
  photoThumb: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  photoDeleteBtn: {
    position: 'absolute', top: 4, right: 4, width: 27, height: 27, borderRadius: 7,
    background: 'rgba(0,0,0,0.55)', color: 'white', fontSize: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
  },

  settingRow: { marginBottom: 16 },
  settingLabel: { fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 },
  slider: { width: '100%', accentColor: 'var(--blue)' },
  previewBtn: {
    padding: '7px 16px', borderRadius: 8, border: '0.5px solid var(--border-md)',
    background: 'var(--surface)', color: 'var(--text-1)', fontSize: 15, fontWeight: 600,
    cursor: 'pointer', flexShrink: 0,
  },

  dateInput: {
    padding: '7px 8px', borderRadius: 8, border: '1px solid var(--border-md)',
    fontSize: 15, background: 'var(--bg)',
  },
  colorSwatchSmall: {
    width: 19, height: 19, borderRadius: '50%', flexShrink: 0, border: '1px solid var(--border)',
  },
  cancelBtn: {
    padding: '7px 16px', borderRadius: 8, border: '0.5px solid var(--border-md)',
    background: 'var(--surface)', color: 'var(--text-2)', fontSize: 15, fontWeight: 600,
    cursor: 'pointer', flexShrink: 0,
  },
  countdownEditBlock: {
    padding: '10px 12px', borderRadius: 10, background: 'var(--bg)', border: '0.5px solid var(--border)',
  },
  countdownEditFooter: {
    display: 'flex', alignItems: 'center', gap: 14, marginTop: 12,
  },
  countdownEditButtons: { display: 'flex', gap: 6 },
  countdownPreviewWrap: { marginTop: 14 },
  previewLabelText: {
    fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase',
    letterSpacing: '0.04em', marginBottom: 8, fontFamily: 'var(--font-heading)', fontStyle: 'italic',
  },
  previewCard: {
    width: 128, height: 104, background: 'var(--surface)', borderRadius: 12,
    boxShadow: 'var(--shadow-sm)',
    padding: '8px 10px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 1,
  },
  previewEmoji: { fontSize: 32, lineHeight: 1 },
  previewName: {
    fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginTop: 2,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%',
  },
  previewDays: { fontSize: 38, fontWeight: 800, lineHeight: 1.1, marginTop: 1 },
  previewDaysLabel: { fontSize: 13, color: 'var(--text-3)', fontWeight: 500 },
  previewToday: { fontSize: 17, fontWeight: 700, color: '#d97706', marginTop: 6 },
  previewDone: { fontSize: 15, fontWeight: 600, color: 'var(--text-3)', marginTop: 6 },
  previewMuted: { fontSize: 15, color: 'var(--text-3)', marginTop: 6 },
};
