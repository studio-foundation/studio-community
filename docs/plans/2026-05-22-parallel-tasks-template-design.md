# Design — template `parallel-tasks`

## Contexte

Nouveau template communautaire Studio illustrant le pattern **fan-out parallèle + consolidation** : un agent planifie N tâches indépendantes, N workers les exécutent en parallèle, un consolidateur agrège les résultats.

Inspiré de `meal-planner-weekly` dans little-chef-by-studio, mais générique et sans dépendances externes (pas de `studio_run`, pas de DB).

Les templates existants (`content`, `software`, `software-full`, `document-analysis`) ne couvrent pas ce pattern.

---

## Pipeline

```
task-selection → [task-1 ‖ task-2 ‖ task-3 ‖ task-4 ‖ task-5] → consolidation
```

### Stage 1 — `task-selection`

- **Agent :** `planner`
- **Contract :** `task-selection`
- **Contexte :** `input`
- **Rôle :** décompose l'input utilisateur en exactement 5 tâches distinctes avec un `id`, un `name` et un `brief` pour chaque

### Groupe `task-execution` (parallèle)

- `mode: parallel`, `max_iterations: 1`, `on_failure: collect-all`
- 5 stages : `task-1` à `task-5`, tous identiques
- **Agent :** `worker` (même agent pour tous)
- **Contract :** `task-output`
- **Contexte :** `previous_stage_output` + `stage_name`
- `stage_name` permet au worker de savoir quelle tâche lui est assignée dans le résultat de la sélection
- `on_failure: collect-all` — un worker qui échoue ne bloque pas les autres

### Stage final — `consolidation`

- **Agent :** `consolidator`
- **Contract :** `consolidated-output`
- **Contexte :** `input` + `all_stage_outputs`
- **Rôle :** agrège les 5 résultats en un output unifié

---

## Agents

| Agent | Rôle | System prompt (intention) |
|---|---|---|
| `planner` | Décompose l'input en 5 tâches | Générique — à adapter au domaine |
| `worker` | Exécute une tâche assignée | Générique — identifie sa tâche via `stage_name` |
| `consolidator` | Agrège les 5 outputs | Produit un résumé cohérent de l'ensemble |

Les system prompts sont intentionnellement génériques avec des commentaires guidant l'utilisateur pour les adapter à son domaine.

---

## Contracts

### `task-selection.contract.yaml`
```
required_fields: [tasks]
tasks: array de 5 objets { id (string), name (string), brief (string) }
```

### `task-output.contract.yaml`
```
required_fields: [task_id, result, summary]
```

### `consolidated-output.contract.yaml`
```
required_fields: [results, summary]
results: array
summary: string
```

---

## Structure fichiers

```
templates/parallel-tasks/
├── metadata.json
└── project/
    ├── pipelines/
    │   └── parallel-tasks.pipeline.yaml
    ├── agents/
    │   ├── planner.agent.yaml
    │   ├── worker.agent.yaml
    │   └── consolidator.agent.yaml
    └── contracts/
        ├── task-selection.contract.yaml
        ├── task-output.contract.yaml
        └── consolidated-output.contract.yaml
```

---

## metadata.json

```json
{
  "name": "parallel-tasks",
  "version": "1.0.0",
  "description": "Fan-out parallel task execution with consolidation",
  "author": "studio-core",
  "license": "MIT",
  "tags": ["parallel", "fan-out", "orchestration"],
  "type": "template",
  "studio_version": ">=0.2.0"
}
```

---

## Décisions de design

- **5 stages statiques** — Studio ne supporte pas les groupes parallèles dynamiques. 5 est le défaut documenté ; les utilisateurs peuvent en retirer ou en ajouter manuellement.
- **`on_failure: collect-all`** — un worker défaillant ne bloque pas le pipeline, le consolidateur reçoit les outputs disponibles.
- **Agents inline** (pas `studio_run`) — reste autonome, pas de dépendance à un second pipeline.
- **Pas de tools requis** — le template est minimal. Les utilisateurs ajoutent `search`, `repo_manager`, etc. selon leur domaine.
