import { anthropic } from "@ai-sdk/anthropic";
import { streamText, tool, zodSchema, stepCountIs } from "ai";
import { z } from "zod";
import { executeExpandToNovel } from "../../../src/tools/expand-to-novel";
import { executeStoryscopeFinalReview } from "../../../src/tools/storyscope-review";
import { executeApplyStoryscopeRevisions } from "../../../src/tools/apply-storyscope-revisions";
import { executeWebSearch } from "../../../src/tools/web-search";
import { workspaceExporter } from "../../../src/storage/workspace";

// Allow streaming responses up to 5 minutes
export const maxDuration = 300;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: anthropic("claude-3-7-sonnet-20250219"),
    messages,
    system:
      "You are an autonomous AI Novel Writing Copilot. You orchestrate the tools to write, review, and revise stories. If the user asks for Draft 3, and Draft 2 exists, you should run storyscope_final_review on Draft 2, and then run apply_storyscope_revisions to generate Draft 3. If they ask you to research something, use web_search. If they ask to expand a novel from scratch, use expand_to_novel. You can also save world bible notes directly if asked.",
    stopWhen: stepCountIs(5),
    tools: {
      expand_to_novel: tool({
        description:
          "Expands a brief synopsis into a structured Beat Sheet, and auto-drafts the manuscript.",
        inputSchema: zodSchema(z.object({
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
        })),
        execute: async ({ story_id, synopsis, target_length, auto_draft, version }) => {
          const res = await executeExpandToNovel({ story_id, synopsis, target_length, auto_draft, version });
          return res.content[0].text;
        },
      }),
      storyscope_final_review: tool({
        description:
          "Runs 10 independent diagnostic agents on the latest draft.",
        inputSchema: zodSchema(z.object({
          story_id: z.string().describe("Identifier for the story"),
          draft_version: z
            .string()
            .default("v1")
            .describe("Which version of the draft to review"),
        })),
        execute: async ({ story_id, draft_version }) => {
          const res = await executeStoryscopeFinalReview({ story_id, draft_version });
          return res.content[0].text;
        },
      }),
      apply_storyscope_revisions: tool({
        description:
          "Applies the StoryScope diagnostics to a draft and generates a new, revised draft.",
        inputSchema: zodSchema(z.object({
          story_id: z.string().describe("Identifier for the story"),
          draft_version: z
            .string()
            .default("v1")
            .describe("The source draft version to revise"),
          new_version: z
            .string()
            .describe(
              "The new version tag to save the revised draft as (e.g., v3)",
            ),
        })),
        execute: async ({ story_id, draft_version, new_version }) => {
          const res = await executeApplyStoryscopeRevisions({ story_id, draft_version, new_version });
          return res.content[0].text;
        },
      }),
      web_search: tool({
        description:
          "Searches the web for historical facts, data, or references.",
        inputSchema: zodSchema(z.object({
          query: z.string().describe("The search query"),
        })),
        execute: async ({ query }) => {
          const res = await executeWebSearch({ query });
          return res.content[0].text;
        },
      }),
      save_world_bible: tool({
        description:
          "Saves or updates the World Bible with new lore, rules, or research.",
        inputSchema: zodSchema(z.object({
          story_id: z.string().describe("Identifier for the story"),
          content: z
            .string()
            .describe("The full Markdown content of the World Bible"),
        })),
        execute: async ({ story_id, content }) => {
          const filePath = await workspaceExporter.saveWorldBible(story_id, content);
          return `Saved World Bible to ${filePath}`;
        },
      }),
    },
  });

  return result.toTextStreamResponse();
}
