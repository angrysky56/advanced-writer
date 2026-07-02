1. create_narrative
   Build a complete narrative from a logline, premise, or raw idea. Runs an 8-step pipeline: intake -> hamartia -> framework -> characters -> architecture -> draft -> diagnostic.
2. develop_character
   Create, update, query, list, or shadow-match characters in the persistent Archetypal Database.
3. review_narrative
   Run neurochemical scoring, pathology diagnostics, and agency enforcement on existing text. Produces a structured neuro-critique report.
4. select_structure
   Interactively select the right structural framework (Truby, Dramatica, Kishōtenketsu, Fichtean) for a story based on its Designing Principle.
5. rewrite_scene
   Targeted scene rewriting with before/after neurochemical scoring. Identifies specific pathologies and produces an improved version.
6. continue_narrative
   Continue drafting a story by generating the next scene based on the previous scene, the story architecture, and user direction.
7. batch_revise_pathologies
   Scans a story's diagnostics, triggers a Character Writer's Room debate for failing scenes, and automatically rewrites them based on the characters' feedback.
8. build_world_bible
   Expands a premise into a highly detailed World Bible including Factions, Tech/Magic, Economics, and Geography, and saves it to Vector Memory.
9. expand_to_novel
   Expands a synopsis into a structured ARC (beat-sheet scaffold seeded into the graph timeline + Chroma), runs a world-model self-consistency check, and optionally auto-drafts the whole manuscript beat by beat with the per-scene continuity gate.
10. storyscope_final_review
    Runs the ultimate multi-agent StoryScope review on a finished manuscript. Dispatches 7 parallel analytical lenses (Plot, Agents, Style, etc.) and synthesizes them into an Executive Summary.
11. apply_storyscope_revisions
    Builds the next draft version from the StoryScope review. Non-destructive and auto-incrementing (v1->v2->v3...). The planner assigns each critique issue to EXACTLY ONE operation: 'rewrite' (full-scene revision), 'line_edit' (surgical anchored edits that preserve polished prose), 'cut_scene', 'merge_scenes', or 'add_scene' — so structural fixes the review asks for are actually executable. Every change is (a) checked against the World Bible's hard rules, (b) VERIFIED against its own directive (PASS/FAIL with cited evidence, retried with auditor feedback on FAIL), (c) re-scored on the neurochemical diagnostic, and (d) logged with deterministic diff stats. Ends with a COVERAGE REPORT mapping every critique item -> op -> scene -> verified status (including items it could NOT action, honestly), and updates the persistent cross-version issue ledger. Pass 'directives' to apply a human-approved/edited plan instead of the auto-generated one. This tool only revises PROSE — for canon reconciliation use reconcile_storyscope_canon.
12. reconcile_storyscope_canon
    Applies the StoryScope review's CANON RECONCILIATION findings: updates the World Bible, Architecture Brief, and character graph metadata so the planning documents catch up to the manuscript's improvements. Complements apply_storyscope_revisions, which only rewrites prose and deliberately ignores canon divergence — this tool is the other half of the review's to-do list and never touches scene text. Non-destructive: the previous World Bible / Architecture Brief are backed up before being overwritten, and every run appends to a persistent changelog.
13. find_replace
    Deterministic find & replace across a story's documents — the literal counterpart to the AI rewrite tools. Renames a term everywhere, fixes a recurring typo, or changes a single word/line, touching ONLY the matched text. Defaults to a safe PREVIEW (apply=false) that reports every match without changing files; set apply=true to write the edits (each touched file is backed up first). Supports literal, whole-word, and regex matching.
14. brainstorm_ideas
    Generate a batch of genuinely good, distinct story concepts (logline + genre + tone + hook) for brainstorming — premises with a real emotional core and a fresh angle, the kind that could become a beloved or cult-classic novel, never gimmicks or absurdist mashups. Use when the user wants fresh story ideas, riffs on a seed, or 'more like that' — discussion only; this never starts writing a story.
15. publish_story
    Package a finished story for publishing. target='amazon' (default) produces the full Amazon/KDP kit: e-book, cover image, print-ready paperback PDF, a listing sheet (description, keywords, categories), and a plain-language upload walkthrough. target='share' produces just a clean e-book + reading PDF. Non-destructive: writes to the project's publish/ folder. Use when the user wants to publish, sell, export, or ship their finished book.
16. check_job
    Check the status/result of a background job started by running a long tool with async=true. Returns running | completed | failed plus the final summary.
17. list_jobs
    List recent background jobs (most recent first) with their status.
