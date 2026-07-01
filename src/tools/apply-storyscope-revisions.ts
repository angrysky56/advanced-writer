import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";
import { safeParseJson, DIAGNOSTIC_SCORE_BLOCK } from "../ai/extract.js";
import { loadCraftDirectives } from "../ai/craft.js";
import { enforceSceneConsistency } from "./_gate.js";

export const applyStoryscopeRevisionsDef = {
  name: "apply_storyscope_revisions",
  description:
    "Builds the next draft version from the StoryScope review. Carries every scene forward, then SELECTIVELY rewrites only the scenes the critique flags (most scenes are left untouched). Non-destructive and auto-incrementing (v1->v2->v3...). Each rewritten scene is checked against the World Bible's hard rules/continuity before being saved, re-scored on the neurochemical/pathology diagnostic, and logged to a persistent changelog. Pass 'directives' to apply a human-approved/edited plan instead of the auto-generated one (see storyscope_final_review's Executive Summary). This tool only revises PROSE — for canon reconciliation (updating the World Bible / Architecture Brief / character records to match the manuscript), use reconcile_storyscope_canon.",
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
      directives: {
        type: "array",
        description:
          "Optional human-approved/edited revision plan (e.g. curated from the Executive Summary's REVISE PROSE bucket). When provided, this REPLACES the auto-generated plan entirely — only these scenes are revised, exactly as directed.",
        items: {
          type: "object",
          properties: {
            scene_id: { type: "string" },
            directive: { type: "string" },
          },
          required: ["scene_id", "directive"],
        },
      },
      exclude_scenes: {
        type: "array",
        description:
          "Optional list of scene_ids to force-skip even if the auto-planner (or 'directives') flags them — e.g. the user rejected that item from the Executive Summary.",
        items: { type: "string" },
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

    // 1. Read Executive Summary AND the full specialist lens reports for the
    // SOURCE version — the reviser must work from the critique of the exact
    // draft it is revising, not whatever review happened to be written last.
    const executiveSummary =
      await workspaceExporter.readStoryscopeExecutiveSummary(
        story_id,
        source_version,
      );
    const lensReports = await workspaceExporter.readAllStoryscopeReports(
      story_id,
      source_version,
    );
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
      if (!text)
        text = await workspaceExporter.readDraft(story_id, sceneId, "v1");
      if (!text) continue;
      await workspaceExporter.saveDraft(
        story_id,
        sceneId,
        text,
        target_version,
      );
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

    // 4. PLAN: either use the human-approved/edited plan passed in via
    // 'directives' (the workflow's step 2 — review, then approve/modify the
    // Executive Summary's action items before applying), or fall back to one
    // call that decides WHICH scenes actually need revision (most do not) and
    // gives each a specific directive — so we never rewrite the whole book.
    const directives = new Map<string, string>();
    const providedDirectives = Array.isArray(args.directives)
      ? args.directives
      : null;
    let planSource: "human-approved" | "auto" = "auto";

    if (providedDirectives && providedDirectives.length > 0) {
      planSource = "human-approved";
      for (const r of providedDirectives) {
        if (r?.scene_id)
          directives.set(
            String(r.scene_id),
            String(
              r.directive ||
                "Apply the StoryScope critique relevant to this scene.",
            ),
          );
      }
    } else {
      const planPrompt = `You are an editorial planner. The AUTHOR'S INTENT IS PRIMARY and the manuscript is the living work; the Architecture Brief / World Bible are only earlier planning drafts. Flag a scene for revision ONLY for a genuine CRAFT problem — the story contradicting ITSELF, an arc that doesn't pay off, pacing/clarity failures, weak execution. DO NOT flag a scene merely because it diverges from the planning documents; when the prose's choice is as good or better, that is not a defect (the canon should be updated to match it via reconcile_storyscope_canon — not here). Given the StoryScope critique and the list of scenes (id :: opening excerpt), give each genuinely-flawed scene a specific directive. Scenes that already work must NOT be listed. Output ONLY JSON:
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
      if (plan && Array.isArray(plan.revisions)) {
        for (const r of plan.revisions) {
          if (r?.scene_id)
            directives.set(
              String(r.scene_id),
              r.directive ||
                "Apply the StoryScope critique relevant to this scene.",
            );
        }
      }
    }

    // Honor explicit exclusions (e.g. the user rejected this item from the
    // Executive Summary) regardless of which plan source flagged it.
    const excludeSet = new Set<string>(
      Array.isArray(args.exclude_scenes)
        ? args.exclude_scenes.map((s: any) => String(s))
        : [],
    );
    for (const id of excludeSet) directives.delete(id);

    // Already carried everything forward; if nothing was flagged, finalize as-is.
    if (directives.size === 0) {
      const compiled0 = await workspaceExporter.readAllDrafts(
        story_id,
        target_version,
      );
      await workspaceExporter.saveManuscript(
        story_id,
        compiled0,
        target_version,
      );
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
    // revisions), so nothing is lost. Every rewrite is: (a) reminded of the same
    // craft/anti-pattern directives used at first-draft time, so fixing one
    // flagged issue doesn't reintroduce another; (b) checked against the World
    // Bible's hard rules/continuity via the same gate create_narrative uses;
    // (c) re-scored on the neurochemical/pathology diagnostic so the fix is
    // verifiable rather than just asserted.
    const MAX_ATTEMPTS = 3;
    let revisedCount = 0;
    const worldBible = (await workspaceExporter.readWorldBible(story_id)) || "";
    const craftDirectives = loadCraftDirectives();
    const changelogLines: string[] = [];

    const appendPartialChangelog = async (note: string) => {
      const entry = `## Apply revisions — ${new Date().toISOString()} (${note})

${source_version} -> ${target_version} | plan source: ${planSource}

${changelogLines.length ? changelogLines.join("\n") : "- No scenes were revised before this point."}
`;
      try {
        await workspaceExporter.appendStoryscopeChangelog(
          story_id,
          source_version,
          entry,
        );
      } catch {
        /* changelog is best-effort — never block on it */
      }
    };

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
${summaryContext}

=== CRAFT DIRECTIVES (still apply while fixing the above — don't trade one pathology for another) ===
${craftDirectives}`;

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
        await workspaceExporter.saveManuscript(
          story_id,
          partial,
          target_version,
        );
        await appendPartialChangelog(`ABORTED at ${sceneId}: ${lastError}`);
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

      // Consistency gate: check the rewrite against the World Bible's hard
      // rules/continuity, same as first-draft scenes. Fail-open (never loses
      // a scene) — logs whether it passed and, if not, that it still flags.
      let gateNote = "consistency gate: skipped (no World Bible on file)";
      if (worldBible.trim()) {
        try {
          const gateResult = await enforceSceneConsistency({
            sceneText: revised,
            worldBible,
            beatDirective: directive,
          });
          revised = gateResult.text;
          gateNote = gateResult.note;
        } catch {
          gateNote = "consistency gate: check failed (non-fatal); kept rewrite as-is";
        }
      }

      await workspaceExporter.saveDraft(
        story_id,
        sceneId,
        revised,
        target_version,
      );
      revisedCount++;

      // Re-score the revised scene so there is a verifiable record that the
      // flagged pathology actually improved, not just an assertion that it did.
      let diagNote = "diagnostic: not re-scored (generation failed)";
      try {
        const rescore = await aiRouter.generateCompletion({
          taskType: "diagnostic",
          systemPrompt: `Analyze the following revised scene for emotional pacing (cortisol, oxytocin, dopamine), pathology diagnostics, and agency enforcement. Produce a structured neuro-critique report.\nScene:\n${revised}${DIAGNOSTIC_SCORE_BLOCK}`,
          userMessage: "Provide the updated neuro-critique report.",
        });
        if (rescore && rescore.trim()) {
          await workspaceExporter.saveDiagnosticReport(story_id, sceneId, rescore);
          diagNote = "diagnostic: re-scored";
        }
      } catch {
        diagNote = "diagnostic: re-score call failed (non-fatal)";
      }

      changelogLines.push(
        `- **${sceneId}**: ${directive}\n  - ${gateNote}\n  - ${diagNote}`,
      );
    }

    // 6. Recompile the new version's manuscript.
    const allDrafts = await workspaceExporter.readAllDrafts(
      story_id,
      target_version,
    );
    await workspaceExporter.saveManuscript(story_id, allDrafts, target_version);

    await appendPartialChangelog("complete");

    return {
      content: [
        {
          type: "text",
          text: `Revision complete. ${target_version} written from ${source_version}: ${revisedCount} of ${sceneIds.length} scenes revised (the rest carried forward unchanged — the critique didn't flag them). Each rewrite was checked against the World Bible and re-scored; see the changelog under storyscope-reports/${source_version}/changelog.md. Manuscript recompiled; originals preserved.\n\nNote: this only revises prose. If the review also flagged canon divergences worth keeping, run reconcile_storyscope_canon to update the World Bible / Architecture Brief / character records.`,
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
