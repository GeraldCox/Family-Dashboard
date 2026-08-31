// Single shared avatar: a photo (if the person has one) or their initial,
// always inside a circle outlined in their own color. `ring` lets a caller
// override the outline (e.g. the Routines stack uses the page background to
// visually separate overlapping avatars instead of clashing color rings).
export default function Avatar({ person, size = 36, ring, style, ...rest }) {
  const color = person?.color || 'var(--text-3)';
  const base = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    border: `2px solid ${ring || color}`,
  };

  if (person?.photoUrl) {
    return (
      <img
        src={person.photoUrl}
        alt={person?.name || ''}
        style={{ ...base, objectFit: 'cover', ...style }}
        {...rest}
      />
    );
  }

  return (
    <div
      style={{
        ...base, background: color + '22', color,
        fontWeight: 700, fontSize: Math.round(size * 0.41),
        ...style,
      }}
      {...rest}
    >
      {person?.name?.[0]?.toUpperCase() || '?'}
    </div>
  );
}
