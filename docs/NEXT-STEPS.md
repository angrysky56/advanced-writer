# NEXT-STEPS.md — Implementation Brief for Coding Agent

> **Purpose:** This document is the definitive specification for transforming the Advanced Writer
> from a static Anthropic Skill 2.0 prompt scaffold into a fully operational MCP-backed narrative
> engineering system. A coding agent should be able to read this file and build the entire system
> without further human clarification on architecture.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Target Architecture](#2-target-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Phase 1 — Project Scaffold & Configuration](#4-phase-1--project-scaffold--configuration)
5. [Phase 2 — MCP Server Core](#5-phase-2--mcp-server-core)
6. [Phase 3 — Storage Layer](#6-phase-3--storage-layer)
7. [Phase 4 — AI Routing Layer](#7-phase-4--ai-routing-layer)
8. [Phase 5 — Workflow Engine](#8-phase-5--workflow-engine)
9. [Phase 6 — Tools (MCP-Exposed)](#9-phase-6--tools-mcp-exposed)
10. [Phase 7 — Integration & Testing](#10-phase-7--integration--testing)
11. [Environment & Hardware](#11-environment--hardware)
12. [Open Design Questions](#12-open-design-questions)

---

## 1. System Overview

### What Exists Today

The `advanced-writer/` directory contains a complete **Anthropic Skill 2.0** — a set of
interlinked markdown files that serve as structured system prompts for an AI writing agent.
These files define the *logic* (what the agent should do, what rules it follows, what outputs
it produces) but provide no *execution infrastructure*.

### What Needs to Be Built

An MCP (Model Context Protocol) server that:

1. **Exposes 5 tools** corresponding to the 5 workflows (create-narrative, develop-characters,
   review-narrative, select-structure, rewrite-scene)
2. **Persists characters and stories** in a vector database (ChromaDB) and a graph database (Neo4j)
   so the "Archetypal Database" is a real, queryable library — not just prompt text
3. **Routes AI calls** through OpenRouter (cloud models) or Ollama (local models) depending on
   task type and user configuration
4. **Enforces the workflow pipeline** — each tool runs its workflow steps in sequence, loading
   the correct references at each step, applying templates, and running self-diagnostics
5. **Supports the mode system** — brainstorm Q&A, collaborative, and fast-auto modes with
   mid-workflow switching

---

## 2. Target Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    MCP CLIENT (IDE / Claude)             │
│  User invokes tool → receives structured output          │
└──────────────────────┬──────────────────────────────────┘
                       │ MCP Protocol (stdio or SSE)
┌──────────────────────▼──────────────────────────────────┐
│                    MCP SERVER (TypeScript)                │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │   Tools      │  │  Resources  │  │    Prompts      │  │
│  │ (5 workflows)│  │ (references)│  │ (intake router) │  │
│  └──────┬───────┘  └──────┬──────┘  └────────┬────────┘  │
│         │                 │                   │           │
│  ┌──────▼─────────────────▼───────────────────▼────────┐ │
│  │              WORKFLOW ENGINE                         │ │
│  │  • Step sequencing   • Mode switching                │ │
│  │  • Reference loading • Template application          │ │
│  │  • Self-diagnostic loop (score → rewrite → rescore)  │ │
│  └──────┬──────────────────────────┬───────────────────┘ │
│         │                          │                     │
│  ┌──────▼──────┐            ┌──────▼──────┐              │
│  │  AI ROUTER  │            │  STORAGE    │              │
│  │             │            │             │              │
│  │ OpenRouter  │            │ ChromaDB    │              │
│  │ Ollama      │            │ Neo4j       │              │
│  │ (per-task)  │            │ (persistent)│              │
│  └─────────────┘            └─────────────┘              │
└──────────────────────────────────────────────────────────┘
```

---

## 3. Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Node.js 22+ / TypeScript 5.x | MCP server, workflow engine, all business logic |
| **MCP SDK** | `@modelcontextprotocol/sdk` | MCP protocol implementation |
| **Vector DB** | ChromaDB (via `chromadb` npm package) | Embeddings for characters, scenes, stories; similarity search |
| **Graph DB** | Neo4j (via `neo4j-driver`) | Character relationships, story structure graphs, shadow-match queries |
| **AI — Cloud** | OpenRouter (via REST API) | Cloud model access (Claude, GPT-4, Gemini, etc.) |
| **AI — Local** | Ollama (via REST API at `localhost:11434`) | Local model access (Llama, Mistral, Qwen, etc.) |
| **Embeddings** | Ollama `nomic-embed-text` or OpenRouter | Vector embeddings for ChromaDB |
| **Config** | dotenv (`.env` file) | API keys, model choices, thresholds, DB connections |
| **Build** | `tsup` or `tsc` | TypeScript compilation |
| **Testing** | Vitest | Unit + integration tests |
| **Linting** | ESLint + Prettier | Code quality |

### Why These Choices

- **ChromaDB over Pinecone/Weaviate**: Runs locally, no cloud dependency, persistent storage
  to disk, Python-native but has a JS client. The character library and story archive are
  project-local, not cloud data.
- **Neo4j over SQLite**: The character relationship map, shadow-match graph, story structure
  beats, and cross-pollination tracking are all inherently graph problems. Neo4j's Cypher
  queries make "find the antagonist whose Shadow matches this protagonist's hamartia"
  trivial. Community Edition is free.
- **OpenRouter over direct API**: Single API key, single interface, model switching without
  code changes. User picks the model in `.env`.
- **Ollama for local**: A RTX 3060 12GB and/or 32GB free RAM are enough for gemma4-12b, Llama 3.1 8B, Mistral 7B,
  Qwen 3.5, etc. Fast iteration during drafting without API costs.

---

## 4. Phase 1 — Project Scaffold & Configuration

### 4.1 Directory Structure (Target)

```
advanced-writer/
├── src/
│   ├── index.ts                    # MCP server entry point
│   ├── server.ts                   # MCP server setup, tool/resource/prompt registration
│   ├── config.ts                   # .env loading + typed config object
│   ├── tools/                      # One file per MCP tool
│   │   ├── create-narrative.ts
│   │   ├── develop-characters.ts
│   │   ├── review-narrative.ts
│   │   ├── select-structure.ts
│   │   └── rewrite-scene.ts
│   ├── engine/                     # Workflow execution engine
│   │   ├── workflow-runner.ts      # Step sequencer, mode switcher
│   │   ├── reference-loader.ts     # Loads markdown references into context
│   │   ├── template-filler.ts      # Fills templates with structured data
│   │   └── diagnostic-loop.ts      # Neurochemical scoring + rewrite loop
│   ├── ai/                         # AI model routing
│   │   ├── router.ts               # Routes to OpenRouter or Ollama based on config
│   │   ├── openrouter.ts           # OpenRouter API client
│   │   ├── ollama.ts               # Ollama API client
│   │   └── prompts.ts              # System prompt assembly from skill references
│   ├── storage/                    # Persistence layer
│   │   ├── chroma.ts               # ChromaDB client, collections, CRUD
│   │   ├── neo4j.ts                # Neo4j driver, Cypher queries
│   │   └── types.ts                # Shared storage types (CharacterRecord, StoryRecord, etc.)
│   └── types/                      # Shared TypeScript types
│       ├── workflow.ts             # WorkflowStep, WorkflowMode, WorkflowState
│       ├── narrative.ts            # NeurochemicalScore, DiagnosticProfile, Pathology
│       └── character.ts            # JungianArchetype, PankseppSystem, PlutchikEmotion
├── skill/                          # Existing skill files (moved from root)
│   ├── SKILL.md
│   ├── workflows/
│   ├── references/
│   └── templates/
├── docs/                           # Research + architecture docs
├── data/                           # Runtime data (gitignored)
│   ├── chroma/                     # ChromaDB persistent storage
│   └── exports/                    # Exported stories, character sheets
├── tests/
│   ├── unit/
│   └── integration/
├── .env.example                    # Template for user configuration
├── .env                            # User's actual config (gitignored)
├── .gitignore
├── package.json
├── tsconfig.json
├── README.md
└── LICENSE
```

### 4.2 `.env.example`

```bash
# ============================================================
# Advanced Writer — Configuration
# ============================================================

# --- AI MODELS ---

# OpenRouter API key (get one at https://openrouter.ai/keys)
OPENROUTER_API_KEY=

# Ollama base URL (default: http://localhost:11434)
OLLAMA_BASE_URL=http://localhost:11434

# Model assignments per task type.
# Format: provider/model-name
# Providers: openrouter, ollama
# Examples:
#   openrouter/anthropic/claude-sonnet-4-20250514
#   openrouter/google/gemini-2.5-flash
#   ollama/llama3.1:8b
#   ollama/mistral:7b

# Creative generation (story drafting, scene writing, character voice)
# Recommendation: Use the most capable model you have budget for
MODEL_GENERATION=deepseek/deepseek-v4-pro

# Diagnostic scoring (neurochemical scoring, pathology scanning)
# Recommendation: A capable but cheaper/faster model — scoring is structured
MODEL_DIAGNOSTIC=ollama/gemma4:12b

# Embedding model (for ChromaDB vector storage)
# Must be an Ollama model with embedding support
MODEL_EMBEDDING=ollama/embeddinggemma:latest

# Brainstorm / interview (intake questions, framework selection)
# Recommendation: Conversational model with good reasoning
MODEL_BRAINSTORM=deepseek/deepseek-v4-flash

# --- STORAGE ---

# ChromaDB persistent storage directory (relative to project root)
CHROMA_PERSIST_DIR=./data/chroma

# Neo4j connection (Community Edition — free)
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=

# --- WORKFLOW SETTINGS ---

# Default interaction mode: brainstorm | collaborative | fast-auto
DEFAULT_MODE=brainstorm

# Neurochemical score threshold for "Optimal Transportation" (all axes must meet this)
NEUROCHEMICAL_PASS_THRESHOLD=7

# Maximum self-diagnostic rewrite iterations before giving up
MAX_REWRITE_ITERATIONS=3

# Maximum simultaneous Panksepp systems to track per character per scene
MAX_PANKSEPP_ACTIVATIONS=2

# --- SERVER ---

# MCP transport: stdio | sse
MCP_TRANSPORT=stdio

# SSE port (only used if MCP_TRANSPORT=sse)
MCP_PORT=3100
```

### 4.3 `package.json` (Initial)

```json
{
  "name": "advanced-writer-mcp",
  "version": "0.1.0",
  "description": "MCP server for neurochemically-grounded narrative engineering",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/",
    "format": "prettier --write src/"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "latest",
    "chromadb": "latest",
    "neo4j-driver": "latest",
    "dotenv": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "typescript": "^5.8",
    "tsx": "latest",
    "vitest": "latest",
    "eslint": "latest",
    "prettier": "latest",
    "@types/node": "latest"
  }
}
```

> **Note for coding agent:** Run `scan_dependencies` skill on every package before installing.
> Verify each package is safe and pin to specific versions in the final `package.json`.

### 4.4 `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

---

## 5. Phase 2 — MCP Server Core

### 5.1 Server Setup (`src/server.ts`)

The MCP server must register:

**5 Tools** (one per workflow):

| Tool Name | Description | Input Schema |
|-----------|-------------|--------------|
| `create_narrative` | Build a story from scratch | `{ logline?: string, genre?: string, mode?: Mode }` |
| `develop_character` | Create/update a character profile | `{ name?: string, archetype?: Archetype, action?: "create" \| "update" \| "list" \| "shadow_match" }` |
| `review_narrative` | Score and diagnose existing text | `{ text: string, scope?: "scene" \| "chapter" \| "full" }` |
| `select_structure` | Choose a structural framework | `{ premise?: string, designing_principle?: string }` |
| `rewrite_scene` | Rewrite with neuro-critique | `{ scene_text: string, target_axis?: "cortisol" \| "oxytocin" \| "dopamine" }` |

**8 Resources** (one per reference file):

Each reference markdown file should be exposed as an MCP resource so clients can read the
agent's domain knowledge directly. URI scheme: `advanced-writer://reference/{filename}`

**1 Prompt** (the intake router):

The SKILL.md intake question, registered as an MCP prompt named `advanced_writer_intake`.

### 5.2 Transport

Support both `stdio` (for IDE integration like Claude Code) and `sse` (for network access).
Configurable via `MCP_TRANSPORT` in `.env`.

---

## 6. Phase 3 — Storage Layer

### 6.1 ChromaDB Collections

```
Collection: characters
├── id: string (uuid)
├── document: string (full character profile markdown)
├── metadata:
│   ├── name: string
│   ├── archetype: string (one of 12 Jungian archetypes)
│   ├── hamartia: string
│   ├── shadow: string
│   ├── moral_weakness: string
│   ├── individuation_state: string (Pre-Awareness | Awakening | Confrontation | Integration | Transcendence)
│   ├── role: string (protagonist | antagonist | ally | influence)
│   ├── panksepp_primary: string (dominant Panksepp system)
│   ├── story_ids: string[] (stories this character appears in)
│   ├── created_at: string (ISO 8601)
│   └── updated_at: string (ISO 8601)
└── embedding: float[] (from document text)

Collection: stories
├── id: string (uuid)
├── document: string (story architecture brief markdown)
├── metadata:
│   ├── title: string
│   ├── genre: string
│   ├── framework: string (truby | dramatica | kishotenketsu | fichtean)
│   ├── designing_principle: string
│   ├── status: string (planning | drafting | review | complete)
│   ├── character_ids: string[]
│   ├── created_at: string
│   └── updated_at: string
└── embedding: float[]

Collection: scenes
├── id: string (uuid)
├── document: string (scene text)
├── metadata:
│   ├── story_id: string
│   ├── act: string
│   ├── sequence: number
│   ├── cortisol_score: number (1-10)
│   ├── oxytocin_score: number (1-10)
│   ├── dopamine_score: number (1-10)
│   ├── diagnostic_profile: string (flatline | stress_no_empathy | pleasant_stagnant | action_no_soul | optimal)
│   ├── pathologies_detected: string[] (e.g., ["thematic_over_explaining", "vague_allusions"])
│   ├── version: number (increments on rewrite)
│   └── created_at: string
└── embedding: float[]

Collection: archetypes
├── id: string (archetype name, e.g., "the_hero")
├── document: string (full archetype reference text including desires, strategies, vulnerabilities)
├── metadata:
│   ├── core_desire: string
│   ├── core_strategy: string
│   ├── primary_vulnerability: string
│   ├── compatible_panksepp: string[] (which Panksepp systems this archetype typically activates)
│   └── shadow_archetypes: string[] (which archetypes serve as natural Shadows)
└── embedding: float[]
```

### 6.2 Neo4j Graph Schema

```cypher
// --- Node Types ---

// Character node (mirrors ChromaDB character but optimized for graph traversal)
CREATE (c:Character {
  id: $id,
  name: $name,
  archetype: $archetype,
  hamartia: $hamartia,
  shadow: $shadow,
  individuation_state: $individuation_state,
  panksepp_primary: $panksepp_primary
})

// Story node
CREATE (s:Story {
  id: $id,
  title: $title,
  framework: $framework,
  designing_principle: $designing_principle,
  status: $status
})

// Scene node
CREATE (sc:Scene {
  id: $id,
  act: $act,
  sequence: $sequence,
  cortisol: $cortisol,
  oxytocin: $oxytocin,
  dopamine: $dopamine,
  profile: $diagnostic_profile
})

// Archetype node (static — seeded from reference data)
CREATE (a:Archetype {
  name: $name,
  core_desire: $desire,
  core_strategy: $strategy,
  vulnerability: $vulnerability
})

// Emotion node (Plutchik primaries + compounds)
CREATE (e:Emotion {
  name: $name,
  type: $type,  // primary | compound
  intensity: $intensity,  // low | primary | high
  components: $components  // for compounds: ["joy", "trust"] etc.
})

// --- Edge Types ---

// Character relationships
(c1:Character)-[:SHADOWS]->(c2:Character)         // Shadow-match pairing
(c1:Character)-[:OPPOSES]->(c2:Character)          // Antagonist relationship
(c1:Character)-[:ALLIES_WITH]->(c2:Character)      // Alliance
(c1:Character)-[:INFLUENCES]->(c2:Character)       // Influence character relationship
(c:Character)-[:HAS_ARCHETYPE]->(a:Archetype)      // Archetype mapping

// Story structure
(c:Character)-[:APPEARS_IN {role: $role}]->(s:Story)
(sc:Scene)-[:BELONGS_TO]->(s:Story)
(sc:Scene)-[:FOLLOWS]->(sc2:Scene)                 // Sequence ordering
(c:Character)-[:ACTS_IN {agency: $agency}]->(sc:Scene)  // agency: active|passive|mixed

// Emotional tracking
(c:Character)-[:EXPERIENCES {
  scene_id: $scene_id,
  panksepp_system: $system,
  mask_response: $mask_response
}]->(e:Emotion)

// Individuation tracking
(c:Character)-[:TRANSFORMS_IN {
  from_state: $from,
  to_state: $to,
  catalyst: $catalyst
}]->(sc:Scene)

// Cross-pollination tracking
(c:Character)-[:CROSS_POLLINATED {
  source_framework: $from_framework,
  target_framework: $to_framework
}]->(s:Story)
```

### 6.3 Key Graph Queries

```cypher
// Find Shadow-matched antagonist candidates for a protagonist
MATCH (p:Character {name: $protagonist_name})-[:HAS_ARCHETYPE]->(a:Archetype)
MATCH (candidate:Character)-[:HAS_ARCHETYPE]->(ca:Archetype)
WHERE ca.name IN a.shadow_archetypes
  AND candidate.id <> p.id
RETURN candidate, ca

// Get a character's emotional arc across a story
MATCH (c:Character {name: $name})-[exp:EXPERIENCES]->(e:Emotion)
MATCH (sc:Scene {id: exp.scene_id})-[:BELONGS_TO]->(s:Story {id: $story_id})
RETURN sc.sequence, e.name, exp.panksepp_system, exp.mask_response
ORDER BY sc.sequence

// Find stories where a character was cross-pollinated
MATCH (c:Character {name: $name})-[cp:CROSS_POLLINATED]->(s:Story)
RETURN s.title, cp.source_framework, cp.target_framework

// Diagnose neurochemical pacing across a story
MATCH (sc:Scene)-[:BELONGS_TO]->(s:Story {id: $story_id})
RETURN sc.act, sc.sequence, sc.cortisol, sc.oxytocin, sc.dopamine, sc.profile
ORDER BY sc.sequence

// Find all characters with unresolved individuation
MATCH (c:Character)
WHERE c.individuation_state IN ['Pre-Awareness', 'Awakening', 'Confrontation']
RETURN c.name, c.archetype, c.hamartia, c.individuation_state
```

### 6.4 Seeding the Archetype Collection

On first run, the system must seed the `archetypes` ChromaDB collection and Neo4j Archetype
nodes from the data in `skill/references/03-archetypal-database.md`. Parse the 12-archetype
table and create one entry per archetype with full metadata.

Also seed the Plutchik emotion nodes (8 primaries × 3 intensities + 8 compounds = 32 nodes).

---

## 7. Phase 4 — AI Routing Layer

### 7.1 Router Design (`src/ai/router.ts`)

The AI router selects and calls the appropriate model based on the task type:

```typescript
type TaskType = 'generation' | 'diagnostic' | 'embedding' | 'brainstorm';

interface AIRouterConfig {
  generation: ModelSpec;   // From MODEL_GENERATION env
  diagnostic: ModelSpec;   // From MODEL_DIAGNOSTIC env
  embedding: ModelSpec;    // From MODEL_EMBEDDING env
  brainstorm: ModelSpec;   // From MODEL_BRAINSTORM env
}

interface ModelSpec {
  provider: 'openrouter' | 'ollama';
  model: string;
}

interface CompletionRequest {
  taskType: TaskType;
  systemPrompt: string;    // Assembled from skill references
  userMessage: string;
  temperature?: number;    // Default: 0.8 for generation, 0.2 for diagnostic
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
}
```

### 7.2 OpenRouter Client (`src/ai/openrouter.ts`)

- Endpoint: `https://openrouter.ai/api/v1/chat/completions`
- Auth: `Authorization: Bearer ${OPENROUTER_API_KEY}`
- Set `HTTP-Referer` and `X-Title` headers per OpenRouter docs
- Handle rate limiting with exponential backoff
- Stream responses for collaborative mode (SSE)

### 7.3 Ollama Client (`src/ai/ollama.ts`)

- Endpoint: `${OLLAMA_BASE_URL}/api/chat` (chat completion)
- Endpoint: `${OLLAMA_BASE_URL}/api/embed` (embeddings)
- No auth required for local
- Check model availability on startup (`/api/tags`)
- Pull model if not present (`/api/pull`) — with user confirmation

### 7.4 System Prompt Assembly (`src/ai/prompts.ts`)

The prompt assembler must:

1. Always include the essential principles from `SKILL.md`
2. Load the `<required_reading>` references listed in the active workflow step
3. Include the relevant template if the step produces structured output
4. Append the current mode instructions (brainstorm/collaborative/fast-auto)
5. Include character context from ChromaDB if characters are involved

```typescript
interface PromptAssemblyInput {
  workflow: string;           // e.g., 'create-narrative'
  currentStep: number;
  mode: WorkflowMode;
  characterContext?: string;  // Retrieved from ChromaDB
  storyContext?: string;      // Retrieved from ChromaDB
  userInput: string;
}

function assembleSystemPrompt(input: PromptAssemblyInput): string {
  // 1. Essential principles (always)
  // 2. Workflow-specific references (per step)
  // 3. Template (if step produces structured output)
  // 4. Mode instructions
  // 5. Character/story context from storage
}
```

---

## 8. Phase 5 — Workflow Engine

### 8.1 Workflow Runner (`src/engine/workflow-runner.ts`)

The core execution engine that steps through workflows:

```typescript
interface WorkflowState {
  workflow: string;
  currentStep: number;
  totalSteps: number;
  mode: WorkflowMode;         // 'brainstorm' | 'collaborative' | 'fast-auto'
  context: Map<string, any>;  // Accumulated data from previous steps
  storyId?: string;           // Active story (from Neo4j/ChromaDB)
  characterIds: string[];     // Active characters
  diagnosticHistory: DiagnosticResult[];
}

type WorkflowMode = 'brainstorm' | 'collaborative' | 'fast-auto';

interface WorkflowStep {
  name: string;
  requiredReferences: string[];      // Reference files to load
  template?: string;                 // Template to fill
  taskType: TaskType;                // Which AI model to use
  modeOverrides: {
    brainstorm: StepBehavior;        // Ask questions, wait
    collaborative: StepBehavior;     // Generate chunk, pause
    fastAuto: StepBehavior;          // Generate, continue
  };
  storageOperations?: {
    read?: StorageQuery[];           // What to fetch before step
    write?: StorageWrite[];          // What to persist after step
  };
  hooks?: {
    before?: HookFn;                 // Pre-step validation
    after?: HookFn;                  // Post-step processing
  };
}
```

### 8.2 Reference Loader (`src/engine/reference-loader.ts`)

Reads the markdown reference files and prepares them for injection into prompts:

- Parses the `<required_reading>` block from each workflow file
- Loads the specified reference files from `skill/references/`
- Strips XML tags for cleaner prompt injection (or preserves them — TBD)
- Caches loaded references in memory to avoid re-reading

### 8.3 Template Filler (`src/engine/template-filler.ts`)

Takes a template file and structured data, produces filled output:

- Reads template from `skill/templates/`
- Replaces `[placeholder]` syntax with actual values
- Validates all required fields are filled
- Returns both the filled markdown and a structured data object

### 8.4 Diagnostic Loop (`src/engine/diagnostic-loop.ts`)

The self-diagnostic system from the neurochemical engine:

```typescript
interface DiagnosticResult {
  cortisol: number;       // 1-10
  oxytocin: number;       // 1-10
  dopamine: number;       // 1-10
  profile: DiagnosticProfile;
  pathologies: Pathology[];
  agencyCheck: AgencyResult;
  pass: boolean;          // All axes >= NEUROCHEMICAL_PASS_THRESHOLD
  rewriteDirectives: string[];
}

type DiagnosticProfile =
  | 'flatline'              // All < 4
  | 'stress_no_empathy'     // Cortisol > 7, Oxytocin < 4
  | 'pleasant_stagnant'     // Oxytocin > 7, Cortisol < 4
  | 'action_no_soul'        // Cortisol & Dopamine > 7, Oxytocin < 4
  | 'optimal';              // All >= threshold

async function diagnosticLoop(
  text: string,
  maxIterations: number,
  aiRouter: AIRouter
): Promise<{ finalText: string; history: DiagnosticResult[] }> {
  // 1. Score the text
  // 2. If pass → return
  // 3. If fail → generate rewrite directives, rewrite, re-score
  // 4. Repeat up to MAX_REWRITE_ITERATIONS
  // 5. Return best version even if never "optimal"
}
```

### 8.5 Workflow Hooks

Hooks fire at step boundaries and enable storage integration:

```typescript
type HookFn = (state: WorkflowState, storage: StorageLayer) => Promise<void>;

// Example hooks:

// Before "Hamartia Definition" step — fetch existing characters for reference
const beforeHamartia: HookFn = async (state, storage) => {
  const similar = await storage.chroma.query('characters', {
    queryTexts: [state.context.get('logline')],
    nResults: 3
  });
  state.context.set('similarCharacters', similar);
};

// After "Character Assembly" step — persist new character to both stores
const afterCharacterAssembly: HookFn = async (state, storage) => {
  const profile = state.context.get('characterProfile');
  await storage.chroma.add('characters', profile);
  await storage.neo4j.createCharacterNode(profile);
  if (profile.shadowMatch) {
    await storage.neo4j.createShadowEdge(profile.id, profile.shadowMatch.id);
  }
};

// After "Self-Diagnostic" step — persist scene scores
const afterDiagnostic: HookFn = async (state, storage) => {
  const result = state.context.get('diagnosticResult');
  await storage.chroma.add('scenes', {
    document: state.context.get('sceneText'),
    metadata: {
      story_id: state.storyId,
      cortisol_score: result.cortisol,
      oxytocin_score: result.oxytocin,
      dopamine_score: result.dopamine,
      diagnostic_profile: result.profile,
      pathologies_detected: result.pathologies.map(p => p.type)
    }
  });
};
```

---

## 9. Phase 6 — Tools (MCP-Exposed)

### 9.1 Tool: `create_narrative`

```typescript
{
  name: 'create_narrative',
  description: 'Build a complete narrative from a logline, premise, or raw idea. Runs an 8-step pipeline: intake → hamartia → framework → characters → architecture → draft → diagnostic.',
  inputSchema: {
    type: 'object',
    properties: {
      logline: { type: 'string', description: 'One-sentence story premise' },
      genre: { type: 'string', description: 'Primary genre (e.g., literary fiction, sci-fi, thriller)' },
      tone: { type: 'string', description: 'Desired tone (e.g., dark, comedic, elegiac)' },
      target_length: { type: 'string', enum: ['short_story', 'novella', 'novel', 'screenplay'] },
      mode: { type: 'string', enum: ['brainstorm', 'collaborative', 'fast-auto'], default: 'brainstorm' },
      existing_character_ids: { type: 'array', items: { type: 'string' }, description: 'Pull characters from the library' }
    }
  }
}
```

### 9.2 Tool: `develop_character`

```typescript
{
  name: 'develop_character',
  description: 'Create, update, query, or shadow-match characters in the persistent Archetypal Database.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['create', 'update', 'get', 'list', 'shadow_match', 'cross_pollinate'] },
      character_id: { type: 'string', description: 'For update/get/shadow_match' },
      name: { type: 'string', description: 'For create' },
      archetype: { type: 'string', description: 'For create — one of 12 Jungian archetypes' },
      mode: { type: 'string', enum: ['brainstorm', 'collaborative', 'fast-auto'], default: 'brainstorm' }
    },
    required: ['action']
  }
}
```

### 9.3 Tool: `review_narrative`

```typescript
{
  name: 'review_narrative',
  description: 'Run neurochemical scoring, pathology diagnostics, and agency enforcement on existing text. Produces a structured neuro-critique report.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The narrative text to review' },
      scope: { type: 'string', enum: ['scene', 'chapter', 'full'], default: 'scene' },
      story_id: { type: 'string', description: 'Optional — link review to existing story' }
    },
    required: ['text']
  }
}
```

### 9.4 Tool: `select_structure`

```typescript
{
  name: 'select_structure',
  description: 'Interactively select the right structural framework (Truby, Dramatica, Kishōtenketsu, Fichtean) for a story based on its Designing Principle.',
  inputSchema: {
    type: 'object',
    properties: {
      premise: { type: 'string', description: 'Story premise or logline' },
      designing_principle: { type: 'string', description: 'Optional — the abstract structural logic' },
      mode: { type: 'string', enum: ['brainstorm', 'collaborative', 'fast-auto'], default: 'brainstorm' }
    }
  }
}
```

### 9.5 Tool: `rewrite_scene`

```typescript
{
  name: 'rewrite_scene',
  description: 'Targeted scene rewriting with before/after neurochemical scoring. Identifies specific pathologies and produces an improved version.',
  inputSchema: {
    type: 'object',
    properties: {
      scene_text: { type: 'string', description: 'The scene to rewrite' },
      target_axis: { type: 'string', enum: ['cortisol', 'oxytocin', 'dopamine'], description: 'Which axis to prioritize raising' },
      story_id: { type: 'string', description: 'Optional — context from existing story' },
      character_ids: { type: 'array', items: { type: 'string' }, description: 'Characters in the scene' }
    },
    required: ['scene_text']
  }
}
```

---

## 10. Phase 7 — Integration & Testing

### 10.1 Unit Tests

| Module | Test Coverage |
|--------|---------------|
| `config.ts` | Validates .env parsing, defaults, error on missing required vars |
| `reference-loader.ts` | Loads correct references per workflow step |
| `template-filler.ts` | Fills templates correctly, errors on missing required fields |
| `ai/router.ts` | Routes to correct provider/model per task type |
| `storage/chroma.ts` | CRUD operations on all collections |
| `storage/neo4j.ts` | Node/edge creation, Cypher queries return expected shapes |
| `diagnostic-loop.ts` | Scoring logic, profile classification, rewrite loop termination |

### 10.2 Integration Tests

| Test | Description |
|------|-------------|
| Full create-narrative | Run entire workflow end-to-end with a test logline |
| Character persistence | Create character → query by archetype → shadow-match |
| Cross-pollination | Create character in Truby → deploy in Kishōtenketsu |
| Diagnostic loop | Score a deliberately flat scene → verify rewrite improves score |
| Mode switching | Start brainstorm → switch to fast-auto mid-workflow |

### 10.3 MCP Inspector Testing

Use the MCP Inspector (`npx @modelcontextprotocol/inspector`) to:
1. Verify all 5 tools are registered with correct schemas
2. Verify all 8 resources are readable
3. Test tool invocation with sample inputs
4. Verify structured output matches templates

---

## 11. Environment & Hardware

| Resource | Available |
|----------|-----------|
| **OS** | Pop!_OS (Debian-based Linux) |
| **RAM** | 64 GB |
| **GPU** | NVIDIA RTX 3060 12GB VRAM |
| **Ollama Models** | Can run: Llama 3.1 8B, Mistral 7B, Qwen 2.5 7B, Phi-3, nomic-embed-text |
| **Neo4j** | Community Edition (free, must be installed) |
| **ChromaDB** | Runs embedded in Node.js process via `chromadb` npm package |
| **Package Manager** | npm (Node) / uv (Python if needed for ChromaDB server mode) |

### Neo4j Installation (if not already present)

```bash
# Add Neo4j repository
wget -O - https://debian.neo4j.com/neotechnology.gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/neo4j.gpg
echo 'deb [signed-by=/usr/share/keyrings/neo4j.gpg] https://debian.neo4j.com stable latest' | sudo tee /etc/apt/sources.list.d/neo4j.list
sudo apt update
sudo apt install neo4j

# Start service
sudo systemctl enable neo4j
sudo systemctl start neo4j

# Set password (default user: neo4j)
cypher-shell -u neo4j -p neo4j
# Change password when prompted, update .env
```

### Ollama Model Setup

```bash
# Pull required models
ollama pull llama3.1:8b          # Diagnostic scoring
ollama pull nomic-embed-text      # Embeddings for ChromaDB
```

---

## 12. Open Design Questions

These should be resolved by the user before or during implementation:

### Question 1: ChromaDB Mode
ChromaDB can run in two modes:
- **Embedded** (in-process): Simpler, no separate server, data persists to `./data/chroma/`
- **Client-server**: Runs as a separate process, accessible over HTTP

**Recommendation:** Start with embedded mode. Switch to client-server only if performance
becomes an issue or if multiple processes need simultaneous access.

### Question 2: Streaming in Collaborative Mode
In collaborative mode, the agent generates a chunk and pauses. Should the tool:
- **(A)** Return the chunk as a complete tool result, then the user re-invokes the tool with
  feedback (stateless, simpler)
- **(B)** Stream the response via SSE and use MCP's progress notifications to pause
  mid-generation (stateful, more complex, better UX)

**Recommendation:** Start with (A) — stateless with workflow state persisted to ChromaDB.
The tool returns the chunk + a `continuation_token` that the next call uses to resume.

### Question 3: Story File Export
Should completed stories be:
- **(A)** Stored only in ChromaDB (queryable, embedded)
- **(B)** Also exported as markdown files to `data/exports/` (human-readable, git-trackable)
- **(C)** Both

**Recommendation:** (C) — ChromaDB for search/query, markdown files for reading/editing.

### Question 4: Multi-Model Generation
Some workflows could benefit from using different models at different steps:
- Use Claude Opus for the initial creative draft (expensive but highest quality)
- Use Llama 3.1 8B for diagnostic scoring (fast, local, structured output)
- Use Claude Sonnet for rewrite directives (good balance)

Should the `.env` support per-step model overrides, or is per-task-type sufficient?

**Recommendation:** Start with per-task-type (4 model slots). Add per-step overrides later
if needed — premature complexity otherwise.

### Question 5: Neo4j Alternatives
Neo4j Community Edition requires a JVM and a separate service. Lighter alternatives:
- **FalkorDB** — Redis-based graph DB, lighter footprint
- **SurrealDB** — Multi-model DB (document + graph), single binary
- **In-memory graph** — Use a library like `graphology` for small-scale graphs, persist to JSON

**Recommendation:** Start with Neo4j if the user is comfortable with the JVM dependency.
Otherwise, SurrealDB offers graph + document in a single binary with no JVM.

---

## Build Order Summary

| Phase | Deliverable | Dependencies |
|-------|------------|--------------|
| **1** | Scaffold, config, `.env`, `package.json`, `tsconfig.json` | None |
| **2** | MCP server shell with tool/resource/prompt registration | Phase 1 |
| **3** | ChromaDB + Neo4j clients, schema creation, archetype seeding | Phase 1 |
| **4** | AI router (OpenRouter + Ollama clients) | Phase 1 |
| **5** | Workflow engine (runner, reference loader, template filler, diagnostic loop) | Phases 2, 3, 4 |
| **6** | 5 tool implementations wiring engine → MCP | Phase 5 |
| **7** | Tests + MCP Inspector validation | Phase 6 |

**Estimated complexity:** ~2,500–3,500 lines of TypeScript across ~20 source files.
