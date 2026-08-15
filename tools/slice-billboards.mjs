// Slice the ChatGPT reference sheets into individual billboard PNG textures.
//
// The user dropped 5 composite reference sheets (1536x1024 each) into
// `<Downloads>/Cybercity Billboards`. Each sheet packs multiple neon billboards
// in a grid. This tool extracts each billboard into its own file under
// `public/images/billboards/<slug>.png` (long edge clamped to 1024) so they can
// be texture-mapped onto the 3D ad-billboard prefabs.
//
// Boxes are [left, top, width, height] in source pixels. Re-run after tweaking.
//   node tools/slice-billboards.mjs
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SRC = 'C:/Users/eliotli2/Downloads/Cybercity Billboards';
const OUT = fileURLToPath(new URL('../public/images/billboards/', import.meta.url));

const S47 = 'ChatGPT Image Aug 7, 2026, 11_40_47 PM.png'; // in-situ mount refs
const S50 = 'ChatGPT Image Aug 7, 2026, 11_40_50 PM.png'; // clean grid
const S52 = 'ChatGPT Image Aug 7, 2026, 11_40_52 PM.png'; // clean vertical x4
const S55 = 'ChatGPT Image Aug 7, 2026, 11_40_55 PM.png'; // clean vertical x4
const S57 = 'ChatGPT Image Aug 7, 2026, 11_40_57 PM.png'; // 2x2 pairs
const S08 = 'ChatGPT Image Aug 8, 2026, 11_04_34 PM.png'; // clean 4x2 grid (batch 2)

/** slug -> { sheet, box:[left,top,width,height] } */
const CROPS = {
  // --- Sheet 50: clean grid (neon on black) ---
  'live-beyond':      { sheet: S50, box: [14, 26, 308, 686] },
  'aerix':            { sheet: S50, box: [344, 30, 836, 318] },
  'diamond':          { sheet: S50, box: [1204, 28, 318, 324] },
  'ichiban-ramen':    { sheet: S50, box: [344, 372, 838, 194] },
  'cyber-brew':       { sheet: S50, box: [1244, 374, 278, 418] },
  'xenia':            { sheet: S50, box: [344, 586, 836, 206] },
  'escape':           { sheet: S50, box: [14, 754, 308, 258] },
  'waveform':         { sheet: S50, box: [344, 830, 660, 180] },
  'neo-eats':         { sheet: S50, box: [1044, 826, 478, 184] },

  // --- Sheet 52: clean vertical panels ---
  'cyberdream':       { sheet: S52, box: [18, 28, 338, 970] },
  'neo-ramen':        { sheet: S52, box: [388, 28, 338, 970] },
  'xr-7':             { sheet: S52, box: [790, 28, 335, 970] },
  'evocore':          { sheet: S52, box: [1178, 28, 342, 970] },

  // --- Sheet 55: clean vertical panels ---
  'mirai':            { sheet: S55, box: [20, 30, 330, 965] },
  'neo-drive':        { sheet: S55, box: [362, 35, 340, 958] },
  'cyber-energy':     { sheet: S55, box: [786, 38, 330, 955] },
  'beyond-beauty':    { sheet: S55, box: [1168, 38, 352, 955] },

  // --- Sheet 57: 2x2 pairs (only the ones unique to this sheet) ---
  'ramen-ya':         { sheet: S57, box: [28, 558, 448, 398] },
  'hotel-yoake':      { sheet: S57, box: [505, 545, 190, 430] },
  'synapse':          { sheet: S57, box: [828, 545, 300, 442] },
  'hana':             { sheet: S57, box: [1178, 545, 300, 442] },

  // --- Sheet 08 (batch 2): clean 4x2 grid on black ---
  'hana-yume':        { sheet: S08, box: [8, 8, 372, 528] },
  'techno-futures':   { sheet: S08, box: [392, 8, 372, 528] },
  'nightrun':         { sheet: S08, box: [776, 8, 372, 528] },
  'neo-spark':        { sheet: S08, box: [1160, 8, 372, 528] },
  'echo-wave':        { sheet: S08, box: [8, 544, 372, 472] },
  'ryujin-ramen':     { sheet: S08, box: [392, 544, 372, 472] },
  'vantage':          { sheet: S08, box: [776, 544, 372, 472] },
  'explore-beyond':   { sheet: S08, box: [1160, 544, 372, 472] },

  // --- Sheet 47: in-situ (carry a bit of scene; best for holo/pillar/hanging) ---
  'yoru-sakura':      { sheet: S47, box: [40, 45, 258, 460] },
  'inner-balance':    { sheet: S47, box: [410, 40, 295, 470] },
  'kiroshi':          { sheet: S47, box: [800, 118, 392, 280] },
  'eva-series':       { sheet: S47, box: [1232, 18, 292, 508] },
  'welcome-new-world':{ sheet: S47, box: [28, 558, 388, 348] },
  'golden-ramen':     { sheet: S47, box: [472, 542, 245, 468] },
  'dawn-protocol':    { sheet: S47, box: [782, 542, 350, 468] },
  'neon-dream':       { sheet: S47, box: [1182, 542, 342, 468] },
};

const MAX_EDGE = 1024;

await mkdir(OUT, { recursive: true });

const results = [];
for (const [slug, { sheet, box }] of Object.entries(CROPS)) {
  const [left, top, width, height] = box;
  const outPath = path.join(OUT, `${slug}.png`);
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const outW = Math.round(width * scale);
  const outH = Math.round(height * scale);
  await sharp(path.join(SRC, sheet))
    .extract({ left, top, width, height })
    .resize(outW, outH)
    .png()
    .toFile(outPath);
  results.push({ slug, w: outW, h: outH, aspect: +(outW / outH).toFixed(3) });
}

results.sort((a, b) => a.slug.localeCompare(b.slug));
for (const r of results) {
  console.log(`${r.slug.padEnd(20)} ${String(r.w).padStart(4)}x${String(r.h).padStart(4)}  aspect ${r.aspect}`);
}
console.log(`\n${results.length} billboards -> ${OUT}`);

// Contact sheet for quick visual QA of crop boundaries.
const COLS = 6;
const CELL = 240;
const rows = Math.ceil(results.length / COLS);
const thumbs = await Promise.all(
  Object.entries(CROPS).map(async ([slug]) => {
    const buf = await sharp(path.join(OUT, `${slug}.png`))
      .resize(CELL - 8, CELL - 8, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
      .png()
      .toBuffer();
    return { slug, buf };
  }),
);
const composites = thumbs.map((t, i) => ({
  input: t.buf,
  left: (i % COLS) * CELL + 4,
  top: Math.floor(i / COLS) * CELL + 4,
}));
await sharp({
  create: { width: COLS * CELL, height: rows * CELL, channels: 3, background: { r: 6, g: 7, b: 18 } },
})
  .composite(composites)
  .png()
  .toFile(path.join(OUT, '_contact-sheet.png'));
console.log('contact sheet -> _contact-sheet.png');
