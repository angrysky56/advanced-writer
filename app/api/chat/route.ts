import { createOpenAI } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import {
  streamText,
  tool,
  zodSchema,
  stepCountIs,
  convertToModelMessages,
} from "ai";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";

// Import tool executors
import { executeCreateNarrative } from "../../../src/tools/create-narrative";
import { executeDevelopCharacter } from "../../../src/tools/develop-character";
import { executeReviewNarrative } from "../../../src/tools/review-narrative";
import { executeSelectStructure } from "../../../src/tools/select-structure";
import { executeRewriteScene } from "../../../src/tools/rewrite-scene";
import { executeContinueNarrative } from "../../../src/tools/continue-narrative";
import { executeBatchRevisePathologies } from "../../../src/tools/batch-revise-pathologies";
import { executeBuildWorldBible } from "../../../src/tools/build-world-bible";
import { executeExpandToNovel } from "../../../src/tools/expand-to-novel";
import { executeStoryscopeFinalReview } from "../../../src/tools/storyscope-review";
import { executeApplyStoryscopeRevisions } from "../../../src/tools/apply-storyscope-revisions";
import { executeWebSearch } from "../../../src/tools/web-search";
import { executeBrainstorm } from "../../../src/tools/brainstorm";
import { workspaceExporter } from "../../../src/storage/workspace";
import { aiRouter } from "../../../src/ai/router";
import { startJob } from "../../../src/jobs";

// ---- SKILL.md injection: load the craft persona once at startup ----
const SKILL_PATH = path.join(process.cwd(), "skill", "SKILL.md");
let skillMdCache: string | null = null;
function loadSkillMd(): string {
  if (skillMdCache !== null) return skillMdCache;
  try {
    skillMdCache = fs.readFileSync(SKILL_PATH, "utf-8").trim();
  } catch {
    skillMdCache = "";
    console.warn("[chat] Could not load SKILL.md from", SKILL_PATH);
  }
  return skillMdCache;
}

/**
 * Wrap a long, draft-mutating tool so the chat STARTS it as a background job and
 * returns immediately. Multi-minute runs must never hold the chat stream open:
 * the work completes server-side, but the held stream gets truncated and the
 * copilot's final message is lost ("no response, but a new draft appeared").
 * The Studio's job poller refreshes the UI when the job lands.
 */
function runAsJob(
  tool: string,
  exec: (args: any) => Promise<any>,
  describe: string,
) {
  return async (args: any) => {
    const rec = startJob(tool, args, () => exec(args));
    return `Started ${describe} — ONE background job, id ${rec.id}. Report THIS single job only: tell the user it's running in the background and to watch the draft-version selector for the new version (the Studio refreshes on its own when it finishes). Do NOT claim it's done, do NOT invent a multi-job status table, and do NOT describe any other jobs as running — only ${rec.id}.`;
  };
}

/**
 * Compact snapshot of the project open in the Studio, injected into the system
 * prompt so the copilot knows what already exists (and uses read_story for full
 * content) instead of asking the user to re-describe their own story.
 */
async function loadProjectContext(
  storyId: string,
  version: string,
): Promise<string> {
  try {
    const [arch, chars, sceneFiles, versions, manuscript, worldBible] =
      await Promise.all([
        workspaceExporter.readArchitectureBrief(storyId),
        workspaceExporter.listCharacterNames(storyId),
        workspaceExporter.listDrafts(storyId, version),
        workspaceExporter.listDraftVersions(storyId),
        workspaceExporter.readManuscript(storyId, version),
        workspaceExporter.readWorldBible(storyId),
      ]);
    const scenes = (sceneFiles || []).map((f: string) =>
      f.replace(/\.md$/, ""),
    );
    const archSnippet = arch ? arch.replace(/\s+/g, " ").slice(0, 1500) : "";
    const lines = [
      `ACTIVE PROJECT: "${storyId}" (user is viewing draft ${version}).`,
      `Available draft versions: ${(versions && versions.length ? versions : ["v1"]).join(", ")}.`,
      chars.length ? `Characters: ${chars.join(", ")}.` : "Characters: none yet.",
      scenes.length
        ? `Scenes in ${version}: ${scenes.join(", ")}.`
        : `Scenes in ${version}: none yet.`,
      `Compiled manuscript for ${version}: ${manuscript ? `present (~${manuscript.length} chars)` : "not compiled yet"}.`,
      `World bible: ${worldBible ? "present" : "none"}. Architecture brief: ${arch ? "present" : "none"}.`,
      archSnippet ? `Architecture brief (excerpt): ${archSnippet}` : "",
      "This project ALREADY EXISTS in the workspace. Do NOT ask the user what the story is about — call read_story to load the manuscript, a scene, the architecture brief, the world bible, the beat sheet, or the character profiles as needed, then act.",
    ].filter(Boolean);
    return "\n\n=== CURRENT PROJECT CONTEXT ===\n" + lines.join("\n");
  } catch {
    return "";
  }
}

