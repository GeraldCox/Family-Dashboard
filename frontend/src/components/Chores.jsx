import { useState, useEffect } from 'react';
import { api } from '../api';
import { useScreenSize } from '../hooks/useScreenSize';

const RESET_COLORS = {
  daily:  { bg: '#dbeafe', color: '#1e40af' },
  weekly: { bg: '#ede9fe', color: '#5b21b6' },
  manual: { bg: '#d1fae5', color: '#065f46' },
};

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
          <div style={{ ...s.resetBadge, ...RESET_COLORS[chore.reset] }}>
            Resets {chore.reset}
          </div>
          <div style={s.choreStars}>{'⭐'.repeat(chore.stars || 1)}</div>
        </div>
      </div>
      <div style={{ ...s.check, ...(chore.done ? s.checkDone : {}) }}>
        {chore.done && <span style={{ color: 'white', fontSize: 18, lineHeight: 1 }}>✓</span>}
      </div>
    </div>
  );
}

export default function Chores() {
  const [data, setData] = useState(null);
  const [personColors, setPersonColors] = useState({});
  const [floatingStars, setFloatingStars] = useState([]); // [{ popId, choreId }]
  const [claimingId, setClaimingId] = useState(null);
  const [celebrations, setCelebrations] = useState({}); // rewardId -> particles
  const { isMobile } = useScreenSize();

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

  return (
    <div style={{ ...s.wrap, ...(isMobile ? s.wrapMobile : {}) }}>
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
                <div style={{ ...s.avatar, background: color + '22', color: color }}>
                  {person.name[0]}
                </div>
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
              <div key={chore.id} style={s.grabsCard}>
                <div style={s.grabsCardHead}>
                  <div style={s.grabsEmoji}>{chore.emoji}</div>
                  <div style={s.grabsInfo}>
                    <div style={s.grabsName}>{chore.name}</div>
                    <div style={s.grabsStars}>{'⭐'.repeat(chore.stars || 1)}</div>
                  </div>
                </div>
                {claimingId === chore.id ? (
                  <div style={s.pickerRow}>
                    {visiblePeople.map(person => (
                      <button
                        key={person.id}
                        style={{ ...s.pickerAvatar, background: person.color + '22', color: person.color }}
                        onClick={() => claimChore(chore, person)}
                        title={`Claim as ${person.name}`}
                      >
                        {person.name[0]}
                      </button>
                    ))}
                    <button style={s.pickerCancel} onClick={() => setClaimingId(null)}>✕</button>
                  </div>
                ) : (
                  <button style={s.claimBtn} onClick={() => setClaimingId(chore.id)}>Claim</button>
                )}
              </div>
            ))}
            {unclaimed.length === 0 && <div style={s.emptySmall}>Nothing up for grabs right now</div>}

            {claimed.map(chore => {
              const doneByPerson = personById[chore.doneBy];
              return (
                <div key={chore.id} style={{ ...s.grabsCard, ...s.grabsCardDone }}>
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

  column: {
    display: 'flex', flexDirection: 'column', height: '100%',
    background: 'var(--surface)', borderRadius: 16, overflow: 'hidden',
    border: '0.5px solid var(--border)', minWidth: 0, boxShadow: 'var(--shadow-sm)',
  },
  columnMobile: { height: 'auto', maxHeight: '60vh' },

  columnHeader: { padding: '16px 16px 13px', flexShrink: 0 },
  headerTop: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  avatar: { width: 39, height: 39, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, flexShrink: 0 },
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
  resetBadge: { fontSize: 10, padding: '2px 6px', borderRadius: 20, fontWeight: 600, display: 'inline-block' },
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
  },
  grabsCardDone: { opacity: 0.6 },
  grabsCardHead: { display: 'flex', alignItems: 'center', gap: 8 },
  grabsEmoji: { fontSize: 26, width: 36, textAlign: 'center', flexShrink: 0 },
  grabsInfo: { flex: 1, minWidth: 0 },
  grabsName: { fontSize: 14, fontWeight: 600, color: 'var(--text-1)' },
  grabsStars: { fontSize: 10, letterSpacing: '-1px', marginTop: 2 },
  grabsDoneBy: { fontSize: 12, color: 'var(--text-3)', fontWeight: 500 },
  claimBtn: {
    alignSelf: 'flex-start', padding: '5px 12px', borderRadius: 8,
    background: 'var(--blue)', color: 'white', fontSize: 13, fontWeight: 600,
  },
  pickerRow: { display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' },
  pickerAvatar: {
    width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0,
  },
  pickerCancel: {
    width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 12, color: 'var(--text-3)', background: 'var(--surface)',
    border: '0.5px solid var(--border)', flexShrink: 0,
  },
};
