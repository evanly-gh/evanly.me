/**
 * Download, optimize, attribute, and validate NASA SVS CGI Moon Kit textures.
 *
 * Usage:
 *   node tools/process-moon.mjs
 *   node tools/process-moon.mjs --validate
 *   node tools/process-moon.mjs --force-download
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUTPUT_DIR = path.join(ROOT, 'public', 'textures', 'moon');
export const SOURCE_CACHE_DIR = path.join(os.tmpdir(), 'evanly-moon-sources');

export const MOON_ASSETS = [
  {
    id: 'albedo',
    url: 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_16bit_srgb_4k.tif',
    sourceFile: 'lroc_color_16bit_srgb_4k.tif',
    output: 'moon-albedo.webp',
    width: 4096,
    height: 2048,
    maxBytes: 4 * 1024 * 1024,
    webp: { quality: 82, effort: 6, smartSubsample: true },
  },
  {
    id: 'height',
    url: 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_3_8bit.jpg',
    sourceFile: 'ldem_3_8bit.jpg',
    output: 'moon-height.webp',
    width: 1024,
    height: 512,
    maxBytes: 512 * 1024,
    webp: { quality: 90, effort: 6, smartSubsample: true },
  },
];

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function download(url, destination) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'evanly.me reproducible moon asset processor' },
  });
  if (!response.ok || !response.body) {
    throw new Error(`NASA source download failed (${response.status} ${response.statusText}): ${url}`);
  }
  const temporary = `${destination}.download-${process.pid}`;
  try {
    await pipeline(
      Readable.fromWeb(response.body),
      fs.createWriteStream(temporary),
    );
    fs.renameSync(temporary, destination);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }
}

async function sourceIsDecodable(file) {
  try {
    const metadata = await sharp(file, { limitInputPixels: false }).metadata();
    return Boolean(metadata.width && metadata.height && metadata.format);
  } catch {
    return false;
  }
}

async function ensureSource(asset, forceDownload, logger) {
  fs.mkdirSync(SOURCE_CACHE_DIR, { recursive: true });
  const file = path.join(SOURCE_CACHE_DIR, asset.sourceFile);
  if (forceDownload || !fs.existsSync(file) || !(await sourceIsDecodable(file))) {
    fs.rmSync(file, { force: true });
    logger.log(`Downloading ${asset.id}: ${asset.url}`);
    await download(asset.url, file);
  } else {
    logger.log(`Using cached ${asset.id}: ${file}`);
  }
  if (!(await sourceIsDecodable(file))) {
    throw new Error(`Downloaded NASA ${asset.id} source cannot be decoded by Sharp: ${file}`);
  }
  return file;
}

function metadataDocument(records) {
  return {
    schemaVersion: 1,
    credit: 'NASA Scientific Visualization Studio (SVS), CGI Moon Kit',
    license: 'NASA imagery and data are public domain; NASA endorsement is not implied.',
    sourcePage: 'https://svs.gsfc.nasa.gov/4720/',
    optimizer: {
      name: 'Sharp',
      version: sharp.versions.sharp,
      outputFormat: 'WebP',
    },
    assets: records,
  };
}

function attributionReadme(metadata) {
  const rows = metadata.assets.map((asset) => [
    `### ${asset.id}`,
    `- Source: ${asset.source.url}`,
    `- Source SHA-256: \`${asset.source.sha256}\``,
    `- Output: \`${asset.output.file}\` (${asset.output.width}×${asset.output.height}, ${asset.output.bytes} bytes)`,
    `- Output SHA-256: \`${asset.output.sha256}\``,
    `- Sharp WebP options: \`${JSON.stringify(asset.optimization.webp)}\``,
  ].join('\n')).join('\n\n');
  return `# Moon texture attribution

These browser-ready WebP textures were generated reproducibly from the
**NASA Scientific Visualization Studio (SVS) CGI Moon Kit**.

NASA imagery and data are public domain. Credit: NASA SVS. This project does
not imply NASA endorsement.

Source page: ${metadata.sourcePage}

${rows}
`;
}

export function publishMoonDirectory(
  stageDir,
  outputDir,
  {
    logger = console,
    removeBackup = (backupDir) => fs.rmSync(
      backupDir,
      { recursive: true, force: true },
    ),
  } = {},
) {
  const backupDir = `${outputDir}.backup-${process.pid}-${Date.now()}`;
  let movedExisting = false;
  try {
    if (fs.existsSync(outputDir)) {
      fs.renameSync(outputDir, backupDir);
      movedExisting = true;
    }
    fs.renameSync(stageDir, outputDir);
  } catch (error) {
    if (!fs.existsSync(outputDir) && movedExisting && fs.existsSync(backupDir)) {
      fs.renameSync(backupDir, outputDir);
    }
    throw error;
  }

  if (movedExisting) {
    try {
      removeBackup(backupDir);
    } catch (error) {
      logger.warn(
        `Published successfully, but backup cleanup failed; retained ${backupDir}: `
        + `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export async function processMoonAssets({
  forceDownload = false,
  logger = console,
} = {}) {
  const parentDir = path.dirname(OUTPUT_DIR);
  fs.mkdirSync(parentDir, { recursive: true });
  const stageDir = fs.mkdtempSync(path.join(parentDir, '.process-moon-'));
  const records = [];
  try {
    for (const asset of MOON_ASSETS) {
      const sourceFile = await ensureSource(asset, forceDownload, logger);
      const sourceBuffer = fs.readFileSync(sourceFile);
      const sourceMetadata = await sharp(sourceBuffer, {
        limitInputPixels: false,
      }).metadata();
      const outputFile = path.join(stageDir, asset.output);
      let image = sharp(sourceBuffer, { limitInputPixels: false })
        .resize({
          width: asset.width,
          height: asset.height,
          fit: 'fill',
          kernel: sharp.kernel.lanczos3,
        });
      if (asset.id === 'height') image = image.grayscale();
      await image.webp(asset.webp).toFile(outputFile);
      const outputBuffer = fs.readFileSync(outputFile);
      const outputMetadata = await sharp(outputBuffer).metadata();
      if (
        outputMetadata.format !== 'webp'
        || outputMetadata.width !== asset.width
        || outputMetadata.height !== asset.height
      ) {
        throw new Error(
          `${asset.output} validation failed: `
          + `${outputMetadata.format} ${outputMetadata.width}x${outputMetadata.height}`,
        );
      }
      if (outputBuffer.length >= asset.maxBytes) {
        throw new Error(`${asset.output} is ${outputBuffer.length} bytes; budget is under ${asset.maxBytes}`);
      }
      records.push({
        id: asset.id,
        credit: 'NASA SVS',
        source: {
          url: asset.url,
          file: asset.sourceFile,
          format: sourceMetadata.format,
          width: sourceMetadata.width,
          height: sourceMetadata.height,
          bytes: sourceBuffer.length,
          sha256: sha256(sourceBuffer),
        },
        optimization: {
          resize: {
            width: asset.width,
            height: asset.height,
            fit: 'fill',
            kernel: 'lanczos3',
          },
          grayscale: asset.id === 'height',
          webp: asset.webp,
        },
        output: {
          file: asset.output,
          format: outputMetadata.format,
          width: outputMetadata.width,
          height: outputMetadata.height,
          bytes: outputBuffer.length,
          sha256: sha256(outputBuffer),
        },
      });
      logger.log(
        `Optimized ${asset.id}: ${sourceMetadata.width}x${sourceMetadata.height} `
        + `(${sourceBuffer.length} bytes) → ${asset.width}x${asset.height} `
        + `(${outputBuffer.length} bytes)`,
      );
    }
    const metadata = metadataDocument(records);
    fs.writeFileSync(
      path.join(stageDir, 'metadata.json'),
      `${JSON.stringify(metadata, null, 2)}\n`,
    );
    fs.writeFileSync(path.join(stageDir, 'README.md'), attributionReadme(metadata));
    publishMoonDirectory(stageDir, OUTPUT_DIR, { logger });
    const validation = await validateMoonAssets({ logger });
    logger.log(`Published ${validation.assets.length} NASA moon textures → ${OUTPUT_DIR}`);
    return validation;
  } finally {
    if (fs.existsSync(stageDir)) fs.rmSync(stageDir, { recursive: true, force: true });
  }
}

export async function validateMoonAssets({
  logger = console,
  outputDir = OUTPUT_DIR,
} = {}) {
  const expectedInventory = [
    ...MOON_ASSETS.map(({ output }) => output),
    'README.md',
    'metadata.json',
  ].sort();
  const actualInventory = fs.readdirSync(outputDir).sort();
  const missing = expectedInventory.filter((file) => !actualInventory.includes(file));
  const unexpected = actualInventory.filter((file) => !expectedInventory.includes(file));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error([
      'Moon output inventory mismatch.',
      missing.length > 0 ? `Missing: ${missing.join(', ')}` : '',
      unexpected.length > 0 ? `Unexpected: ${unexpected.join(', ')}` : '',
    ].filter(Boolean).join(' '));
  }

  const metadataFile = path.join(outputDir, 'metadata.json');
  const readmeFile = path.join(outputDir, 'README.md');
  if (!fs.existsSync(metadataFile) || !fs.existsSync(readmeFile)) {
    throw new Error(`Moon attribution files are missing from ${outputDir}`);
  }
  const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
  const readme = fs.readFileSync(readmeFile, 'utf8');
  if (!/NASA Scientific Visualization Studio/i.test(metadata.credit ?? '')) {
    throw new Error('Moon metadata is missing NASA SVS credit');
  }
  if (!/public domain/i.test(metadata.license ?? '')) {
    throw new Error('Moon metadata is missing the public-domain note');
  }
  if (
    metadata.schemaVersion !== 1
    || metadata.optimizer?.name !== 'Sharp'
    || metadata.optimizer?.outputFormat !== 'WebP'
  ) {
    throw new Error('Moon metadata optimizer contract is invalid');
  }
  const metadataIds = (metadata.assets ?? []).map(({ id }) => id).sort();
  const expectedIds = MOON_ASSETS.map(({ id }) => id).sort();
  if (JSON.stringify(metadataIds) !== JSON.stringify(expectedIds)) {
    throw new Error(
      `Moon metadata inventory mismatch: expected ${expectedIds.join(', ')}, `
      + `received ${metadataIds.join(', ')}`,
    );
  }
  const assets = [];
  for (const expected of MOON_ASSETS) {
    const record = metadata.assets?.find(({ id }) => id === expected.id);
    if (
      !record
      || record.source?.url !== expected.url
      || record.source?.file !== expected.sourceFile
      || record.output?.file !== expected.output
      || record.output?.format !== 'webp'
      || record.output?.width !== expected.width
      || record.output?.height !== expected.height
    ) {
      throw new Error(`Moon metadata source mismatch for ${expected.id}`);
    }
    if (!readme.includes(expected.url) || !readme.includes(expected.output)) {
      throw new Error(`Moon README attribution is incomplete for ${expected.id}`);
    }
    const file = path.join(outputDir, expected.output);
    const buffer = fs.readFileSync(file);
    if (
      buffer.subarray(0, 4).toString('ascii') !== 'RIFF'
      || buffer.subarray(8, 12).toString('ascii') !== 'WEBP'
    ) {
      throw new Error(`${expected.output} does not have a WebP container signature`);
    }
    const image = await sharp(buffer).metadata();
    if (
      image.format !== 'webp'
      || image.width !== expected.width
      || image.height !== expected.height
    ) {
      throw new Error(
        `${expected.output} is ${image.format} ${image.width}x${image.height}; `
        + `expected webp ${expected.width}x${expected.height}`,
      );
    }
    if (buffer.length <= 10_000 || buffer.length >= expected.maxBytes) {
      throw new Error(
        `${expected.output} is ${buffer.length} bytes; expected 10000..${expected.maxBytes - 1}`,
      );
    }
    const digest = sha256(buffer);
    if (digest !== record.output?.sha256) {
      throw new Error(`${expected.output} checksum does not match metadata`);
    }
    if (record.output.bytes !== buffer.length) {
      throw new Error(`${expected.output} byte count does not match metadata`);
    }
    if (!/^[a-f0-9]{64}$/.test(record.source?.sha256 ?? '')) {
      throw new Error(`${expected.id} source checksum is missing or malformed`);
    }
    assets.push({
      id: expected.id,
      file,
      format: image.format,
      width: image.width,
      height: image.height,
      expectedWidth: expected.width,
      expectedHeight: expected.height,
      bytes: buffer.length,
      maxBytes: expected.maxBytes,
      sha256: digest,
      recordedSha256: record.output.sha256,
      sourceSha256: record.source.sha256,
    });
    logger.log(`${expected.output}: ${image.width}x${image.height}, ${buffer.length} bytes, ${digest}`);
  }
  return { metadata, assets };
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = process.argv.slice(2);
    const unknown = args.filter((arg) =>
      arg !== '--validate' && arg !== '--force-download');
    if (unknown.length > 0) throw new Error(`Unknown option(s): ${unknown.join(', ')}`);
    if (args.includes('--validate') && args.includes('--force-download')) {
      throw new Error('--validate cannot be combined with --force-download');
    }
    if (args.includes('--validate')) await validateMoonAssets();
    else await processMoonAssets({ forceDownload: args.includes('--force-download') });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
