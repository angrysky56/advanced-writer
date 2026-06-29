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
  parseBeatSheet,
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

    // 4. ARC SCAFFOLD — REUSE an existing arc if the story already has one, so a
    // resumed run continues against the SAME beat timeline its scenes were
    // written to (regenerating the arc mid-story would desync the drafted scenes
    // from the plan). Reuse from the BEAT SHEET (lossless: it keeps every field,
    // incl. `establishes` + `characters_present`), NOT the graph — getArc drops
    // those, which fed resumed scenes thinner directives and caused a style seam
    // at the resume boundary. Fall back to the graph only if the sheet is gone.
    const existingSheet = await workspaceExporter.readBeatSheet(story_id);
    let arc: any[] = parseBeatSheet(existingSheet || "");
    if (!arc || arc.length === 0) {
      arc = await neo4jStorage.getArc(story_id);
    }
    const reusedArc = arc && arc.length > 0;
    let consistencyNote = "";
    if (!reusedArc) {
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
      arc = consistency.beats;
      consistencyNote = consistency.consistent
        ? ""
        : " (world-model consistency issues were found and repaired — see structure/world-model-consistency.md)";
    }

    if (!auto_draft) {
      return {
        content: [
          {
            type: "text",
            text: reusedArc
              ? `Reusing the existing ${arc.length}-beat arc for ${story_id}. Rerun with auto_draft=true to draft (or resume) it.`
              : `Arc scaffold generated for ${story_id}: ${arc.length} beats seeded into the beat sheet, the graph timeline, and Chroma${consistencyNote}. Review the beat sheet, then rerun with auto_draft=true to draft it.`,
          },
        ],
      };
    }

    // 5. Auto-draft — walk the arc beat by beat. This loop is RESUMABLE and
    // RESILIENT:
    //   - scenes already drafted on disk are SKIPPED, so a re-run continues from
    //     the gap instead of redoing finished work,
    //   - each scene is retried a few times on a transient failure,
    //   - if a scene still can't be drafted, we STOP cleanly (we do NOT skip it
    //     and draft later scenes — that would leave a book with a missing
    //     chapter — and we do NOT compile a misleading partial manuscript).
    //     The run is simply resumable: re-running picks up exactly here.
    let drafted = 0;
    let skipped = 0;
    for (let i = 1; i <= arc.length; i++) {
      // RESUME: if this scene already exists and isn't empty, keep it and move on.
      const existing = await workspaceExporter.readDraft(
        story_id,
        `scene_${i}`,
        version,
      );
      if (existing && existing.trim().length > 0) {
        skipped++;
        continue;
      }

      const beat = arc[i - 1] || null;
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
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }

      // Unrecoverable for this scene: STOP cleanly. No partial manuscript is
      // written; the drafted scenes stay on disk so re-running resumes here.
      if (res?.isError) {
        return {
          content: [
            {
              type: "text",
              text: `Drafting stopped at scene_${i} of ${arc.length} for "${story_id}" after ${MAX_SCENE_ATTEMPTS} attempts: ${res.content?.[0]?.text || "scene generation failed"}. ${i - 1} scene(s) are drafted and preserved. Nothing was compiled (the book isn't finished). Re-run expand_to_novel (auto_draft) on this same story to RESUME — it will skip the ${i - 1} finished scenes and continue from scene_${i}.`,
            },
          ],
          isError: true,
        };
      }
      drafted++;
    }

    // 6. Only here — every beat has a drafted scene — do we compile the
    // manuscript. A book is compiled only when it is actually complete.
    const finalManuscript = await workspaceExporter.readAllDrafts(
      story_id,
      version,
    );
    await workspaceExporter.saveManuscript(story_id, finalManuscript, version);

    return {
      content: [
        {
          type: "text",
          text: `Expansion complete! All ${arc.length} beats are drafted (${drafted} written this run${skipped ? `, ${skipped} already done` : ""}) and the final ${target_length} manuscript for "${story_id}" has been compiled.`,
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
