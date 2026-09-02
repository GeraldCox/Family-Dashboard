import { useState, useEffect } from 'react';
import { api } from '../api';
import { useScreenSize } from '../hooks/useScreenSize';
import Avatar from './Avatar';
import Icon from './Icon';

const STAR_REWARD_PEOPLE = ['kid1', 'kid2'];
const CONFETTI_EMOJI = ['🎉', '✨', '⭐', '🎊'];
const GRABS_COLOR = '#1e2533';

function timeAgo(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function makeConfetti() {
  return Array.from({ length: 8 }).map((_, i) => {
    const angle = (i / 8) * Math.PI * 2;
    const dist = 50 + Math.random() * 20;
    return {
      key: i,
      emoji: CONFETTI_EMOJI[i % CONFETTI_EMOJI.length],
      tx: Math.cos(angle) * dist,
      ty: Math.sin(angle) * dist,
      rot: Math.round((Math.random() - 0.5) * 360),
    };
  });
}

function ChoreCard({ chore, color, isMobile, onToggle, floatingStars }) {
  return (
    <div
      style={{
        ...s.choreCard,
        ...(isMobile ? s.choreCardMobile : {}),
        ...(chore.done ? s.choreDone : {}),
        borderLeft: `4px solid ${chore.done ? '#86efac' : color}`,
      }}
      onClick={onToggle}
    >
      <div style={{ ...s.thumb, ...(isMobile ? s.thumbMobile : {}) }}>
        {chore.emoji}
        {floatingStars.map(f => (
          <span key={f.popId} className="star-pop">⭐</span>
        ))}
      </div>
      <div style={s.choreInfo}>
        <div style={{ ...s.choreName, ...(chore.done ? s.doneText : {}) }}>
          {chore.name}
        </div>
        <div style={s.choreMeta}>
          <div style={s.choreStars}>{'⭐'.repeat(chore.stars || 1)}</div>
        </div>
      </div>
      <div style={{ ...s.check, ...(chore.done ? s.checkDone : {}) }}>
        {chore.done && <span style={{ color: 'white', fontSize: 18, lineHeight: 1 }}>✓</span>}
      </div>
    </div>
  );
}

export default function Chores({ compact = false }) {
  const [data, setData] = useState(null);
  const [personColors, setPersonColors] = useState({});
  const [floatingStars, setFloatingStars] = useState([]); // [{ popId, choreId }]
  const [claimingId, setClaimingId] = useState(null);
  const [celebrations, setCelebrations] = useState({}); // rewardId -> particles
  // Compact (Home panel) cards only — which ones are collapsed, keyed by
  // personId or 'grabs'. Everything starts expanded.
  const [collapsedCards, setCollapsedCards] = useState(() => new Set());
  const { isMobile } = useScreenSize();

  function toggleCardCollapsed(key) {
    setCollapsedCards(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  useEffect(() => { api.chores().then(setData).catch(console.error); }, []);
  useEffect(() => {
    api.people().then(res => {
      const map = {};
      (res.people || []).forEach(p => { map[p.id] = p.color; });
      setPersonColors(map);
    }).catch(console.error);
  }, []);

  function triggerStarPop(choreId) {
    const popId = `${choreId}-${Date.now()}`;
    setFloatingStars(prev => [...prev, { popId, choreId }]);
    setTimeout(() => {
      setFloatingStars(prev => prev.filter(f => f.popId !== popId));
    }, 800);
  }

  function triggerCelebration(rewardId) {
    setCelebrations(prev => ({ ...prev, [rewardId]: makeConfetti() }));
    setTimeout(() => {
      setCelebrations(prev => {
        const next = { ...prev };
        delete next[rewardId];
        return next;
      });
    }, 900);
  }

  async function toggle(person, chore) {
    const wasDone = chore.done;
    const stars = chore.stars || 1;
    await api.toggleChore(person.id, chore.id);
    setData(prev => ({
      ...prev,
      people: prev.people.map(p => p.id !== person.id ? p : {
        ...p,
        totalStars: wasDone
          ? Math.max(0, (p.totalStars || 0) - stars)
          : (p.totalStars || 0) + stars,
        chores: p.chores.map(c => c.id !== chore.id ? c : { ...c, done: !c.done })
      })
    }));
    if (!wasDone) triggerStarPop(chore.id);
  }

  async function claimChore(chore, person) {
    const res = await api.claimUpForGrabs(chore.id, person.id);
    setData(prev => ({
      ...prev,
      people: prev.people.map(p => p.id !== person.id ? p : { ...p, totalStars: res.totalStars }),
      upForGrabs: prev.upForGrabs.map(c => c.id !== chore.id ? c : res.chore),
    }));
    setClaimingId(null);
  }

  async function unclaimChore(chore) {
    const res = await api.unclaimUpForGrabs(chore.id);
    setData(prev => ({
      ...prev,
      people: res.personId
        ? prev.people.map(p => p.id !== res.personId ? p : { ...p, totalStars: res.totalStars })
        : prev.people,
      upForGrabs: prev.upForGrabs.map(c => c.id !== chore.id ? c : res.chore),
    }));
  }

  async function redeem(person, reward) {
    const res = await api.redeemReward(person.id, reward.id);
    if (!res.ok) return;
    setData(prev => ({
      ...prev,
      people: prev.people.map(p => p.id !== person.id ? p : { ...p, totalStars: res.remainingStars }),
    }));
    triggerCelebration(reward.id);
  }

  if (!data) return <div style={s.empty}>Loading chores…</div>;

  const upForGrabs = data.upForGrabs || [];
  const unclaimed = upForGrabs.filter(c => !c.done);
  const claimed = upForGrabs.filter(c => c.done);
  // Keep the full list for "done by" lookups so past attributions still resolve
  // even if that person is later hidden from the page.
  const personById = Object.fromEntries(data.people.map(p => [p.id, p]));
  const visiblePeople = data.people.filter(p => !p.hidden);

  if (compact) {
    return (
      <div style={s.compactWrap}>
        {visiblePeople.length === 0 && <div style={s.empty}>No one to show here yet.</div>}
        {visiblePeople.map(person => {
          const color = personColors[person.id] || person.color;
          const total = person.chores.length;
          const done = person.chores.filter(c => c.done).length;
          const pct = total ? (done / total) * 100 : 0;
          const collapsed = collapsedCards.has(person.id);
          return (
            <div key={person.id} style={{ ...s.compactList, borderLeft: `3px solid ${color}` }}>
              <div style={s.compactCardHeader} onClick={() => toggleCardCollapsed(person.id)}>
                <Avatar person={{ name: person.name, color, photoUrl: person.photoUrl }} size={30} />
                <div style={{ ...s.compactCardName, color }}>{person.name}</div>
                <div style={s.compactProgressWrap}>
                  <div style={s.compactProgressTrack}>
                    <div style={{ ...s.compactProgressFill, width: `${pct}%`, background: color }} />
                  </div>
                  <div style={s.compactProgressLabel}>{done}/{total}</div>
                </div>
                <div style={{ ...s.compactChevron, transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}>
                  <Icon name="chevron-right" size={16} />
                </div>
              </div>
              <div style={{ ...s.compactBodyOuter, maxHeight: collapsed ? 0 : 400 }}>
                <div style={s.compactCardBody}>
                  {person.chores.length === 0 ? (
                    <div style={s.compactDone}>No chores yet</div>
                  ) : (
                    person.chores.slice(0, 4).map(chore => (
                      <div key={chore.id} style={s.compactStepRow} onClick={() => toggle(person, chore)}>
                        <div style={{ ...s.compactStepCircle, ...(chore.done ? s.compactStepCircleDone : {}) }}>
                          {chore.done && <Icon name="check" size={13} />}
                        </div>
                        <span style={s.compactEmoji}>{chore.emoji}</span>
                        <span style={{ ...s.compactItemName, ...(chore.done ? s.compactItemDone : {}) }}>{chore.name}</span>
                        <span style={s.compactItemStars}>{'⭐'.repeat(chore.stars || 1)}</span>
                      </div>
                    ))
                  )}
                  {person.chores.length > 4 && <div style={s.compactMore}>+{person.chores.length - 4} more</div>}
                </div>
              </div>
            </div>
          );
        })}

        <div style={{ ...s.compactList, borderLeft: `3px solid ${GRABS_COLOR}` }}>
          <div style={s.compactCardHeader} onClick={() => toggleCardCollapsed('grabs')}>
            <div style={s.compactGrabsIcon}>🎯</div>
            <div style={s.compactCardName}>Up for Grabs</div>
            <div style={s.compactProgressWrap}>
              <div style={s.compactProgressTrack}>
                <div style={{ ...s.compactProgressFill, width: `${upForGrabs.length ? (claimed.length / upForGrabs.length) * 100 : 0}%`, background: GRABS_COLOR }} />
              </div>
              <div style={s.compactProgressLabel}>{claimed.length}/{upForGrabs.length}</div>
            </div>
            <div style={{ ...s.compactChevron, transform: collapsedCards.has('grabs') ? 'rotate(0deg)' : 'rotate(90deg)' }}>
              <Icon name="chevron-right" size={16} />
            </div>
          </div>
          <div style={{ ...s.compactBodyOuter, maxHeight: collapsedCards.has('grabs') ? 0 : 400 }}>
          <div style={s.compactCardBody}>
          {upForGrabs.length === 0 ? (
            <div style={s.compactDone}>Nothing here yet</div>
          ) : (
            upForGrabs.slice(0, 4).map(chore => {
              if (chore.done) {
                const doneByPerson = personById[chore.doneBy];
                return (
                  <div
                    key={chore.id}
                    style={{ ...s.compactItem, ...s.compactItemDone }}
                    onClick={() => unclaimChore(chore)}
                    title="Tap to unclaim"
                  >
                    <span style={s.compactEmoji}>{chore.emoji}</span>
                    <span style={s.compactItemName}>{chore.name} · {doneByPerson ? doneByPerson.name : 'someone'}</span>
                    <span style={s.compactItemStars}>{'⭐'.repeat(chore.stars || 1)}</span>
                  </div>
                );
              }
              if (claimingId === chore.id) {
                return (
                  <div key={chore.id} style={s.compactPickerRow}>
                    {visiblePeople.map(person => (
                      <button
                        key={person.id}
                        style={s.compactPickerAvatarBtn}
                        onClick={() => claimChore(chore, person)}
                        title={`Claim as ${person.name}`}
                      >
                        <Avatar person={person} size={22} />
                      </button>
                    ))}
                    <button style={s.compactPickerCancel} onClick={() => setClaimingId(null)}>✕</button>
                  </div>
                );
              }
              return (
                <div key={chore.id} style={s.compactItem} onClick={() => setClaimingId(chore.id)}>
                  <span style={s.compactEmoji}>{chore.emoji}</span>
                  <span style={s.compactItemName}>{chore.name}</span>
                  <span style={s.compactItemStars}>{'⭐'.repeat(chore.stars || 1)}</span>
                </div>
              );
            })
          )}
          {upForGrabs.length > 4 && <div style={s.compactMore}>+{upForGrabs.length - 4} more</div>}
          </div>
          </div>
        </div>
      </div>
    );
  }

  // One column per visible person plus "Up for Grabs" — grid tracks are all
  // 1fr, so hiding a person shrinks the column count and lets the remaining
  // columns stretch to fill the freed-up width, instead of leaving a gap.
  const columnCount = visiblePeople.length + 1;

  return (
    <div style={{ ...s.wrap, ...(isMobile ? s.wrapMobile : { gridTemplateColumns: `repeat(${columnCount}, 1fr)` }) }}>
      {visiblePeople.map(person => {
        const done = person.chores.filter(c => c.done).length;
        const total = person.chores.length;
        const pct = total ? (done / total) * 100 : 0;
        const color = personColors[person.id] || person.color;
        const isStarPerson = STAR_REWARD_PEOPLE.includes(person.id);
        const totalStars = person.totalStars || 0;

        return (
          <div key={person.id} style={{ ...s.column, ...(isMobile ? s.columnMobile : {}) }}>
            <div style={{ ...s.columnHeader, background: color + '14' }}>
              <div style={s.headerTop}>
                <Avatar person={{ name: person.name, color, photoUrl: person.photoUrl }} size={39} />
                <div style={s.personInfo}>
                  <div style={s.personName}>{person.name}</div>
                  <div style={s.doneCountText}>
                    {done}/{total} done{isStarPerson ? ` · ⭐ ${totalStars}` : ''}
                  </div>
                </div>
              </div>
              <div style={s.progressBar}>
                <div
                  style={{
                    ...s.progressFill,
                    width: `${pct}%`,
                    background: color,
                  }}
                />
              </div>
            </div>

            <div style={s.columnBody}>
              <div style={s.choreList}>
                {person.chores.map(chore => (
                  <ChoreCard
                    key={chore.id}
                    chore={chore}
                    color={color}
                    isMobile={isMobile}
                    onToggle={() => toggle(person, chore)}
                    floatingStars={floatingStars.filter(f => f.choreId === chore.id)}
                  />
                ))}
                {person.chores.length === 0 && <div style={s.emptySmall}>No chores yet</div>}
              </div>

              {isStarPerson && (
                <div style={s.rewardsBlock}>
                  <div style={s.rewardsTitle}>🎁 Rewards</div>
                  <div style={s.rewardsGrid}>
                    {(person.rewards || []).map(reward => {
                      const canAfford = totalStars >= reward.starsRequired;
                      const needed = Math.max(0, reward.starsRequired - totalStars);
                      const rewardPct = reward.starsRequired ? Math.min(100, (totalStars / reward.starsRequired) * 100) : 0;
                      return (
                        <div
                          key={reward.id}
                          style={{
                            ...s.rewardCard,
                            ...(canAfford ? { ...s.rewardCardGlow, borderColor: color } : {}),
                          }}
                        >
                          {celebrations[reward.id] && celebrations[reward.id].map(p => (
                            <span
                              key={p.key}
                              className="confetti-particle"
                              style={{ '--tx': `${p.tx}px`, '--ty': `${p.ty}px`, '--rot': `${p.rot}deg` }}
                            >
                              {p.emoji}
                            </span>
                          ))}
                          <div style={s.rewardRowHead}>
                            <div style={s.rewardEmoji}>{reward.emoji}</div>
                            <div style={s.rewardName}>{reward.name}</div>
                            <div style={s.rewardCost}>
                              {Math.min(totalStars, reward.starsRequired)}/{reward.starsRequired} ⭐
                            </div>
                          </div>
                          <div style={s.rewardProgressBar}>
                            <div
                              style={{
                                ...s.rewardProgressFill,
                                width: `${rewardPct}%`,
                                background: color,
                              }}
                            />
                          </div>
                          {canAfford ? (
                            <button style={{ ...s.redeemBtn, background: color }} onClick={() => redeem(person, reward)}>
                              Redeem ⭐
                            </button>
                          ) : (
                            <div style={s.rewardNeeded}>Need {needed} more ⭐</div>
                          )}
                        </div>
                      );
                    })}
                    {(person.rewards || []).length === 0 && <div style={s.emptySmall}>No rewards yet</div>}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div style={{ ...s.column, ...(isMobile ? s.columnMobile : {}) }}>
        <div style={{ ...s.columnHeader, background: GRABS_COLOR }}>
          <div style={s.headerTop}>
            <div style={s.grabsTitle}>🎯 Up for Grabs</div>
          </div>
          <div style={s.grabsCountText}>{unclaimed.length} unclaimed</div>
        </div>

        <div style={s.columnBody}>
          <div style={s.choreList}>
            {unclaimed.map(chore => (
              <div
                key={chore.id}
                style={s.grabsCard}
                onClick={() => setClaimingId(chore.id)}
              >
                <div style={s.grabsCardHead}>
                  <div style={s.grabsEmoji}>{chore.emoji}</div>
                  <div style={s.grabsInfo}>
                    <div style={s.grabsName}>{chore.name}</div>
                    <div style={s.grabsStars}>{'⭐'.repeat(chore.stars || 1)}</div>
                  </div>
                  {claimingId !== chore.id && (
                    <button style={s.claimBtn} onClick={() => setClaimingId(chore.id)}>Claim</button>
                  )}
                </div>
                {claimingId === chore.id && (
                  <div style={s.pickerRow} onClick={e => e.stopPropagation()}>
                    {visiblePeople.map(person => (
                      <button
                        key={person.id}
                        style={s.pickerAvatarBtn}
                        onClick={() => claimChore(chore, person)}
                        title={`Claim as ${person.name}`}
                      >
                        <Avatar person={person} size={30} />
                      </button>
                    ))}
                    <button style={s.pickerCancel} onClick={() => setClaimingId(null)}>✕</button>
                  </div>
                )}
              </div>
            ))}
            {unclaimed.length === 0 && <div style={s.emptySmall}>Nothing up for grabs right now</div>}

            {claimed.map(chore => {
              const doneByPerson = personById[chore.doneBy];
              return (
                <div
                  key={chore.id}
                  style={{ ...s.grabsCard, ...s.grabsCardDone }}
                  onClick={() => unclaimChore(chore)}
                  title="Click to unclaim and remove the stars"
                >
                  <div style={s.grabsCardHead}>
                    <div style={{ ...s.grabsEmoji, opacity: 0.5 }}>{chore.emoji}</div>
                    <div style={s.grabsInfo}>
                      <div style={{ ...s.grabsName, ...s.doneText }}>{chore.name}</div>
                      <div style={s.grabsStars}>{'⭐'.repeat(chore.stars || 1)}</div>
                    </div>
                  </div>
                  <div style={s.grabsDoneBy}>
                    ✓ Done by {doneByPerson ? doneByPerson.name : 'someone'} · {timeAgo(chore.doneAt)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  wrap: {
    display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12,
    height: '100%', padding: 4,
  },
  wrapMobile: {
    gridTemplateColumns: '1fr', height: 'auto', overflowY: 'auto', gap: 10,
  },
  empty: { padding: 20, color: 'var(--text-3)' },
  emptySmall: { fontSize: 14, color: 'var(--text-3)', fontStyle: 'italic', padding: '4px 0' },

  // Narrow single-column layout for the Home page side panel — same shape
  // as Tasks' compact mode, one card per person instead of per task list.
  compactWrap: { display: 'flex', flexDirection: 'column', gap: 10, padding: 14, overflowY: 'auto', height: '100%' },
  // flexShrink:0 keeps each card at its natural height inside compactWrap's
  // flex column — without it, flexbox squeezes cards to fit the available
  // space (clipping their own content) instead of letting the wrap actually
  // overflow, which is what makes its overflowY:auto scroll in the first place.
  compactList: { background: 'var(--bg)', borderRadius: 10, overflow: 'hidden', flexShrink: 0 },
  // Collapsible wrapper shared by every compact card's body — same
  // max-height-transition trick as Routines' stepsOuter.
  compactBodyOuter: { overflow: 'hidden', transition: 'max-height 0.25s ease' },
  compactChevron: {
    color: 'var(--text-3)', flexShrink: 0, marginLeft: 'auto',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'transform 0.2s ease',
  },
  // Per-person card header/steps, styled to match Routines' bubble cards —
  // avatar + name + progress bar/count up top, circle-checkbox rows below.
  compactCardHeader: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 8px', cursor: 'pointer' },
  // Stands in for the person cards' Avatar on the Up for Grabs card, which
  // has no single person to show a photo for.
  compactGrabsIcon: {
    width: 30, height: 30, borderRadius: '50%', background: 'var(--surface2)', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
  },
  compactCardName: {
    fontSize: 16, fontWeight: 700, flex: 1, minWidth: 0,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  compactProgressWrap: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
  compactProgressTrack: { width: 44, height: 6, borderRadius: 99, background: 'var(--border-md)', overflow: 'hidden' },
  compactProgressFill: { height: '100%', borderRadius: 99, transition: 'width 0.2s ease' },
  compactProgressLabel: { fontSize: 13, fontWeight: 700, color: 'var(--text-3)', minWidth: 26, textAlign: 'right' },
  compactCardBody: { display: 'flex', flexDirection: 'column', gap: 1, padding: '0 8px 8px' },
  compactStepRow: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px', cursor: 'pointer', borderRadius: 8,
  },
  compactStepCircle: {
    width: 22, height: 22, borderRadius: '50%', border: '2px solid var(--border-md)', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
    transition: 'background 0.15s, border-color 0.15s',
  },
  compactStepCircleDone: { background: 'var(--green)', borderColor: 'var(--green)' },
  compactItem: {
    fontSize: 14, color: 'var(--text-1)', padding: '3px 0', display: 'flex',
    alignItems: 'center', gap: 6, cursor: 'pointer',
  },
  // Stays in the list (rather than disappearing) so a tap can undo it —
  // muted + struck through instead of removed.
  compactItemDone: { color: 'var(--text-3)', textDecoration: 'line-through' },
  compactEmoji: { fontSize: 17, flexShrink: 0, width: 20, textAlign: 'center' },
  compactItemName: {
    fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  compactItemStars: { fontSize: 10, letterSpacing: '-1px', flexShrink: 0, marginLeft: 6, opacity: 0.9 },
  compactDone: { fontSize: 14, color: 'var(--text-3)' },
  compactMore: { fontSize: 13, color: 'var(--text-3)', marginTop: 2 },
  compactPickerRow: { display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', padding: '3px 0' },
  compactPickerAvatarBtn: { background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 },
  compactPickerCancel: {
    width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 11, color: 'var(--text-3)', background: 'var(--surface)',
    border: '0.5px solid var(--border)', flexShrink: 0,
  },

  column: {
    display: 'flex', flexDirection: 'column', height: '100%',
    background: 'var(--surface)', borderRadius: 16, overflow: 'hidden',
    border: '0.5px solid var(--border)', minWidth: 0, boxShadow: 'var(--shadow-sm)',
  },
  columnMobile: { height: 'auto', maxHeight: '60vh' },

  columnHeader: { padding: '16px 16px 13px', flexShrink: 0 },
  headerTop: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  personInfo: { flex: 1, minWidth: 0 },
  personName: { fontSize: 16, fontWeight: 700, color: 'var(--text-1)' },
  doneCountText: { fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginTop: 2 },
  progressBar: { height: 5, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 99, transition: 'width 0.3s ease' },

  grabsTitle: { fontSize: 16, fontWeight: 700, color: 'white' },
  grabsCountText: { fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)' },

  columnBody: { flex: 1, overflowY: 'auto', padding: 10 },
  choreList: { display: 'flex', flexDirection: 'column', gap: 8 },

  choreCard: {
    display: 'flex', alignItems: 'center', gap: 11,
    padding: '11px 11px', borderRadius: 12,
    background: 'var(--bg)', cursor: 'pointer',
    transition: 'all 0.15s', border: '0.5px solid var(--border)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  choreCardMobile: { padding: '10px 11px', gap: 11 },
  choreDone: { background: 'var(--surface2)' },
  thumb: {
    fontSize: 28, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--surface)', borderRadius: 10, flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    position: 'relative', overflow: 'visible',
  },
  thumbMobile: { fontSize: 26, width: 40, height: 40 },
  choreInfo: { flex: 1, minWidth: 0 },
  choreName: { fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 3 },
  doneText: { textDecoration: 'line-through', color: 'var(--text-3)' },
  choreMeta: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  choreStars: { fontSize: 10, letterSpacing: '-1px' },
  check: { width: 28, height: 28, borderRadius: 7, border: '2px solid var(--border-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' },
  checkDone: { background: '#22c55e', borderColor: '#22c55e' },

  rewardsBlock: { marginTop: 14, paddingTop: 12, borderTop: '0.5px solid var(--border)' },
  rewardsTitle: {
    fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8,
    fontFamily: 'var(--font-heading)', fontStyle: 'italic',
  },
  rewardsGrid: { display: 'flex', flexDirection: 'column', gap: 8 },
  rewardCard: {
    position: 'relative', overflow: 'visible', borderRadius: 12, padding: '10px',
    border: '2px solid var(--border)', display: 'flex', flexDirection: 'column',
    gap: 6, background: 'var(--bg)', transition: 'all 0.15s',
  },
  rewardCardGlow: { boxShadow: '0 0 0 3px rgba(60,126,195,0.15), 0 4px 14px rgba(0,0,0,0.1)' },
  rewardRowHead: { display: 'flex', alignItems: 'center', gap: 8 },
  rewardEmoji: { fontSize: 22, flexShrink: 0 },
  rewardName: { fontSize: 13, fontWeight: 600, color: 'var(--text-1)', flex: 1, textAlign: 'left' },
  rewardCost: { fontSize: 12, color: 'var(--text-3)', fontWeight: 600, flexShrink: 0 },
  rewardProgressBar: { height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' },
  rewardProgressFill: { height: '100%', borderRadius: 99, transition: 'width 0.3s ease' },
  redeemBtn: {
    padding: '5px 10px', borderRadius: 8, color: 'white',
    fontSize: 13, fontWeight: 700, width: '100%',
  },
  rewardNeeded: { fontSize: 12, color: 'var(--text-3)', fontWeight: 600, textAlign: 'center' },

  grabsCard: {
    background: 'var(--bg)', borderRadius: 12, padding: 10,
    border: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8,
    cursor: 'pointer',
  },
  grabsCardDone: { opacity: 0.6, cursor: 'pointer' },
  grabsCardHead: { display: 'flex', alignItems: 'center', gap: 8 },
  grabsEmoji: { fontSize: 26, width: 36, textAlign: 'center', flexShrink: 0 },
  grabsInfo: { flex: 1, minWidth: 0 },
  grabsName: { fontSize: 14, fontWeight: 600, color: 'var(--text-1)' },
  grabsStars: { fontSize: 10, letterSpacing: '-1px', marginTop: 2 },
  grabsDoneBy: { fontSize: 12, color: 'var(--text-3)', fontWeight: 500 },
  claimBtn: {
    flexShrink: 0, padding: '5px 12px', borderRadius: 8,
    background: 'var(--blue)', color: 'white', fontSize: 13, fontWeight: 600,
  },
  pickerRow: { display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' },
  pickerAvatarBtn: { background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 },
  pickerCancel: {
    width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 12, color: 'var(--text-3)', background: 'var(--surface)',
    border: '0.5px solid var(--border)', flexShrink: 0,
  },
};
