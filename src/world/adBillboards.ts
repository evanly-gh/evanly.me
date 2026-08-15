/**
 * Data model for the cyberpunk ad billboards. Each entry maps a sliced neon
 * reference texture (public/images/billboards/<image>.png, produced by
 * tools/slice-billboards.mjs) onto a 3D billboard prefab with a mount type,
 * aspect ratio, glow colour and world height. The <AdBillboard> component
 * renders these; the gallery catalog and (phase 2) the city consume the list.
 *
 * `aspect` = width / height of the source crop (from the slicer output). The
 * renderer prefers the loaded texture's true aspect, falling back to this for
 * pre-load layout, so the plane always matches the reference exactly.
 */

export type BillboardMount =
  | 'flat-wall' // panel flush on a wall: bezel + backing + brackets
  | 'holo-floating' // additive hologram hovering over an emitter disc + beam
  | 'hanging-blade' // vertical blade hung perpendicular off a storefront
  | 'freestanding-pillar'; // panel on a plinth/stand with side neon rails

export interface AdBillboardDef {
  id: string;
  /** basename under public/images/billboards/ (no extension). */
  image: string;
  /** width / height of the reference crop. */
  aspect: number;
  mount: BillboardMount;
  /** dominant neon colour, drives frame/halo/emitter glow. */
  glow: string;
  /** world height in metres; width = height * aspect. */
  heightM: number;
  title: string;
}

