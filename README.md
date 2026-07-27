# studio-community

The community registry for [Studio](https://github.com/studio-foundation/studio). It holds shareable packages (tools, templates, pipelines, integrations, agents, plugins, skills) that the Studio CLI can install into a project's `.studio/` directory.

The CLI side of this registry is wired and working: install, publish, search, update, audit, and sync all run against this repo. The registry content itself is young. Every package here today is first-party, authored alongside Studio. There is no external adoption yet. Contributions are open and the publish flow is built, but nobody outside the core has published a package so far.

---

## Current state

What is actually published in this repo today:

| Type | Payload | Installed into | Published today |
|------|---------|----------------|-----------------|
| `tool` | `.tool.yaml` | `.studio/tools/` | 5 |
| `template` | `project/` directory | `.studio/projects/` | 5 |
| `integration` | `.integration.yaml` | `.studio/integrations/` | 3 |
| `agent` | `.agent.yaml` | `.studio/agents/` | 5 |
| `skill` | `.skill.md` | `.studio/skills/` | 2 |
| `pipeline` | `.pipeline.yaml` | `.studio/pipelines/` | 0 (supported, none published) |
| `plugin` | directory | `.studio/plugins/` | 0 (supported, none published) |

`pipeline` and `plugin` are valid package types. The CLI installs them and the index generator handles them, but no package of either type exists yet. Their directories are absent until a first package lands. Do not read the rows above as a populated catalog for those two types.

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

There are no package scopes. Names are flat (`linear`, not `@studio/integration-linear`). Installing a template writes it under `.studio/projects/<name>/`.

If a package executes shell commands (`execute.type: shell`), the installer detects it and asks for confirmation before writing the file. If a package declares `requires_binaries`, the installer warns when a binary is missing from `PATH`. Required dependencies are installed automatically; recommended ones are prompted.

## Publish a package

`studio registry publish <path>` validates the package, forks this repo, pushes a branch, and opens a pull request titled `[type] name vX.Y.Z`. `<path>` points at a file inside the package directory; the command reads the `metadata.json` sitting next to it.

```bash
studio registry publish tools/my-tool/my-tool.tool.yaml --dry-run   # validate only
studio registry publish tools/my-tool/my-tool.tool.yaml             # opens a PR
```

`--dry-run` checks the required metadata fields and stops before touching GitHub. The non-dry run needs `gh` installed and authenticated.

---

## Repository structure

```
studio-community/
├── index.json          ← package index (auto-generated, do not edit manually)
├── tools/
├── templates/
├── integrations/
├── agents/
├── skills/
├── scripts/
│   ├── generate-index.mjs
│   └── validate-templates.mjs
└── .github/workflows/
```

Each single-file package lives in its own subdirectory with two files:

```
tools/git/
├── metadata.json     ← name, version, author, tags, type
└── git.tool.yaml     ← the package payload
```

For `template` and `plugin` types, the payload is a directory named `project/` instead of a single file:

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
  "type": "tool",
  "studio_version": ">=0.2.0",
  "requires_binaries": ["nutrition-api"]
}
```

Required fields: `name`, `version`, `description`, `author`, `license`, `type`.
Optional: `tags`, `studio_version`, `requires_binaries`.

A note on `studio_version`: every package in this repo currently declares `>=0.2.0`. The kernel is at 0.4.x, so that constraint is satisfied, but it is also loose and inconsistent across packages. The field is declarative only right now: the installer records it but does not enforce it, so a mismatch will not block an install. These constraints still need a pass to reflect the features each package actually depends on.

---

## Contributing a package

You can publish through the CLI (which opens the PR for you) or by hand.

### Via the CLI

```bash
studio registry publish <type>s/<name>/<file>            # opens a PR
studio registry publish <type>s/<name>/<file> --dry-run  # validate first
```

### By hand

1. Fork this repo.
2. Create your package directory, for example `tools/my-tool/` with a `metadata.json` and a `my-tool.tool.yaml`.
3. Validate locally. For templates, run `node scripts/validate-templates.mjs` (or `npm run validate`). For any package, `studio registry publish <path> --dry-run` checks the metadata.
4. Open a pull request titled `[type] package-name vX.Y.Z`, for example `[tool] nutrition-tools v1.0.0`.

The PR title format matters: CI and governance keep to it.

`index.json` is regenerated automatically on merge (and locally with `node scripts/generate-index.mjs`). Do not edit it by hand.

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
      "type": "tool",
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
studio registry search <query> --type tool
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
```

---

## Related

- [Studio](https://github.com/studio-foundation/studio): the kernel and CLI
