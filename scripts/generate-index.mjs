import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url)) + '/..';
const TYPES = ['templates', 'plugins'];

const packages = [];

for (const type of TYPES) {
  let dirs;
  try {
    dirs = await readdir(join(ROOT, type));
  } catch {
    continue; // directory doesn't exist yet
  }

  for (const dir of dirs) {
    const metaPath = join(ROOT, type, dir, 'metadata.json');
    let meta;
    try {
      meta = JSON.parse(await readFile(metaPath, 'utf8'));
    } catch {
      continue; // skip if no metadata.json
    }

    const entry = {
      name: meta.name,
      type: meta.type,
      version: meta.version,
      description: meta.description,
      author: meta.author,
      license: meta.license,
      tags: meta.tags ?? [],
      studio_version: meta.studio_version ?? null,
      downloads: meta.downloads ?? 0,
      dependencies: meta.dependencies ?? {},
      source: { type: 'local', path: `${type}/${dir}` },
    };
    if (meta.type === 'plugin') entry.provides = meta.provides ?? {};
    packages.push(entry);
  }
}

const index = {
  generated_at: new Date().toISOString(),
  version: '1',
  packages,
};

await writeFile(join(ROOT, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`Generated index.json with ${packages.length} packages`);
