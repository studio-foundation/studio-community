import { readFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url)) + '/..';
const PACKAGE_TYPES = new Set(['template', 'plugin']);

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

  if (!PACKAGE_TYPES.has(pkg.type)) {
    errors.push(`${label}: unknown package type "${pkg.type}"`);
    continue;
  }
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

  if (pkg.type === 'template') {
    if (!(await exists(join(ROOT, source.path, 'project')))) {
      errors.push(`${label}: ${source.path}/project/ not found`);
    }
  } else if (!pkg.provides || Object.keys(pkg.provides).length === 0) {
    errors.push(`${label}: plugin declares no "provides"`);
  }
}

if (errors.length > 0) {
  console.error(`FAIL  index.json:`);
  for (const e of errors) console.error(`      ${e}`);
  console.error(`\n${errors.length} error(s) found.`);
  process.exit(1);
}

console.log(`All ${index.packages.length} index entries resolve.`);
