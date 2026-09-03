import { useState, useEffect } from 'react';
import { api } from '../api';
import Icon, { StarIcon } from './Icon';
import Avatar from './Avatar';

function formatNoteDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

// Shared by the Meals Planner (opened from a specific planned day) and the
// Library (opened from a meal's own card, with no specific day in context —
// callers pass `date` as the meal's own last-planned date, or today).
export default function RecipeDetailModal({ date, mealName, onClose, onRated, startExpanded = false, hideSourceLink = false }) {
  const [full, setFull] = useState(undefined); // undefined = loading, null = not found
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [previousNotes, setPreviousNotes] = useState(null);
  // Collapsed by default — rating is what people open this for most of the
  // time; the recipe itself is a click away when they actually need it.
  const [recipeExpanded, setRecipeExpanded] = useState(startExpanded);
  const [people, setPeople] = useState([]);
  // Same "claim" flow as Up for Grabs: submitting doesn't post right away —
  // it reveals a row of avatars, and picking one is the action that submits.
  const [pickingPerson, setPickingPerson] = useState(false);

  useEffect(() => {
    api.getFullMeal(mealName).then(setFull).catch(() => setFull(null));
  }, [mealName]);

  useEffect(() => {
    api.getMealNotes(mealName).then(res => setPreviousNotes(res.notes || [])).catch(() => setPreviousNotes([]));
  }, [mealName]);

  useEffect(() => {
    api.people().then(res => setPeople(res.people || [])).catch(() => setPeople([]));
  }, []);

  async function submitRating(personId) {
    setSaving(true);
    try {
      await api.rateWeeklyMeal(date, mealName, stars, note.trim(), personId);
      onRated?.(date, mealName, stars);
      onClose();
    } catch (err) {
      console.error(err);
      setSaving(false);
      setPickingPerson(false);
    }
  }

  const ingredients = full?.ingredients || [];
  const instructions = full?.instructions || [];
  const hasRecipe = ingredients.length > 0 || instructions.length > 0;
  const peopleById = Object.fromEntries(people.map(p => [p.id, p]));

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.detailModal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHead}>
          <div style={s.modalTitle}>{full?.name || mealName}</div>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        </div>

        <div style={s.detailModalBody}>
        {full?.sourceUrl && !hideSourceLink && (
          <a href={full.sourceUrl} target="_blank" rel="noreferrer" style={s.sourceLinkRow}>
            <Icon name="link" size={15} /> {full.sourceName || 'View source'}
          </a>
        )}

        {hasRecipe && (
          <>
            <button style={s.recipeToggle} onClick={() => setRecipeExpanded(e => !e)}>
              <span>Recipe</span>
              <span style={{ ...s.recipeToggleChevron, transform: recipeExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                <Icon name="chevron-right" size={16} />
              </span>
            </button>
            <div style={{ ...s.recipeBodyOuter, maxHeight: recipeExpanded ? 2000 : 0 }}>
              <div style={s.detailSection}>
                <div style={s.label}>Ingredients</div>
                <div style={s.ingredientsRow}>
                  {ingredients.length > 0 ? (
                    <ul style={s.ingredientList}>
                      {ingredients.map((ing, i) => (
                        <li key={i} style={s.ingredientItem}>
                          {[ing.amount, ing.unit, ing.name].filter(Boolean).join(' ')}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={s.notAvailable}>Not available</div>
                  )}
                  {full?.image && <img src={full.image} alt="" style={s.recipeImage} />}
                </div>
              </div>

              <div style={s.detailSection}>
                <div style={s.label}>Instructions</div>
                {instructions.length > 0 ? (
                  <div style={s.instructionsList}>
                    {instructions.map(step => (
                      <div key={step.number} style={s.instructionRow}>
                        <div style={s.instructionNumber}>{step.number}</div>
                        <div style={s.instructionText}>{step.step}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={s.notAvailable}>Not available</div>
                )}
              </div>
            </div>
          </>
        )}

        <div style={{ ...s.ratingSection, ...(hasRecipe ? s.ratingSectionDivider : {}) }}>
          <div style={s.label}>Rate this meal</div>
          <div style={s.rateStarsRow}>
            {[1, 2, 3, 4, 5].map(n => (
              <span
                key={n}
                style={s.rateStarIcon}
                onClick={() => setStars(prev => (prev === n ? 0 : n))}
                role="button"
                aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
              >
                <StarIcon filled={n <= stars} size={30} style={{ color: n <= stars ? '#f59e0b' : 'var(--text-3)' }} />
              </span>
            ))}
          </div>

          <textarea
            style={s.noteTextarea}
            rows={3}
            placeholder="How did it go? Any changes for next time?"
            value={note}
            onChange={e => setNote(e.target.value)}
          />
          <div style={s.noteHelperText}>Notes help you remember what worked and what to adjust</div>

          {previousNotes && previousNotes.length > 0 && (
            <div style={s.previousNotesBlock}>
              <div style={s.previousNotesHeading}>Previous notes:</div>
              {previousNotes.slice(0, 3).map((n, i) => {
                const person = n.personId ? peopleById[n.personId] : null;
                return (
                  <div key={i} style={s.previousNoteItem}>
                    <Avatar person={person} size={18} style={s.previousNoteAvatar} />
                    <div style={s.previousNoteBody}>
                      <span style={s.previousNoteMeta}>
                        {person ? person.name : 'Someone'} · {formatNoteDate(n.date)} ·{' '}
                        {Array.from({ length: n.stars || 0 }).map((_, k) => (
                          <StarIcon key={k} filled size={11} style={{ color: '#f59e0b', display: 'inline-block', verticalAlign: '-1px' }} />
                        ))}
                      </span>
                      {' '}{n.note}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {pickingPerson ? (
            <div style={s.ratePickerRow}>
              {people.map(person => (
                <button
                  key={person.id}
                  style={s.ratePickerAvatarBtn}
                  onClick={() => submitRating(person.id)}
                  disabled={saving}
                  title={`Rate as ${person.name}`}
                >
                  <Avatar person={person} size={34} />
                </button>
              ))}
              <button style={s.ratePickerCancel} onClick={() => setPickingPerson(false)} disabled={saving} aria-label="Cancel">
                <Icon name="x" size={14} />
              </button>
            </div>
          ) : (
            <button style={s.rateSubmitBtn} onClick={() => setPickingPerson(true)} disabled={saving}>
              {saving ? 'Saving…' : 'Submit rating'}
            </button>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  // Header (title + close) is a fixed, non-scrolling sibling of the body —
  // simpler and more robust than position:sticky (no scroll-container/padding
  // edge cases, no need to paint over content scrolling underneath).
  detailModal: {
    background: 'var(--surface)', borderRadius: 16,
    width: 520, maxWidth: '92vw', maxHeight: '86vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
  },
  detailModalBody: { overflowY: 'auto', padding: '14px 20px 20px' },

  modalHead: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
    padding: '20px 20px 12px', borderBottom: '0.5px solid var(--border)',
  },
  modalTitle: { fontSize: 18, fontWeight: 700, color: 'var(--text-1)' },
  closeBtn: { border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center' },

  sourceLinkRow: {
    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--blue)', textDecoration: 'none', marginBottom: 14,
  },

  // Recipe (ingredients/instructions) is collapsed by default so rating is
  // the first thing visible — same chevron-rotate pattern used elsewhere.
  recipeToggle: {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', borderRadius: 10, fontSize: 14, fontWeight: 700,
    color: 'var(--text-2)', background: 'var(--bg)', border: '0.5px solid var(--border)',
    cursor: 'pointer', fontFamily: 'inherit', marginBottom: 14,
  },
  recipeToggleChevron: {
    color: 'var(--text-3)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'transform 0.2s ease',
  },
  recipeBodyOuter: { overflow: 'hidden', transition: 'max-height 0.25s ease' },

  detailSection: { marginBottom: 18 },
  label: {
    display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8,
    fontFamily: 'var(--font-heading)', fontStyle: 'italic',
  },
  ingredientsRow: { display: 'flex', gap: 16, alignItems: 'flex-start' },
  ingredientList: { flex: 1, minWidth: 0, margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 },
  ingredientItem: { fontSize: 15, color: 'var(--text-1)', lineHeight: 1.4 },
  recipeImage: { width: 120, height: 120, borderRadius: 10, objectFit: 'cover', flexShrink: 0 },

  instructionsList: { display: 'flex', flexDirection: 'column', gap: 14 },
  instructionRow: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  instructionNumber: {
    width: 28, height: 28, borderRadius: '50%', background: 'var(--blue)', color: 'white',
    fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  instructionText: { fontSize: 15, color: 'var(--text-1)', lineHeight: 1.6, paddingTop: 2 },

  notAvailable: { fontSize: 15, color: 'var(--text-3)', fontStyle: 'italic' },

  ratingSection: { marginTop: 8 },
  // Only shown when there's a Recipe block above to separate from.
  ratingSectionDivider: { paddingTop: 16, borderTop: '0.5px solid var(--border)' },
  rateStarsRow: { display: 'flex', gap: 8, marginBottom: 14, justifyContent: 'center' },
  rateStarIcon: { cursor: 'pointer', display: 'flex', transition: 'transform 0.15s' },
  noteTextarea: {
    width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-md)',
    fontSize: 15, background: 'var(--bg)', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  },
  noteHelperText: { fontSize: 13, color: 'var(--text-3)', marginTop: 5 },
  previousNotesBlock: {
    marginTop: 14, paddingTop: 12, borderTop: '0.5px solid var(--border)',
  },
  previousNotesHeading: {
    fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase',
    letterSpacing: '0.04em', marginBottom: 6, fontFamily: 'var(--font-heading)', fontStyle: 'italic',
  },
  previousNoteItem: {
    display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8,
    fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5,
  },
  previousNoteAvatar: { marginTop: 1 },
  previousNoteBody: { flex: 1 },
  previousNoteMeta: { fontWeight: 700, color: 'var(--text-2)' },
  rateSubmitBtn: {
    width: '100%', marginTop: 12, padding: '9px', borderRadius: 8, border: 'none',
    background: 'var(--blue)', color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer',
  },
  // Same "claim" picker used by the Up for Grabs chores — picking a person
  // is the action itself, rather than a separate confirm step.
  ratePickerRow: {
    display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
    justifyContent: 'center', marginTop: 12,
  },
  ratePickerAvatarBtn: { background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 },
  ratePickerCancel: {
    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center',
    justifyContent: 'center', color: 'var(--text-3)', background: 'var(--surface)',
    border: '0.5px solid var(--border)', cursor: 'pointer', flexShrink: 0,
  },
};
