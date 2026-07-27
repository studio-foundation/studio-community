import { readFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url)) + '/..';
const DIRECTORY_TYPES = new Set(['template', 'plugin']);

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const index = JSON.parse(await readFile(join(ROOT, 'index.json'), 'utf8'));
const errors = [];

for (const pkg of index.packages) {
  const label = `${pkg.type}/${pkg.name}`;
  const source = pkg.source;

  if (!source) {
    errors.push(`${label}: missing "source"`);
    continue;
  }
  if (source.type !== 'local') {
    errors.push(`${label}: unsupported source type "${source.type}"`);
    continue;
  }
  if (!source.path) {
    errors.push(`${label}: source has no "path"`);
    continue;
  }

  if (!(await exists(join(ROOT, source.path, 'metadata.json')))) {
    errors.push(`${label}: ${source.path}/metadata.json not found`);
  }

  if (DIRECTORY_TYPES.has(pkg.type)) {
    if (!(await exists(join(ROOT, source.path, 'project')))) {
      errors.push(`${label}: ${source.path}/project/ not found`);
    }
  } else if (!source.file) {
    errors.push(`${label}: source has no "file"`);
  } else if (!(await exists(join(ROOT, source.path, source.file)))) {
    errors.push(`${label}: ${source.path}/${source.file} not found`);
  }
}

if (errors.length > 0) {
  console.error(`FAIL  index.json:`);
  for (const e of errors) console.error(`      ${e}`);
  console.error(`\n${errors.length} error(s) found.`);
  process.exit(1);
}

console.log(`All ${index.packages.length} index entries resolve.`);
