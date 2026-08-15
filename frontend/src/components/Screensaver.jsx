import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

export default function Screensaver({ transitionSeconds = 6, brightness = 100, onDismiss }) {
  const [photos, setPhotos] = useState([]);
  const [layerUrls, setLayerUrls] = useState([null, null]);
  const [activeLayer, setActiveLayer] = useState(0);
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(new Date());
  const preloadRef = useRef(null);

  useEffect(() => {
    api.getPhotos().then(list => {
      setPhotos(list || []);
      if (list && list.length > 0) {
        setLayerUrls([list[0].url, null]);
        setActiveLayer(0);
        setIndex(0);
      }
    }).catch(() => setPhotos([]));
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (photos.length < 2) return undefined;
    const intervalMs = Math.max(3, transitionSeconds) * 1000;

    const id = setInterval(() => {
      const nextIndex = (index + 1) % photos.length;
      const nextUrl = photos[nextIndex].url;
      const img = new Image();
      preloadRef.current = img;
      img.onload = () => {
        const inactive = activeLayer === 0 ? 1 : 0;
        setLayerUrls(prev => {
          const next = [...prev];
          next[inactive] = nextUrl;
          return next;
        });
        setActiveLayer(inactive);
        setIndex(nextIndex);
      };
      img.src = nextUrl;
    }, intervalMs);

    return () => clearInterval(id);
  }, [photos, index, activeLayer, transitionSeconds]);

  const hasPhotos = photos.length > 0;

  return (
    <div
      style={{ ...s.overlay, filter: `brightness(${brightness}%)` }}
      onClick={onDismiss}
      onTouchStart={onDismiss}
    >
      {hasPhotos ? (
        <>
          <div style={s.photoWrap}>
            {[0, 1].map(layer => (
              layerUrls[layer] && (
                <img
                  key={layer}
                  src={layerUrls[layer]}
                  alt=""
                  style={{
                    ...s.photoImg,
                    opacity: activeLayer === layer ? 1 : 0,
                    transitionDuration: `${transitionSeconds}s`,
                  }}
                />
              )
            ))}
          </div>
          <div style={s.bottomOverlay}>
            <div style={s.timeBottom}>
              {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </div>
          </div>
        </>
      ) : (
        <>
          <div style={s.gradientBg} />
          <div style={s.centeredClock}>
            <div style={s.timeCentered}>
              {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </div>
            <div style={s.dateCentered}>
              {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'black', overflow: 'hidden', cursor: 'pointer',
  },
  photoWrap: { position: 'absolute', inset: 0 },
  photoImg: {
    position: 'absolute', inset: 0, width: '100%', height: '100%',
    objectFit: 'cover', transitionProperty: 'opacity', transitionTimingFunction: 'ease-in-out',
  },
  bottomOverlay: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: '60px 50px 46px',
    background: 'linear-gradient(transparent, rgba(0,0,0,0.55))',
  },
  timeBottom: {
    fontSize: 56, fontWeight: 600, color: 'white',
    textShadow: '0 2px 16px rgba(0,0,0,0.6)', letterSpacing: '-1px',
  },
  gradientBg: {
    position: 'absolute', inset: 0,
    background: 'radial-gradient(circle at 30% 20%, #1e293b 0%, #0f172a 55%, #000000 100%)',
  },
  centeredClock: {
    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
  },
  timeCentered: {
    fontSize: 130, fontWeight: 200, color: 'white', letterSpacing: '-2px', lineHeight: 1,
  },
  dateCentered: {
    fontSize: 26, fontWeight: 400, color: 'rgba(255,255,255,0.65)', marginTop: 16,
  },
};
