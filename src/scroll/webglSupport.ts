export interface WebGL2ProbeContext {
  getExtension?: (name: string) => Record<string, number> | { loseContext?: () => void } | null;
  getParameter?: (pname: number) => unknown;
}

export interface WebGL2ProbeCanvas {
  getContext: (type: string) => WebGL2ProbeContext | null;
}

export interface WebGL2ProbeDocument {
  createElement: (tag: string) => WebGL2ProbeCanvas;
}

// Software rasterizers expose a fully-conformant WebGL2 context but run the whole
// pipeline on the CPU — a heavy real-time-lit scene like this crawls at ~1fps on
// them. Detect the well-known ones by their UNMASKED_RENDERER string so we can
// serve the fast non-3D fallback instead. (Users usually land here because browser
// hardware acceleration is OFF or the GPU driver is blocklisted — not because the
// machine truly has no GPU.)
const SOFTWARE_RENDERER = /(microsoft basic render|swiftshader|llvmpipe|softpipe|\bsoftware\b|basic render driver)/i;

export function isSoftwareRenderer(gl: WebGL2ProbeContext): boolean {
  try {
    const dbg = gl.getExtension?.('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL?: number } | null;
    const name = dbg?.UNMASKED_RENDERER_WEBGL != null
      ? String(gl.getParameter?.(dbg.UNMASKED_RENDERER_WEBGL) ?? '')
      : '';
    return SOFTWARE_RENDERER.test(name);
  } catch {
    return false;
  }
}

/**
 * three.js (r163+) renders exclusively through a WebGL 2 context, so a browser
 * that only exposes WebGL 1 (older GPUs, some VMs) cannot run the 3D scene. We
 * probe specifically for `webgl2` — probing for `webgl` would report a false
 * positive and let the canvas mount, then throw asynchronously.
 *
 * We ALSO reject software rasterizers (Microsoft Basic Render Driver / SwiftShader
 * / llvmpipe): they satisfy the WebGL2 probe but render on the CPU at ~1fps, so the
 * 2D fallback is a far better experience there.
 *
 * The throwaway probe context is released immediately so it never counts against
 * the browser's live-context budget.
 */
export function detectWebGL2Support(doc: WebGL2ProbeDocument): boolean {
  try {
    const canvas = doc.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    const software = isSoftwareRenderer(gl);
    (gl.getExtension?.('WEBGL_lose_context') as { loseContext?: () => void } | null)?.loseContext?.();
    return !software;
  } catch {
    return false;
  }
}
