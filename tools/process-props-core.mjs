import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, draco, prune, textureCompress, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

const require = createRequire(import.meta.url);
const obj2gltf = require('obj2gltf');

const CY = path.join(os.homedir(), 'Downloads', 'Cyber Assets');
const QUAT = path.join(CY, 'Cyberpunk Game Kit - Quaternius-20260716T040550Z-1-001', 'Cyberpunk Game Kit - Quaternius');
const ROBOTS = path.join(CY, 'Cyber Robots');

export const JOBS = [
  { name: 'ped_char', input: path.join(QUAT, 'Character', 'Character.obj'), type: 'obj', expectedTextures: 0, sourceBbox: [0.61086, 1.374499, 1.155609] },
  { name: 'robot_companion', input: path.join(ROBOTS, 'Companion-bot', 'Package', 'Companion-bot.obj'), type: 'obj', expectedTextures: 1, sourceBbox: [2.30011, 5.7, 1.800146] },
  { name: 'robot_recon', input: path.join(ROBOTS, 'ReconBot', 'Package', 'ReconBot.obj'), type: 'obj', expectedTextures: 1, sourceBbox: [2.69989, 5.9, 2.800006] },
  { name: 'robot_storage', input: path.join(ROBOTS, 'MobileStorageBot', 'Package', 'MobileStorageBot.obj'), type: 'obj', expectedTextures: 1, sourceBbox: [5, 4.59989, 3.399866] },
  { name: 'quat_ac', input: path.join(QUAT, 'Platforms', 'AC.gltf'), type: 'gltf', expectedTextures: 0, sourceBbox: [1.038104, 0.685606, 0.770958] },
  { name: 'quat_ac_stacked', input: path.join(QUAT, 'Platforms', 'AC_Stacked.gltf'), type: 'gltf', expectedTextures: 1, sourceBbox: [0.670082, 1.006229, 0.511437] },
  { name: 'quat_antenna_1', input: path.join(QUAT, 'Platforms', 'Antenna_1.gltf'), type: 'gltf', expectedTextures: 0, sourceBbox: [0.401899, 1.655596, 0.06316] },
  { name: 'quat_antenna_2', input: path.join(QUAT, 'Platforms', 'Antenna_2.gltf'), type: 'gltf', expectedTextures: 0, sourceBbox: [0.617384, 0.730613, 0.656673] },
  { name: 'quat_sign_1', input: path.join(QUAT, 'Platforms', 'Sign_1.gltf'), type: 'gltf', expectedTextures: 1, sourceBbox: [1.29387, 0.462249, 0.06176] },
  { name: 'quat_sign_3', input: path.join(QUAT, 'Platforms', 'Sign_3.gltf'), type: 'gltf', expectedTextures: 1, sourceBbox: [1.271665, 0.45548, 0.061786] },
];

export const DELIVERY_BUDGETS = {
  minFileBytes: 2 * 1024,
  maxFileBytes: 200 * 1024,
  maxTotalBytes: 700 * 1024,
};

