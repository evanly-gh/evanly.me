export interface WebGL2ProbeContext {
  getExtension?: (name: string) => { loseContext?: () => void } | null;
}

export interface WebGL2ProbeCanvas {
  getContext: (type: string) => WebGL2ProbeContext | null;
}

export interface WebGL2ProbeDocument {
  createElement: (tag: string) => WebGL2ProbeCanvas;
}

/**
 * three.js (r163+) renders exclusively through a WebGL 2 context, so a browser
 * that only exposes WebGL 1 (older GPUs, some VMs, software-rendering setups)
 * cannot run the 3D scene. We must probe specifically for `webgl2` — probing
 * for `webgl` would report a false positive and let the canvas mount, then
 * throw asynchronously and leave a blank/broken page.
 *
 * The throwaway probe context is released immediately so it never counts
 * against the browser's live-context budget.
 */
export function detectWebGL2Support(doc: WebGL2ProbeDocument): boolean {
  try {
    const canvas = doc.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension?.('WEBGL_lose_context')?.loseContext?.();
    return true;
  } catch {
    return false;
  }
}
