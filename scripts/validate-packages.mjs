import { readdir, readFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import semver from 'semver';
import { parseAgentYaml, parseContractYaml, parsePipelineYaml } from '@studio-foundation/engine';
import { loadProjectTools } from '@studio-foundation/runner';

const ROOT = dirname(fileURLToPath(import.meta.url)) + '/..';
const REQUIRED_META_FIELDS = ['name', 'version', 'description', 'author', 'license', 'type'];
// Tools the kernel implements. Everything else — git, search, web_search — comes
// from a plugin, so it has to be declared as a dependency like any other.
const BUILTIN_PREFIXES = ['repo_manager-', 'shell-', 'studio_run-'];

/** The marketplace an unqualified dependency name resolves against. */
const DEFAULT_MARKETPLACE = 'studio-community';

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

/**
 * Extension -> the kernel's own loader. Parsing with anything else is how a
 * package the kernel refuses to load still passes CI: the loaders reject both
 * missing required fields (a stage without `kind`) and unknown ones (a contract
 * carrying `field_constraints`), and a plain YAML parse sees neither.
 */
const KERNEL_PARSERS = {
  '.pipeline.yaml': parsePipelineYaml,
  '.agent.yaml': parseAgentYaml,
  '.contract.yaml': parseContractYaml,
};

async function ls(dir) {
  try { return await readdir(dir); } catch { return []; }
}

/** `[marketplace:]name[@range]` — mirrors the CLI's dependency spec parser. */
function parseDependencySpec(raw) {
  const trimmed = raw.trim();
  const colon = trimmed.indexOf(':');
  const marketplace = colon === -1 ? DEFAULT_MARKETPLACE : trimmed.slice(0, colon).trim();
  const rest = (colon === -1 ? trimmed : trimmed.slice(colon + 1)).trim();
  const at = rest.indexOf('@');
  return {
    marketplace,
    name: (at === -1 ? rest : rest.slice(0, at)).trim(),
    range: at === -1 ? undefined : rest.slice(at + 1).trim() || undefined,
  };
}

/** Every dependency must name a package this registry actually publishes. */
function checkDependencies(meta, registry, errors) {
  for (const [category, entry] of Object.entries(meta.dependencies ?? {})) {
    for (const kind of ['required', 'recommended']) {
      for (const raw of entry?.[kind] ?? []) {
        const where = `metadata.json: dependencies.${category}.${kind}`;
        const spec = parseDependencySpec(raw);
        if (!spec.name) {
          errors.push(`${where}: invalid dependency entry "${raw}"`);
          continue;
        }
        if (spec.marketplace !== DEFAULT_MARKETPLACE) continue;
        const dep = registry.get(spec.name);
        if (!dep) {
          errors.push(`${where}: no package named "${spec.name}" in this registry`);
        } else if (spec.range && !semver.satisfies(dep.version, spec.range)) {
          errors.push(`${where}: "${spec.name}" is at ${dep.version}, outside range "${spec.range}"`);
        }
      }
    }
  }
}

async function readMeta(dir, expectedType, registry, errors) {
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
  if (meta.version && !semver.valid(meta.version)) {
    errors.push(`metadata.json: version "${meta.version}" is not a valid semver version`);
  }
  if (meta.studio_version && !semver.validRange(meta.studio_version)) {
    errors.push(`metadata.json: studio_version "${meta.studio_version}" is not a valid semver range`);
  }
  checkDependencies(meta, registry, errors);
  return meta;
}

/**
 * Parse a content file with the kernel loader that owns its extension, falling
 * back to a plain YAML parse for the extensions no loader claims. Returns null
 * when the file is unusable.
 */
async function parseContentFile(path, rel, errors) {
  let content;
  try {
    content = await readFile(path, 'utf-8');
  } catch (e) {
    errors.push(`${rel}: cannot read — ${e.message}`);
    return null;
  }

  const ext = Object.keys(KERNEL_PARSERS).find(e => path.endsWith(e));
  if (ext) {
    try {
      return KERNEL_PARSERS[ext](content, rel);
    } catch (e) {
      errors.push(`${rel}: ${e.message}`);
      return null;
    }
  }

  let obj;
  try {
    obj = yaml.load(content);
  } catch (e) {
    errors.push(`${rel}: YAML parse error — ${e.message}`);
    return null;
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    errors.push(`${rel}: must be a YAML object`);
    return null;
  }
  return obj;
}

/** Run every `.tool.yaml` in `dir` through the runner's plugin loader. */
async function checkToolPlugins(dir, rel, errors) {
  try {
    await loadProjectTools(dir, dir);
  } catch (e) {
    errors.push(`${rel}: ${e.message}`);
  }
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

async function validateTemplate(name, registry) {
  const errors = [];
  const templateDir = join(ROOT, 'templates', name);
  const projectDir = join(templateDir, 'project');

  const meta = await readMeta(templateDir, 'template', registry, errors);
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
  // Every dependency category resolves by name, never by category (ADR 0002), so a
  // referenced agent may be declared under any of them.
  const declaredDependencies = new Set(
    Object.values(meta.dependencies ?? {}).flatMap(
      (entry) => [...(entry.required ?? []), ...(entry.recommended ?? [])],
    ),
  );

  await checkToolPlugins(join(projectDir, 'tools'), 'project/tools', errors);

  // --- YAML files: one level of subdirectories in project/ ---
  const subdirs = await ls(projectDir);
  for (const sub of subdirs) {
    if (sub === 'skills') continue; // handled separately below
    const subPath = join(projectDir, sub);
    const files = await ls(subPath);
    for (const file of files) {
      if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
      const rel = `project/${sub}/${file}`;
      const obj = await parseContentFile(join(subPath, file), rel, errors);
      if (!obj) continue;

      // Pipeline
      if (file.endsWith('.pipeline.yaml')) {
        for (const stage of obj.stages) {
          if (!stage || typeof stage !== 'object' || Array.isArray(stage)) continue;
          const { agents, contracts } = collectStageRefs(stage);
          for (const a of agents) {
            if (!agentNames.has(a) && !declaredDependencies.has(a)) {
              errors.push(`${rel}: agent "${a}" not found in project/agents/ or declared in dependencies`);
            }
          }
          for (const c of contracts) {
            if (!contractNames.has(c)) errors.push(`${rel}: contract "${c}" not found in project/contracts/`);
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

async function validatePlugin(name, registry) {
  const errors = [];
  const pluginDir = join(ROOT, 'plugins', name);

  const meta = await readMeta(pluginDir, 'plugin', registry, errors);
  if (!meta) return errors;

  await checkToolPlugins(pluginDir, name, errors);

  // --- What the payload actually delivers, by content kind ---
  const actual = {};
  for (const file of await ls(pluginDir)) {
    const ext = Object.keys(CONTENT_KINDS).find(e => file.endsWith(e));
    if (!ext) continue;
    const kind = CONTENT_KINDS[ext];
    const stem = file.slice(0, -ext.length);

    if (ext === '.skill.md') {
      let content;
      try {
        content = await readFile(join(pluginDir, file), 'utf-8');
      } catch (e) {
        errors.push(`${file}: cannot read — ${e.message}`);
        continue;
      }
      if (!content.trim()) errors.push(`${file}: skill is empty`);
      (actual[kind] ??= []).push(stem);
      continue;
    }

    const obj = await parseContentFile(join(pluginDir, file), file, errors);
    if (!obj) continue;
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
const SECTIONS = [['templates', validateTemplate], ['plugins', validatePlugin]];

/** Package name -> published version, so dependencies resolve against the registry. */
const registry = new Map();
for (const [dir] of SECTIONS) {
  for (const name of await ls(join(ROOT, dir))) {
    try {
      const meta = JSON.parse(await readFile(join(ROOT, dir, name, 'metadata.json'), 'utf-8'));
      if (meta.name) registry.set(meta.name, { version: meta.version });
    } catch { /* the package's own validation reports it below */ }
  }
}

let totalErrors = 0;

for (const [dir, validate] of SECTIONS) {
  for (const name of await ls(join(ROOT, dir))) {
    const errors = await validate(name, registry);
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
