# Advanced Writer — Review (2026-06-21)

Method: full static read of `src/` (storage, ai, engine, all 11 tools, server wiring) + live invocation of the running MCP server + inspection of real story data in `/home/ty/Documents/writing-workspace` via Glob. Node isn't in the review sandbox, so the build/UI weren't run; findings are code- and data-level.

## TL;DR

The 11 tools are individually wired correctly and the per-scene generation path works. But the **persistent-state layer that's supposed to prevent drift is largely not connected to reality**, and several "auto" pipelines fail silently or destroy data. The drift you saw in the 200-page run is explained by concrete bugs below, not by model temperature. Top three to fix: (1) Neo4j character identity mismatch, (2) silent failures + no `max_tokens`/timeout in the auto-draft loop, (3) `expand_to_novel` never seeds characters into the graph.

Live confirmation: both `create_narrative` (6 sequential model calls) **and** the single-call `select_structure` timed out at the MCP client (~60s). So the bottleneck is the model call itself (slow `deepseek-v4-pro`, no output cap), not just call count — see CRITICAL-5.

---

## Fixes applied (2026-06-21)

All of the following were implemented in this session. Rebuild the MCP server (`npm run build`) for the desktop/MCP connection to pick them up; the Web UI uses `next dev` and needs only a restart.

Limits (UI regressions) removed — see C5: `maxDuration` 300→86400, `stepCountIs(5)`→100000, model-list timeouts 4s/1.5s→60s.

Memory system:
- Characters are now generated, then their REAL name/archetype/hamartia/shadow/etc. are extracted (`src/ai/extract.ts`) and seeded into Neo4j under the real name via a shared helper (`src/tools/_cast.ts`). Used by both `create_narrative` and `expand_to_novel`. (C1)
- `expand_to_novel` now seeds the cast **and** an architecture brief before drafting, so the 32-scene path no longer drafts against an empty graph. (C2)
- `updateCharacterState` is bounded to a rolling 8-beat log and rebuilds `current_state` from it (no more unbounded growth). (C4)
- `getStoryState` injects a lean character projection instead of the full node. (C4)
- Continuity extraction now uses a robust JSON parser and guards each record; `/\\s+/`→`/\s+/`; empty relationship types guarded. (C1/low)
- `develop_character` now implements `get`, `list`, `update`, and `shadow_match` (was create-only), and fills real traits on create. (M1)
- Wired `createShadowEdge` (co-star → protagonist). (M5)

Reliability / correctness:
- `create_narrative` and `expand_to_novel` check each `continue_narrative` result and stop the chain on failure (no more silent scene-drop); `continue_narrative` refuses to draft from a missing predecessor. (C3)
- `continue_narrative` literal `\n` joins fixed. (low)
- `batch_revise_pathologies`: added `version`; re-scores each revised scene; programmatic concat. (H1/H3/H5)
- `apply_storyscope_revisions`: non-destructive — reads `source_version`, writes Draft 2 to `target_version` (default v2). (H2)
- `create_narrative` fast-auto: programmatic concat instead of LLM stitch; `logline` now required. (H3/low)
- `rewrite_scene`: real before/after axis scoring. (M2)
- `storyscope_final_review`: `Promise.allSettled` + partial-failure tolerance. (H4)
- `openrouter.ts`: guards `choices[0]`, handles reasoning-model null content, surfaces error body. No timeout added. (low)
- `server.ts`: skill dir resolved relative to the module, not CWD. (low)
- Deleted dead code: `src/engine/*` and `src/ai/prompts.ts`. (M6)

Embedding model removed (M4): Chroma handles its own embeddings, so the unused `MODEL_EMBEDDING` config, the `embedding` TaskType, `getEmbeddings()` (router + ollama), the models-API default, and the UI's "Vector Embedding Model" selector were all deleted. One less moving part to misconfigure.

