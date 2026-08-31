import { useState, useEffect, useRef } from 'react';
import Icon from './Icon';

const PRESETS = [1, 5, 10, 15, 20, 30];
const BEEP_REPEAT_MS = 1200;

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function playBeep(ctx, delay = 0) {
  const startTime = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.35, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.28);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + 0.3);
}

function ProgressRing({ pct, danger }) {
  const size = 320;
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(1, Math.max(0, pct)));

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} style={s.ring}>
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="var(--border-md)" strokeWidth={strokeWidth} fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        stroke={danger ? 'var(--red)' : 'var(--accent-blue)'}
        strokeWidth={strokeWidth} fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={s.ringProgress}
      />
    </svg>
  );
}

export default function Timer() {
  const [phase, setPhase] = useState('idle'); // idle | running | paused | done
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [customMin, setCustomMin] = useState('');
  const [customSec, setCustomSec] = useState('');

  const intervalRef = useRef(null);
  const audioCtxRef = useRef(null);
  const beepIntervalRef = useRef(null);

  useEffect(() => {
    return () => {
      clearInterval(intervalRef.current);
      clearInterval(beepIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'running') return;
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          setPhase('done');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [phase]);

  useEffect(() => {
    if (phase === 'done') {
      const ctx = audioCtxRef.current;
      if (ctx) {
        const fire = () => { playBeep(ctx, 0); playBeep(ctx, 0.35); };
        fire();
        beepIntervalRef.current = setInterval(fire, BEEP_REPEAT_MS);
      }
    } else {
      clearInterval(beepIntervalRef.current);
      beepIntervalRef.current = null;
    }
    return () => clearInterval(beepIntervalRef.current);
  }, [phase]);

  function ensureAudioCtx() {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
    return audioCtxRef.current;
  }

  function startTimer(minutes, seconds = 0) {
    const total = Math.round(minutes * 60 + seconds);
    if (total <= 0) return;
    ensureAudioCtx();
    clearInterval(intervalRef.current);
    clearInterval(beepIntervalRef.current);
    setTotalSeconds(total);
    setRemaining(total);
    setPhase('running');
  }

  function startCustom() {
    const m = parseInt(customMin, 10) || 0;
    const sec = parseInt(customSec, 10) || 0;
    startTimer(m, sec);
    setCustomMin('');
    setCustomSec('');
  }

  function pauseResume() {
    setPhase(p => (p === 'running' ? 'paused' : 'running'));
  }

  function reset() {
    clearInterval(intervalRef.current);
    clearInterval(beepIntervalRef.current);
    setPhase('idle');
    setTotalSeconds(0);
    setRemaining(0);
  }

  function dismiss() {
    reset();
  }

  const pct = totalSeconds > 0 ? remaining / totalSeconds : 0;
  const isDone = phase === 'done';

  if (phase === 'idle') {
    return (
      <div style={s.wrap}>
        <div style={s.title}><Icon name="timer" size={26} /> Timer</div>

        <div style={s.presetGrid}>
          {PRESETS.map(min => (
            <button key={min} style={s.presetBtn} onClick={() => startTimer(min)}>
              {min} min
            </button>
          ))}
        </div>

        <div style={s.customRow}>
          <input
            type="number"
            min="0"
            placeholder="Min"
            style={s.customInput}
            value={customMin}
            onChange={e => setCustomMin(e.target.value)}
          />
          <span style={s.customColon}>:</span>
          <input
            type="number"
            min="0"
            max="59"
            placeholder="Sec"
            style={s.customInput}
            value={customSec}
            onChange={e => setCustomSec(e.target.value)}
          />
          <button style={s.customStartBtn} onClick={startCustom}>Start</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...s.wrap, ...(isDone ? s.wrapDone : {}) }}>
      <div style={s.ringOuter}>
        <ProgressRing pct={isDone ? 0 : pct} danger={isDone} />
        <div style={s.ringCenter}>
          <div style={{ ...s.bigTime, ...(isDone ? s.bigTimeDone : {}) }}>
            {formatTime(isDone ? 0 : remaining)}
          </div>
        </div>
      </div>

      {isDone ? (
        <>
          <div style={s.timesUp}>Time's Up!</div>
          <button style={s.dismissBtn} onClick={dismiss}>Dismiss</button>
        </>
      ) : (
        <div style={s.controls}>
          <button style={s.controlBtn} onClick={pauseResume}>
            <Icon name={phase === 'running' ? 'pause' : 'play'} size={18} />
            {phase === 'running' ? 'Pause' : 'Resume'}
          </button>
          <button style={{ ...s.controlBtn, ...s.resetBtn }} onClick={reset}>
            <Icon name="rotate-ccw" size={18} /> Reset
          </button>
        </div>
      )}
    </div>
  );
}

const s = {
  wrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    height: '100%', gap: 28, padding: 24, boxSizing: 'border-box',
    background: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
    transition: 'background-color 0.3s ease',
  },
  wrapDone: {
    animation: 'timer-flash-bg 1s ease-in-out infinite',
  },
  title: {
    fontSize: 28, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-heading)',
    display: 'flex', alignItems: 'center', gap: 10,
  },

  presetGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16,
    width: '100%', maxWidth: 640,
  },
  presetBtn: {
    padding: '22px 12px', borderRadius: 16, background: 'var(--bg)',
    border: '0.5px solid var(--border)', fontSize: 22, fontWeight: 700,
    color: 'var(--text-1)', boxShadow: 'var(--shadow-sm)', cursor: 'pointer',
  },

  customRow: {
    display: 'flex', alignItems: 'center', gap: 10,
  },
  customInput: {
    width: 84, padding: '14px 10px', borderRadius: 12, textAlign: 'center',
    border: '0.5px solid var(--border-md)', background: 'var(--bg)', fontSize: 20, fontWeight: 600,
    color: 'var(--text-1)',
  },
  customColon: { fontSize: 24, fontWeight: 700, color: 'var(--text-2)' },
  customStartBtn: {
    padding: '16px 28px', borderRadius: 12, background: 'var(--accent-blue)',
    color: 'white', fontSize: 18, fontWeight: 700, cursor: 'pointer',
  },

  ringOuter: {
    position: 'relative', width: 'min(52vh, 60vw)', height: 'min(52vh, 60vw)',
    maxWidth: 420, maxHeight: 420, minWidth: 220, minHeight: 220,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    containerType: 'inline-size',
  },
  ring: {},
  ringProgress: { transition: 'stroke-dashoffset 1s linear' },
  ringCenter: {
    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  bigTime: {
    // Sized off the ring's own container width (not vh) so the digits stay
    // inscribed in the circle regardless of viewport aspect ratio — vh-based
    // sizing could outgrow the ring once its 420px width cap kicked in.
    fontSize: 'clamp(44px, 30cqw, 150px)', fontWeight: 700, lineHeight: 1,
    color: 'var(--text-1)', fontFamily: 'var(--font-heading)', fontVariantNumeric: 'tabular-nums',
  },
  bigTimeDone: {
    color: 'var(--red)', animation: 'timer-flash-text 1s ease-in-out infinite',
  },

  timesUp: {
    fontSize: 40, fontWeight: 800, color: 'var(--red)', fontFamily: 'var(--font-heading)',
    animation: 'timer-flash-text 1s ease-in-out infinite',
  },
  dismissBtn: {
    padding: '20px 48px', borderRadius: 16, background: 'var(--red)',
    color: 'white', fontSize: 24, fontWeight: 700, cursor: 'pointer', boxShadow: 'var(--shadow-md)',
  },

  controls: { display: 'flex', gap: 18 },
  controlBtn: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '20px 36px', borderRadius: 16, background: 'var(--accent-blue)',
    color: 'white', fontSize: 20, fontWeight: 700, cursor: 'pointer', boxShadow: 'var(--shadow-sm)',
  },
  resetBtn: { background: 'var(--bg)', color: 'var(--text-2)', border: '0.5px solid var(--border-md)' },
};
