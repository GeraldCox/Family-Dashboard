import { useState, useRef } from 'react';
import Icon from './Icon';

const FRAME = 240; // displayed square crop area, css px
const OUTPUT = 400; // exported image size, px

function clampOffset(offset, scale, imgSize) {
  const scaledW = imgSize.w * scale;
  const scaledH = imgSize.h * scale;
  const maxX = Math.max(0, (scaledW - FRAME) / 2);
  const maxY = Math.max(0, (scaledH - FRAME) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };
}

export default function AvatarCropModal({ personName, color, onClose, onSave }) {
  const [imgSrc, setImgSrc] = useState(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [minScale, setMinScale] = useState(1);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dragRef = useRef(null);
  const fileInputRef = useRef(null);

  function chooseFile() {
    fileInputRef.current?.click();
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const min = FRAME / Math.min(img.naturalWidth, img.naturalHeight);
        setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
        setMinScale(min);
        setScale(min);
        setOffset({ x: 0, y: 0 });
        setImgSrc(reader.result);
      };
      img.onerror = () => setError('Could not load that image.');
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function onPointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOffset: offset };
  }

  function onPointerMove(e) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clampOffset(
      { x: dragRef.current.startOffset.x + dx, y: dragRef.current.startOffset.y + dy },
      scale, imgSize,
    ));
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  function handleScale(value) {
    const next = Number(value);
    setScale(next);
    setOffset(prev => clampOffset(prev, next, imgSize));
  }

  async function confirmCrop() {
    setSaving(true);
    setError('');
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imgSrc;
      });
      const k = OUTPUT / FRAME;
      const outScale = scale * k;
      const drawW = imgSize.w * outScale;
      const drawH = imgSize.h * outScale;
      const drawX = OUTPUT / 2 - drawW / 2 + offset.x * k;
      const drawY = OUTPUT / 2 - drawH / 2 + offset.y * k;

      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, drawX, drawY, drawW, drawH);

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      await onSave(blob);
    } catch (err) {
      console.error(err);
      setError('Could not save that photo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.box} onClick={e => e.stopPropagation()}>
        <div style={s.header}>
          <div style={s.title}><Icon name="camera" size={18} /> {personName ? `Photo for ${personName}` : 'Upload Photo'}</div>
          <button style={s.close} onClick={onClose}>✕</button>
        </div>

        <div style={s.body}>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />

          {!imgSrc ? (
            <button style={s.dropZone} onClick={chooseFile}>
              <Icon name="upload" size={28} style={{ color: 'var(--text-3)' }} />
              <div style={s.dropZoneText}>Click to choose a photo</div>
            </button>
          ) : (
            <>
              <div
                style={s.frame}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <img
                  src={imgSrc}
                  alt=""
                  draggable={false}
                  style={{
                    position: 'absolute',
                    left: `calc(50% + ${offset.x}px)`, top: `calc(50% + ${offset.y}px)`,
                    width: imgSize.w * scale, height: imgSize.h * scale,
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none', userSelect: 'none',
                  }}
                />
                <div style={{ ...s.roundGuide, border: `2px solid ${color || 'white'}` }} />
              </div>

              <div style={s.controlsRow}>
                <Icon name="minus" size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                <input
                  type="range"
                  min={minScale}
                  max={minScale * 3}
                  step={minScale / 100}
                  value={scale}
                  onChange={e => handleScale(e.target.value)}
                  style={s.slider}
                />
                <Icon name="plus" size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              </div>
              <button style={s.changeBtn} onClick={chooseFile}>Choose a different photo</button>
            </>
          )}

          {error && <div style={s.error}>{error}</div>}
        </div>

        {imgSrc && (
          <div style={s.footer}>
            <button style={s.cancelBtn} onClick={onClose}>Cancel</button>
            <button style={s.saveBtn} onClick={confirmCrop} disabled={saving}>
              {saving ? 'Saving…' : 'Save Photo'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  box: {
    background: 'var(--surface)', borderRadius: 'var(--radius-xl)', width: 420,
    maxWidth: '92vw', maxHeight: '90vh', overflow: 'auto', boxShadow: 'var(--shadow-md)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '18px 20px', borderBottom: '0.5px solid var(--border)',
  },
  title: { fontSize: 18, fontWeight: 700, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 },
  close: {
    width: 34, height: 34, borderRadius: 'var(--radius-sm)', background: 'var(--bg)',
    color: 'var(--text-2)', fontSize: 16, display: 'flex', alignItems: 'center',
    justifyContent: 'center', cursor: 'pointer', border: '0.5px solid var(--border)',
  },
  body: { padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 },
  dropZone: {
    width: '100%', height: 200, borderRadius: 12, border: '2px dashed var(--border-md)',
    background: 'var(--bg)', color: 'var(--text-2)', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  dropZoneText: { fontSize: 15, fontWeight: 500 },
  frame: {
    position: 'relative', width: FRAME, height: FRAME, borderRadius: 12,
    background: '#000', overflow: 'hidden', touchAction: 'none', cursor: 'grab',
  },
  roundGuide: {
    position: 'absolute', inset: 0, borderRadius: '50%',
    boxShadow: '0 0 0 999px rgba(0,0,0,0.45)', pointerEvents: 'none',
  },
  controlsRow: { display: 'flex', alignItems: 'center', gap: 10, width: '100%' },
  slider: { flex: 1 },
  changeBtn: {
    fontSize: 13, fontWeight: 600, color: 'var(--blue)', background: 'transparent',
    border: 'none', cursor: 'pointer', padding: 0,
  },
  error: { color: '#dc2626', fontSize: 14 },
  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: 10,
    padding: '14px 20px', borderTop: '0.5px solid var(--border)',
  },
  cancelBtn: {
    padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border-md)',
    background: 'var(--bg)', color: 'var(--text-2)', fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
  saveBtn: {
    padding: '10px 16px', borderRadius: 8, border: 'none',
    background: 'var(--blue)', color: 'white', fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
};
