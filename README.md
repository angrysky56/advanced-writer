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
7. `batch_revise_pathologies`
   Scan the diagnostics for a story and for each failing scene, trigger a Character Writer's Room debate for failing scenes, and automatically rewrites them based on the characters' feedback.
   Executes the following logic loop completely under the hood:

- Grade the Diagnostics: It reads all of the existing neuro-critique reports for a given story and uses an LLM to "grade" them. If a scene has flatlining cortisol, false agency, or other pathologies, it marks it as a "FAIL".
- The Character Revolt: For each failing scene, it pulls the actual character profiles out of Neo4j and loads the bad scene draft. It then instructs the LLM to roleplay as the characters sitting in a writer's room, fiercely arguing to protect their own agency and archetypes.
- The Demands: At the end of the argument, the characters output a list of "Unified Character Demands" on how the scene must change.
- The Rewrite: The editing engine takes the bad draft and strictly applies the Character Demands to rewrite the scene.
  Recompile: It stitches all the scenes (both untouched and newly rewritten) back together into a fresh final_manuscript.md.

8. `build_world_bible`
   Generates a comprehensive World Bible including lore, history, magic systems, and rules based on the story and its characters.
9. `expand_to_novel`
   Expands a brief synopsis into a structured Beat Sheet, and optionally automatically drafts the entire manuscript scene by scene.
10. `storyscope_final_review`
    Runs the ultimate multi-agent StoryScope review on a finished manuscript. Dispatches 7 parallel analytical lenses (Plot, Agents, Style, etc.) and synthesizes them into an Executive Summary.

---

## What This System Does

[Examples in Wiki](https://github.com/angrysky56/advanced-writer/wiki)

The Advanced Writer is not a chatbot wrapper. It is a **multi-module narrative engineering pipeline** grounded in:

- **StoryScope Research and Prompts** — Empirical data showing AI defaults to moralizing endings (77%), protagonist-solved plots (69%), bodily metaphors, and single-track timelines. Every module actively counteracts these measured pathologies.
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

## Quick start

Requires Neo4j Desktop started with database and Graph Data Science Library installed, Node and NPM, OpenRouter API key and/or Ollama server running.

Run `npm audit` before running `npm run build` to check for security vulnerabilities.

```bash
cd advanced-writer
npm audit
npm run build
```

Copy the .env.example file to .env and fill in the required and desired values.

Add the mcp server to your client with your builds path to dist/index.js

[mcp server configuration example](mcp_config.json.example)

## Current File Structure

```
advanced-writer/
├── README.md                         # Project documentation
├── LICENSE                           # License file
├── package.json                      # Node project configuration
├── package-lock.json                 # Lockfile for dependencies
├── tsconfig.json                     # TypeScript configuration
├── test_workspace.ts                 # Test script for workspace/Neo4j setup
├── mcp_config.json.example           # Example configuration for MCP client
├── skill/                            # Narrative engineering core rules and guidelines
│   ├── SKILL.md                      # Router — essential principles + intake routing
│   ├── workflows/                    # Step-by-step procedures
│   │   ├── create-narrative.md       # Full story creation (8 steps)
│   │   ├── develop-characters.md     # Character library management
│   │   ├── review-narrative.md       # Diagnostic review of existing text
│   │   ├── select-structure.md       # Framework selection guidance
│   │   └── rewrite-scene.md          # Scene rewriting with neuro-critique
│   ├── references/                   # Domain knowledge (loaded by workflows)
│   │   ├── 00-master-core-directives.md
│   │   ├── 01-neurochemical-engine.md
│   │   ├── 02-structural-paradigms.md
│   │   ├── 03-archetypal-database.md # Includes Tri-Layer Emotional Substrate
│   │   ├── 04-agency-enforcement.md
│   │   ├── 05-narrative-diagnostics.md
│   │   ├── storyscope-anti-patterns.md
│   │   └── narrative-research-summary.md
│   └── templates/                    # Output structures (copied + filled)
│       ├── character-profile.md
│       ├── neuro-critique-report.md
│       └── story-architecture-brief.md
├── src/                              # MCP Server Source Code
│   ├── index.ts                      # MCP server entry point
│   ├── server.ts                     # MCP server setup, tool/resource/prompt registration
│   ├── config.ts                     # .env loading + typed config object
│   ├── tools/                        # TypeScript implementations of MCP tools
│   │   ├── index.ts                  # Exports/registers all tools
│   │   ├── batch-revise-pathologies.ts
│   │   ├── build-world-bible.ts
│   │   ├── continue-narrative.ts
│   │   ├── create-narrative.ts
│   │   ├── develop-character.ts
│   │   ├── expand-to-novel.ts
│   │   ├── review-narrative.ts
│   │   ├── rewrite-scene.ts
│   │   └── select-structure.ts
│   ├── engine/                       # Workflow execution engine
│   │   ├── workflow-runner.ts        # Step sequencer, mode switcher
│   │   ├── reference-loader.ts       # Loads markdown references into context
│   │   ├── template-filler.ts        # Fills templates with structured data
│   │   └── diagnostic-loop.ts        # Neurochemical scoring + rewrite loop
│   ├── ai/                           # AI model routing
│   │   ├── router.ts                 # Routes to OpenRouter or Ollama based on config
│   │   ├── openrouter.ts             # OpenRouter API client
│   │   ├── ollama.ts                 # Ollama API client
│   │   └── prompts.ts                # System prompt assembly from skill references
│   ├── storage/                      # Persistence layer
│   │   ├── chroma.ts                 # ChromaDB client, collections, CRUD
│   │   ├── neo4j.ts                  # Neo4j driver, Cypher queries
│   │   ├── workspace.ts              # Story space filesystem/workspace operations
│   │   └── types.ts                  # Shared storage types (CharacterRecord, StoryRecord, etc.)
│   └── types/                        # Shared TypeScript types
│       ├── workflow.ts               # WorkflowStep, WorkflowMode, WorkflowState
│       ├── narrative.ts              # NeurochemicalScore, DiagnosticProfile, Pathology
│       └── character.ts              # JungianArchetype, PankseppSystem, PlutchikEmotion
├── docs/                             # Research + architecture docs
│   ├── NEXT-STEPS.md                 # Implementation brief for coding agent
│   ├── Elements-Of-A-Great-Story.md  # 58K research report
│   ├── Mind-Map.png
│   ├── Mind-Map-v1.1.png
│   ├── agency-map.png
│   ├── Plutchiks-Wheel-Of-Emotions.png
│   └── conversation-archive/         # Original concept development logs
└── data/                             # Runtime data (gitignored)
    ├── chroma/                       # ChromaDB persistent storage
    └── exports/                      # Exported stories, character sheets
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

[GPLv3](LICENSE)
