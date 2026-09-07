import { useEffect } from 'react';
import { closePosterZoom, usePosterZoom } from '../choreography/posterZoom';

/**
 * DOM overlay for the poster click-to-zoom: shows the close (X) control while a
 * board is zoomed and locks page scroll so the ride's position is frozen until
 * the view is dismissed (X or Esc). The wrapper is pointer-events:none so only
 * the button captures clicks — poster clicks still reach the 3D canvas.
 */
export function PosterZoomOverlay() {
  const { status } = usePosterZoom();
  const active = status !== 'idle';

  useEffect(() => {
    if (!active) return undefined;
    const block = (event: Event) => event.preventDefault();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePosterZoom();
        return;
      }
      const scrollKeys = [
        ' ', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End',
      ];
      if (scrollKeys.includes(event.key)) event.preventDefault();
    };
    window.addEventListener('wheel', block, { passive: false });
    window.addEventListener('touchmove', block, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', block);
      window.removeEventListener('touchmove', block);
      window.removeEventListener('keydown', onKey);
    };
  }, [active]);

  if (!active) return null;
  return (
    <div className="poster-zoom-overlay">
      <button
        type="button"
        className="poster-zoom-overlay__close"
        aria-label="Close poster"
        onClick={closePosterZoom}
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}
