import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error The reproducible asset processor is native JavaScript.
import { MOON_ASSETS, OUTPUT_DIR, publishMoonDirectory, validateMoonAssets } from '../tools/process-moon.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('NASA moon asset pipeline', () => {
  it('pins authoritative NASA SVS sources and bounded WebP outputs', () => {
    expect(MOON_ASSETS).toEqual([
      expect.objectContaining({
        id: 'albedo',
        url: 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_16bit_srgb_4k.tif',
        output: 'moon-albedo.webp',
        width: 4096,
        height: 2048,
      }),
      expect.objectContaining({
        id: 'height',
        url: 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_3_8bit.jpg',
        output: 'moon-height.webp',
        width: 1024,
        height: 512,
      }),
    ]);
    expect(OUTPUT_DIR).toBe(path.join(root, 'public', 'textures', 'moon'));
  });

  it('publishes valid attributed WebPs with matching checksums and budgets', async () => {
    const result = await validateMoonAssets();
    expect(result.assets).toHaveLength(2);
    for (const asset of result.assets) {
      expect(asset.format).toBe('webp');
      expect(asset.width).toBe(asset.expectedWidth);
      expect(asset.height).toBe(asset.expectedHeight);
      expect(asset.bytes).toBeGreaterThan(10_000);
      expect(asset.bytes).toBeLessThan(asset.maxBytes);
      expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(asset.sha256).toBe(asset.recordedSha256);
      expect(asset.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    }

    const metadata = JSON.parse(
      readFileSync(path.join(OUTPUT_DIR, 'metadata.json'), 'utf8'),
    );
    const readme = readFileSync(path.join(OUTPUT_DIR, 'README.md'), 'utf8');
    expect(metadata.credit).toMatch(/NASA Scientific Visualization Studio/i);
    expect(metadata.license).toMatch(/public domain/i);
    expect(metadata.optimizer.name).toBe('Sharp');
    for (const asset of MOON_ASSETS) {
      expect(readme).toContain(asset.url);
      expect(readme).toContain(asset.output);
      expect(readme).toContain('NASA');
      expect(readme).toContain('public domain');
    }
  });

  it('keeps a successful publish successful when backup cleanup fails', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'process-moon-publish-'));
    const outputDir = path.join(directory, 'moon');
    const stageDir = path.join(directory, 'stage');
    const warnings: string[] = [];
    mkdirSync(outputDir);
    mkdirSync(stageDir);
    writeFileSync(path.join(outputDir, 'old.txt'), 'old');
    writeFileSync(path.join(stageDir, 'new.txt'), 'new');

    try {
      expect(() => publishMoonDirectory(stageDir, outputDir, {
        removeBackup: () => { throw new Error('cleanup denied'); },
        logger: {
          log() {},
          warn(message: string) { warnings.push(message); },
          error() {},
        },
      })).not.toThrow();
      expect(readFileSync(path.join(outputDir, 'new.txt'), 'utf8')).toBe('new');
      expect(warnings.join('\n')).toMatch(/published successfully[\s\S]*cleanup denied/i);
      expect(readdirSync(directory).some((name) => name.startsWith('moon.backup-')))
        .toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects extra published moon files', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'process-moon-inventory-'));
    const outputDir = path.join(directory, 'moon');
    cpSync(OUTPUT_DIR, outputDir, { recursive: true });
    writeFileSync(path.join(outputDir, 'unexpected.webp'), 'unexpected');

    try {
      await expect(validateMoonAssets({ outputDir }))
        .rejects.toThrow(/inventory[\s\S]*unexpected\.webp/i);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects non-exact moon metadata asset records', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'process-moon-metadata-'));
    const outputDir = path.join(directory, 'moon');
    cpSync(OUTPUT_DIR, outputDir, { recursive: true });
    const metadataFile = path.join(outputDir, 'metadata.json');
    const metadata = JSON.parse(readFileSync(metadataFile, 'utf8'));
    metadata.assets.push({
      ...metadata.assets[0],
      id: 'stale',
      output: { ...metadata.assets[0].output, file: 'stale.webp' },
    });
    writeFileSync(metadataFile, `${JSON.stringify(metadata, null, 2)}\n`);

    try {
      await expect(validateMoonAssets({ outputDir }))
        .rejects.toThrow(/metadata inventory/i);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
