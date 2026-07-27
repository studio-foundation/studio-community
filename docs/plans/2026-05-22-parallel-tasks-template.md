# parallel-tasks Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Créer le template communautaire `parallel-tasks` — fan-out de 5 agents parallèles avec étape de sélection et consolidation finale.

**Architecture:** Un pipeline en 3 temps : `task-selection` (planner) → groupe parallèle `task-execution` (5 × worker) → `consolidation`. Les agents `planner`, `worker`, `consolidator` sont créés dans `agents/` à la racine du repo (pattern existant). Le template `project/` contient uniquement le pipeline et les contracts.

**Tech Stack:** YAML (Studio pipeline, contracts), Markdown (agent system prompts), Node.js (scripts de validation existants)

---

## File Map

**Créer :**
- `agents/planner/planner.agent.yaml` — agent de décomposition en tâches
- `agents/worker/worker.agent.yaml` — agent d'exécution générique
- `agents/consolidator/consolidator.agent.yaml` — agent d'agrégation
- `templates/parallel-tasks/metadata.json` — métadonnées du template
- `templates/parallel-tasks/project/pipelines/parallel-tasks.pipeline.yaml` — pipeline principal
- `templates/parallel-tasks/project/contracts/task-selection.contract.yaml`
- `templates/parallel-tasks/project/contracts/task-output.contract.yaml`
- `templates/parallel-tasks/project/contracts/consolidated-output.contract.yaml`

**Modifier :**
- `index.json` — régénérer via script après ajout des metadata.json

---

### Task 1 : Agent `planner`

**Files:**
- Create: `agents/planner/planner.agent.yaml`

- [ ] **Step 1 : Créer l'agent**

```yaml
name: planner
system_prompt: |
  You are a task planning specialist. Your job is to decompose a user request
  into exactly 5 distinct, independent tasks that can be executed in parallel.

  RULES:
  - Always produce exactly 5 tasks — no more, no fewer.
  - Each task must be self-contained: a worker can execute it without knowing
    about the other tasks.
  - Assign a short unique id to each task (e.g. "task-1" through "task-5").
  - The brief for each task must be specific enough for a worker to act on
    without additional context.
  - Adapt the task decomposition to the domain described in the input.
```

- [ ] **Step 2 : Commit**

```bash
git add agents/planner/planner.agent.yaml
git commit -m "feat(agents): add planner agent for parallel-tasks template"
```

---

### Task 2 : Agent `worker`

**Files:**
- Create: `agents/worker/worker.agent.yaml`

- [ ] **Step 1 : Créer l'agent**

```yaml
name: worker
system_prompt: |
  You are a task execution specialist. You receive a list of planned tasks
  and your own stage name (e.g. "task-1"). Execute the task assigned to you.

  WORKFLOW:
  1. Read the `tasks` array from your context (output of the task-selection stage).
  2. Match your stage name to the task `id` field (e.g. stage "task-1" → task with id "task-1").
  3. Execute that task based on its `brief`.
  4. Return your result in the required output fields.

  RULES:
  - Only execute the task assigned to you — ignore the others.
  - If you cannot determine your assigned task, use the first unmatched task.
  - Be thorough and complete. The consolidator will aggregate your output
    with 4 other workers — quality matters.
```

- [ ] **Step 2 : Commit**

```bash
git add agents/worker/worker.agent.yaml
git commit -m "feat(agents): add worker agent for parallel-tasks template"
```

---

### Task 3 : Agent `consolidator`

**Files:**
- Create: `agents/consolidator/consolidator.agent.yaml`

- [ ] **Step 1 : Créer l'agent**

```yaml
name: consolidator
system_prompt: |
  You are an aggregation specialist. You receive the outputs of multiple parallel
  workers and consolidate them into a single coherent result.

  WORKFLOW:
  1. Read all stage outputs from your context (all_stage_outputs).
  2. Collect the `result` and `summary` from each worker stage that succeeded.
  3. Merge them into a unified `results` array and write a global `summary`.

  RULES:
  - Include all available worker outputs, even partial ones.
  - If a worker stage failed or produced no output, skip it gracefully.
  - The global summary must reflect the combined output, not just one worker.
  - Do not invent or hallucinate results — only consolidate what workers produced.
```

- [ ] **Step 2 : Commit**

```bash
git add agents/consolidator/consolidator.agent.yaml
git commit -m "feat(agents): add consolidator agent for parallel-tasks template"
```

---

### Task 4 : Contracts

**Files:**
- Create: `templates/parallel-tasks/project/contracts/task-selection.contract.yaml`
- Create: `templates/parallel-tasks/project/contracts/task-output.contract.yaml`
- Create: `templates/parallel-tasks/project/contracts/consolidated-output.contract.yaml`

- [ ] **Step 1 : Créer `task-selection.contract.yaml`**

