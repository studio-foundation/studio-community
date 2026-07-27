# studio-community

The community registry for [Studio](https://github.com/studio-foundation/studio). It holds shareable packages — `template` to start a project, `plugin` to add content to an existing one — that the Studio CLI can install into a project's `.studio/` directory.

The CLI side of this registry is wired and working: install, publish, search, update, audit, and sync all run against this repo. The registry content itself is young. Every package here today is first-party, authored alongside Studio. There is no external adoption yet. Contributions are open and the publish flow is built, but nobody outside the core has published a package so far.

---

## Current state

There are two package types, separated by install semantics:

| | `template` | `plugin` |
|---|---|---|
| Target | no `.studio/` yet | an existing `.studio/` |
| Verb | `studio init --template X` | `studio plugin add X` |
| Cardinality | one per project, at creation | many, at any time |
| Payload | a `project/` directory | one or more content files |
| Published today | 5 | 18 |

A plugin's payload is dispatched file by file, by extension:

| Extension | Content kind | Installed into | Published today |
|---|---|---|---|
| `.tool.yaml` | `tools` | `.studio/tools/` | 5 |
| `.agent.yaml` | `agents` | `.studio/agents/` | 8 |
| `.integration.yaml` | `integrations` | `.studio/integrations/` | 3 |
| `.skill.md` | `skills` | `.studio/skills/` | 2 |
| `.pipeline.yaml` | `pipelines` | `.studio/pipelines/` | 0 |
| `.contract.yaml` | `contracts` | `.studio/contracts/` | 0 |

`tool`, `agent`, `integration`, `skill`, and `pipeline` used to be package types of their own. They are content kinds now — things a plugin delivers, referenced by name from inside YAML (`agent: coder`, `tools: [git-commit]`). A single-file package is simply a plugin whose payload is one file.

`downloads` is tracked per package but is `0` across the board. The registry is new, so `browse` (which orders by download count) currently returns packages in a flat order.

---

## Install a package

Install by name. Pin a version with `name@version`.

```bash
studio registry install git
studio registry install linear
studio registry install code-conventions
studio registry install software           # a template
studio registry install git@1.0.0          # pin a version
```

There are no package scopes. Names are flat (`linear`, not `@studio/integration-linear`). Installing a template writes it under `.studio/projects/<name>/`. Installing a plugin dispatches each payload file to the `.studio/` subdirectory matching its content kind.

If a package executes shell commands (`execute.type: shell`), the installer detects it and asks for confirmation before writing the file. If a package declares `requires_binaries`, the installer warns when a binary is missing from `PATH`. Required dependencies are installed automatically; recommended ones are prompted.

## Publish a package

`studio registry publish <path>` validates the package, forks this repo, pushes a branch, and opens a pull request titled `[type] name vX.Y.Z`. `<path>` points at a file inside the package directory; the command reads the `metadata.json` sitting next to it.

```bash
studio registry publish plugins/my-plugin/my-plugin.tool.yaml --dry-run   # validate only
studio registry publish plugins/my-plugin/my-plugin.tool.yaml             # opens a PR
```

`--dry-run` checks the required metadata fields and stops before touching GitHub. The non-dry run needs `gh` installed and authenticated.

---

## Repository structure

```
studio-community/
├── index.json          ← package index (auto-generated, do not edit manually)
├── templates/
├── plugins/
├── scripts/
│   ├── generate-index.mjs
│   ├── validate-index.mjs
│   └── validate-packages.mjs
└── .github/workflows/
```

A plugin lives in its own subdirectory: a `metadata.json` plus its content files.

```
plugins/git/
├── metadata.json     ← name, version, author, tags, type, provides
└── git.tool.yaml     ← the payload
```

A template's payload is a `project/` directory instead:

```
templates/software/
├── metadata.json
└── project/
    ├── pipelines/
    ├── agents/
    ├── contracts/
    ├── tools/
    └── inputs/
```

---

## metadata.json format

```json
{
  "name": "nutrition-tools",
  "version": "1.0.0",
  "description": "Nutritional analysis and allergen checking tools",
  "author": "your-github-username",
  "license": "MIT",
  "tags": ["cuisine", "nutrition", "health"],
  "type": "plugin",
  "provides": {
    "tools": ["nutrition"],
    "skills": ["allergen-rules"]
  },
  "studio_version": ">=0.11.2",
  "requires_binaries": ["nutrition-api"]
}
```

Required fields: `name`, `version`, `description`, `author`, `license`, `type`. A plugin also declares `provides`.
Optional: `tags`, `studio_version`, `requires_binaries`.

`provides` lists, per content kind, the names the package makes referenceable — the `name` field of the YAML file (so `repo_manager`, not the directory name `repo-manager`), or the filename stem for a skill. Search stays granular through it: "find me a git tool" matches the plugin that provides it. CI asserts the payload delivers exactly what is declared, no more and no less.

`studio_version` is enforced: `studio registry install` refuses a package whose range excludes the running CLI. Every package here declares `>=0.11.2` — the floor at which the CLI resolves downloads through the index `source` and dispatches a plugin payload by content kind. An older CLI cannot install what this repo publishes today, so the range says so instead of letting the install fail halfway.

---

## Contributing a package

You can publish through the CLI (which opens the PR for you) or by hand.

### Via the CLI

```bash
studio registry publish plugins/<name>/<file>            # opens a PR
studio registry publish plugins/<name>/<file> --dry-run  # validate first
```

### By hand

1. Fork this repo.
2. Create your package directory, for example `plugins/my-plugin/` with a `metadata.json` and a `my-plugin.tool.yaml`.
3. Declare what it delivers in `provides`.
4. Validate locally with `node scripts/validate-packages.mjs` (or `npm run validate`). `studio registry publish <path> --dry-run` checks the metadata.
5. Open a pull request titled `[type] package-name vX.Y.Z`, for example `[plugin] nutrition-tools v1.0.0`.

The PR title format matters: CI and governance keep to it.

`index.json` is regenerated automatically on merge (and locally with `node scripts/generate-index.mjs`). Do not edit it by hand.

Every index entry carries an explicit `source` — the directory the package was read from:

```json
"source": { "type": "local", "path": "plugins/studio" }
```

The CLI resolves downloads through `source`, so a package directory may differ from the declared `name` (`plugins/studio` holds the package `studio-run`). `node scripts/validate-index.mjs` checks that every entry still resolves.

To update an existing package, bump `version` in its `metadata.json`. That is the only field to change for a release.

---

## Governance

- All packages must be open source (`license` is required).
- No review gate. Publishing is open.
- No paid packages. This registry is a common good.
- Packages with `execute.type: shell` are surfaced to the user before install, with the commands shown for confirmation.
- To report a malicious package, open an issue with the `[report]` prefix.

---

## Security

Packages that execute shell commands (`execute.type: shell` in `.tool.yaml` or `.integration.yaml`) are detected at install time. The CLI shows the file and asks for explicit confirmation before writing it.

Each installed package is checksummed (SHA256) in `.studio/registry.lock.json`. Run `studio registry audit` to verify that installed files still match their recorded checksums.

---

## Lockfile

Studio maintains `.studio/registry.lock.json` in your project to track installed packages:

```json
{
  "installed": {
    "git": {
      "version": "1.0.0",
      "type": "plugin",
      "installed_at": "2026-02-28",
      "sha256": "…",
      "required_by": []
    }
  }
}
```

Commit this file. Do not commit the installed packages themselves; they are fetched on demand.

---

## Studio CLI reference

```bash
studio registry search <query>            # Search packages
studio registry search <query> --type plugin
studio registry browse                    # List packages by download count
studio registry install <name>            # Install a package
studio registry install <name>@<version>  # Install a specific version
studio registry install <name> --force    # Reinstall
studio registry update <name>             # Update an installed package
studio registry outdated                  # List packages with updates available
studio registry remove <name>             # Uninstall a package
studio registry publish <path>            # Validate, fork, and open a PR
studio registry publish <path> --dry-run  # Validate only
studio registry audit                     # Verify SHA256 integrity of installed packages
studio registry sync                      # Force refresh the index cache
studio plugin add <name>                  # Install a plugin into an existing .studio/
studio init --template <name>             # Start a project from a template
```

---

## Related

- [Studio](https://github.com/studio-foundation/studio): the kernel and CLI
