# Advanced Writer

> A modular narrative engineering system that uses neurochemical pacing, Jungian depth psychology, structural paradigm selection, and automated pathology diagnostics to produce fiction that resists the default failure modes of AI-generated prose.

## Current Implementation

| Layer             | Description                                                                 |
| ----------------- | --------------------------------------------------------------------------- |
| **Skill Prompts** | Anthropic Skill 2.0 router pattern — 8 references, 5 workflows, 3 templates |
| **MCP Server**    | TypeScript MCP server exposing workflows as tools                           |
| **Storage**       | ChromaDB (vectors) + Neo4j (graph) for persistent characters/stories        |
| **AI Routing**    | OpenRouter (cloud) + Ollama (local) with per-task model selection           |
| **Configuration** | `.env` for API keys, model choices, scoring thresholds                      |

## Tools Available in MCP Server

1. `create_narrative`
   Build a complete narrative from a logline, premise, or raw idea. Runs an 8-step pipeline: intake -> hamartia -> framework -> characters -> architecture -> draft -> diagnostic.
2. `develop_character`
   Create, update, query, or shadow-match characters in the persistent Archetypal Database.
3. `review_narrative`
   Run neurochemical scoring, pathology diagnostics, and agency enforcement on existing text. Produces a structured neuro-critique report.
4. `select_structure`
   Interactively select the right structural framework (Truby, Dramatica, Kishōtenketsu, Fichtean) for a story based on its Designing Principle.
5. `rewrite_scene`
   Targeted scene rewriting with before/after neurochemical scoring. Identifies specific pathologies and produces an improved version.
6. `continue_narrative`
   Continue drafting a story by generating the next scene based on the previous scene, the story architecture, and user direction.

---

## What This System Does

The Advanced Writer is not a chatbot wrapper. It is a **multi-module narrative engineering pipeline** grounded in:

- **StoryScope Research** — Empirical data showing AI defaults to moralizing endings (77%), protagonist-solved plots (69%), bodily metaphors, and single-track timelines. Every module actively counteracts these measured pathologies.
  - [arXiv](https://arxiv.org/abs/2604.03136) : StoryScope: Investigating idiosyncrasies in AI fiction

- **Affective Neuroscience** — Scenes are scored on three biological axes (Cortisol/Oxytocin/Dopamine) with diagnostic profiles that trigger targeted rewrites.
- **Jungian Depth Psychology** — Characters are anchored to immutable psychological cores (Archetype + Hamartia + Shadow) with a living memory bank that persists across stories.
- **Tri-Layer Emotional Substrate** — Replaces somatic metaphor clichés with a Panksepp → Plutchik pipeline: Social Mask → Biological Engine → Granular Emotional Output.
- **Structural Paradigm Selection** — Dynamically chooses between Truby's Organic Architecture, Dramatica Theory, Kishōtenketsu, or the Fichtean Curve based on the story's Designing Principle.

- **Elements of a Great Story** — A comprehensive synthesis of narrative theory and best practices, including Jungian archetypes, emotional substrates, neurochemical pacing, and structural paradigms.
  - [Elements of a Great Story](docs/Elements-Of-A-Great-Story.md)

### The Six Modules

| #   | Module                 | Function                                                                           |
| --- | ---------------------- | ---------------------------------------------------------------------------------- |
| 00  | Master Core Directives | Entropy Mandate — reject obvious resolutions, earn catharsis, resist moralizing    |
| 01  | Neurochemical Engine   | Score scenes 1–10 on Cortisol/Oxytocin/Dopamine; diagnose pacing flatlines         |
| 02  | Structural Paradigms   | Select and enforce narrative architecture (Truby/Dramatica/Kishōtenketsu/Fichtean) |
| 03  | Archetypal Database    | Persistent character library with Jungian anchors + Tri-Layer Emotional Substrate  |
| 04  | Agency Enforcement     | Verify Want→Decision→Action→Consequence; filter false activity                     |
| 05  | Narrative Diagnostics  | Scan for continuity errors, Chekhov's Gun violations, StoryScope anti-patterns     |

### Three Interaction Modes

Users can switch modes at any point during any workflow:

- **Brainstorm Q&A** (default) — Agent interviews before generating
- **Collaborative** — Agent generates in chunks, pauses for feedback
- **Fast-Auto** — Agent generates autonomously from whatever context it has

---

## Current File Structure

```
advanced-writer/
├── SKILL.md                          # Router — essential principles + intake routing
├── workflows/                        # Step-by-step procedures
│   ├── create-narrative.md           # Full story creation (8 steps)
│   ├── develop-characters.md         # Character library management
│   ├── review-narrative.md           # Diagnostic review of existing text
│   ├── select-structure.md           # Framework selection guidance
│   └── rewrite-scene.md             # Scene rewriting with neuro-critique
├── references/                       # Domain knowledge (loaded by workflows)
│   ├── 00-master-core-directives.md
│   ├── 01-neurochemical-engine.md
│   ├── 02-structural-paradigms.md
│   ├── 03-archetypal-database.md     # Includes Tri-Layer Emotional Substrate
│   ├── 04-agency-enforcement.md
│   ├── 05-narrative-diagnostics.md
│   ├── storyscope-anti-patterns.md
│   └── narrative-research-summary.md
├── templates/                        # Output structures (copied + filled)
│   ├── character-profile.md
│   ├── neuro-critique-report.md
│   └── story-architecture-brief.md
└── docs/
    ├── NEXT-STEPS.md                 # Implementation brief for coding agent
    ├── Elements-Of-A-Great-Story.md  # 58K research report
    ├── Mind-Map.png
    ├── Mind-Map-v1.1.png
    ├── Plutchiks-Wheel-Of-Emotions.png
    └── conversation-archive/         # Original 9 pages of concept development
```

---

## Research Foundation

The system is built on a multidisciplinary research report covering:

- Evolutionary psychology of narrative (stories as survival simulators)
- Neurochemical architecture of transportation (Zak et al.)
- Aristotelian dramatic theory (_Poetics_ — Mythos, Ethos, Dianoia, Catharsis)
- Jungian archetypes and the collective unconscious
- Panksepp's affective neuroscience (7 primary affect systems)
- Plutchik's psychoevolutionary emotion taxonomy
- StoryScope empirical analysis of AI fiction pathologies
- Comparative structural paradigms (Western + Eastern traditions)

---

## License

TBD
