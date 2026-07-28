# CLAUDE.md — studio-community

studio-community est le registre communautaire de Studio — le [wordpress.org/plugins](https://wordpress.org/plugins/) de Studio. Les utilisateurs y publient et installent des templates (démarrer un projet) et des plugins (ajouter du contenu à un projet existant).

Ce repo **ne contient pas de code Studio**. C'est un repo de contenu : des fichiers YAML, JSON et Markdown organisés par type de package.

## Structure du repo

```
studio-community/
├── index.json              ← index auto-généré (NE PAS éditer manuellement)
├── templates/
│   └── <name>/
│       ├── metadata.json
│       └── project/        ← payload (pipelines/, agents/, contracts/, tools/, inputs/)
├── plugins/
│   └── <name>/
│       ├── metadata.json
│       └── <name>.tool.yaml    ← payload : un ou plusieurs fichiers de contenu
├── scripts/
│   ├── generate-index.mjs  ← régénère index.json depuis tous les metadata.json
│   ├── validate-index.mjs  ← vérifie que chaque entrée d'index a un `source` résolvable
│   └── validate-packages.mjs  ← valide templates et plugins (metadata, YAML, refs, provides)
└── .github/workflows/
    ├── generate-index.yml  ← CI : régénère index.json sur merge si metadata.json changé
    ├── validate-index.yml  ← CI : valide les `source` de index.json sur les PRs
    └── validate-packages.yml  ← CI : valide templates et plugins sur les PRs
```

## Types de packages

Deux types, définis par la sémantique d'installation :

| | `template` | `plugin` |
|---|---|---|
| Cible | pas encore de `.studio/` | `.studio/` existant |
| Verbe | `studio init --template X` | `studio plugin add X` |
| Cardinalité | un par projet, à la création | plusieurs, n'importe quand |
| Payload | répertoire `project/` | fichiers de contenu |

Les anciens types (`tool`, `pipeline`, `integration`, `agent`, `skill`) ne sont plus des types de
package : ce sont des **kinds de contenu** transportés par un plugin. Un package mono-fichier est
un plugin dont le payload est un seul fichier.

Chaque fichier du payload est dispatché selon son extension :

| Extension | Kind | Installé dans |
|---|---|---|
| `.tool.yaml` | `tools` | `.studio/tools/` |
| `.agent.yaml` | `agents` | `.studio/agents/` |
| `.pipeline.yaml` | `pipelines` | `.studio/pipelines/` |
| `.integration.yaml` | `integrations` | `.studio/integrations/` |
| `.contract.yaml` | `contracts` | `.studio/contracts/` |
| `.skill.md` | `skills` | `.studio/skills/` |

## Format metadata.json

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
  "studio_version": ">=0.2.0",
  "requires_binaries": ["nutrition-api"]
}
```

**Champs requis :** `name`, `version`, `description`, `author`, `license`, `type`.
**Requis pour un plugin :** `provides`.
**Optionnels :** `tags`, `studio_version`, `requires_binaries`.

`provides` liste, par kind de contenu, les **noms référençables** — le champ `name` du YAML
(donc `repo_manager`, pas `repo-manager`), ou le nom de fichier sans extension pour un skill.
C'est ce qui garde la recherche granulaire : « trouve-moi un tool git » matche le plugin qui le
fournit. Le CI vérifie que le payload livre exactement ce qui est déclaré — ni plus, ni moins.

## Commandes

```bash
# Régénérer index.json localement (après avoir ajouté/modifié un package)
node scripts/generate-index.mjs

# Valider tous les templates et plugins
node scripts/validate-packages.mjs

# Vérifier que chaque entrée de index.json pointe sur un payload existant
node scripts/validate-index.mjs

# Valider un package avant de soumettre
studio validate tool plugins/my-plugin/my-plugin.tool.yaml
studio validate integration plugins/my-integration/my-integration.integration.yaml
```

## Workflow de contribution

### Ajouter un package

1. Créer le répertoire `plugins/<package-name>/` (ou `templates/<package-name>/`)
2. Ajouter `metadata.json` + payload (fichiers de contenu, ou répertoire `project/` pour un template)
3. Déclarer `provides` dans `metadata.json` pour un plugin
4. Valider localement : `node scripts/validate-packages.mjs`
5. Ouvrir une PR avec le titre : `[type] package-name vX.Y.Z`
   - Exemple : `[plugin] nutrition-tools v1.0.0`

### index.json

**Ne jamais éditer `index.json` manuellement.** Il est :
- Régénéré localement via `node scripts/generate-index.mjs`
- Régénéré automatiquement par CI sur merge si un `metadata.json` a changé

Chaque entrée porte un `source` explicite — le répertoire réellement parcouru :

```json
"source": { "type": "local", "path": "plugins/studio" }
```

Le CLI résout les téléchargements via `source`, jamais en concaténant `name`. Un répertoire qui
diverge du `name` déclaré est donc licite (`plugins/studio` fournit le package `studio-run`).

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

2. **Titre de PR obligatoire :** `[type] package-name vX.Y.Z` où `type` est `template` ou `plugin` — le CI et la gouvernance dépendent de ce format.

3. **Format tool dans les agent YAML :** tiret (`repo_manager-write_file`). Dans les contract YAML (`required_tools`) : point (`repo_manager.write_file`). Le engine transforme.

4. **Templates = répertoire `project/`**, pas un fichier unique. La structure interne doit suivre la structure `.studio/` standard : `pipelines/`, `agents/`, `contracts/`, `tools/`, `inputs/`.

5. **`studio_version`** — utiliser le format `>=X.Y.Z` pour la compatibilité minimale.

6. **`provides` doit matcher le payload à l'octet près** — un fichier de contenu non déclaré fait
   échouer le CI, tout comme un nom déclaré sans fichier correspondant.

## CI

| Workflow | Déclencheur | Rôle |
|----------|-------------|------|
| `generate-index.yml` | push sur `main` si `metadata.json` changé | Régénère `index.json` |
| `validate-index.yml` | PR vers `main` | Vérifie que chaque entrée de `index.json` a un `source` résolvable |
| `validate-packages.yml` | PR vers `main` si `templates/**` ou `plugins/**` changé | Valide metadata, syntaxe YAML, refs croisées, et `provides` |

La validation de **template** couvre :
- **metadata.json** — champs requis (`name`, `version`, `description`, `author`, `license`, `type`)
- **Syntaxe YAML** — tous les fichiers `.yaml` dans `project/`
- **Pipelines** — `stages` array requis ; agents et contracts référencés doivent exister dans `project/`
- **Agents** — tools référencés doivent être des builtins (`repo_manager-*`, `shell-*`, `search-*`, `patch-*`, `git-*`) ou définis dans `project/tools/`
- **Contracts** — seuls les champs implémentés par le kernel sont acceptés ; un champ inconnu (`field_constraints`, `post_validation.constraints`) est du config-théâtre et fait échouer le CI
- **Skills** — contenu non vide

La validation de **plugin** couvre :
- **metadata.json** — mêmes champs requis, `type: "plugin"`
- **Syntaxe YAML** — tous les fichiers de contenu du payload
- **`provides`** — chaque nom déclaré existe dans le payload, et chaque fichier du payload est déclaré
- **Contracts** — même contrôle des champs supportés que pour un template
- **Skills** — contenu non vide
