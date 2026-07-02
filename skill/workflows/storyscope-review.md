# Workflow: StoryScope Final Review

**Purpose:** Run the ultimate structural audit on a completed manuscript using 10 parallel AI specialists (+ the Actors' Table), then apply BOTH halves of its action plan using `storyscope_final_review`, `apply_storyscope_revisions`, and `reconcile_storyscope_canon`. The loop is designed to CONVERGE: a persistent cross-version issue ledger tracks every critique item until it is verifiably resolved.

## Prerequisites

- A completed manuscript (or substantial act).

## Steps

### 1. Launch StoryScope Audit

1. Invoke the `storyscope_final_review` MCP tool on the manuscript.
2. The tool dispatches 10 parallel specialist lenses (Plot, Agents, Perspective, Temporal Structure, Setting, Style, Events, Revelation, Situatedness, Social Networks) plus the Actors' Table. The lenses read blind (fresh eyes).
3. The SYNTHESIZER additionally receives the prior round's context — the cross-version issue ledger, the previous Executive Summary, and the changelog of what apply actually did — and must give a LEDGER VERDICT (RESOLVED / IMPROVED / PERSISTS) for every open issue. Convergence rules forbid silent flip-flops: reversing a previously accepted decision requires an explicit "REVERSAL:" marker with justification.
4. The Executive Summary is run through a self-consistency check (a To-Do item must never undo a listed Strength) and repaired if contradictions are found.
   4b. The synthesizer also receives the per-scene SCENE DIAGNOSTICS (neurochemical scores + pathology flags shown in the Studio Inspector) and must either fold each flagged pathology into bucket A or explicitly dismiss it as intentional — standing warnings never go unaddressed in both directions. The apply planner receives the same digest, and every re-score logs a measurable delta (scores before→after, pathologies cleared/persisting/new).
5. The issue ledger (`storyscope-reports/issue-ledger.json`) is updated: new issues get stable ids; recurring issues keep their id and history.

### 2. Review Action Plan

1. The review's final artifact is the compiled revision plan: `storyscope-reports/<version>/revision-plan.json` — the concrete list of operations (op, scene, directive, verbatim lens specifics, unactionable items) that apply will execute. Present the Executive Summary AND this plan to the user; the plan is what they approve, and it is directly editable (in the Studio or by hand).
2. The user may accept the plan as-is (just run apply — it executes the saved plan), edit the JSON file directly, or dictate changes: captured as directive objects `{ scene_id, directive, op?, merge_with?, after_scene?, issue_id?, specifics? }` passed via `directives` (which overrides the saved plan). Rejected scenes go in `exclude_scenes`.

### 3. Apply Prose Revisions

1. Invoke `apply_storyscope_revisions`. By default it executes the saved `revision-plan.json` (what the user just reviewed); pass `directives` to override with a dictated plan, and/or `exclude_scenes` for rejections. If no plan file exists it auto-plans (and saves the plan it used).
2. The planner assigns each critique issue to EXACTLY ONE operation (never the same fix to two scenes — that manufactures repetition):
   - `rewrite` — full-scene revision (pacing, structure, POV, emotional beats), with neighbor-scene boundary context.
   - `line_edit` — surgical anchored find/replace edits for local fixes; preserves polished prose by construction. Escalates to `rewrite` if anchors fail or verification fails.
   - `global_line_edit` — the same surgical directive applied across every scene, for manuscript-wide passes (verb-tense drag, thematic over-explication, stylistic crutches). These are never "needs a human pass."
   - `cut_scene` — removes a redundant scene from the new version (the old version keeps it).
   - `merge_scenes` — fuses two scenes into one.
   - `add_scene` — drafts a genuinely new scene between two existing ones.
   - Items no operation can execute are reported as UNACTIONABLE with the reason — never faked.
3. Every change is (a) checked against the World Bible's hard rules, (b) VERIFIED against its own directive by an independent auditor (PASS/PARTIAL/FAIL with cited evidence; FAIL triggers one retry with the auditor's feedback), (c) re-scored on the neurochemical diagnostic, and (d) logged with deterministic diff stats (+/- lines, % changed).
4. PROSE PRESERVATION: a rewrite that sheds more of a scene's words than its directive authorizes (>30%, or >85% when the directive explicitly cuts) is REVERTED — the original scene ships unchanged and the item is marked failed, never silently gutted. Unresolved continuity contradictions from the gate are surfaced loudly in the output and auto-filed as open `continuity-<scene>` ledger issues.
5. CONVERGENCE: the planner sees the issue ledger and the previous round's changelog — it may not silently undo what a prior round deliberately did (explicit "REVERSAL:" required), reuses ledger issue ids, and passes verbatim lens-report `specifics` (actors_table DEMANDs, style citations) to the executor so edits carry the specialists' depth, not just a one-line summary.
6. The run ends with a COVERAGE REPORT — every critique item → op → scene → verified status — in both the tool output and the changelog (`storyscope-reports/<version>/changelog.md`), and updates the issue ledger.

### 4. Apply Canon Reconciliation

1. Invoke `reconcile_storyscope_canon` on the same reviewed version (bucket B).
2. The tool updates the World Bible, Architecture Brief, and/or character graph metadata to match the manuscript's improvements — backing up the previous documents first — and appends its own changelog entry to the same log.
3. This step never touches scene text; it only reconciles planning documents to what the manuscript already does well.

### 5. Know When to Stop

- Check `issue-ledger.json` after each round. The loop has converged when open issues are RESOLVED or NEEDS-HUMAN and a fresh review produces only new low-priority items (or REVERSAL-marked items, which signal reviewer taste oscillation, not manuscript defects).
- Do not keep iterating past convergence: full rewrites always carry regression risk on polished prose.

## Essential Principles Applied

- **All Principles**: The 10 specialists are explicitly designed to enforce all Advanced Writer essential principles simultaneously.
- **Convergence over churn**: verify directives, track issues across versions, touch only what is flagged, and stop when the ledger is clean.
