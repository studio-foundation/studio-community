import { readdir, readFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = dirname(fileURLToPath(import.meta.url)) + '/..';
const REQUIRED_META_FIELDS = ['name', 'version', 'description', 'author', 'license', 'type'];
const BUILTIN_PREFIXES = ['repo_manager-', 'shell-', 'search-', 'patch-', 'git-'];

/** Payload extension -> the content kind it lands in under `.studio/`. */
const CONTENT_KINDS = {
  '.tool.yaml': 'tools',
  '.agent.yaml': 'agents',
  '.pipeline.yaml': 'pipelines',
  '.integration.yaml': 'integrations',
  '.contract.yaml': 'contracts',
  '.skill.md': 'skills',
};
const KIND_NAMES = new Set(Object.values(CONTENT_KINDS));

async function ls(dir) {
  try { return await readdir(dir); } catch { return []; }
}

async function readMeta(dir, expectedType, errors) {
  let meta;
  try {
    meta = JSON.parse(await readFile(join(dir, 'metadata.json'), 'utf-8'));
  } catch (e) {
    errors.push(`metadata.json: cannot read/parse — ${e.message}`);
    return null;
  }
  for (const field of REQUIRED_META_FIELDS) {
    if (!meta[field]) errors.push(`metadata.json: missing required field "${field}"`);
  }
  if (meta.type && meta.type !== expectedType) {
    errors.push(`metadata.json: type must be "${expectedType}", got "${meta.type}"`);
  }
  return meta;
}

function collectStageRefs(stage) {
  const agents = [], contracts = [];
  if (typeof stage.agent === 'string') agents.push(stage.agent);
  if (typeof stage.contract === 'string') contracts.push(stage.contract);
  if (Array.isArray(stage.stages)) {
    for (const s of stage.stages) {
      if (s && typeof s === 'object' && !Array.isArray(s)) {
        const inner = collectStageRefs(s);
        agents.push(...inner.agents);
        contracts.push(...inner.contracts);
      }
    }
  }
  return { agents, contracts };
}

async function validateTemplate(name) {
  const errors = [];
  const templateDir = join(ROOT, 'templates', name);
  const projectDir = join(templateDir, 'project');

  const meta = await readMeta(templateDir, 'template', errors);
  if (!meta) return errors;

  try {
    await stat(projectDir);
  } catch {
    errors.push('project/: directory not found');
    return errors;
  }

  // --- Collect cross-ref sets from the template's own project/ ---
  const agentFiles = await ls(join(projectDir, 'agents'));
  const contractFiles = await ls(join(projectDir, 'contracts'));
  const toolFiles = await ls(join(projectDir, 'tools'));
  const agentNames = new Set(agentFiles.filter(f => f.endsWith('.agent.yaml')).map(f => f.slice(0, -'.agent.yaml'.length)));
  const contractNames = new Set(contractFiles.filter(f => f.endsWith('.contract.yaml')).map(f => f.slice(0, -'.contract.yaml'.length)));
  const toolPlugins = new Set(toolFiles.filter(f => f.endsWith('.tool.yaml')).map(f => f.slice(0, -'.tool.yaml'.length)));
  const dependencyAgents = new Set([
    ...(meta.dependencies?.agents?.required ?? []),
    ...(meta.dependencies?.agents?.recommended ?? []),
  ]);

  // --- YAML files: one level of subdirectories in project/ ---
  const subdirs = await ls(projectDir);
  for (const sub of subdirs) {
    if (sub === 'skills') continue; // handled separately below
    const subPath = join(projectDir, sub);
    const files = await ls(subPath);
    for (const file of files) {
      if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
      const filePath = join(subPath, file);
      const rel = `project/${sub}/${file}`;
      let content;
      try {
        content = await readFile(filePath, 'utf-8');
      } catch (e) {
        errors.push(`${rel}: cannot read — ${e.message}`);
        continue;
      }
      let obj;
      try {
        obj = yaml.load(content);
      } catch (e) {
        errors.push(`${rel}: YAML parse error — ${e.message}`);
        continue;
      }
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        errors.push(`${rel}: must be a YAML object`);
        continue;
      }

      // Pipeline
      if (file.endsWith('.pipeline.yaml')) {
        if (!Array.isArray(obj.stages)) {
          errors.push(`${rel}: pipeline must have a "stages" array`);
        } else {
          for (const stage of obj.stages) {
            if (!stage || typeof stage !== 'object' || Array.isArray(stage)) continue;
            const { agents, contracts } = collectStageRefs(stage);
            for (const a of agents) {
              if (!agentNames.has(a) && !dependencyAgents.has(a)) {
                errors.push(`${rel}: agent "${a}" not found in project/agents/ or declared in dependencies`);
              }
            }
            for (const c of contracts) {
              if (!contractNames.has(c)) errors.push(`${rel}: contract "${c}" not found in project/contracts/`);
            }
          }
        }
      }

      // Agent
      if (file.endsWith('.agent.yaml') && Array.isArray(obj.tools)) {
        for (const tool of obj.tools) {
          if (typeof tool !== 'string') continue;
          const isBuiltin = BUILTIN_PREFIXES.some(p => tool.startsWith(p));
          const isCustom = [...toolPlugins].some(p => tool === p || tool.startsWith(p + '-'));
          if (!isBuiltin && !isCustom) {
            errors.push(`${rel}: tool "${tool}" is not a builtin and not in project/tools/`);
          }
        }
      }
    }
  }

  // --- Skills: *.skill.md must be non-empty ---
  const skillFiles = await ls(join(projectDir, 'skills'));
  for (const f of skillFiles) {
    if (!f.endsWith('.skill.md')) continue;
    let content;
    try {
      content = await readFile(join(projectDir, 'skills', f), 'utf-8');
    } catch (e) {
      errors.push(`project/skills/${f}: cannot read — ${e.message}`);
      continue;
    }
    if (!content.trim()) errors.push(`project/skills/${f}: skill is empty`);
  }

  return errors;
}

