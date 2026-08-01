/// <reference lib="webworker" />
//
// Off-main-thread city layout generation. `buildVisibilityLayouts` runs the
// heavy deterministic pipeline — buildCityLayout (~1s) + props/skyline/furniture/
// crowd/dressing/signs (~1.5s) + the frustum-culling broad phase — which used to
// freeze the main thread at mount and again on the first idle callbacks. Running
// it here keeps the canvas interactive while the full/culled layout is computed;
// the main thread swaps the result in when it arrives (see City.tsx).
//
// The result is structured-cloned back to the main thread. Everything in
// VisibilityLayouts is plain data except the furniture Vector3 fields, which the
// caller rehydrates via reviveWorkerVisibilityLayouts.
import {
  buildVisibilityLayouts,
  type VisibilityLayouts,
} from './visibilityProfile';
import type { TypedAntiVoidMetric } from './antiVoidCoverage';

export interface LayoutWorkerRequest {
  requestId: number;
  viewport: { width: number; height: number };
}

export interface LayoutWorkerResponse {
  requestId: number;
  layouts: VisibilityLayouts;
}

/**
 * `audit.antiVoid` is a lazy getter. structured-clone (postMessage) walks every
 * enumerable property, which would force that getter to evaluate during
 * serialization — and the anti-void metric (a dev-only inspection stat) can throw
 * when the static canyon-filler probe ids drift from the camera keys. Resolve it
 * defensively here, off the main thread, so a throw degrades to an empty metric
 * instead of losing the whole layout, and replace the getter with the plain result
 * so the posted payload contains no getters at all.
 */
function toSerializablePayload(
  layouts: VisibilityLayouts,
): VisibilityLayouts {
  let antiVoid: TypedAntiVoidMetric[] = [];
  try {
    antiVoid = layouts.audit.antiVoid;
  } catch {
    antiVoid = [];
  }
  const audit = layouts.audit;
  return {
    ...layouts,
    audit: {
      removed: audit.removed,
      retained: audit.retained,
      antiVoid,
      canyonFillers: audit.canyonFillers,
      visibilityBroadPhase: audit.visibilityBroadPhase,
      visibilityCache: audit.visibilityCache,
    },
  };
}

self.addEventListener('message', (event: MessageEvent<LayoutWorkerRequest>) => {
  const { requestId, viewport } = event.data;
  const layouts = toSerializablePayload(buildVisibilityLayouts(viewport));
  (self as DedicatedWorkerGlobalScope).postMessage({
    requestId,
    layouts,
  } satisfies LayoutWorkerResponse);
});
