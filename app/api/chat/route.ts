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
import { workspaceExporter } from "../../../src/storage/workspace";
import { aiRouter } from "../../../src/ai/router";

// No time cap: novel-length runs can take an hour or more. This system is
// designed to run long; do NOT reintroduce a maxDuration cap. (Self-hosted
// Next has no hard enforcement; the high value documents intent and avoids the
// short serverless default if ever deployed behind one.)
export const maxDuration = 86400; // 24h

export async function POST(req: Request) {
  const { messages, model: requestModel, modelOverrides } = await req.json();

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

  const result = streamText({
    model: chatModel,
    messages: modelMessages,
    system:
      "You are an autonomous AI Novel Writing Copilot. You orchestrate the tools to write, review, and revise stories. " +
      "apply_storyscope_revisions requires a StoryScope review to exist; it auto-increments the draft version. Do NOT re-run storyscope_final_review if a review (executive summary + lens reports) already exists for the project — only run it when none exists yet, then apply. Never run a review you already have. " +
      "If they ask you to research something, use web_search. If they ask to expand a novel from scratch, use expand_to_novel. " +
      "You have access to 11 narrative engineering tools to build character decks, select story architectures, write scene drafts, score neurochemical pacing, and debate character agency.",
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
            logline: z.string().describe("One-sentence story premise"),
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
        execute: async (args) => {
          const res = await executeCreateNarrative(args);
          return res.content[0].text;
        },
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
            version: z
              .string()
              .default("v1")
              .describe("The draft version to use"),
          }),
        ),
        execute: async (args) => {
          const res = await executeContinueNarrative(args);
          return res.content[0].text;
        },
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
        execute: async (args) => {
          const res = await executeBatchRevisePathologies(args);
          return res.content[0].text;
        },
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
        execute: async (args) => {
          const res = await executeExpandToNovel(args);
          return res.content[0].text;
        },
      }),

      storyscope_final_review: tool({
        description:
          "Runs the multi-agent StoryScope review on a finished manuscript, dispatching parallel lenses and synthesizing an Executive Summary.",
        inputSchema: zodSchema(
          z.object({
            story_id: z.string().describe("Identifier for the story to review"),
          }),
        ),
        execute: async (args) => {
          const res = await executeStoryscopeFinalReview(args);
          return res.content[0].text;
        },
      }),

      apply_storyscope_revisions: tool({
        description:
          "Applies StoryScope diagnostic revisions to a draft and generates a new revised draft.",
        inputSchema: zodSchema(
          z.object({
            story_id: z.string().describe("Identifier for the story"),
          }),
        ),
        execute: async (args) => {
          const res = await executeApplyStoryscopeRevisions(args);
          return res.content[0].text;
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
  return result.toUIMessageStreamResponse();
}
