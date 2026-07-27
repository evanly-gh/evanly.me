import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { createRequire } from 'module';
import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  draco,
  prune,
  textureCompress,
  weld,
} from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

const require = createRequire(import.meta.url);
const obj2gltf = require('obj2gltf');

const CY = path.join(os.homedir(), 'Downloads', 'Cyber Assets');
const QUAT = path.join(CY, 'Cyberpunk Game Kit - Quaternius-20260716T040550Z-1-001', 'Cyberpunk Game Kit - Quaternius');
const ROBOTS = path.join(CY, 'Cyber Robots');
const CHARACTER_SOURCE = path.join(QUAT, 'Character', 'Character.obj');

export const JOBS = [
  { name: 'ped_char', input: CHARACTER_SOURCE, type: 'obj', expectedTextures: 0, sourceBbox: [0.61086, 1.374499, 1.155609] },
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

export const CHARACTER_SOURCE_PROVENANCE = Object.freeze({
  package: 'Cyberpunk Game Kit - Quaternius-20260716T040550Z-1-001',
  objectSha256: 'c774a055e3dfa81ee61861f8d6caa7853ee2554d916f48327671d5023ded16e5',
  materialSha256: 'b2a69fbaf95a9a0bd1a86ff72be8a737a1848755cbd65a13f219b70cdea80038',
  licenseSha256: 'de990ef6fc68cffd7fd1ae342c4d0c823b541b8848d8f76bca5d3339f4de6f6e',
});

export const CC0_LICENSE_TEXT = `------------------------------------------------------
Ultimate Platformer Pack by @Quaternius
Consider supporting me on Patreon, even $1 helps me a lot!

https://www.patreon.com/quaternius
-------------------------------------------------------

License:
CC0 1.0 Universal (CC0 1.0)
Public Domain Dedication
https://creativecommons.org/publicdomain/zero/1.0/
`;

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

function updateAccessorHash(hash, label, accessor) {
  hash.update(label);
  hash.update(String(accessor.getType()));
  hash.update(String(accessor.getComponentType()));
  const array = accessor.getArray();
  if (array) {
    hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
  }
}

function inspectGeometry(document) {
  const hash = createHash('sha256');
  let triangles = 0;
  let primitives = 0;
  document.getRoot().listMeshes().forEach((mesh, meshIndex) => {
    hash.update(`mesh:${meshIndex}:${mesh.getName()}`);
    mesh.listPrimitives().forEach((primitive, primitiveIndex) => {
      primitives += 1;
      hash.update(`primitive:${primitiveIndex}:${primitive.getMode()}`);
      const indices = primitive.getIndices();
      const position = primitive.getAttribute('POSITION');
      triangles += (indices?.getCount() ?? position?.getCount() ?? 0) / 3;
      if (indices) updateAccessorHash(hash, 'indices', indices);
      for (const semantic of [...primitive.listSemantics()].sort()) {
        const accessor = primitive.getAttribute(semantic);
        if (accessor) updateAccessorHash(hash, semantic, accessor);
      }
    });
  });
  return {
    geometryHash: hash.digest('hex'),
    primitives,
    triangles: Math.round(triangles),
  };
}

function inspectMaterials(document) {
  const materials = document.getRoot().listMaterials();
  const texturedMaterials = materials.filter((material) =>
    material.getBaseColorTexture()
    || material.getNormalTexture()
    || material.getMetallicRoughnessTexture()
    || material.getEmissiveTexture()
    || material.getOcclusionTexture());
  return {
    pbrMaterials: materials.length,
    texturedMaterials: texturedMaterials.length,
  };
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
    const geometry = inspectGeometry(document);
    const materials = inspectMaterials(document);
    return {
      bytes: buffer.length,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      meshes: root.listMeshes().length,
      textures: textures.length,
      bbox,
      ...geometry,
      ...materials,
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

function artifactManifestMetadata(result) {
  if (
    typeof result.sha256 !== 'string'
    || typeof result.geometryHash !== 'string'
    || !Number.isInteger(result.triangles)
    || !Number.isInteger(result.primitives)
    || !Number.isInteger(result.pbrMaterials)
    || !Number.isInteger(result.texturedMaterials)
  ) {
    return {};
  }
  return {
    sha256: result.sha256,
    geometryHash: result.geometryHash,
    triangles: result.triangles,
    primitives: result.primitives,
    pbrMaterials: result.pbrMaterials,
    texturedMaterials: result.texturedMaterials,
  };
}

function buildProvenanceMarkdown(results) {
  const result = results.find((candidate) => candidate.name === 'ped_char');
  const generated = result
    ? `- \`ped_char.glb\` bytes: ${result.bytes}
- \`ped_char.glb\` SHA-256: \`${result.sha256}\`
- Geometry SHA-256: \`${result.geometryHash}\`
- Triangles: ${result.triangles}
- Mesh primitives: ${result.primitives}`
    : '- Canonical human output was not part of this custom processor run.';
  return `# Prop asset provenance

## Canonical Quaternius Character 1

- Local package: \`${CHARACTER_SOURCE_PROVENANCE.package}\`
- Geometry source: \`Cyberpunk Game Kit - Quaternius/Character/Character.obj\`
- \`Character.obj\` SHA-256: \`${CHARACTER_SOURCE_PROVENANCE.objectSha256}\`
- Material source: \`Cyberpunk Game Kit - Quaternius/Character/Character.mtl\`
- \`Character.mtl\` SHA-256: \`${CHARACTER_SOURCE_PROVENANCE.materialSha256}\`
- Bundled license: \`Cyberpunk Game Kit - Quaternius/License.txt\`
- \`License.txt\` SHA-256: \`${CHARACTER_SOURCE_PROVENANCE.licenseSha256}\`
- License: **CC0 1.0 Universal (CC0 1.0), Public Domain Dedication**
- License URL: https://creativecommons.org/publicdomain/zero/1.0/
- Checked-in license text: \`LICENSE-CC0.txt\`

The package folder is named \`Cyberpunk Game Kit - Quaternius\`; its bundled
\`License.txt\` header identifies \`Ultimate Platformer Pack\`. The exact local
source path and checksums above are recorded without renaming that provenance.

The source has seven color-only material regions and no image textures. The
pipeline preserves the one canonical geometry, welds/deduplicates it, and
DRACO-compresses the GLB. The runtime per-instance PBR colors apply
deterministic skin, hair, jacket/shirt, pants, and accent palettes without
claiming texture maps exist or creating duplicate GLBs or material buckets.

${generated}
`;
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
            ...artifactManifestMetadata(result),
          });
        }
        if (job.name === 'ped_char') {
          entry.characterSource = {
            object: 'Character.obj',
            objectSha256: CHARACTER_SOURCE_PROVENANCE.objectSha256,
            material: 'Character.mtl',
            materialSha256: CHARACTER_SOURCE_PROVENANCE.materialSha256,
          };
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
    fs.writeFileSync(path.join(stageDir, 'PROVENANCE.md'), buildProvenanceMarkdown(results));
    fs.writeFileSync(path.join(stageDir, 'LICENSE-CC0.txt'), CC0_LICENSE_TEXT);
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
    const expectedManifest = results.map((result) => {
      const job = jobs.find(({ name }) => name === result.name);
      return {
        name: result.name,
        file: `props/${result.name}.glb`,
        kb: +(result.bytes / 1024).toFixed(0),
        expectedTextures: result.expectedTextures,
        sourceBbox: result.sourceBbox,
        bbox: result.bbox,
        ...artifactManifestMetadata(result),
        ...(job?.name === 'ped_char'
          ? {
              characterSource: {
                object: 'Character.obj',
                objectSha256: CHARACTER_SOURCE_PROVENANCE.objectSha256,
                material: 'Character.mtl',
                materialSha256: CHARACTER_SOURCE_PROVENANCE.materialSha256,
              },
            }
          : {}),
      };
    });
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
