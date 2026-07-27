/**
 * Reproducibly optimize the provided anonymous About portrait placeholder.
 *
 * Usage:
 *   node tools/process-about-portrait.mjs
 *   node tools/process-about-portrait.mjs --validate
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPOSITORY_SOURCE = path.join(
  ROOT,
  'assets',
  'source',
  'about-portrait-placeholder.png',
);
const REPOSITORY_SOURCE_LABEL = 'assets/source/about-portrait-placeholder.png';
export function resolveAboutPortraitSource(env = process.env) {
  return env.ABOUT_PORTRAIT_SOURCE
    ? path.resolve(env.ABOUT_PORTRAIT_SOURCE)
    : REPOSITORY_SOURCE;
}

export const OUTPUT_DIR = path.join(ROOT, 'public', 'images', 'about');
export const ABOUT_PORTRAIT_ASSET = {
  id: 'about-portrait-placeholder',
  sourcePath: resolveAboutPortraitSource(),
  sourceFile: 'about-portrait-placeholder.png',
  sourceWidth: 1024,
  sourceHeight: 1536,
  sourceSha256: '1fcd875b5ec21d7e20525650a6f9cb05cbf2e9fc0810163b291d55d3d63ecf27',
  output: 'about-portrait-placeholder.webp',
  width: 1024,
  height: 1536,
  maxBytes: 800_000,
  anonymousPlaceholder: true,
  webp: {
    quality: 88,
    effort: 6,
    smartSubsample: true,
  },
};

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function metadataDocument(sourceBuffer, outputBuffer, outputMetadata) {
  return {
    schemaVersion: 1,
    provenance: 'Provided generated portrait source supplied with Scroll Task 2.',
    subject: 'Anonymous placeholder portrait',
    realPerson: false,
    replacementNote: 'This is not Evan’s real portrait and may be replaced through RESUME.about.faceImage.src.',
    optimizer: {
      name: 'Sharp',
      version: sharp.versions.sharp,
      outputFormat: 'WebP',
    },
    source: {
      suppliedPath: REPOSITORY_SOURCE_LABEL,
      file: ABOUT_PORTRAIT_ASSET.sourceFile,
      format: 'png',
      width: ABOUT_PORTRAIT_ASSET.sourceWidth,
      height: ABOUT_PORTRAIT_ASSET.sourceHeight,
      bytes: sourceBuffer.length,
      sha256: sha256(sourceBuffer),
    },
    optimization: {
      resize: {
        width: ABOUT_PORTRAIT_ASSET.width,
        height: ABOUT_PORTRAIT_ASSET.height,
        fit: 'fill',
        kernel: 'lanczos3',
      },
      webp: ABOUT_PORTRAIT_ASSET.webp,
    },
    output: {
      file: ABOUT_PORTRAIT_ASSET.output,
      format: outputMetadata.format,
      width: outputMetadata.width,
      height: outputMetadata.height,
      bytes: outputBuffer.length,
      sha256: sha256(outputBuffer),
    },
  };
}

function provenanceReadme(metadata) {
  return `# About portrait placeholder

This browser-ready WebP was generated from the provided Scroll Task 2 source
\`${ABOUT_PORTRAIT_ASSET.sourceFile}\`.

- Subject: anonymous placeholder
- Identity: not Evan's real photo or portrait
- Source SHA-256: \`${metadata.source.sha256}\`
- Source dimensions: ${metadata.source.width}×${metadata.source.height}
- Output: \`${metadata.output.file}\` (${metadata.output.width}×${metadata.output.height}, ${metadata.output.bytes} bytes)
- Output SHA-256: \`${metadata.output.sha256}\`
- Optimizer: Sharp ${metadata.optimizer.version}, WebP \`${JSON.stringify(metadata.optimization.webp)}\`

Replace the image later by changing \`RESUME.about.faceImage.src\`; the sign
layout and texture dimensions do not need to change.
`;
}

export async function processAboutPortrait({ logger = console } = {}) {
  if (!fs.existsSync(ABOUT_PORTRAIT_ASSET.sourcePath)) {
    throw new Error(`Provided About portrait source is missing: ${ABOUT_PORTRAIT_ASSET.sourcePath}`);
  }
  const sourceBuffer = fs.readFileSync(ABOUT_PORTRAIT_ASSET.sourcePath);
  const sourceMetadata = await sharp(sourceBuffer).metadata();
  if (
    sourceMetadata.format !== 'png'
    || sourceMetadata.width !== ABOUT_PORTRAIT_ASSET.sourceWidth
    || sourceMetadata.height !== ABOUT_PORTRAIT_ASSET.sourceHeight
    || sha256(sourceBuffer) !== ABOUT_PORTRAIT_ASSET.sourceSha256
  ) {
    throw new Error('Provided About portrait source dimensions or checksum changed');
  }

  const parent = path.dirname(OUTPUT_DIR);
  fs.mkdirSync(parent, { recursive: true });
  const stage = fs.mkdtempSync(path.join(parent, '.process-about-'));
  try {
    const outputFile = path.join(stage, ABOUT_PORTRAIT_ASSET.output);
    await sharp(sourceBuffer)
      .resize({
        width: ABOUT_PORTRAIT_ASSET.width,
        height: ABOUT_PORTRAIT_ASSET.height,
        fit: 'fill',
        kernel: sharp.kernel.lanczos3,
      })
      .webp(ABOUT_PORTRAIT_ASSET.webp)
      .toFile(outputFile);
    const outputBuffer = fs.readFileSync(outputFile);
    const outputMetadata = await sharp(outputBuffer).metadata();
    const metadata = metadataDocument(sourceBuffer, outputBuffer, outputMetadata);
    fs.writeFileSync(
      path.join(stage, 'metadata.json'),
      `${JSON.stringify(metadata, null, 2)}\n`,
    );
    fs.writeFileSync(path.join(stage, 'README.md'), provenanceReadme(metadata));

    const backup = `${OUTPUT_DIR}.backup-${process.pid}`;
    fs.rmSync(backup, { recursive: true, force: true });
    if (fs.existsSync(OUTPUT_DIR)) fs.renameSync(OUTPUT_DIR, backup);
    try {
      fs.renameSync(stage, OUTPUT_DIR);
      fs.rmSync(backup, { recursive: true, force: true });
    } catch (error) {
      if (!fs.existsSync(OUTPUT_DIR) && fs.existsSync(backup)) {
        fs.renameSync(backup, OUTPUT_DIR);
      }
      throw error;
    }
    logger.log(`Published About portrait → ${OUTPUT_DIR}`);
    return validateAboutPortrait({ logger });
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

export async function validateAboutPortrait({
  logger = console,
  outputDir = OUTPUT_DIR,
} = {}) {
  const expectedInventory = [
    ABOUT_PORTRAIT_ASSET.output,
    'README.md',
    'metadata.json',
  ].sort();
  const actualInventory = fs.readdirSync(outputDir).sort();
  if (JSON.stringify(actualInventory) !== JSON.stringify(expectedInventory)) {
    throw new Error(
      `About portrait inventory mismatch: expected ${expectedInventory.join(', ')}, `
      + `received ${actualInventory.join(', ')}`,
    );
  }
  const metadata = JSON.parse(
    fs.readFileSync(path.join(outputDir, 'metadata.json'), 'utf8'),
  );
  if (
    metadata.schemaVersion !== 1
    || metadata.subject !== 'Anonymous placeholder portrait'
    || metadata.realPerson !== false
    || metadata.source?.suppliedPath !== REPOSITORY_SOURCE_LABEL
    || metadata.source?.file !== ABOUT_PORTRAIT_ASSET.sourceFile
    || metadata.source?.sha256 !== ABOUT_PORTRAIT_ASSET.sourceSha256
    || metadata.output?.file !== ABOUT_PORTRAIT_ASSET.output
  ) {
    throw new Error('About portrait provenance metadata is invalid');
  }
  const file = path.join(outputDir, ABOUT_PORTRAIT_ASSET.output);
  const buffer = fs.readFileSync(file);
  const image = await sharp(buffer).metadata();
  const digest = sha256(buffer);
  if (
    image.format !== 'webp'
    || image.width !== ABOUT_PORTRAIT_ASSET.width
    || image.height !== ABOUT_PORTRAIT_ASSET.height
    || buffer.length <= 20_000
    || buffer.length >= ABOUT_PORTRAIT_ASSET.maxBytes
    || metadata.output?.bytes !== buffer.length
    || metadata.output?.sha256 !== digest
  ) {
    throw new Error('Published About portrait dimensions, budget, or checksum are invalid');
  }
  const asset = {
    file,
    format: image.format,
    width: image.width,
    height: image.height,
    bytes: buffer.length,
    sha256: digest,
    recordedSha256: metadata.output.sha256,
    sourceSha256: metadata.source.sha256,
  };
  logger.log(
    `${ABOUT_PORTRAIT_ASSET.output}: ${asset.width}x${asset.height}, `
    + `${asset.bytes} bytes, ${asset.sha256}`,
  );
  return { metadata, asset };
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = process.argv.slice(2);
    if (args.some((argument) => argument !== '--validate')) {
      throw new Error(`Unknown option(s): ${args.filter((argument) => argument !== '--validate').join(', ')}`);
    }
    if (args.includes('--validate')) await validateAboutPortrait();
    else await processAboutPortrait();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