// Clean neon-on-black artwork only. The in-situ crops (which depicted a
// billboard already mounted in a scene) were dropped — mounting them read as a
// "billboard of a billboard". `mount` here only drives the ?gallery catalog
// grouping; the city assigns a mount per placement (adBillboardPlacement).
export const AD_BILLBOARDS: readonly AdBillboardDef[] = [
  // ---------------- flat-wall ----------------
  { id: 'aerix', image: 'aerix', aspect: 2.629, mount: 'flat-wall', glow: '#4fe0ff', heightM: 17, title: 'AERIX' },
  { id: 'ichiban-ramen', image: 'ichiban-ramen', aspect: 4.32, mount: 'flat-wall', glow: '#ffb648', heightM: 12, title: 'Ichiban Ramen' },
  { id: 'xenia', image: 'xenia', aspect: 4.058, mount: 'flat-wall', glow: '#6dff9e', heightM: 12, title: 'Xenia' },
  { id: 'waveform', image: 'waveform', aspect: 3.667, mount: 'flat-wall', glow: '#9b6bff', heightM: 12, title: 'Waveform' },
  { id: 'neo-eats', image: 'neo-eats', aspect: 2.598, mount: 'flat-wall', glow: '#ff4fa3', heightM: 16, title: 'Neo Eats' },
  { id: 'diamond', image: 'diamond', aspect: 0.981, mount: 'flat-wall', glow: '#ff5566', heightM: 24, title: 'Diamond District' },
  { id: 'live-beyond', image: 'live-beyond', aspect: 0.449, mount: 'flat-wall', glow: '#ff54d6', heightM: 40, title: 'Live Beyond Reality' },
  { id: 'cyber-brew', image: 'cyber-brew', aspect: 0.665, mount: 'flat-wall', glow: '#47b6ff', heightM: 34, title: 'Cyber Brew' },
  { id: 'neo-drive', image: 'neo-drive', aspect: 0.355, mount: 'flat-wall', glow: '#47b6ff', heightM: 42, title: 'Neo Drive' },
  { id: 'xr-7', image: 'xr-7', aspect: 0.345, mount: 'flat-wall', glow: '#ff4433', heightM: 42, title: 'XR-7 Underground' },
  { id: 'hana-yume', image: 'hana-yume', aspect: 0.705, mount: 'flat-wall', glow: '#ff5cc0', heightM: 36, title: 'Hana Yume' },
  { id: 'nightrun', image: 'nightrun', aspect: 0.705, mount: 'flat-wall', glow: '#ff4fa3', heightM: 36, title: 'Nightrun' },
  { id: 'neo-spark', image: 'neo-spark', aspect: 0.705, mount: 'flat-wall', glow: '#8dff5a', heightM: 36, title: 'Neo Spark' },
  { id: 'echo-wave', image: 'echo-wave', aspect: 0.788, mount: 'flat-wall', glow: '#c86bff', heightM: 34, title: 'Echo Wave' },

  // ---------------- holo-floating ----------------
  { id: 'techno-futures', image: 'techno-futures', aspect: 0.705, mount: 'holo-floating', glow: '#4fb6ff', heightM: 28, title: 'Techno Futures' },
  { id: 'vantage', image: 'vantage', aspect: 0.788, mount: 'holo-floating', glow: '#4fe0ff', heightM: 26, title: 'Vantage' },
  { id: 'synapse', image: 'synapse', aspect: 0.679, mount: 'holo-floating', glow: '#4fb6ff', heightM: 24, title: 'Synapse' },
  { id: 'beyond-beauty', image: 'beyond-beauty', aspect: 0.369, mount: 'holo-floating', glow: '#47c6ff', heightM: 30, title: 'Beyond Beauty' },
  { id: 'cyber-energy', image: 'cyber-energy', aspect: 0.346, mount: 'holo-floating', glow: '#d64bff', heightM: 30, title: 'Cyber Energy' },

  // ---------------- hanging-blade (off a storefront) ----------------
  { id: 'hotel-yoake', image: 'hotel-yoake', aspect: 0.442, mount: 'hanging-blade', glow: '#ff54d6', heightM: 20, title: 'Hotel Yoake' },
  { id: 'hana', image: 'hana', aspect: 0.679, mount: 'hanging-blade', glow: '#ff5cc0', heightM: 16, title: 'Hana' },
  { id: 'ramen-ya', image: 'ramen-ya', aspect: 1.126, mount: 'hanging-blade', glow: '#ff4455', heightM: 12, title: 'Ramen-Ya' },
  { id: 'ryujin-ramen', image: 'ryujin-ramen', aspect: 0.788, mount: 'hanging-blade', glow: '#ffb648', heightM: 20, title: 'Ryujin Ramen' },
  { id: 'neo-ramen', image: 'neo-ramen', aspect: 0.348, mount: 'hanging-blade', glow: '#ff54d6', heightM: 24, title: 'Neo Ramen' },

  // ---------------- freestanding-pillar ----------------
  { id: 'mirai', image: 'mirai', aspect: 0.342, mount: 'freestanding-pillar', glow: '#ff4a86', heightM: 30, title: 'Mirai' },
  { id: 'evocore', image: 'evocore', aspect: 0.353, mount: 'freestanding-pillar', glow: '#58ff86', heightM: 30, title: 'Evocore Biotech' },
  { id: 'explore-beyond', image: 'explore-beyond', aspect: 0.788, mount: 'freestanding-pillar', glow: '#5aa0ff', heightM: 26, title: 'Explore Beyond' },
  { id: 'cyberdream', image: 'cyberdream', aspect: 0.348, mount: 'freestanding-pillar', glow: '#ff54d6', heightM: 30, title: 'Cyberdream' },
  { id: 'escape', image: 'escape', aspect: 1.194, mount: 'freestanding-pillar', glow: '#d24bff', heightM: 18, title: 'Escape' },
];

/** width/height in metres for a def (uses manifest aspect for layout). */
export function billboardSize(def: AdBillboardDef): { w: number; h: number } {
  return { w: def.heightM * def.aspect, h: def.heightM };
}

export const AD_BILLBOARDS_BY_MOUNT: Record<BillboardMount, AdBillboardDef[]> = {
  'flat-wall': AD_BILLBOARDS.filter((b) => b.mount === 'flat-wall'),
  'holo-floating': AD_BILLBOARDS.filter((b) => b.mount === 'holo-floating'),
  'hanging-blade': AD_BILLBOARDS.filter((b) => b.mount === 'hanging-blade'),
  'freestanding-pillar': AD_BILLBOARDS.filter((b) => b.mount === 'freestanding-pillar'),
};