Async / long-run support (new): the long tools (`create_narrative`, `continue_narrative`, `batch_revise_pathologies`, `expand_to_novel`, `storyscope_final_review`, `apply_storyscope_revisions`) now accept `async: true`. In that mode they start a detached background job and return a job id immediately — no client request can time out, and an hour-long run keeps going as long as the MCP host (the desktop app) stays open. Poll with the new `check_job {"job_id":"…"}` tool or `list_jobs`. Job records live in `<WORKSPACE_DIR>/_jobs/<id>.json`. Implemented in `src/jobs.ts` with a single chokepoint in `executeTool` (`src/tools/index.ts`); no per-tool rewrites.

Affect system — fixed and extended (the "SEEKING/FEAR only" report): the UI's Panksepp scores were **fabricated** (seeded from a hash of the character's name; the regex override never matched prose profiles), only 6 of 7 systems were computed (no LUST), and cards rendered just 2. Now: `extractCharacterMeta` has the model score all seven Panksepp systems AND Plutchik's eight emotions 1-10; `formatAffectProfile` writes a uniform, parseable block into every saved profile; generation prompts forbid preamble (kills the "Excellent. Based on…" leak); the workspace API parses all seven real scores (+ skips leaked preamble in summaries); UI cards render every system. Per-scene **arc tracking**: `continue_narrative` now extracts each present character's Panksepp+Plutchik reading per scene and appends a capped (40-deep) snapshot to `affect_log` on the Neo4j node (`appendAffectSnapshot`), so emotional arcs can be reconstructed. UI arc-chart over that timeline is the agreed next step.

Not changed (by design / your call): no `max_tokens` anywhere (intentional); `cross_pollinate` action dropped rather than stubbed.

---

## CRITICAL — these cause the drift / silent breakage

**C1. Neo4j character identity never matches the real characters.**
`create_narrative` writes character nodes with **hardcoded** names and traits regardless of what the LLM actually generated: `name: "Protagonist" / "Co-Star" / "Supporting"`, `archetype: "The Hero"`, `panksepp_primary: "SEEKING"`, etc. (`create-narrative.ts:90-103, 126-139, 166-179`). The rich generated profile only lives in the markdown file.
Then `continue_narrative` extracts continuity using the **real** character names and calls `updateCharacterState(story_id, realName, ...)`, which does `MATCH (c:Character {name:$name})` (`neo4j.ts:152-159`). Real name ≠ "Protagonist", so the match returns nothing and **every arc update silently no-ops**. The "living graph state" injected into every scene prompt is therefore frozen at the generic placeholder values forever. This is the single biggest drift source.
Fix: store the real generated name (parse it out of the profile, or have the model return name+archetype+hamartia as JSON), and stop hardcoding metadata.

**C2. `expand_to_novel` never creates characters (or architecture) in the graph.**
The big novella `an_ai_coding_assistant` (32 scenes) has **no `characters/` directory and no character nodes** — `expand_to_novel` only does beat-sheet → `continue_narrative` loop (`expand-to-novel.ts`). So `getStoryState()` returns empty characters for the whole book, and `continue_narrative` drafts 32 scenes with no character grounding in the state channel. Fix: `expand_to_novel` should seed cast + architecture (call the character/arch steps) before the drafting loop, or require they exist.

**C3. The auto-draft loop swallows failures → dropped/orphaned scenes.**
`expand_to_novel` calls `await executeContinueNarrative(...)` but **ignores the return value** (`expand-to-novel.ts:92`). `continue_narrative` catches its own errors and returns `{isError:true}` instead of throwing, so a failed scene produces no draft file and the loop keeps going. The next scene then reads `previous_scene_id = scene_{i-1}` → "Previous scene not found." → writes a disconnected scene, and final concatenation just skips the missing file. Over dozens of scenes this guarantees continuity holes. Same silent-ignore pattern in `create_narrative` fast-auto (`create-narrative.ts:227`). Fix: check each result, stop or retry on `isError`, and don't proceed past a missing previous scene.

