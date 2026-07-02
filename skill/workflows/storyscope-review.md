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
5. The issue ledger (`storyscope-reports/issue-ledger.json`) is updated: new issues get stable ids; recurring issues keep their id and history.

### 2. Review Action Plan

1. Present the Executive Summary to the user, both buckets — plus the Ledger Verdicts so the user sees what previous rounds already fixed.
2. Discuss the prioritized action items. The user may accept all, reject some, or modify the plan.
3. If the user modified the plan, capture their final REVISE PROSE list as directive objects — `{ scene_id, directive, op?, merge_with?, after_scene?, issue_id? }` — for the `directives` argument in step 3. Anything rejected goes in `exclude_scenes`.

### 3. Apply Prose Revisions

1. Invoke `apply_storyscope_revisions`. Pass `directives` (the user-approved/edited plan) and/or `exclude_scenes`; omit `directives` to let the tool auto-plan.
2. The planner assigns each critique issue to EXACTLY ONE operation (never the same fix to two scenes — that manufactures repetition):
   - `rewrite` — full-scene revision (pacing, structure, POV, emotional beats), with neighbor-scene boundary context.
   - `line_edit` — surgical anchored find/replace edits for local fixes; preserves polished prose by construction. Escalates to `rewrite` if anchors fail or verification fails.
   - `cut_scene` — removes a redundant scene from the new version (the old version keeps it).
   - `merge_scenes` — fuses two scenes into one.
   - `add_scene` — drafts a genuinely new scene between two existing ones.
   - Items no operation can execute are reported as UNACTIONABLE with the reason — never faked.
3. Every change is (a) checked against the World Bible's hard rules, (b) VERIFIED against its own directive by an independent auditor (PASS/PARTIAL/FAIL with cited evidence; FAIL triggers one retry with the auditor's feedback), (c) re-scored on the neurochemical diagnostic, and (d) logged with deterministic diff stats (+/- lines, % changed).
4. The run ends with a COVERAGE REPORT — every critique item → op → scene → verified status — in both the tool output and the changelog (`storyscope-reports/<version>/changelog.md`), and updates the issue ledger.

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
