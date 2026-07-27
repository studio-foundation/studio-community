import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url)) + '/..';
const TYPES = ['tools', 'templates', 'pipelines', 'integrations', 'agents', 'plugins', 'skills'];

/** Single-file package types, and the extension their payload carries. */
const PAYLOAD_EXTENSIONS = {
  tool: '.tool.yaml',
  pipeline: '.pipeline.yaml',
  integration: '.integration.yaml',
  agent: '.agent.yaml',
  skill: '.skill.md',
};

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

    const source = { type: 'local', path: `${type}/${dir}` };
    const ext = PAYLOAD_EXTENSIONS[meta.type];
    if (ext) {
      const payload = (await readdir(join(ROOT, type, dir))).find((f) => f.endsWith(ext));
      if (!payload) {
        console.error(`${type}/${dir}: no ${ext} payload found`);
        process.exit(1);
      }
      source.file = payload;
    }

    packages.push({
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
      source,
    });
  }
}

const index = {
  generated_at: new Date().toISOString(),
  version: '1',
  packages,
};

await writeFile(join(ROOT, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`Generated index.json with ${packages.length} packages`);
