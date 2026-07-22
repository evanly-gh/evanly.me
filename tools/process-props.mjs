/**
 * Convert curated OBJ and glTF assets into validated DRACO+WebP GLBs.
 *
 * Usage:
 *   node tools/process-props.mjs [--res=512]
 *   node tools/process-props.mjs --validate
 */
import path from 'path';
import { fileURLToPath } from 'url';
import {
  JOBS,
  parseResolution,
  runProcessor,
  validatePublishedArtifacts,
} from './process-props-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '..', 'public', 'models', 'props');

try {
  const args = process.argv.slice(2);
  const validateOnly = args.includes('--validate');
  const unknown = args.filter(arg => arg !== '--validate' && !arg.startsWith('--res='));
  if (unknown.length > 0) throw new Error(`Unknown option(s): ${unknown.join(', ')}`);

  if (validateOnly) {
    if (args.some(arg => arg.startsWith('--res='))) {
      throw new Error('--res cannot be used with --validate');
    }
    await validatePublishedArtifacts({ jobs: JOBS, outDir });
  } else {
    await runProcessor({
      jobs: JOBS,
      outDir,
      res: parseResolution(args),
    });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
