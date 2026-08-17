import { useEffect, useRef, useState } from 'react';

/**
 * Freehand signature capture on a canvas.
 *
 * The prototype drew a static SVG path; this is the real thing. Pointer events
 * cover mouse, trackpad, pen and touch in one code path, and `touch-action:
 * none` on the element stops a finger stroke scrolling the page instead of
 * drawing.
 *
 * `onChange(hasInk)` lets the parent enable its submit button only once
 * something has actually been drawn.
 */
export default function SignaturePad({ height = 128, className = '', onChange, label = 'Signature area' }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const [hasInk, setHasInk] = useState(false);

  // Size the backing store to the device pixel ratio, or strokes render soft.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const prev = canvas.toDataURL();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1A1D21';
      // Repaint whatever was already drawn, so a resize does not wipe the ink.
      if (hasInk) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
        img.src = prev;
      }
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e) {
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  }

  function move(e) {
    if (!drawing.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!hasInk) {
      setHasInk(true);
      onChange?.(true);
    }
  }

  function end(e) {
    if (!drawing.current) return;
    drawing.current = false;
    try {
      canvasRef.current.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange?.(false);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        className={`sigpad ${className}`}
        style={{ height, width: '100%', display: 'block' }}
        aria-label={label}
        role="img"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>
          {hasInk ? 'Signature captured' : 'Draw your signature above'}
        </span>
        {/* Reads as a link, but keeps a 44px tap target — the handoff calls for
            a 44px Clear on the mobile signing screen, and a thumb needs it. */}
        <button
          type="button"
          onClick={clear}
          style={{
            background: 'none',
            border: 0,
            padding: '0 4px',
            minHeight: 44,
            minWidth: 44,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--blue)',
            cursor: 'pointer',
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
