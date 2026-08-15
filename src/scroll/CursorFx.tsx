import { useEffect, useRef } from 'react';

/**
 * Game-like custom cursor: a rotating neon reticle that eases toward the pointer,
 * plus a particle + ring burst on every click. Pure full-screen canvas overlay
 * with pointer-events: none, so it never intercepts interaction. Mounted only for
 * the immersive ride (the OS cursor is hidden there via CSS).
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
}

interface Ring {
  x: number;
  y: number;
  life: number;
  max: number;
}

export function CursorFx() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const eased = { x: pointer.x, y: pointer.y };
    let inside = false;
    let pressed = 0;
    const particles: Particle[] = [];
    const rings: Ring[] = [];

    const onMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      inside = true;
    };
    const onLeave = () => {
      inside = false;
    };
    const onDown = (event: PointerEvent) => {
      pressed = 1;
      rings.push({ x: event.clientX, y: event.clientY, life: 0, max: 0.5 });
      const count = 16;
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
        const speed = 3 + Math.random() * 4;
        particles.push({
          x: event.clientX,
          y: event.clientY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          max: 0.5 + Math.random() * 0.3,
          color: i % 2 ? '#2bfdf9' : '#ff3abf',
        });
      }
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerout', onLeave);

    let raf = 0;
    let prev = performance.now();
    let spin = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      // Snappy follow — trails the real pointer only slightly (higher rate =
      // closer follow).
      const k = 1 - Math.exp(-32 * dt);
      eased.x += (pointer.x - eased.x) * k;
      eased.y += (pointer.y - eased.y) * k;
      pressed = Math.max(0, pressed - dt * 3);
      spin += dt * 0.8;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        p.life += dt;
        if (p.life >= p.max) {
          particles.splice(i, 1);
          continue;
        }
        p.vx *= 0.92;
        p.vy *= 0.92;
        p.vy += dt * 6;
        p.x += p.vx;
        p.y += p.vy;
        ctx.globalAlpha = 1 - p.life / p.max;
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      }

      for (let i = rings.length - 1; i >= 0; i -= 1) {
        const r = rings[i];
        r.life += dt;
        if (r.life >= r.max) {
          rings.splice(i, 1);
          continue;
        }
        const f = r.life / r.max;
        ctx.globalAlpha = (1 - f) * 0.9;
        ctx.strokeStyle = '#2bfdf9';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#2bfdf9';
        ctx.beginPath();
        ctx.arc(r.x, r.y, 6 + f * 46, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (inside) {
        const s = 12 + pressed * 8;
        ctx.globalAlpha = 0.9;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#2bfdf9';
        ctx.strokeStyle = '#2bfdf9';
        ctx.lineWidth = 1.5;
        ctx.save();
        ctx.translate(eased.x, eased.y);
        ctx.rotate(spin);
        ctx.strokeRect(-s, -s, s * 2, s * 2);
        ctx.restore();
        ctx.fillStyle = '#ff3abf';
        ctx.shadowColor = '#ff3abf';
        ctx.beginPath();
        ctx.arc(eased.x, eased.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerout', onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="cursor-fx" aria-hidden="true" />;
}
