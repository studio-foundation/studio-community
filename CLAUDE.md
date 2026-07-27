# CLAUDE.md — studio-community

studio-community est le registre communautaire de Studio — le [wordpress.org/plugins](https://wordpress.org/plugins/) de Studio. Les utilisateurs y publient et installent des tools, templates, pipelines, intégrations, agents, plugins et skills.

Ce repo **ne contient pas de code Studio**. C'est un repo de contenu : des fichiers YAML, JSON et Markdown organisés par type de package.

## Structure du repo

```
studio-community/
├── index.json              ← index auto-généré (NE PAS éditer manuellement)
├── tools/
│   └── <name>/
│       ├── metadata.json
│       └── <name>.tool.yaml
├── templates/
│   └── <name>/
│       ├── metadata.json
│       └── project/        ← payload directory (pipelines/, agents/, contracts/, tools/, inputs/)
├── pipelines/
├── integrations/
├── agents/
├── plugins/
├── skills/
├── scripts/
│   ├── generate-index.mjs  ← régénère index.json depuis tous les metadata.json
│   ├── validate-index.mjs  ← vérifie que chaque entrée d'index a un `source` résolvable
│   └── validate-templates.mjs  ← valide les templates (syntaxe YAML, metadata, refs croisées)
└── .github/workflows/
    ├── generate-index.yml  ← CI : régénère index.json sur merge si metadata.json changé
    ├── validate-index.yml  ← CI : valide les `source` de index.json sur les PRs
    └── validate-templates.yml  ← CI : valide les templates modifiés sur les PRs
```

## Types de packages

| Type | Payload | Installé dans |
|------|---------|---------------|
| `tool` | `.tool.yaml` | `.studio/tools/` |
| `template` | répertoire `project/` | `.studio/` (nouveau projet) |
| `pipeline` | `.pipeline.yaml` | `.studio/pipelines/` |
| `integration` | `.integration.yaml` | `.studio/integrations/` |
| `agent` | `.agent.yaml` | `.studio/agents/` |
| `plugin` | répertoire | `.studio/plugins/` |
| `skill` | `.skill.md` | `.studio/skills/` |

Les types `template` et `plugin` ont un répertoire comme payload (pas un fichier unique).

## Format metadata.json

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

**Champs requis :** `name`, `version`, `description`, `author`, `license`, `type`.
**Optionnels :** `tags`, `studio_version`, `requires_binaries`.

## Commandes

```bash
# Régénérer index.json localement (après avoir ajouté/modifié un package)
node scripts/generate-index.mjs

# Valider les templates modifiés (ou tous si pas de diff git)
node scripts/validate-templates.mjs

# Vérifier que chaque entrée de index.json pointe sur un payload existant
node scripts/validate-index.mjs

# Valider un package avant de soumettre
studio validate tool tools/my-tool/my-tool.tool.yaml
studio validate integration integrations/my-integration/my-integration.integration.yaml
```

## Workflow de contribution

### Ajouter un package

1. Créer le répertoire `<type>/<package-name>/`
2. Ajouter `metadata.json` + payload (fichier YAML ou répertoire `project/`)
3. Valider localement avec `studio validate`
4. Ouvrir une PR avec le titre : `[type] package-name vX.Y.Z`
   - Exemple : `[tool] nutrition-tools v1.0.0`

### index.json

**Ne jamais éditer `index.json` manuellement.** Il est :
- Régénéré localement via `node scripts/generate-index.mjs`
- Régénéré automatiquement par CI sur merge si un `metadata.json` a changé

Chaque entrée porte un `source` explicite — le répertoire réellement parcouru, plus le nom du
fichier payload pour les types mono-fichier :

```json
"source": { "type": "local", "path": "tools/studio", "file": "run-pipeline.tool.yaml" }
```

Le CLI résout les téléchargements via `source`, jamais en concaténant `name`. Un répertoire ou
un nom de fichier qui diverge du `name` déclaré est donc licite.

### Mettre à jour un package

Incrémenter `version` dans `metadata.json` — c'est le seul champ à changer pour une mise à jour.

## Règles de gouvernance

- Tous les packages doivent être open source (champ `license` requis)
- Pas de gate de review — publication ouverte
- Pas de packages payants — ce registre est un bien commun
- Les packages avec `execute.type: shell` sont flaggés automatiquement (Studio affiche les commandes avant installation)

## Git Workflow — Règles obligatoires

**Tu ne push JAMAIS sur `main`. Jamais. Aucune exception.**

```bash
# 1. Branche (ou worktree pour un ticket Linear)
git checkout -b <type>/<description-courte>

# 2. Commits atomiques
git commit -m "feat(integrations): add slack integration v1.0.0"

# 3. Push + PR
git push -u origin <branch-name>
gh pr create --title "[integration] slack v1.0.0" --body "..."
```

**Tout ticket Linear = worktree en premier.** Utilise `superpowers:using-git-worktrees`.

## Gotchas

1. **Ne jamais éditer `index.json` manuellement** — il est généré depuis les `metadata.json`.

2. **Titre de PR obligatoire :** `[type] package-name vX.Y.Z` — le CI et la gouvernance dépendent de ce format.

3. **Format tool dans les agent YAML :** tiret (`repo_manager-write_file`). Dans les contract YAML (`required_tools`) : point (`repo_manager.write_file`). Le engine transforme.

4. **Templates = répertoire `project/`**, pas un fichier unique. La structure interne doit suivre la structure `.studio/` standard : `pipelines/`, `agents/`, `contracts/`, `tools/`, `inputs/`.

5. **`studio_version`** — utiliser le format `>=X.Y.Z` pour la compatibilité minimale.

## CI

| Workflow | Déclencheur | Rôle |
|----------|-------------|------|
| `generate-index.yml` | push sur `main` si `metadata.json` changé | Régénère `index.json` |
| `validate-index.yml` | PR vers `main` | Vérifie que chaque entrée de `index.json` a un `source` résolvable |
| `validate-templates.yml` | PR vers `main` si `templates/**` changé | Valide metadata, syntaxe YAML, et refs croisées des templates modifiés |

La validation de template couvre :
- **metadata.json** — champs requis (`name`, `version`, `description`, `author`, `license`, `type`)
- **Syntaxe YAML** — tous les fichiers `.yaml` dans `project/`
- **Pipelines** — `stages` array requis ; agents et contracts référencés doivent exister dans `project/`
- **Agents** — tools référencés doivent être des builtins (`repo_manager-*`, `shell-*`, `search-*`, `patch-*`, `git-*`) ou définis dans `project/tools/`
- **Skills** — contenu non vide
