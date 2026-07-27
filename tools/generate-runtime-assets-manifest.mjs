import { createHash } from 'node:crypto';
import {
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const directory = path.join(root, 'public', 'models', 'neocity');
const files = readdirSync(directory)
  .filter((file) => file.endsWith('.glb'))
  .sort()
  .map((file) => {
    const filename = path.join(directory, file);
    const buffer = readFileSync(filename);
    return {
      file,
      bytes: statSync(filename).size,
      sha256: createHash('sha256').update(buffer).digest('hex'),
    };
  });
const document = {
  schemaVersion: 1,
  fileCount: files.length,
  totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  files,
};
writeFileSync(
  path.join(directory, 'runtime-assets-manifest.json'),
  `${JSON.stringify(document, null, 2)}\n`,
);
console.log(
  `Wrote ${document.fileCount} model hashes (${document.totalBytes} bytes)`,
);