// No time cap: novel-length runs can take an hour or more. This system is
// designed to run long; do NOT reintroduce a maxDuration cap. (Self-hosted
// Next has no hard enforcement; the high value documents intent and avoids the
// short serverless default if ever deployed behind one.)
export const maxDuration = 86400; // 24h

export async function POST(req: Request) {
  const {
    messages,
    model: requestModel,
    modelOverrides,
    mode,
    story_id: activeStoryId,
    version: activeVersion,
  } = await req.json();

  if (modelOverrides) {
    aiRouter.setOverrides(modelOverrides);
  }

  // Resolve model string (e.g. "openrouter/deepseek/deepseek-v4-pro" or "default")
  const modelString =
    modelOverrides?.generation ||
    (requestModel && requestModel !== "default"
      ? requestModel
      : process.env.MODEL_GENERATION || "openrouter/deepseek/deepseek-v4-pro");

  // Determine provider and model ID
  const slashIndex = modelString.indexOf("/");
  if (slashIndex === -1) {
    return new Response(
      JSON.stringify({
        error: `Invalid model format: ${modelString}. Expected 'provider/model-id'.`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const provider = modelString.substring(0, slashIndex);
  const modelId = modelString.substring(slashIndex + 1);

  let chatModel;
  try {
    if (provider === "openrouter") {
      if (!process.env.OPENROUTER_API_KEY) {
        throw new Error("OPENROUTER_API_KEY is not configured in environment.");
      }
      const openrouter = createOpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: process.env.OPENROUTER_API_KEY,
        headers: {
          "HTTP-Referer": "http://localhost:3100",
          "X-Title": "Advanced Writer Workspace",
        },
      });
      chatModel = openrouter(modelId);
    } else if (provider === "ollama") {
      const ollama = createOpenAI({
        baseURL: `${process.env.OLLAMA_BASE_URL || "http://localhost:11434"}/v1`,
        apiKey: "ollama", // Dummy key
      });
      chatModel = ollama(modelId);
    } else if (provider === "anthropic") {
      chatModel = anthropic(modelId);
    } else if (provider === "openai") {
      const openai = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      chatModel = openai(modelId);
    } else {
      return new Response(
        JSON.stringify({ error: `Unsupported AI provider: ${provider}` }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // useChat sends UI messages (with `parts`); streamText needs model messages.
  const modelMessages = await convertToModelMessages(messages);

  // ---- System prompt: inject SKILL.md + operational instructions ----
  const skillContext = loadSkillMd();
  const baseSystem =
    "You are an autonomous AI Novel Writing Copilot. You orchestrate the tools to write, review, and revise stories. " +
    "apply_storyscope_revisions requires a StoryScope review to exist; it auto-increments the draft version. Do NOT re-run storyscope_final_review if a review (executive summary + lens reports) already exists for the project — only run it when none exists yet, then apply. Never run a review you already have. " +
    "If they ask you to research something, use web_search. If they ask to expand a novel from scratch, use expand_to_novel. " +
    "You have access to narrative engineering tools to build character decks, select story architectures, write scene drafts, score neurochemical pacing, and debate character agency.\n\n" +
    "BACKGROUND JOBS — be precise and never fabricate. When you start an async tool you get back ONE job id; report exactly that single job and tell the user it's running in the background and to watch the draft-version selector for the new version. To report status, CALL `list_jobs` or `check_job` and read the result — do NOT invent a status table or describe jobs from memory. `list_jobs` separates jobs that are RUNNING NOW from finished history; only the RUNNING ones are active — never describe finished/history jobs as in-progress, and never claim multiple pipelines are running unless `list_jobs` shows multiple with status running. Do not re-run reviews or revisions for versions the user didn't ask about.\n\n" +
    "CRITICAL — when calling create_narrative, you MUST pass the full, detailed story idea (characters, beats, tone, setting, intended ending, everything discussed) into the `premise` field. The `logline` is only a short tag for naming; the `premise` is what the engine actually builds the story from. Compressing the discussion into a one-line logline will produce a different, worse story. Synthesize everything the user has discussed into the `premise`.\n\n" +
    (skillContext
      ? `=== ADVANCED WRITER SKILL (your craft persona — follow these principles) ===\n${skillContext}\n=== END SKILL ===\n`
      : "");

  // Brainstorm surface: lead with MEANING, not plot mechanics. Interrogate why
  // a premise's familiar elements actually appeal before discussing execution.
  const brainstormSystem =
    "\n\nBRAINSTORM MODE — you are a thoughtful developmental editor in a discovery conversation. The user is exploring ideas, not yet writing. Your job is to deepen an idea's RESONANCE, not just stress-test its plot.\n" +
    "When discussing any premise, begin with its APPEAL and underlying metaphor before mechanics. For every familiar element or trope (a 'well-worn door'), ask explicitly: What is the appeal? Why do people love this? Is it merely a plot device, or is it load-bearing metaphor? Then NAME the human pull underneath it — e.g. the person who isn't really himself (who we could have been); the one with a secret power (hiding from our own powerlessness); another life outside the mundane (escape); the return of what we buried (guilt, grief). A trope is a worn door for a reason: don't dismiss it — excavate why it resonates, then find the fresh, specific, emotionally true way to honor that core.\n" +
    "Only after the thematic/emotional engine is clear should you move to craft (structure, stakes, character, mechanics). Offer angles and questions; pull on what the writer is circling. Do NOT start writing, and do NOT run drafting tools, unless the user explicitly says they're ready. You may use brainstorm_ideas to generate or riff on concepts.";

  // Draft surface: ACT, don't interview. The injected SKILL.md persona declares
  // "Brainstorm Q&A (DEFAULT)" — which is correct for the brainstorm surface but
  // WRONG here; left unchecked it makes the copilot ask round after round of
  // questions and never draft. This overlay makes execution the default so a
  // "write/expand/continue/turn into a screenplay" request goes straight to the
  // tools using the context already on hand.
  const executionSystem =
    "\n\nEXECUTION MODE (this is the default surface — you are NOT in brainstorm mode). " +
    "The SKILL.md '<mode_system>' marks 'Brainstorm Q&A' as its default and the '<intake>' step says to wait for the user — those apply ONLY to the brainstorm surface and are OVERRIDDEN here. In this mode you operate in Fast-Auto: you DRAFT. " +
    "When the user asks to write, create, draft, expand, continue, or 'turn it into' a screenplay/novella/novel/scene/chapter, immediately CALL the appropriate tool — create_narrative, expand_to_novel (auto_draft), continue_narrative, rewrite_scene, or develop_character — using the project context and conversation you already have. The active project, its premise, cast, architecture brief, world bible and beat sheet are already available to you (and read_story can load any of it); do NOT re-ask what the story is about. " +
    "Do NOT interview the user. Do NOT ask clarifying or scoping questions before acting. Make the most reasonable assumptions from the existing material and PRODUCE the draft — the user refines afterward by reading the result, not by answering questionnaires. If something is genuinely, blockingly missing (e.g. no premise exists at all), make a sensible choice and proceed anyway; ask at most ONE short question only when you truly cannot proceed without it. " +
    "Bias hard toward completing the whole requested artifact (the full screenplay/manuscript), not a single scene. For multi-scene work prefer expand_to_novel with auto_draft so the entire piece is drafted, not just the opening.";

  let system =
    mode === "brainstorm"
      ? baseSystem + brainstormSystem
      : baseSystem + executionSystem;

  // Give the copilot awareness of the project currently open in the Studio, so
  // it never asks "what's the story about?" about a story sitting right there.
  if (activeStoryId) {
    system += await loadProjectContext(activeStoryId, activeVersion || "v1");
  }

  const result = streamText({
    model: chatModel,
    messages: modelMessages,
    system,
    // Effectively unlimited agent autonomy. A low cap here silently halts
    // multi-step orchestration (e.g. drafting many scenes / multi-draft
    // pipelines). High guard prevents only pathological infinite loops.
    stopWhen: stepCountIs(100000),
    tools: {
      create_narrative: tool({
        description:
          "Build a complete narrative from a logline, premise, or raw idea. Runs an 8-step pipeline: intake -> hamartia -> framework -> characters -> architecture -> draft -> diagnostic.",
        inputSchema: zodSchema(
          z.object({
            logline: z
              .string()
              .describe(
                "One-sentence hook/title seed. Short. Used for naming and as a fallback if no full premise is given.",
              ),
            premise: z
              .string()
              .optional()
              .describe(
                "The FULL story idea in the author's own words — characters, world, tone, key beats, the desired ending, any constraints. THIS is what the cast, architecture, world bible, and prose are built from. Always provide this when you have it; do not compress the idea down to the logline.",
              ),
            genre: z
              .string()
              .describe(
                "Primary genre (e.g., literary fiction, sci-fi, thriller)",
              ),
            tone: z
              .string()
              .describe("Desired tone (e.g., dark, comedic, elegiac)"),
            target_length: z
              .enum([
                "short_story",
                "novella",
                "novel",
                "screenplay",
                "book_of_poems",
              ])
              .describe("Intended narrative format length"),
            mode: z
              .enum(["brainstorm", "collaborative", "fast-auto"])
              .default("brainstorm")
              .describe("Operation mode"),
            existing_character_ids: z
              .array(z.string())
              .optional()
              .describe("Pull characters from the library"),
            story_name: z
              .string()
              .optional()
              .describe("Identifier for the story to save under"),
          }),
        ),
        execute: runAsJob(
          "create_narrative",
          executeCreateNarrative,
          "the new narrative build",
        ),
      }),

      develop_character: tool({
        description:
          "Create, update, query, or shadow-match characters in the persistent Archetypal Database.",
        inputSchema: zodSchema(
          z.object({
            action: z
              .enum(["create", "update", "get", "list", "shadow_match"])
              .describe("Action to perform"),
            character_id: z
              .string()
              .optional()
              .describe("For update/get/shadow_match"),
            name: z.string().optional().describe("For create"),
            archetype: z
              .string()
              .optional()
              .describe("For create — one of 12 Jungian archetypes"),
            story_name: z
              .string()
              .optional()
              .describe("Story to associate this character with"),
            mode: z
              .enum(["brainstorm", "collaborative", "fast-auto"])
              .default("brainstorm")
              .describe("Operation mode"),
          }),
        ),
        execute: async (args) => {
          const res = await executeDevelopCharacter(args);
          return res.content[0].text;
        },
      }),

      review_narrative: tool({
        description:
          "Run neurochemical scoring, pathology diagnostics, and agency enforcement on existing text. Produces a structured neuro-critique report.",
        inputSchema: zodSchema(
          z.object({
            text: z.string().describe("The narrative text to review"),
            scope: z
              .enum(["scene", "chapter", "full"])
              .default("scene")
              .describe("Scope of review"),
            story_id: z
              .string()
              .optional()
              .describe("Link review to existing story"),
            scene_id: z
              .string()
              .optional()
              .describe("Identifier for the scene"),
          }),
        ),
        execute: async (args) => {
          const res = await executeReviewNarrative(args);
          return res.content[0].text;
        },
      }),

      select_structure: tool({
        description:
          "Interactively select the right structural framework (Truby, Dramatica, Kishōtenketsu, Fichtean) for a story based on its Designing Principle.",
        inputSchema: zodSchema(
          z.object({
            premise: z.string().describe("Story premise or logline"),
            designing_principle: z
              .string()
              .optional()
              .describe("The abstract structural logic"),
            story_name: z
              .string()
              .optional()
              .describe("Name of the story to export to"),
            mode: z
              .enum(["brainstorm", "collaborative", "fast-auto"])
              .default("brainstorm")
              .describe("Operation mode"),
          }),
        ),
        execute: async (args) => {
          const res = await executeSelectStructure(args);
          return res.content[0].text;
        },
      }),

      rewrite_scene: tool({
        description:
          "Targeted scene rewriting with before/after neurochemical scoring. Identifies specific pathologies and produces an improved version.",
        inputSchema: zodSchema(
          z.object({
            scene_text: z.string().describe("The scene to rewrite"),
            target_axis: z
              .enum(["cortisol", "oxytocin", "dopamine"])
              .describe("Which axis to prioritize raising"),
            story_id: z
              .string()
              .optional()
              .describe("Context from existing story"),
            scene_id: z
              .string()
              .optional()
              .describe("Identifier for the scene"),
            character_ids: z
              .array(z.string())
              .optional()
              .describe("Characters in the scene"),
          }),
        ),
        execute: async (args) => {
          const res = await executeRewriteScene(args);
          return res.content[0].text;
        },
      }),

      continue_narrative: tool({
        description:
          "Continue drafting a story by generating the next scene based on the previous scene, the story architecture, and user direction.",
        inputSchema: zodSchema(
          z.object({
            story_id: z.string().describe("The identifier for the story"),
            previous_scene_id: z
              .string()
              .describe("The identifier of the preceding scene"),
            next_scene_id: z
              .string()
              .describe("The identifier to save the new scene as"),
            user_direction: z
              .string()
              .optional()
              .describe(
                "Optional feedback or direction for where the story should go next",
              ),
            beat_order: z
              .number()
              .optional()
              .describe(
                "Optional 1-based index of the arc beat this scene delivers. If given, the engine loads that beat and only its related nodes (characters present, location) instead of the whole graph.",
              ),
            version: z
              .string()
              .default("v1")
              .describe("The draft version to use"),
          }),
        ),
        execute: runAsJob(
          "continue_narrative",
          executeContinueNarrative,
          "the next scene draft",
        ),
      }),

      batch_revise_pathologies: tool({
        description:
          "Scans a story's diagnostics, triggers a Character Writer's Room debate for failing scenes, and automatically rewrites them based on the characters' feedback.",
        inputSchema: zodSchema(
          z.object({
            story_id: z.string().describe("The story to batch revise"),
            target_length: z
              .enum([
                "short_story",
                "novella",
                "novel",
                "screenplay",
                "book_of_poems",
              ])
              .default("screenplay")
              .describe("The format to recompile the final manuscript into"),
          }),
        ),
        execute: runAsJob(
          "batch_revise_pathologies",
          executeBatchRevisePathologies,
          "the Character Writer's Room batch revision",
        ),
      }),

      build_world_bible: tool({
        description:
          "Expands a premise into a highly detailed World Bible including Factions, Tech/Magic, Economics, and Geography, and saves it to Vector Memory.",
        inputSchema: zodSchema(
          z.object({
            story_id: z.string().describe("Identifier for the story/world"),
            world_premise: z
              .string()
              .describe("The raw premise or logline of the world to build"),
          }),
        ),
        execute: async (args) => {
          const res = await executeBuildWorldBible(args);
          return res.content[0].text;
        },
      }),

      expand_to_novel: tool({
        description:
          "Expands a brief synopsis into a structured Beat Sheet, and auto-drafts the manuscript.",
        inputSchema: zodSchema(
          z.object({
            story_id: z.string().describe("Identifier for the story"),
            synopsis: z.string().describe("Summary of the story"),
            target_length: z
              .enum(["novella", "novel", "screenplay"])
              .describe("Intended length"),
            auto_draft: z
              .boolean()
              .default(true)
              .describe("Whether to draft the scenes automatically"),
            version: z
              .string()
              .default("v1")
              .describe("The draft version to write to"),
          }),
        ),
        execute: runAsJob(
          "expand_to_novel",
          executeExpandToNovel,
          "the novel expansion / auto-draft",
        ),
      }),

      storyscope_final_review: tool({
        description:
          "Runs the multi-agent StoryScope review on a finished manuscript, dispatching parallel lenses and synthesizing an Executive Summary. The review is saved per draft version and never overwrites another version's review.",
        inputSchema: zodSchema(
          z.object({
            story_id: z.string().describe("Identifier for the story to review"),
            version: z
              .string()
              .optional()
              .describe(
                "Draft version to review (e.g. 'v2'). Defaults to the latest draft.",
              ),
          }),
        ),
        execute: runAsJob(
          "storyscope_final_review",
          executeStoryscopeFinalReview,
          "the multi-agent StoryScope review",
        ),
      }),

      apply_storyscope_revisions: tool({
        description:
          "Applies StoryScope diagnostic revisions to a draft and generates a new revised draft.",
        inputSchema: zodSchema(
          z.object({
            story_id: z.string().describe("Identifier for the story"),
          }),
        ),
        execute: runAsJob(
          "apply_storyscope_revisions",
          executeApplyStoryscopeRevisions,
          "the StoryScope revision (new draft version)",
        ),
      }),

      read_story: tool({
        description:
          "Read the ACTUAL existing content of a story from the workspace. Use this before expanding, revising, screenwriting, or answering questions about a story that already exists — never ask the user to re-describe a story that is already in the project. Returns the requested material as text.",
        inputSchema: zodSchema(
          z.object({
            story_id: z
              .string()
              .describe("The story id (use the active project's id)."),
            what: z
              .enum([
                "manuscript",
                "scene",
                "architecture",
                "world_bible",
                "beat_sheet",
                "characters",
                "scenes_list",
              ])
              .describe("Which material to read."),
            scene_id: z
              .string()
              .optional()
              .describe("Required when what='scene' (e.g. 'scene_1')."),
            version: z
              .string()
              .optional()
              .describe("Draft version (default 'v1')."),
          }),
        ),
        execute: async ({ story_id, what, scene_id, version }) => {
          const v = version || "v1";
          try {
            switch (what) {
              case "manuscript":
                return (
                  (await workspaceExporter.readManuscript(story_id, v)) ||
                  `(no compiled manuscript for ${v})`
                );
              case "scene":
                if (!scene_id) return "(scene_id is required to read a scene)";
                return (
                  (await workspaceExporter.readDraft(story_id, scene_id, v)) ||
                  `(no scene '${scene_id}' in ${v})`
                );
              case "architecture":
                return (
                  (await workspaceExporter.readArchitectureBrief(story_id)) ||
                  "(no architecture brief yet)"
                );
              case "world_bible":
                return (
                  (await workspaceExporter.readWorldBible(story_id)) ||
                  "(no world bible yet)"
                );
              case "beat_sheet":
                return (
                  (await workspaceExporter.readBeatSheet(story_id)) ||
                  "(no beat sheet yet)"
                );
              case "characters":
                return (
                  (await workspaceExporter.readAllCharacterProfiles(story_id)) ||
                  "(no character profiles yet)"
                );
              case "scenes_list": {
                const files = await workspaceExporter.listDrafts(story_id, v);
                return files && files.length
                  ? files.map((f: string) => f.replace(/\.md$/, "")).join(", ")
                  : `(no scenes in ${v})`;
              }
              default:
                return "(unknown read target)";
            }
          } catch (e: any) {
            return `(read error: ${e?.message || e})`;
          }
        },
      }),

      web_search: tool({
        description:
          "Searches the web for historical facts, data, or references.",
        inputSchema: zodSchema(
          z.object({
            query: z.string().describe("The search query"),
          }),
        ),
        execute: async (args) => {
          const res = await executeWebSearch(args);
          return res.content[0].text;
        },
      }),

      brainstorm_ideas: tool({
        description:
          "Generate a batch of genuinely good, distinct story concepts (logline + genre + tone + hook) for brainstorming — premises with a real emotional core and a fresh angle, the kind that could become a beloved or cult-classic novel, never gimmicks or absurdist mashups. Use for fresh ideas, riffs on a seed, or 'more like that'. Discussion only — this never starts writing a story.",
        inputSchema: zodSchema(
          z.object({
            seed: z
              .string()
              .optional()
              .describe("Optional theme/genre/keywords/vibe to steer around."),
            wildness: z
              .number()
              .optional()
              .describe(
                "Ambition: 0 grounded literary realism … 100 visionary/speculative. Scales reach, not absurdity. Default 40.",
              ),
            count: z
              .number()
              .optional()
              .describe("How many concepts (1–8). Default 4."),
            avoid: z
              .array(z.string())
              .optional()
              .describe("Loglines to avoid repeating (for 'give me more')."),
          }),
        ),
        execute: async (args) => {
          const res = await executeBrainstorm(args);
          return res.content[0].text;
        },
      }),

      save_world_bible: tool({
        description:
          "Saves or updates the World Bible with new lore, rules, or research.",
        inputSchema: zodSchema(
          z.object({
            story_id: z.string().describe("Identifier for the story"),
            content: z
              .string()
              .describe("The full Markdown content of the World Bible"),
          }),
        ),
        execute: async ({ story_id, content }) => {
          const filePath = await workspaceExporter.saveWorldBible(
            story_id,
            content,
          );
          return `Saved World Bible to ${filePath}`;
        },
      }),
    },
  });

  // useChat expects the UI message stream protocol (text + reasoning + tool
  // parts), which the frontend renders via m.parts. A plain text stream here is
  // silently unparseable by useChat — the original "send, no response, no error".
  // Surface the real error instead of the default "An error occurred." mask, so
  // a failed turn is visible rather than appearing as an empty response.
  return result.toUIMessageStreamResponse({
    onError: (error) => {
      const msg =
        error instanceof Error ? error.message : String(error ?? "Unknown error");
      console.error("[chat] stream error:", msg);
      return `⚠ Copilot error: ${msg}`;
    },
  });
}
