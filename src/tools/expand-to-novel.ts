import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";
import { neo4jStorage } from "../storage/neo4j.js";
import { executeContinueNarrative } from "./continue-narrative.js";
import { executeBuildWorldBible } from "./build-world-bible.js";
import { generateAndSeedCast } from "./_cast.js";
import {
  generateAndSeedArc,
  checkWorldModelConsistency,
  formatBeatDirective,
} from "./_arc.js";
import { storySlug } from "../storage/story-id.js";

export const expandToNovelDef = {
  name: "expand_to_novel",
  description:
    "Expands a synopsis into a structured ARC (beat-sheet scaffold seeded into the graph timeline + Chroma), runs a world-model self-consistency check, and optionally auto-drafts the whole manuscript beat by beat with the per-scene continuity gate.",
  inputSchema: {
    type: "object",
    properties: {
      story_id: { type: "string", description: "Identifier for the story" },
      synopsis: {
        type: "string",
        description: "A 1-3 page summary of the story (the author's full idea)",
      },
      target_length: {
        type: "string",
        enum: ["novella", "novel", "screenplay"],
        description: "The intended length and format.",
      },
      auto_draft: {
        type: "boolean",
        description:
          "If true, walk the arc and draft EVERY beat consecutively (each through the consistency gate). WARNING: can take an hour+ for a novel.",
        default: false,
      },
      version: {
        type: "string",
        description: "The version tag for the draft (e.g., 'v2')",
        default: "v1",
      },
      async: {
        type: "boolean",
        description:
          "Run in the background and return a job id immediately (strongly recommended when auto_draft=true). Poll with check_job.",
        default: false,
      },
    },
    required: ["story_id", "synopsis", "target_length"],
  },
};