export function parseResolution(args) {
  const values = args.filter(arg => arg.startsWith('--res='));
  if (values.length === 0) return 512;
  if (values.length !== 1 || !/^--res=\d+$/.test(values[0])) {
    throw new Error('--res must be specified once as an integer from 1 to 4096');
  }
  const value = Number(values[0].slice('--res='.length));
  if (!Number.isSafeInteger(value) || value < 1 || value > 4096) {
    throw new Error('--res must be an integer from 1 to 4096');
  }
  return value;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function createTransformIO() {
  const [encoder, decoder] = await Promise.all([
    draco3d.createEncoderModule({}),
    draco3d.createDecoderModule({}),
  ]);
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.encoder': encoder, 'draco3d.decoder': decoder });
}

async function createValidationIO() {
  const decoder = await draco3d.createDecoderModule({});
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.decoder': decoder });
}

function roundBbox(values) {
  return values.map((value) => +value.toFixed(6));
}

function documentBbox(document) {
  const bounds = document.getRoot().listScenes().map((scene) => getBounds(scene));
  if (bounds.length === 0) throw new Error('document has no scene bounds');
  const min = [0, 1, 2].map((axis) =>
    Math.min(...bounds.map((bound) => bound.min[axis])));
  const max = [0, 1, 2].map((axis) =>
    Math.max(...bounds.map((bound) => bound.max[axis])));
  return roundBbox(max.map((value, axis) => value - min[axis]));
}

function assertBbox(actual, expected, label, tolerance = 0.005) {
  if (
    !Array.isArray(actual)
    || actual.length !== 3
    || actual.some((value) => !Number.isFinite(value) || value <= 0)
  ) {
    throw new Error(`${label} bbox must contain three positive finite dimensions`);
  }
  if (expected && actual.some((value, index) =>
    Math.abs(value - expected[index]) > tolerance)) {
    throw new Error(
      `${label} bbox ${JSON.stringify(actual)} does not match `
      + `${JSON.stringify(expected)} within ${tolerance}`,
    );
  }
}

export async function createConverter() {
  const io = await createTransformIO();
  const sharp = (await import('sharp')).default;

  return async (job, res) => {
    const document = job.type === 'obj'
      ? await io.readBinary(new Uint8Array(await obj2gltf(job.input, {
        binary: true,
        checkTransparency: false,
      })))
      : await io.read(job.input);
    const sourceBbox = documentBbox(document);
    const sourceTextures = document.getRoot().listTextures().length;
    assertBbox(sourceBbox, job.sourceBbox, `${job.name} source`);
    if (sourceTextures !== job.expectedTextures) {
      throw new Error(
        `${job.name} source texture count ${sourceTextures} does not match `
        + `expected ${job.expectedTextures}`,
      );
    }

    await document.transform(
      prune(),
      weld({ tolerance: 1e-4 }),
      dedup(),
      textureCompress({
        encoder: sharp,
        targetFormat: 'webp',
        quality: 85,
        resize: [res, res],
      }),
      draco({
        method: job.name === 'quat_antenna_1' ? 'sequential' : 'edgebreaker',
        quantizationVolume: 'scene',
        quantizePosition: 14,
        quantizeNormal: 10,
        quantizeTexcoord: 12,
      }),
    );

    return {
      buffer: Buffer.from(await io.writeBinary(document)),
      expectedTextures: job.expectedTextures,
      sourceBbox: job.sourceBbox,
    };
  };
}

function readGLBJson(buffer) {
  if (buffer.length < 20 || buffer.subarray(0, 4).toString('ascii') !== 'glTF') {
    throw new Error('file is not a GLB');
  }
  if (buffer.readUInt32LE(4) !== 2) throw new Error('GLB version is not 2');

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > buffer.length) throw new Error('GLB contains a truncated chunk');
    if (type === 0x4e4f534a) {
      return JSON.parse(buffer.subarray(start, end).toString('utf8').replace(/\0+$/u, '').trim());
    }
    offset = end;
  }
  throw new Error('GLB has no JSON chunk');
}

export async function createArtifactValidator() {
  const io = await createValidationIO();

  return async (file, {
    expectedTextures = 0,
    budgets = DELIVERY_BUDGETS,
  } = {}) => {
    const buffer = fs.readFileSync(file);
    if (buffer.length <= budgets.minFileBytes) {
      throw new Error(`${path.basename(file)} is ${buffer.length} bytes; must exceed ${budgets.minFileBytes}`);
    }
    if (buffer.length >= budgets.maxFileBytes) {
      throw new Error(`${path.basename(file)} is ${buffer.length} bytes; must be under ${budgets.maxFileBytes}`);
    }

    const json = readGLBJson(buffer);
    const jsonPrimitives = (json.meshes ?? []).flatMap(mesh => mesh.primitives ?? []);
    if (jsonPrimitives.length === 0) throw new Error(`${path.basename(file)} contains no mesh primitives`);
    if (jsonPrimitives.some(primitive => !primitive.extensions?.KHR_draco_mesh_compression)) {
      throw new Error(`${path.basename(file)} contains a primitive without DRACO compression`);
    }

    const document = await io.readBinary(new Uint8Array(buffer));
    const root = document.getRoot();
    if (root.listMeshes().length === 0) throw new Error(`${path.basename(file)} contains no meshes`);
    if (!root.listExtensionsUsed().some(extension => extension.extensionName === 'KHR_draco_mesh_compression')) {
      throw new Error(`${path.basename(file)} does not declare DRACO compression`);
    }

    const textures = root.listTextures();
    if (textures.length !== expectedTextures) {
      throw new Error(
        `${path.basename(file)} has ${textures.length} texture(s); `
        + `expected exactly ${expectedTextures}`,
      );
    }
    if (textures.some(texture => texture.getMimeType() !== 'image/webp')) {
      throw new Error(`${path.basename(file)} contains a non-WebP texture`);
    }

    const bbox = documentBbox(document);
    assertBbox(bbox, undefined, path.basename(file));
    return {
      bytes: buffer.length,
      meshes: root.listMeshes().length,
      primitives: jsonPrimitives.length,
      textures: textures.length,
      bbox,
    };
  };
}