```yaml
name: task-selection
version: 1

schema:
  required_fields:
    - tasks
  field_constraints:
    - field: tasks
      type: array
      min_items: 5
      max_items: 5
      item_fields:
        - id
        - name
        - brief
```

- [ ] **Step 2 : Créer `task-output.contract.yaml`**

```yaml
name: task-output
version: 1

schema:
  required_fields:
    - task_id
    - result
    - summary
```

- [ ] **Step 3 : Créer `consolidated-output.contract.yaml`**

```yaml
name: consolidated-output
version: 1

schema:
  required_fields:
    - results
    - summary
  field_constraints:
    - field: results
      type: array
    - field: summary
      type: string
```

- [ ] **Step 4 : Commit**

```bash
git add templates/parallel-tasks/project/contracts/
git commit -m "feat(templates): add contracts for parallel-tasks template"
```

---

### Task 5 : Pipeline

**Files:**
- Create: `templates/parallel-tasks/project/pipelines/parallel-tasks.pipeline.yaml`

- [ ] **Step 1 : Créer le pipeline**

```yaml
name: parallel-tasks
description: Decompose input into 5 parallel tasks, execute them, then consolidate
version: 1

stages:
  - name: task-selection
    kind: planning
    agent: planner
    contract: task-selection
    ralph:
      max_attempts: 3
    context:
      include:
        - input

  - group: task-execution
    mode: parallel
    max_iterations: 1
    on_failure: collect-all
    stages:
      - name: task-1
        kind: execution
        agent: worker
        contract: task-output
        ralph:
          max_attempts: 2
        context:
          include:
            - previous_stage_output
            - stage_name

      - name: task-2
        kind: execution
        agent: worker
        contract: task-output
        ralph:
          max_attempts: 2
        context:
          include:
            - previous_stage_output
            - stage_name

      - name: task-3
        kind: execution
        agent: worker
        contract: task-output
        ralph:
          max_attempts: 2
        context:
          include:
            - previous_stage_output
            - stage_name

      - name: task-4
        kind: execution
        agent: worker
        contract: task-output
        ralph:
          max_attempts: 2
        context:
          include:
            - previous_stage_output
            - stage_name

      - name: task-5
        kind: execution
        agent: worker
        contract: task-output
        ralph:
          max_attempts: 2
        context:
          include:
            - previous_stage_output
            - stage_name

  - name: consolidation
    kind: aggregation
    agent: consolidator
    contract: consolidated-output
    ralph:
      max_attempts: 2
    context:
      include:
        - input
        - all_stage_outputs
```

- [ ] **Step 2 : Commit**

```bash
git add templates/parallel-tasks/project/pipelines/parallel-tasks.pipeline.yaml
git commit -m "feat(templates): add pipeline for parallel-tasks template"
```

---

### Task 6 : metadata.json + régénération index

**Files:**
- Create: `templates/parallel-tasks/metadata.json`
- Modify: `index.json` (via script)

- [ ] **Step 1 : Créer `metadata.json`**

```json
{
  "name": "parallel-tasks",
  "version": "1.0.0",
  "description": "Fan-out parallel task execution with consolidation",
  "author": "studio-core",
  "license": "MIT",
  "tags": ["parallel", "fan-out", "orchestration"],
  "type": "template",
  "studio_version": ">=0.2.0",
  "dependencies": {
    "agents": {
      "required": ["planner", "worker", "consolidator"]
    }
  }
}
```

- [ ] **Step 2 : Régénérer `index.json`**

```bash
node scripts/generate-index.mjs
```

Expected: pas d'erreur, `index.json` mis à jour avec l'entrée `parallel-tasks`.

- [ ] **Step 3 : Valider le template**

```bash
node scripts/validate-templates.mjs
```

Expected: `✓ parallel-tasks` sans erreur.

- [ ] **Step 4 : Commit**

```bash
git add templates/parallel-tasks/metadata.json index.json
git commit -m "feat(templates): add parallel-tasks template v1.0.0"
```

---

### Task 7 : Branch + PR

- [ ] **Step 1 : Créer la branche et pusher**

```bash
git checkout -b template/parallel-tasks
git push -u origin template/parallel-tasks
```

- [ ] **Step 2 : Ouvrir la PR**

```bash
gh pr create \
  --title "[template] parallel-tasks v1.0.0" \
  --body "$(cat <<'EOF'
## Summary

- Adds `parallel-tasks` template: fan-out 5 parallel workers + consolidation
- Adds 3 new agents to the registry: `planner`, `worker`, `consolidator`
- Inspired by little-chef-by-studio `meal-planner-weekly` pattern, generalized

## Test plan

- [ ] `node scripts/validate-templates.mjs` passes
- [ ] `node scripts/generate-index.mjs` produces valid `index.json` entry
- [ ] Pipeline YAML is valid (stages, group, contracts all referenced correctly)
EOF
)"
```
