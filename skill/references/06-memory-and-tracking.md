# 06 — Memory, Continuity & the Character System

This documents how the engine *remembers* — the persistent systems that keep a story
coherent across scenes, drafts, and versions. Apply this understanding while writing:
the data below is real, queryable, and authoritative. Do not contradict it.

## Persistence layers

- **Neo4j graph** — the source of continuity truth: `Character` nodes, `Entity` nodes,
  relationships between them, each character's **scratchpad** and **affect_log**.
- **ChromaDB vectors** — semantic recall of past scenes and world-bible lore.
- **Workspace files** — `drafts/<version>/scene_*.md`, `diagnostics/`, `structure/`
  (architecture brief, world bible, beat sheet), `storyscope-reports/`,
  `manuscript/<version>/final_manuscript.md`.

## The cast (character system)

Characters are generated with **distinct, culturally-specific names** (the AI-default
register — Elara, Voss, Kael, etc. — is explicitly avoided). Each is seeded with a real
identity, not a placeholder:

- Jungian **archetype**, **hamartia** (tragic flaw), **shadow**, **moral weakness**,
  **individuation state**.
- **Panksepp affect profile** — all seven primary-process systems scored 1–10:
  SEEKING, FEAR, RAGE, LUST, CARE, PANIC_GRIEF, PLAY (the *drive* layer).
- **Plutchik emotional state** — all eight primary emotions scored 1–10 (the *felt*
  layer), with derived **dyads** (love = joy+trust, remorse = sadness+disgust, contempt
  = disgust+anger, etc.), **intensity tiers** (serenity→joy→ecstasy, annoyance→anger→rage),
  and **opposed-pair ambivalence** (joy↔sadness both high = genuine internal conflict).

The co-star is wired as the protagonist's **SHADOWS** edge in the graph.

## The scratchpad — a per-character continuity sheet (the "script supervisor")

After **every** scene, a continuity pass reads the prose and updates each present
character's living state sheet, MERGING new events into prior state (keep what still
holds, change only what changed). Fields:

- `location` — where they physically are at scene end
- `knows` — what they now know/believe (this is the "who knows what, when" ledger —
  critical for secrets and revelations)
- `wants` — current immediate goal
- `holding` — possessions, injuries, appearance changes
- `relationships` — current stance toward each other named character
- `last_action` — what they just did

**Before** writing the next scene, every character's current sheet is injected as
**CHARACTER STATE SHEETS** with the instruction to maintain them. This is the read-back
loop: write to the sheets after a scene, read them before the next. Honor it — locations,
knowledge, possessions, and relationships must stay consistent unless a scene deliberately
changes them (and shows the change).

## Affect arcs

Each scene records a Panksepp + Plutchik snapshot per present character, forming a
trajectory (`baseline → scene_1 → scene_2 → …`) viewable as a per-character emotional arc.
Use it to keep emotional change *gradual and motivated*, not flipping scene to scene.

## World bible — canon law

`build_world_bible` produces five sections; the first, **CORE RULES & CONSTRAINTS**, is
the hard logic of the world (how the central premise/mechanic works, its limits and costs,
what is impossible). It is injected into every scene as canon and must **never** be
violated. `create_narrative` builds the world bible automatically so the rules exist
before drafting — this is what prevents each scene from reinventing the physics.

## Versions & revision

- Drafts live under `drafts/v1`, `drafts/v2`, … Revision is **non-destructive**: a new
  version is written, the old one preserved.
- `apply_storyscope_revisions` **auto-increments** (v1→v2→v3…), building Draft N+1 from the
  latest draft, and applies the **full StoryScope lens reports** (not just the executive
  summary) to each scene.
- Any two versions can be diffed in the Studio UI.

## Writing a scene — the assembled context

When the engine drafts a scene it is given, in order: the **craft directives** (this skill's
core writing rules), the **world bible canon rules**, the **architecture brief**, the
**canon cast**, the **character state sheets**, semantically-recalled past scenes and lore,
and the **previous scene**. Apply all of them. Then the continuity supervisor records the
scene's tracking. Nothing should contradict the sheets or the world rules.
