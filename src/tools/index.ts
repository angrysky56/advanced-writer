import {
  createNarrativeDef,
  executeCreateNarrative,
} from "./create-narrative.js";
import {
  developCharacterDef,
  executeDevelopCharacter,
} from "./develop-character.js";
import {
  reviewNarrativeDef,
  executeReviewNarrative,
} from "./review-narrative.js";
import {
  selectStructureDef,
  executeSelectStructure,
} from "./select-structure.js";
import { rewriteSceneDef, executeRewriteScene } from "./rewrite-scene.js";
import {
  continueNarrativeDef,
  executeContinueNarrative,
} from "./continue-narrative.js";
import {
  batchRevisePathologiesDef,
  executeBatchRevisePathologies,
} from "./batch-revise-pathologies.js";
import {
  buildWorldBibleDef,
  executeBuildWorldBible,
} from "./build-world-bible.js";
import { expandToNovelDef, executeExpandToNovel } from "./expand-to-novel.js";
import {
  storyscopeFinalReviewDef,
  executeStoryscopeFinalReview,
} from "./storyscope-review.js";
import {
  applyStoryscopeRevisionsDef,
  executeApplyStoryscopeRevisions,
} from "./apply-storyscope-revisions.js";
import { findReplaceDef, executeFindReplace } from "./find-replace.js";
import { brainstormDef, executeBrainstorm } from "./brainstorm.js";
import { publishStoryDef, executePublishStory } from "./publish-story.js";
import { startJob, getJob, listJobs } from "../jobs.js";

export const checkJobDef = {
  name: "check_job",
  description:
    "Check the status/result of a background job started by running a long tool with async=true. Returns running | completed | failed plus the final summary.",
  inputSchema: {
    type: "object",
    properties: {
      job_id: {
        type: "string",
        description: "The id returned when the job started",
      },
    },
    required: ["job_id"],
  },
};

export const listJobsDef = {
  name: "list_jobs",
  description:
    "List recent background jobs (most recent first) with their status.",
  inputSchema: { type: "object", properties: {} },
};

export const ALL_TOOLS = [
  createNarrativeDef,
  developCharacterDef,
  reviewNarrativeDef,
  selectStructureDef,
  rewriteSceneDef,
  continueNarrativeDef,
  batchRevisePathologiesDef,
  buildWorldBibleDef,
  expandToNovelDef,
  storyscopeFinalReviewDef,
  applyStoryscopeRevisionsDef,
  findReplaceDef,
  brainstormDef,
  publishStoryDef,
  checkJobDef,
  listJobsDef,
];

// Tools whose work can take minutes-to-hours. When called with async=true they
// run detached and return a job id immediately instead of blocking the client.
const ASYNC_CAPABLE = new Set([
  "create_narrative",
  "continue_narrative",
  "batch_revise_pathologies",
  "expand_to_novel",
  "storyscope_final_review",
  "apply_storyscope_revisions",
]);

export async function executeTool(name: string, args: any) {
  // Background mode: fire-and-forget for long tools.
  if (args && args.async === true && ASYNC_CAPABLE.has(name)) {
    const { async: _async, ...rest } = args;
    const rec = startJob(name, rest, () => dispatch(name, rest));
    return {
      content: [
        {
          type: "text",
          text: `Started '${name}' as background job ${rec.id}. It will keep running after this call returns. Poll with check_job {"job_id":"${rec.id}"}, or watch the workspace files appear.`,
        },
      ],
    };
  }

  if (name === "check_job") {
    const rec = getJob(args?.job_id);
    if (!rec) {
      return {
        content: [
          { type: "text", text: `No job found with id '${args?.job_id}'.` },
        ],
        isError: true,
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(rec, null, 2) }] };
  }

  if (name === "list_jobs") {
    const jobs = listJobs();
    if (jobs.length === 0)
      return { content: [{ type: "text", text: "No background jobs yet." }] };
    const running = jobs.filter((j) => j.status === "running");
    const finished = jobs.filter((j) => j.status !== "running").slice(0, 6);
    const fmt = (j: any) => `- ${j.id} ${j.tool}${j.args?.version ? ` (${j.args.version})` : ""}`;
    const text =
      `RUNNING NOW (${running.length}) — only these are still in progress:\n` +
      (running.length ? running.map(fmt).join("\n") : "  (none — nothing is running)") +
      `\n\nAlready finished (history, NOT running):\n` +
      (finished.length ? finished.map((j) => `${fmt(j)} → ${j.status}`).join("\n") : "  (none)") +
      `\n\nNOTE: Report ONLY the RUNNING jobs as active. The finished list is history — do not describe it as in-progress.`;
    return { content: [{ type: "text", text }] };
  }

  return dispatch(name, args);
}

async function dispatch(name: string, args: any) {
  switch (name) {
    case "create_narrative":
      return executeCreateNarrative(args);
    case "develop_character":
      return executeDevelopCharacter(args);
    case "review_narrative":
      return executeReviewNarrative(args);
    case "select_structure":
      return executeSelectStructure(args);
    case "rewrite_scene":
      return executeRewriteScene(args);
    case "continue_narrative":
      return executeContinueNarrative(args);
    case "batch_revise_pathologies":
      return executeBatchRevisePathologies(args);
    case "build_world_bible":
      return executeBuildWorldBible(args);
    case "expand_to_novel":
      return executeExpandToNovel(args);
    case "storyscope_final_review":
      return executeStoryscopeFinalReview(args);
    case "apply_storyscope_revisions":
      return executeApplyStoryscopeRevisions(args);
    case "find_replace":
      return executeFindReplace(args);
    case "brainstorm_ideas":
      return executeBrainstorm(args);
    case "publish_story":
      return executePublishStory(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
