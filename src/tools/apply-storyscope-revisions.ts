import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";
import { safeParseJson } from "../ai/extract.js";

export const applyStoryscopeRevisionsDef = {
  name: "apply_storyscope_revisions",
  description:
    "Builds the next draft version from the StoryScope review. Carries every scene forward, then SELECTIVELY rewrites only the scenes the critique flags (most scenes are left untouched). Non-destructive and auto-incrementing (v1->v2->v3...).",
  inputSchema: {
    type: "object",
    properties: {
      story_id: { type: "string", description: "Identifier for the story" },
      source_version: {
        type: "string",
        description: "Draft version to read from (default 'v1')",
        default: "v1",
      },
      target_version: {
        type: "string",
        description: "Draft version to write the rewrites to (default 'v2')",
        default: "v2",
      },
      async: {
        type: "boolean",
        description:
          "Run in the background and return a job id immediately (recommended for long manuscripts). Poll with check_job.",
        default: false,
      },
    },
    required: ["story_id"],
  },
};

export async function executeApplyStoryscopeRevisions(args: any) {
  const { story_id } = args;

  try {
    // Auto-increment: each run builds Draft N+1 from the latest existing draft,
    // so repeated revisions produce v2, v3, v4 ... (all diffable). Explicit
    // source_version/target_version args still override.
    const versions = await workspaceExporter.listDraftVersions(story_id);
    const latestNum = versions.length
      ? Math.max(
          ...versions.map((v) => parseInt(v.replace(/\D/g, ""), 10) || 1),
        )
      : 1;
    const source_version =
      args.source_version || (versions.length ? `v${latestNum}` : "v1");
    const target_version = args.target_version || `v${latestNum + 1}`;

    // 1. Read Executive Summary AND the full specialist lens reports — the
    // reviser must work from the specific critique, not just the lossy summary.
    const executiveSummary =
      await workspaceExporter.readStoryscopeExecutiveSummary(story_id);
    const lensReports =
      await workspaceExporter.readAllStoryscopeReports(story_id);
    const lensContext =
      lensReports.length > 0
        ? lensReports
            .map((r) => `## LENS: ${r.aspect.toUpperCase()}\n${r.content}`)
            .join("\n\n")
        : "(no specialist lens reports found)";

    // A review exists if EITHER the executive summary OR the lens reports are on
    // disk — don't falsely report "no review" when the reports clearly exist.
    const hasReview =
      !!(executiveSummary && executiveSummary.trim()) || lensReports.length > 0;
    if (!hasReview) {
      return {
        content: [
          {
            type: "text",
            text: `Error: No StoryScope review found for ${story_id} (neither an executive summary nor lens reports exist on disk). Run storyscope_final_review first.`,
          },
        ],
        isError: true,
      };
    }
    const summaryContext =
      executiveSummary && executiveSummary.trim()
        ? executiveSummary
        : "(No executive summary file found — applying the specialist lens reports directly.)";

    // 2. Canonical scene set = the COMPLETE original (v1) UNION the source
    // version, so a partial source can never silently drop scenes.
    const baseFiles = await workspaceExporter.listDrafts(story_id, "v1");
    const sourceFiles = await workspaceExporter.listDrafts(
      story_id,
      source_version,
    );
    const sceneIds = Array.from(
      new Set([...baseFiles, ...sourceFiles].map((f) => f.replace(".md", ""))),
    ).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    );
    if (sceneIds.length === 0) {
      return {
        content: [
          { type: "text", text: `Error: No drafts found for ${story_id}.` },
        ],
        isError: true,
      };
    }

    // 3. STREAM each scene forward into the new version (copy as-is) and collect
    // a short opening excerpt for the planner. No whole-book memory buffer:
    // copies go disk-to-disk; flagged scenes are re-read individually later.
    const excerpts: { sceneId: string; excerpt: string }[] = [];
    for (const sceneId of sceneIds) {
      let text = await workspaceExporter.readDraft(
        story_id,
        sceneId,
        source_version,
      );
      if (!text) text = await workspaceExporter.readDraft(story_id, sceneId, "v1");
      if (!text) continue;
      await workspaceExporter.saveDraft(story_id, sceneId, text, target_version);
      excerpts.push({
        sceneId,
        excerpt: text.slice(0, 400).replace(/\s+/g, " ").trim(),
      });
    }
    if (excerpts.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `Error: no scenes available to revise for ${story_id}.`,
          },
        ],
        isError: true,
      };
    }

    // 4. PLAN: one call to decide WHICH scenes actually need revision (most do
    // not) and give each a specific directive — so we never rewrite the whole book.
    const planPrompt = `You are an editorial planner. Given the StoryScope critique and the list of scenes (id :: opening excerpt), decide which scenes genuinely NEED revision for the next draft, and give each a specific directive. Scenes that already work should NOT be listed. Be selective — flag only what the critique actually calls for. Output ONLY JSON:
{ "revisions": [ { "scene_id": "scene_3", "directive": "the specific change this scene needs" } ] }

=== EXECUTIVE SUMMARY ===
${summaryContext}

=== SPECIALIST LENS REPORTS ===
${lensContext}

=== SCENES ===
${excerpts.map((e) => `${e.sceneId} :: ${e.excerpt}`).join("\n\n")}`;
    let plan: any = null;
    try {
      const planResp = await aiRouter.generateCompletion({
        taskType: "diagnostic",
        systemPrompt: planPrompt,
        userMessage: "Output the revision plan as JSON.",
      });
      plan = safeParseJson<any>(planResp);
    } catch {
      plan = null;
    }
    const directives = new Map<string, string>();
    if (plan && Array.isArray(plan.revisions)) {
      for (const r of plan.revisions) {
        if (r?.scene_id)
          directives.set(
            String(r.scene_id),
            r.directive || "Apply the StoryScope critique relevant to this scene.",
          );
      }
    }

    // Already carried everything forward; if nothing was flagged, finalize as-is.
    if (directives.size === 0) {
      const compiled0 = await workspaceExporter.readAllDrafts(
        story_id,
        target_version,
      );
      await workspaceExporter.saveManuscript(story_id, compiled0, target_version);
      return {
        content: [
          {
            type: "text",
            text: `${target_version} created from ${source_version} (${excerpts.length} scenes carried forward). The planner flagged NO scenes as needing revision, so nothing was rewritten. If you expected changes, re-run storyscope_final_review or tell me which scenes to target.`,
          },
        ],
      };
    }

    // 5. Revise ONLY the flagged scenes, in place. Retry; on persistent failure,
    // abort with the reason — every scene stays present (copies + successful
    // revisions), so nothing is lost.
    const MAX_ATTEMPTS = 3;
    let revisedCount = 0;
    for (const sceneId of sceneIds) {
      const directive = directives.get(sceneId);
      if (!directive) continue; // not flagged — already carried forward as-is

      const sceneText = await workspaceExporter.readDraft(
        story_id,
        sceneId,
        target_version,
      );
      if (!sceneText) continue;

      const systemPrompt = `You are a brilliant MFA-level editor revising ONE scene for the next draft. Apply the specific directive below, informed by the overall critique. Rewrite the entire scene from start to finish; output the full revised prose only. CRITICAL: do not "correct" intentional stylistic choices, character voice quirks, or technical terms.

=== THIS SCENE'S REVISION DIRECTIVE ===
${directive}

=== OVERALL CRITIQUE (context) ===
${summaryContext}`;

      let revised = "";
      let lastError = "model returned empty output";
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const out = await aiRouter.generateCompletion({
            taskType: "generation",
            systemPrompt,
            userMessage: `Revise this scene per the directive.\n\n=== SCENE ===\n${sceneText}`,
          });
          if (out && out.trim()) {
            revised = out;
            break;
          }
          lastError = "model returned empty output";
        } catch (e: any) {
          lastError = e?.message || String(e);
        }
        if (attempt < MAX_ATTEMPTS)
          await new Promise((r) => setTimeout(r, 1500 * attempt));
      }

      if (!revised) {
        // Abort: every scene is still present (copies + revisions done so far);
        // recompile so the draft is readable, and report the failure honestly.
        const partial = await workspaceExporter.readAllDrafts(
          story_id,
          target_version,
        );
        await workspaceExporter.saveManuscript(story_id, partial, target_version);
        return {
          content: [
            {
              type: "text",
              text: `Revision ABORTED at ${sceneId} after ${MAX_ATTEMPTS} attempts: ${lastError}. ${revisedCount} of ${directives.size} flagged scene(s) were revised first; ${target_version} holds every scene (revised + originals) but the revision is INCOMPLETE. If this was a transient connection issue, rerun to continue; otherwise the model could not revise this scene.`,
            },
          ],
          isError: true,
        };
      }
      await workspaceExporter.saveDraft(
        story_id,
        sceneId,
        revised,
        target_version,
      );
      revisedCount++;
    }

    // 6. Recompile the new version's manuscript.
    const allDrafts = await workspaceExporter.readAllDrafts(
      story_id,
      target_version,
    );
    await workspaceExporter.saveManuscript(story_id, allDrafts, target_version);

    return {
      content: [
        {
          type: "text",
          text: `Revision complete. ${target_version} written from ${source_version}: ${revisedCount} of ${sceneIds.length} scenes revised (the rest carried forward unchanged — the critique didn't flag them). Manuscript recompiled; originals preserved.`,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error running apply_storyscope_revisions: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
