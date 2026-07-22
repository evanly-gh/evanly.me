import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { validateManifest } from '../src/viewer/manifest';
// @ts-expect-error The processor core is native JavaScript without TypeScript declarations.
import { JOBS, parseResolution, runProcessor, validatePublishedArtifacts } from '../tools/process-props-core.mjs';

const sample = JSON.parse(readFileSync(new URL('./fixtures/manifest.sample.json', import.meta.url), 'utf8'));

describe('validateManifest', () => {
  it('returns typed entries sorted by name', () => {
    const out = validateManifest(sample);
    expect(out.map(p => p.name)).toEqual(['BldgLG_C_Main', 'BldgSM_A_Main']);
    expect(out[0].bbox).toHaveLength(3);
    expect(out[0].category).toBe('LG');
    expect(typeof out[0].tris).toBe('number');
  });

  it('throws on malformed data', () => {
    expect(() => validateManifest([{ name: 'x' }])).toThrow();
    expect(() => validateManifest({})).toThrow();
  });
});

describe('prop processor registry', () => {
  it('exports exact names, input types, and source path suffixes', () => {
    expect(JOBS.map(({ name, type, input }: { name: string; type: string; input: string }) => ({
      name,
      type,
      suffix: input.replaceAll('\\', '/').split('/Cyber Assets/')[1],
    }))).toEqual([
      { name: 'ped_char', type: 'obj', suffix: 'Cyberpunk Game Kit - Quaternius-20260716T040550Z-1-001/Cyberpunk Game Kit - Quaternius/Character/Character.obj' },
      { name: 'robot_companion', type: 'obj', suffix: 'Cyber Robots/Companion-bot/Package/Companion-bot.obj' },
      { name: 'robot_recon', type: 'obj', suffix: 'Cyber Robots/ReconBot/Package/ReconBot.obj' },
      { name: 'robot_storage', type: 'obj', suffix: 'Cyber Robots/MobileStorageBot/Package/MobileStorageBot.obj' },
      { name: 'quat_ac', type: 'gltf', suffix: 'Cyberpunk Game Kit - Quaternius-20260716T040550Z-1-001/Cyberpunk Game Kit - Quaternius/Platforms/AC.gltf' },
      { name: 'quat_ac_stacked', type: 'gltf', suffix: 'Cyberpunk Game Kit - Quaternius-20260716T040550Z-1-001/Cyberpunk Game Kit - Quaternius/Platforms/AC_Stacked.gltf' },
      { name: 'quat_antenna_1', type: 'gltf', suffix: 'Cyberpunk Game Kit - Quaternius-20260716T040550Z-1-001/Cyberpunk Game Kit - Quaternius/Platforms/Antenna_1.gltf' },
      { name: 'quat_antenna_2', type: 'gltf', suffix: 'Cyberpunk Game Kit - Quaternius-20260716T040550Z-1-001/Cyberpunk Game Kit - Quaternius/Platforms/Antenna_2.gltf' },
      { name: 'quat_sign_1', type: 'gltf', suffix: 'Cyberpunk Game Kit - Quaternius-20260716T040550Z-1-001/Cyberpunk Game Kit - Quaternius/Platforms/Sign_1.gltf' },
      { name: 'quat_sign_3', type: 'gltf', suffix: 'Cyberpunk Game Kit - Quaternius-20260716T040550Z-1-001/Cyberpunk Game Kit - Quaternius/Platforms/Sign_3.gltf' },
    ]);
  });

  it('encodes source-independent texture and source-bound requirements', () => {
    for (const job of JOBS) {
      expect(job.expectedTextures).toBeTypeOf('number');
      expect(job.expectedTextures).toBeGreaterThanOrEqual(0);
      expect(job.sourceBbox).toHaveLength(3);
      expect(job.sourceBbox.every((value: number) =>
        Number.isFinite(value) && value > 0)).toBe(true);
    }
  });

  it('accepts a bounded integer resolution and rejects invalid values', () => {
    expect(parseResolution([])).toBe(512);
    expect(parseResolution(['--res=1024'])).toBe(1024);
    for (const value of ['0', '-1', '512px', '1.5', '4097', '', 'abc']) {
      expect(() => parseResolution([`--res=${value}`])).toThrow(/--res/);
    }
    expect(() => parseResolution(['--res=256', '--res=512'])).toThrow(/--res/);
  });

  it('aggregates failures and preserves the published directory', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'process-props-test-'));
    const outDir = path.join(root, 'props');
    const existingInput = path.join(root, 'broken.obj');
    const invalidInput = path.join(root, 'invalid.obj');
    mkdirSync(outDir);
    writeFileSync(existingInput, 'broken');
    writeFileSync(invalidInput, 'invalid');
    writeFileSync(path.join(outDir, 'manifest.json'), 'original manifest');

    try {
      await expect(runProcessor({
        jobs: [
          { name: 'missing', type: 'obj', input: path.join(root, 'missing.obj') },
          { name: 'broken', type: 'obj', input: existingInput },
          { name: 'invalid', type: 'obj', input: invalidInput },
        ],
        outDir,
        convertJob: async ({ name }: { name: string }) => {
          if (name === 'broken') throw new Error('conversion exploded');
          return Buffer.from('not a GLB');
        },
        validateArtifact: async () => { throw new Error('validation rejected output'); },
        logger: { log() {}, warn() {}, error() {} },
      })).rejects.toThrow(/missing[\s\S]*broken: conversion exploded[\s\S]*invalid: validation rejected output/);

      expect(readFileSync(path.join(outDir, 'manifest.json'), 'utf8')).toBe('original manifest');
      expect(existsSync(path.join(outDir, 'missing.glb'))).toBe(false);
      expect(existsSync(path.join(outDir, 'broken.glb'))).toBe(false);
      expect(existsSync(path.join(outDir, 'invalid.glb'))).toBe(false);
      expect(readdirSync(root).some(name => name.startsWith('.process-props-'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps a successful publish successful when backup cleanup fails', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'process-props-cleanup-test-'));
    const outDir = path.join(root, 'props');
    const input = path.join(root, 'valid.obj');
    const warnings: string[] = [];
    mkdirSync(outDir);
    writeFileSync(input, 'valid');
    writeFileSync(path.join(outDir, 'manifest.json'), 'old manifest');

    try {
      const result = await runProcessor({
        jobs: [{ name: 'valid', type: 'obj', input }],
        outDir,
        convertJob: async () => Buffer.alloc(3000),
        validateArtifact: async () => ({
          bytes: 3000,
          meshes: 1,
          primitives: 1,
          textures: 0,
        }),
        removeBackup: () => { throw new Error('cleanup denied'); },
        logger: {
          log() {},
          warn(message: string) { warnings.push(message); },
          error() {},
        },
      });

      expect(result.manifest).toEqual([
        { name: 'valid', file: 'props/valid.glb', kb: 3 },
      ]);
      expect(JSON.parse(readFileSync(path.join(outDir, 'manifest.json'), 'utf8')))
        .toEqual(result.manifest);
      expect(warnings.join('\n')).toMatch(/backup cleanup failed[\s\S]*cleanup denied/i);
      expect(readdirSync(root).some(name => name.startsWith('props.backup-'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('standalone validation rejects extra published GLBs', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'process-props-extra-test-'));
    const outDir = path.join(root, 'props');
    mkdirSync(outDir);
    writeFileSync(path.join(outDir, 'manifest.json'), '[]\n');
    writeFileSync(path.join(outDir, 'unexpected.glb'), 'unexpected');

    try {
      await expect(validatePublishedArtifacts({
        jobs: [],
        outDir,
        logger: { log() {}, warn() {}, error() {} },
      })).rejects.toThrow(/unexpected GLB/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('standalone validation rejects non-exact manifest contents', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'process-props-manifest-test-'));
    const outDir = path.join(root, 'props');
    mkdirSync(outDir);
    writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify([
      { name: 'stale', file: 'props/stale.glb', kb: 1 },
    ])}\n`);

    try {
      await expect(validatePublishedArtifacts({
        jobs: [],
        outDir,
        logger: { log() {}, warn() {}, error() {} },
      })).rejects.toThrow(/manifest/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('validates exact inventory, textures, and bounds without source files', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'process-props-clean-source-test-'));
    const outDir = path.join(root, 'props');
    const job = {
      name: 'clean',
      type: 'obj',
      input: path.join(root, 'missing-source.obj'),
      expectedTextures: 1,
      sourceBbox: [1, 2, 3],
    };
    const manifest = [{
      name: 'clean',
      file: 'props/clean.glb',
      kb: 3,
      expectedTextures: 1,
      sourceBbox: [1, 2, 3],
      bbox: [4, 5, 6],
    }];
    mkdirSync(outDir);
    writeFileSync(path.join(outDir, 'clean.glb'), Buffer.alloc(3000));
    writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest)}\n`);

    try {
      await expect(validatePublishedArtifacts({
        jobs: [job],
        outDir,
        validateArtifact: async (
          _file: string,
          { expectedTextures }: { expectedTextures: number },
        ) => {
          expect(expectedTextures).toBe(1);
          return {
            bytes: 3000,
            meshes: 1,
            primitives: 1,
            textures: 1,
            bbox: [4, 5, 6],
          };
        },
        logger: { log() {}, warn() {}, error() {} },
      })).resolves.toMatchObject({ totalBytes: 3000 });
      expect(existsSync(job.input)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