async function validatePlugin(name) {
  const errors = [];
  const pluginDir = join(ROOT, 'plugins', name);

  const meta = await readMeta(pluginDir, 'plugin', errors);
  if (!meta) return errors;

  // --- What the payload actually delivers, by content kind ---
  const actual = {};
  for (const file of await ls(pluginDir)) {
    const ext = Object.keys(CONTENT_KINDS).find(e => file.endsWith(e));
    if (!ext) continue;
    const kind = CONTENT_KINDS[ext];
    const stem = file.slice(0, -ext.length);
    let content;
    try {
      content = await readFile(join(pluginDir, file), 'utf-8');
    } catch (e) {
      errors.push(`${file}: cannot read — ${e.message}`);
      continue;
    }

    if (ext === '.skill.md') {
      if (!content.trim()) errors.push(`${file}: skill is empty`);
      (actual[kind] ??= []).push(stem);
      continue;
    }

    let obj;
    try {
      obj = yaml.load(content);
    } catch (e) {
      errors.push(`${file}: YAML parse error — ${e.message}`);
      continue;
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      errors.push(`${file}: must be a YAML object`);
      continue;
    }
    (actual[kind] ??= []).push(obj.name ?? stem);
  }

  if (Object.keys(actual).length === 0) errors.push('no content payload found');

  // --- Declared vs actual ---
  const declared = meta.provides ?? {};
  for (const kind of Object.keys(declared)) {
    if (!KIND_NAMES.has(kind)) errors.push(`metadata.json: provides has unknown content kind "${kind}"`);
  }
  for (const kind of new Set([...Object.keys(declared), ...Object.keys(actual)])) {
    const d = new Set(declared[kind] ?? []);
    const a = new Set(actual[kind] ?? []);
    for (const n of d) if (!a.has(n)) errors.push(`provides.${kind} declares "${n}", absent from payload`);
    for (const n of a) if (!d.has(n)) errors.push(`payload delivers ${kind} "${n}", undeclared in provides`);
  }

  return errors;
}

// --- Main ---
let totalErrors = 0;

for (const [dir, validate] of [['templates', validateTemplate], ['plugins', validatePlugin]]) {
  for (const name of await ls(join(ROOT, dir))) {
    const errors = await validate(name);
    if (errors.length > 0) {
      console.error(`\nFAIL  ${dir}/${name}:`);
      for (const e of errors) console.error(`      ${e}`);
      totalErrors += errors.length;
    } else {
      console.log(`PASS  ${dir}/${name}`);
    }
  }
}

if (totalErrors > 0) {
  console.error(`\n${totalErrors} error(s) found.`);
  process.exit(1);
}
console.log('\nAll packages valid.');