function assertTotalBudget(results, budgets = DELIVERY_BUDGETS) {
  const totalBytes = results.reduce((sum, result) => sum + result.bytes, 0);
  if (totalBytes >= budgets.maxTotalBytes) {
    throw new Error(`total output is ${totalBytes} bytes; must be under ${budgets.maxTotalBytes}`);
  }
  return totalBytes;
}

function publishDirectory(
  stageDir,
  outDir,
  {
    logger = console,
    removeBackup = (backupDir) => fs.rmSync(
      backupDir,
      { recursive: true, force: true },
    ),
  } = {},
) {
  const backupDir = `${outDir}.backup-${process.pid}-${Date.now()}`;
  let movedExisting = false;
  try {
    if (fs.existsSync(outDir)) {
      fs.renameSync(outDir, backupDir);
      movedExisting = true;
    }
    fs.renameSync(stageDir, outDir);
  } catch (error) {
    if (!fs.existsSync(outDir) && movedExisting && fs.existsSync(backupDir)) {
      fs.renameSync(backupDir, outDir);
    }
    throw error;
  }

  if (movedExisting) {
    try {
      removeBackup(backupDir);
    } catch (error) {
      logger.warn(
        `Published successfully, but backup cleanup failed; retained ${backupDir}: ${errorMessage(error)}`,
      );
    }
  }
}

