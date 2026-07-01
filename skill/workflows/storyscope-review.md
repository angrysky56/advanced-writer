# Workflow: StoryScope Final Review

**Purpose:** Run the ultimate structural audit on a completed manuscript using 10 parallel AI specialists (+ the Actors' Table), then apply BOTH halves of its action plan using `storyscope_final_review`, `apply_storyscope_revisions`, and `reconcile_storyscope_canon`.

## Prerequisites

- A completed manuscript (or substantial act).

## Steps

### 1. Launch StoryScope Audit

1. Invoke the `storyscope_final_review` MCP tool on the manuscript.
2. The tool dispatches 10 parallel specialist lenses:
   - Plot, Agents, Perspective, Temporal Structure, Setting, Style, Events, Revelation, Situatedness, Social Networks.
   - Plus the Actors' Table (conditional, additive): the cast grades its own scene-by-scene emotional performance against the Director's Notes.
3. The tool waits for all reports and synthesizes them into an Executive Summary with two buckets: (A) REVISE PROSE — genuine craft weaknesses, and (B) UPDATE CANON — divergences from the World Bible/Architecture Brief/character records that are as good or better and should be reconciled instead of reverted.

### 2. Review Action Plan

1. Present the Executive Summary to the user, both buckets.
2. Discuss the prioritized action items. The user may choose to accept all, reject some, or modify the plan.
3. If the user modified the plan, capture their final REVISE PROSE list as `{ scene_id, directive }` pairs — this becomes the `directives` argument in step 3. Anything rejected goes in `exclude_scenes`.

### 3. Apply Prose Revisions

1. Invoke `apply_storyscope_revisions`. Pass `directives` (the user-approved/edited plan from step 2) and/or `exclude_scenes` when the user modified anything; omit `directives` to let the tool auto-plan from the Executive Summary instead.
2. The tool carries every scene forward, non-destructively (auto-incrementing v1→v2→v3…), and rewrites only the flagged scenes — each rewrite is reminded of the craft/anti-pattern directives, re-checked against the World Bible's hard rules/continuity, and re-scored on the neurochemical/pathology diagnostic.
3. The tool appends a changelog entry (`storyscope-reports/<version>/changelog.md`) detailing the specific alterations made, per scene.

### 4. Apply Canon Reconciliation

1. Invoke `reconcile_storyscope_canon` on the same reviewed version (bucket B).
2. The tool updates the World Bible, Architecture Brief, and/or character graph metadata to match the manuscript's improvements — backing up the previous documents first — and appends its own changelog entry to the same log.
3. This step never touches scene text; it only reconciles planning documents to what the manuscript already does well.

## Essential Principles Applied

- **All Principles**: The 10 specialists are explicitly designed to enforce all Advanced Writer essential principles simultaneously.
