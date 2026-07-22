import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Task 6 CDP runner is native JavaScript.
import { normalizeCdpEvidence, publishEvidenceTransaction } from '../.superpowers/sdd/task-6-cdp-runner.mjs';
// @ts-expect-error Task 6 browser contract is native JavaScript.
import { TASK6_REQUIRED_RESOURCES, TASK6_SCREENSHOT_FILES, assertTask6MountedEvidence } from '../.superpowers/sdd/task-6-browser-contract.mjs';

const runnerSource = readFileSync(
  new URL('../.superpowers/sdd/task-6-cdp-runner.mjs', import.meta.url),
  'utf8',
);
const auditSource = readFileSync(
  new URL('../.superpowers/sdd/task-6-audit.mjs', import.meta.url),
  'utf8',
);

const base = {
  capturedAt: '2026-07-22T02:00:00.000Z',
  url: 'http://127.0.0.1:5173/?city&inspect&task4=1&task5=1',
  browser: { product: 'Chrome/140', userAgent: 'HeadlessChrome/140' },
  canvas: { width: 1440, height: 900 },
  consoleErrors: [],
  runtimeErrors: [],
  pageErrors: [],
  networkFailures: [],
  resources: TASK6_REQUIRED_RESOURCES.map((url: string) => ({
    url,
    status: 200,
    loaded: true,
  })),
  task4: { passed: true, snapshot: { ready: true } },
  task5: {
    topologyPassed: true,
    framebufferPassed: true,
    targetIds: ['a', 'b', 'c', 'd'],
    topologyFrames: 96,
    pixelFrames: 12,
    signDrawObjectCount: 16,
  },
  frameTiming: { warmupFrames: 60, samples: 300, p95Ms: 16.8 },
  presets: Object.keys(TASK6_SCREENSHOT_FILES),
  screenshots: Object.values(TASK6_SCREENSHOT_FILES),
};

describe('Task 6 CDP evidence normalization', () => {
  it('measures timing at the same representative 640x400 viewport', () => {
    expect(runnerSource).toContain('const VISUAL_VIEWPORT = { width: 640, height: 400 }');
    expect(runnerSource).not.toContain('ANALYSIS_VIEWPORT');
    expect(runnerSource).not.toContain('width: 160, height: 100');
  });

  it('revalidates evidence against current source and build digests', () => {
    expect(auditSource).toContain("import assert from 'node:assert/strict'");
    expect(auditSource).toContain('evidence.sourceDigest');
    expect(auditSource).toContain('evidence.buildDigest');
    expect(auditSource).toContain("digestPaths(['src', 'public'");
    expect(auditSource).toContain("digestPaths(['dist'])");
  });

  it('normalizes successful CDP evidence into the shared mounted contract', () => {
    const evidence = normalizeCdpEvidence(base);
    expect(evidence.version).toBe(1);
    expect(evidence.transport).toBe('chrome-cdp-websocket');
    expect(evidence.failedResources).toEqual([]);
    expect(evidence.loadedResources).toHaveLength(TASK6_REQUIRED_RESOURCES.length);
  });

  it('deduplicates diagnostics and reports missing or failed required resources', () => {
    const evidence = normalizeCdpEvidence({
      ...base,
      consoleErrors: ['boom', 'boom'],
      resources: [
        ...base.resources.slice(1, -1),
        { url: TASK6_REQUIRED_RESOURCES.at(-1), status: 404, loaded: false },
      ],
    });

    expect(evidence.consoleErrors).toEqual(['boom']);
    expect(evidence.failedResources).toContain(
      `${TASK6_REQUIRED_RESOURCES[0]} (not observed)`,
    );
    expect(evidence.failedResources).toContain(
      `${TASK6_REQUIRED_RESOURCES.at(-1)} (404)`,
    );
    expect(() => assertTask6MountedEvidence(evidence)).toThrow();
  });

  it('restores prior screenshots and evidence after an injected publication failure', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'task6-publish-test-'));
    const destinationDirectory = path.join(root, 'published');
    const stagingDirectory = path.join(root, 'staging');
    await mkdir(destinationDirectory);
    await mkdir(stagingDirectory);
    const screenshotFilenames = ['task-6-a.png', 'task-6-b.png'];
    await Promise.all(screenshotFilenames.map(async (filename) => {
      await writeFile(path.join(destinationDirectory, filename), `old-${filename}`);
      await writeFile(path.join(stagingDirectory, filename), `new-${filename}`);
    }));
    await writeFile(
      path.join(destinationDirectory, 'task-6-browser-evidence.json'),
      'old-evidence',
    );
    await writeFile(
      path.join(stagingDirectory, 'task-6-browser-evidence.json'),
      'new-evidence',
    );

    await expect(publishEvidenceTransaction({
      stagingDirectory,
      destinationDirectory,
      screenshotFilenames,
      evidenceFilename: 'task-6-browser-evidence.json',
      failAfterPromotions: 1,
    })).rejects.toThrow(/injected/i);

    for (const filename of screenshotFilenames) {
      expect(await readFile(path.join(destinationDirectory, filename), 'utf8'))
        .toBe(`old-${filename}`);
    }
    expect(await readFile(
      path.join(destinationDirectory, 'task-6-browser-evidence.json'),
      'utf8',
    )).toBe('old-evidence');
    await rm(root, { recursive: true, force: true });
  });
});