**C4. `current_state` grows without bound.**
`updateCharacterState` does `SET c.current_state = c.current_state + " | " + $stateUpdate` (`neo4j.ts:156`). Every scene appends; the full pretty-printed graph state is then injected into every subsequent prompt (`continue-narrative.ts:62-63, 92`). Over a novella this balloons context → bloat, cost, truncation, and drift. (Currently masked by C1, which prevents updates from landing at all — fixing C1 turns this on.) Fix: cap to last N updates, or summarize, or store a bounded rolling state.

**C5. [RESOLVED 2026-06-21] Long runs were being killed by UI-introduced limits — NOT by the core engine.**
By design this system must run uncapped (an hour+ per novel), so `max_tokens` is intentionally absent from `openrouter.ts`/`ollama.ts` and must stay absent. The actual regressions were added during Web-UI development and have been removed:
- `app/api/chat/route.ts` `export const maxDuration = 300` → raised to 86400 (no practical cap; self-host doesn't enforce it anyway).
- `app/api/chat/route.ts` `stopWhen: stepCountIs(5)` → raised to 100000 (the 5-step cap silently halted multi-step orchestration).
- `app/api/models/route.ts` 4s/1.5s abort timeouts on the model-LIST fetch → raised to 60s each (the 1.5s Ollama one failed whenever Ollama was busy generating, dropping local models from the picker). These guard only the dropdown, never generation.
Note (not a code limit): the earlier live MCP timeout was the *review harness's* MCP client cutting off at ~60s, not anything in this repo. Driven by a client without a short timeout (or the Web UI), the tools run as long as they need.
Possible follow-up (optional, not a limit): during a single long tool execution the chat route streams nothing, so a browser/proxy could drop an idle connection on very long single calls. If that ever bites, stream progress between scenes or move long pipelines to a background job + status poll. Node's own server defaults don't cap response streaming.

---

## HIGH

**H1. `batch_revise_pathologies` is hardcoded to `v1` and silently no-ops on versioned drafts.** It reads/writes drafts with the default version (`batch-revise-pathologies.ts:63, 106`), while `expand_to_novel`/`apply_storyscope_revisions` use real version tags. On a v2 story it finds no drafts and revises nothing.

**H2. `apply_storyscope_revisions` is destructive.** It overwrites the v1 per-scene drafts in place (`saveDraft` default v1, `apply-storyscope-revisions.ts:79`) while saving the manuscript as `final_manuscript_v2.md`. Draft 1 scene files are lost, and re-running compounds. Fix: write rewritten scenes to a `v2` draft folder; never clobber the source.

**H3. Inconsistent recompile strategy (contradicts your own fix).** `expand_to_novel` and `apply_storyscope_revisions` concatenate scenes programmatically (good — this was the point of commit f7ee1bf). But `batch_revise_pathologies:118` and `create_narrative` fast-auto:236 still pipe all scenes through one LLM "compile, rewrite, and stitch" call, which re-truncates and silently alters/drops content on long works. Make all four use programmatic concat.

**H4. `storyscope_final_review` doesn't scale and isn't fault-tolerant.** It fires ~10 lenses via `Promise.all`, each sent the **entire** manuscript with no chunking (`storyscope-review.ts:90-128`). For 200 pages this both exceeds the diagnostic model's context window and bursts 10 large requests at once; any single rejection fails the whole tool (already-saved partial reports survive but the run reports failure). Fix: `Promise.allSettled`, limited concurrency, and chunk/summarize the manuscript per lens. (Doc also says "7 lenses"; there are 10 aspect files.)

**H5. Diagnostics go stale after revision.** `batch_revise` and `rewrite_scene` rewrite drafts but never regenerate the neuro-critique reports. The grader then re-reads outdated reports, and manuscript/diagnostics desync. Re-score after each rewrite.

---

## MEDIUM — advertised but not implemented / wired

**M1. `develop_character` only supports `create`.** `update`, `get`, `list`, `shadow_match`, `cross_pollinate` return "not yet implemented" (`develop-character.ts:94-99`), yet the tool description and README sell the "persistent Archetypal Database" with shadow-matching. Either implement or trim the schema/description.

**M2. `rewrite_scene` claims "before/after neurochemical scoring" but does none** — it's a single rewrite call (`rewrite-scene.ts`). The `target_axis` is just dropped into the prompt.

**M3. The neurochemical "threshold" system isn't real.** `NEUROCHEMICAL_PASS_THRESHOLD`, `MAX_REWRITE_ITERATIONS`, `MAX_PANKSEPP_ACTIVATIONS`, `DEFAULT_MODE` are **all unused** (only referenced in `config.ts`). The only numeric/iterative scoring logic lives in `src/engine/diagnostic-loop.ts`, which is dead code (below). In practice "pass/fail" is a vibe-based `includes("FAIL")` on a free-text grader call (`batch-revise:54-62`).

**M4. Embeddings are misconfigured.** `MODEL_EMBEDDING` (ollama/embeddinggemma) and `getEmbeddings()` are never called; Chroma queries use `queryTexts` with Chroma's **own default embedder** (`chroma.ts:68, 96`), not your configured Ollama model. So the embedding config is a no-op and vector recall quality is whatever Chroma defaults to.

**M5. `createShadowEdge` is never called** — the SHADOWS graph relationship is defined but unused.

**M6. Dead code cluster.** All of `src/engine/` (`diagnostic-loop`, `workflow-runner`, `template-filler`, `reference-loader`) and `src/ai/prompts.ts` are unimported. Worth deleting or actually wiring `diagnostic-loop` (it's the only real scored loop) to replace the vibe-grader.

---

## LOW / polish

- **Double-escaped strings.** `continue-narrative.ts:71,80` join with `"\\n\\n---\\n\\n"` → literal backslash-n in the prompt, not newlines. `neo4j.ts:173` and `develop-character.ts:65` use `/\\s+/` (matches a literal `\s`, so spaces in names/entities aren't replaced → ids contain spaces). Should be `\n` / `\s`.
- **`create_narrative` has no `required` fields**; calling it without a `logline` throws on `logline.split` (`create-narrative.ts:56`). Add `required: ["logline"]` (and ideally `target_length`).
- **OpenRouter response is unguarded**: `data.choices[0].message.content` (`openrouter.ts:34`) breaks on error bodies or reasoning-model null content; errors only surface `statusText`, hiding the real message. Guard + log `response.text()` on failure.
- **Chroma client init** uses `new ChromaClient({ path: "http://localhost:8000" })`; newer `chromadb` constructors prefer `{host, port}`. On mismatch it fails silently (caught) → vector memory becomes a no-op and `continue_narrative` loses its semantic-scene/lore context (another quiet drift path). Worth verifying against the installed `chromadb` version.
- **`continue_narrative` continuity window is thin**: previous scene + top-2 semantic scenes only; no recent-N sliding window, so mid-range continuity (events 2-4 scenes back) can drop. The "Previous scene not found." fallback also proceeds to generate anyway instead of erroring.
- **`server.ts` resolves `skill/` via `process.cwd()`** — resources/prompts break if the server is launched from another directory; use a path relative to the module.

---

## What's working well

- Clean tool registration and per-tool error envelopes (`server.ts`, `tools/index.ts`).
- Provider routing via `provider/model` string parsing is simple and correct (`router.ts`).
- Programmatic manuscript concat in `expand_to_novel`/`apply_storyscope_revisions` is the right call.
- Workspace file layout (drafts/diagnostics/structure/storyscope-reports, versioned) is sensible and produced real output across 6 stories including the 32-scene novella.
- StoryScope multi-lens prompt design and the Character Writer's Room concept are genuinely good ideas — they just need the scaling/state fixes above.

## Suggested fix order

1. C1 + C2 (graph identity + seed characters) — restores the anti-drift state layer.
2. C3 + C5 (no silent failures; `max_tokens`/timeout/retry) — makes long runs reliable.
3. C4 + H4 (bound state growth; chunk + allSettled StoryScope) — makes it scale to novel length.
4. H1/H2/H3 (version consistency; non-destructive Draft 2; programmatic concat everywhere).
5. M-series cleanup (trim or implement advertised features; delete/​wire dead code; fix embeddings).
