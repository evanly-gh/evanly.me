// Frame-demand flag for the paced (low-tier) render loop.
//
// On weak devices the canvas renders on demand instead of every vsync: anything
// that changes what the next frame should look like calls `mark()` (scroll
// progress writes, camera/bike damping still settling, pointer parallax, intro
// animation, poster zoom), and RenderGate turns a dirty flag into at most
// `maxFps` renders per second. On high/mid tiers the loop stays "always" and
// this flag is simply ignored.
export const renderDemand = {
  dirty: true,
  mark(): void {
    renderDemand.dirty = true;
  },
  /** Consumes the flag; true when a frame should be rendered. */
  take(): boolean {
    const was = renderDemand.dirty;
    renderDemand.dirty = false;
    return was;
  },
};