export async function runProcessor({
  jobs = JOBS,
  outDir,
  res = 512,
  convertJob,
  validateArtifact,
  logger = console,
  budgets = DELIVERY_BUDGETS,
  removeBackup,
}) {
  if (!outDir) throw new Error('outDir is required');
  const parentDir = path.dirname(outDir);
  fs.mkdirSync(parentDir, { recursive: true });
  const stageDir = fs.mkdtempSync(path.join(parentDir, '.process-props-'));
  const failures = [];
  const manifest = [];
  const results = [];

  try {
    const convert = convertJob ?? await createConverter();
    const validate = validateArtifact ?? await createArtifactValidator();

    for (const job of jobs) {
      if (!fs.existsSync(job.input)) {
        const message = `missing input: ${job.input}`;
        failures.push(`${job.name}: ${message}`);
        logger.warn(`MISSING ${job.name}: ${job.input}`);
        continue;
      }

      logger.log(`Converting ${job.name} ...`);
      try {
        const converted = await convert(job, res);
        const buffer = Buffer.isBuffer(converted) ? converted : converted.buffer;
        const expectedTextures = Buffer.isBuffer(converted)
          ? (job.expectedTextures ?? 0)
          : converted.expectedTextures;
        const sourceBbox = Buffer.isBuffer(converted)
          ? job.sourceBbox
          : converted.sourceBbox;
        const file = path.join(stageDir, `${job.name}.glb`);
        fs.writeFileSync(file, buffer);
        const result = await validate(file, { expectedTextures, budgets });
        results.push({ name: job.name, ...result });
        const entry = {
          name: job.name,
          file: `props/${job.name}.glb`,
          kb: +(result.bytes / 1024).toFixed(0),
        };
        if (Number.isInteger(job.expectedTextures) && Array.isArray(sourceBbox)) {
          assertBbox(sourceBbox, job.sourceBbox, `${job.name} source`);
          assertBbox(result.bbox, undefined, `${job.name} rendered`);
          Object.assign(entry, {
            expectedTextures: job.expectedTextures,
            sourceBbox,
            bbox: result.bbox,
          });
        }
        manifest.push(entry);
        logger.log(`Validated ${job.name}: ${result.bytes} bytes`);
      } catch (error) {
        failures.push(`${job.name}: ${errorMessage(error)}`);
        logger.error(`FAILED ${job.name}: ${errorMessage(error)}`);
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(failures, `Asset processing failed:\n- ${failures.join('\n- ')}`);
    }

    const totalBytes = assertTotalBudget(results, budgets);
    fs.writeFileSync(path.join(stageDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    publishDirectory(stageDir, outDir, { logger, removeBackup });
    logger.log(`Done. ${manifest.length} props, ${totalBytes} bytes → ${outDir}`);
    return { manifest, results, totalBytes };
  } finally {
    if (fs.existsSync(stageDir)) fs.rmSync(stageDir, { recursive: true, force: true });
  }
}

export async function validatePublishedArtifacts({
  jobs = JOBS,
  outDir,
  logger = console,
  budgets = DELIVERY_BUDGETS,
  validateArtifact,
}) {
  const expectedGlbs = jobs.map((job) => `${job.name}.glb`).sort();
  const actualGlbs = fs.readdirSync(outDir)
    .filter((file) => file.toLowerCase().endsWith('.glb'))
    .sort();
  const missingGlbs = expectedGlbs.filter((file) => !actualGlbs.includes(file));
  const unexpectedGlbs = actualGlbs.filter((file) => !expectedGlbs.includes(file));
  if (missingGlbs.length > 0 || unexpectedGlbs.length > 0) {
    throw new Error([
      'Published GLB inventory mismatch.',
      missingGlbs.length > 0 ? `Missing GLB(s): ${missingGlbs.join(', ')}` : '',
      unexpectedGlbs.length > 0 ? `Unexpected GLB(s): ${unexpectedGlbs.join(', ')}` : '',
    ].filter(Boolean).join(' '));
  }

  const validate = validateArtifact ?? await createArtifactValidator();
  const failures = [];
  const results = [];

  for (const job of jobs) {
    const file = path.join(outDir, `${job.name}.glb`);
    try {
      if (!fs.existsSync(file)) throw new Error(`missing output: ${file}`);
      if (!Number.isInteger(job.expectedTextures) || !Array.isArray(job.sourceBbox)) {
        throw new Error('job lacks expectedTextures/sourceBbox metadata');
      }
      const result = await validate(file, {
        expectedTextures: job.expectedTextures,
        budgets,
      });
      assertBbox(result.bbox, undefined, `${job.name} rendered`);
      results.push({
        name: job.name,
        expectedTextures: job.expectedTextures,
        sourceBbox: job.sourceBbox,
        ...result,
      });
      logger.log(`${job.name}: ${result.bytes} bytes, ${result.meshes} mesh(es), ${result.primitives} DRACO primitive(s), ${result.textures} WebP texture(s)`);
    } catch (error) {
      failures.push(`${job.name}: ${errorMessage(error)}`);
    }
  }

  try {
    const totalBytes = assertTotalBudget(results, budgets);
    if (failures.length > 0) {
      throw new AggregateError(failures, `Artifact validation failed:\n- ${failures.join('\n- ')}`);
    }
    const manifestFile = path.join(outDir, 'manifest.json');
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    } catch (error) {
      throw new Error(`Published manifest is unreadable: ${errorMessage(error)}`);
    }
    const expectedManifest = results.map((result) => ({
      name: result.name,
      file: `props/${result.name}.glb`,
      kb: +(result.bytes / 1024).toFixed(0),
      expectedTextures: result.expectedTextures,
      sourceBbox: result.sourceBbox,
      bbox: result.bbox,
    }));
    if (JSON.stringify(manifest) !== JSON.stringify(expectedManifest)) {
      throw new Error(
        `Published manifest contents do not exactly match validated artifacts: expected ${JSON.stringify(expectedManifest)}, received ${JSON.stringify(manifest)}`,
      );
    }
    logger.log(`Validated ${results.length} props: ${totalBytes} bytes total`);
    return { results, totalBytes };
  } catch (error) {
    if (failures.length > 0 && !(error instanceof AggregateError)) {
      failures.push(`delivery budget: ${errorMessage(error)}`);
      throw new AggregateError(failures, `Artifact validation failed:\n- ${failures.join('\n- ')}`);
    }
    throw error;
  }
}