export async function executeExpandToNovel(args: any) {
  const {
    synopsis,
    target_length,
    auto_draft = false,
    version = "v1",
  } = args;
  // Canonicalize the identity so "The Last Frequency", "the-last-frequency" and
  // "the_last_frequency" all resolve to ONE story — the graph key and the
  // workspace folder must agree, or the reuse guards below miss and regenerate.
  const story_id = storySlug(args.story_id);

  try {
    // 1. CAST first — the arc and world bible are built AROUND it. Reuse the
    // existing cast if the story already has one; otherwise seed from the
    // synopsis (the author's full idea, not a one-liner).
    let cast = await neo4jStorage.getCharactersForStory(story_id);
    // Fallback: if the graph read is empty (e.g. a transient Neo4j error, which
    // getCharactersForStory swallows into []), do NOT blindly regenerate — first
    // check whether the story already has character files on disk. Regenerating
    // over an existing cast is what produced the duplicate/split-canon casts.
    if (!cast || cast.length === 0) {
      const existingNames =
        await workspaceExporter.listCharacterNames(story_id);
      if (existingNames && existingNames.length > 0) {
        throw new Error(
          `Story "${story_id}" already has ${existingNames.length} character profile(s) on disk but none were returned from the graph — refusing to regenerate the cast and risk split canon. Check the Neo4j connection / story_ids, then retry. Existing cast: ${existingNames.join(", ")}.`,
        );
      }
      await generateAndSeedCast(story_id, synopsis);
      cast = await neo4jStorage.getCharactersForStory(story_id);
    }
    const castBrief =
      (cast || [])
        .map(
          (c: any) =>
            `- ${c.name}${c.role ? ` — ${c.role}` : ""}${c.archetype ? `; archetype: ${c.archetype}` : ""}`,
        )
        .join("\n") || "(no cast on record)";

    // 2. Architecture brief (intent/outline) — keep an existing one, else make a
    // concise one bound to the cast so continue_narrative has the story's intent.
    const existingArch =
      await workspaceExporter.readArchitectureBrief(story_id);
    if (!existingArch) {
      const archPrompt = `You are an expert story architect. Build a concise story architecture brief for a ${target_length}, based on the author's synopsis and using ONLY the established cast (invent no new named characters).\n\n=== SYNOPSIS ===\n${synopsis}\n\n=== CAST ===\n${castBrief}`;
      const arch = await aiRouter.generateCompletion({
        taskType: "generation",
        systemPrompt: archPrompt,
        userMessage: "Generate the Architecture Brief.",
      });
      await workspaceExporter.saveArchitectureBrief(story_id, arch);
    }

    // 3. World bible (continuity ledger seed) — build bound to the cast if absent.
    let worldBible = (await workspaceExporter.readWorldBible(story_id)) || "";
    if (!worldBible) {
      try {
        await executeBuildWorldBible({
          story_id,
          world_premise: `${synopsis}\n\nFormat/length: ${target_length}.`,
          cast_brief: castBrief,
        });
        worldBible = (await workspaceExporter.readWorldBible(story_id)) || "";
      } catch {
        worldBible = "";
      }
    }

    // 4. ARC SCAFFOLD — explode the synopsis into an ordered beat timeline scaled
    // to length (sheet + graph (:Beat)-[:NEXT]-> chain + Chroma), then REASON over
    // the world model + arc for self-consistency before any drafting.
    const beats = await generateAndSeedArc(
      story_id,
      synopsis,
      castBrief,
      worldBible,
      target_length,
    );
    const consistency = await checkWorldModelConsistency(
      story_id,
      worldBible,
      beats,
    );
    const arc = consistency.beats;

    if (!auto_draft) {
      return {
        content: [
          {
            type: "text",
            text: `Arc scaffold generated for ${story_id}: ${arc.length} beats seeded into the beat sheet, the graph timeline, and Chroma${consistency.consistent ? "" : " (world-model consistency issues were found and repaired — see structure/world-model-consistency.md)"}. Review the beat sheet, then rerun with auto_draft=true to draft it.`,
          },
        ],
      };
    }

    // 5. Auto-draft — walk the arc beat by beat. Each scene goes through
    // continue_narrative, which loads only that beat's related nodes and runs the
    // per-scene continuity gate before saving.
    let drafted = 0;
    for (let i = 1; i <= arc.length; i++) {
      const beat = arc[i - 1] || null;

      // Draft this beat, retrying a couple times on a transient failure so a
      // single AI/network hiccup on (say) scene 7 doesn't abandon the whole
      // manuscript. Only after the retries are exhausted do we stop.
      const MAX_SCENE_ATTEMPTS = 3;
      let res: any = null;
      for (let attempt = 1; attempt <= MAX_SCENE_ATTEMPTS; attempt++) {
        res = await executeContinueNarrative({
          story_id,
          previous_scene_id: i === 1 ? "none" : `scene_${i - 1}`,
          next_scene_id: `scene_${i}`,
          beat_order: i,
          user_direction: beat
            ? formatBeatDirective(beat)
            : `Write scene ${i} of ${arc.length}.`,
          version,
        });
        if (!res?.isError) break;
        if (attempt < MAX_SCENE_ATTEMPTS) {
          // brief backoff before retrying the same beat
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }

      // Stop only after retries are exhausted, but compile what exists so
      // partial work isn't lost.
      if (res?.isError) {
        const partial = await workspaceExporter.readAllDrafts(story_id, version);
        await workspaceExporter.saveManuscript(story_id, partial, version);
        return {
          content: [
            {
              type: "text",
              text: `Expansion stopped at scene_${i}: ${res.content?.[0]?.text || "scene generation failed"}. Drafted ${drafted} scene(s) for ${story_id} and compiled a partial manuscript. Rerun continue_narrative from scene_${drafted} to resume.`,
            },
          ],
          isError: true,
        };
      }
      drafted++;
    }

    // 6. Compile the manuscript programmatically (no LLM stitch).
    const finalManuscript = await workspaceExporter.readAllDrafts(
      story_id,
      version,
    );
    await workspaceExporter.saveManuscript(story_id, finalManuscript, version);

    return {
      content: [
        {
          type: "text",
          text: `Expansion complete! Walked ${arc.length} beats and drafted ${drafted} scenes (each through the consistency gate), then compiled the final ${target_length} manuscript for ${story_id}.`,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error running expand_to_novel: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
