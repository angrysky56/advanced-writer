import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";
import { neo4jStorage } from "../storage/neo4j.js";
import { safeParseJson } from "../ai/extract.js";

export const reconcileStoryscopeCanonDef = {
  name: "reconcile_storyscope_canon",
  description:
    "Applies the StoryScope review's CANON RECONCILIATION findings: updates the World Bible, Architecture Brief, and character graph metadata so the planning documents catch up to the manuscript's improvements. Complements apply_storyscope_revisions, which only rewrites prose and deliberately ignores canon divergence — this tool is the other half of the review's to-do list and never touches scene text. Non-destructive: the previous World Bible / Architecture Brief are backed up before being overwritten, and every run appends to a persistent changelog.",
  inputSchema: {
    type: "object",
    properties: {
      story_id: { type: "string", description: "Identifier for the story" },
      version: {
        type: "string",
        description:
          "Draft version whose StoryScope review to reconcile from (defaults to the latest draft with a review on disk).",
      },
      async: {
        type: "boolean",
        description:
          "Run in the background and return a job id immediately. Poll with check_job.",
        default: false,
      },
    },
    required: ["story_id"],
  },
};

export async function executeReconcileStoryscopeCanon(args: any) {
  const { story_id } = args;

  try {
    const versions = await workspaceExporter.listDraftVersions(story_id);
    const latestNum = versions.length
      ? Math.max(
          ...versions.map((v) => parseInt(v.replace(/\D/g, ""), 10) || 1),
        )
      : 1;
    const version = args.version || (versions.length ? `v${latestNum}` : "v1");

    const executiveSummary =
      await workspaceExporter.readStoryscopeExecutiveSummary(
        story_id,
        version,
      );
    const lensReports = await workspaceExporter.readAllStoryscopeReports(
      story_id,
      version,
    );
    const hasReview =
      !!(executiveSummary && executiveSummary.trim()) || lensReports.length > 0;
    if (!hasReview) {
      return {
        content: [
          {
            type: "text",
            text: `Error: No StoryScope review found for ${story_id} version ${version}. Run storyscope_final_review first.`,
          },
        ],
        isError: true,
      };
    }
    const lensContext =
      lensReports.length > 0
        ? lensReports
            .map((r) => `## LENS: ${r.aspect.toUpperCase()}\n${r.content}`)
            .join("\n\n")
        : "(no specialist lens reports found)";
    const summaryContext =
      executiveSummary && executiveSummary.trim()
        ? executiveSummary
        : "(no executive summary — using the specialist lens reports directly)";

    const worldBible = (await workspaceExporter.readWorldBible(story_id)) || "";
    const architectureBrief =
      (await workspaceExporter.readArchitectureBrief(story_id)) || "";
    const characters = await neo4jStorage.getCharactersForStory(story_id);
    const roster =
      (characters || [])
        .map(
          (c: any) =>
            `- ${c.name} [id: ${c.id}]: archetype=${c.archetype}, hamartia=${c.hamartia}, shadow=${c.shadow}, moral_weakness=${c.moral_weakness}, individuation_state=${c.individuation_state}, role=${c.role}`,
        )
        .join("\n") || "(no characters recorded in the graph)";

    // 1. Extract ONLY the canon-reconciliation findings (never craft/prose
    // problems — those belong to apply_storyscope_revisions) as a structured plan.
    const extractPrompt = `You are a canon-reconciliation editor. The manuscript is the living work; the StoryScope review below identifies places where the manuscript's own choices are AS GOOD OR BETTER than the earlier planning documents (World Bible, Architecture Brief, character records). Your ONLY job is to extract those CANON RECONCILIATION items — do NOT extract craft/prose problems, pacing issues, or anything that requires rewriting scenes; that is a separate process.

For each genuine, worth-keeping divergence, decide which target it belongs to and give a precise directive:
- "world_bible": a fact, rule, faction, geography, or economics detail that should be updated in the World Bible to match the manuscript.
- "architecture_brief": a structural/planning detail that should be updated in the Architecture Brief to match the manuscript.
- "character": a named character's core traits changed in the manuscript (archetype, hamartia, shadow, moral_weakness, individuation_state, role) — the name MUST match one of the CURRENT CHARACTER ROSTER entries below exactly.

Output ONLY JSON, no commentary:
{
  "world_bible_directives": ["specific instruction for what to change and why", "..."],
  "architecture_brief_directives": ["...", "..."],
  "character_updates": [ { "name": "exact roster name", "fields": { "hamartia": "new value", "shadow": "new value" }, "reason": "why the manuscript's version is better" } ],
  "summary": "2-4 sentence plain-English changelog of what canon is being updated and why, for the project record"
}
If there is genuinely nothing to reconcile, return empty arrays for all three and say so in "summary".

=== EXECUTIVE SUMMARY ===
${summaryContext}

=== SPECIALIST LENS REPORTS ===
${lensContext}

=== CURRENT WORLD BIBLE (may be empty) ===
${worldBible || "(none on file)"}

=== CURRENT ARCHITECTURE BRIEF (may be empty) ===
${architectureBrief || "(none on file)"}

=== CURRENT CHARACTER ROSTER ===
${roster}`;

    let plan: any = null;
    try {
      const resp = await aiRouter.generateCompletion({
        taskType: "diagnostic",
        systemPrompt: extractPrompt,
        userMessage: "Output the canon reconciliation plan as JSON.",
      });
      plan = safeParseJson<any>(resp);
    } catch {
      plan = null;
    }

    const wbDirectives: string[] = Array.isArray(plan?.world_bible_directives)
      ? plan.world_bible_directives.filter(Boolean)
      : [];
    const abDirectives: string[] = Array.isArray(
      plan?.architecture_brief_directives,
    )
      ? plan.architecture_brief_directives.filter(Boolean)
      : [];
    const charUpdates: any[] = Array.isArray(plan?.character_updates)
      ? plan.character_updates
      : [];
    const planSummary =
      typeof plan?.summary === "string" && plan.summary.trim()
        ? plan.summary.trim()
        : "";

    if (
      wbDirectives.length === 0 &&
      abDirectives.length === 0 &&
      charUpdates.length === 0
    ) {
      return {
        content: [
          {
            type: "text",
            text: `Canon reconciliation complete for ${story_id} (${version}): the review found no canon divergences worth keeping. World Bible, Architecture Brief, and character records are unchanged.${planSummary ? `\n\n${planSummary}` : ""}`,
          },
        ],
      };
    }

    const changes: string[] = [];

    // 2. Rewrite the World Bible, if flagged. Backup first — never destructive.
    if (wbDirectives.length > 0) {
      if (worldBible)
        await workspaceExporter.backupCanonDoc(
          story_id,
          "world-bible",
          worldBible,
        );
      const rewritePrompt = `You are updating the World Bible so it matches the manuscript's improvements. Apply ONLY the directives below; preserve every other section, fact, and piece of formatting UNCHANGED. Output the FULL updated World Bible markdown only — no commentary, no preamble.

=== DIRECTIVES ===
${wbDirectives.map((d) => `- ${d}`).join("\n")}

=== CURRENT WORLD BIBLE ===
${worldBible || "(none — create a minimal World Bible covering just these directives)"}`;
      const newWorldBible = await aiRouter.generateCompletion({
        taskType: "generation",
        systemPrompt: rewritePrompt,
        userMessage: "Output the updated World Bible.",
      });
      if (newWorldBible && newWorldBible.trim()) {
        await workspaceExporter.saveWorldBible(story_id, newWorldBible);
        changes.push(
          `World Bible updated (${wbDirectives.length} directive(s); previous version backed up to structure/canon-backups/).`,
        );
      }
    }

    // 3. Rewrite the Architecture Brief, if flagged. Backup first.
    if (abDirectives.length > 0) {
      if (architectureBrief)
        await workspaceExporter.backupCanonDoc(
          story_id,
          "story-architecture-brief",
          architectureBrief,
        );
      const rewritePrompt = `You are updating the Story Architecture Brief so it matches the manuscript's improvements. Apply ONLY the directives below; preserve every other section UNCHANGED. Output the FULL updated Architecture Brief markdown only — no commentary, no preamble.

=== DIRECTIVES ===
${abDirectives.map((d) => `- ${d}`).join("\n")}

=== CURRENT ARCHITECTURE BRIEF ===
${architectureBrief || "(none — create a minimal brief covering just these directives)"}`;
      const newBrief = await aiRouter.generateCompletion({
        taskType: "generation",
        systemPrompt: rewritePrompt,
        userMessage: "Output the updated Architecture Brief.",
      });
      if (newBrief && newBrief.trim()) {
        await workspaceExporter.saveArchitectureBrief(story_id, newBrief);
        changes.push(
          `Architecture Brief updated (${abDirectives.length} directive(s); previous version backed up to structure/canon-backups/).`,
        );
      }
    }

    // 4. Patch character graph metadata directly — small, structured, no extra
    // LLM call needed since the extraction step already produced exact fields.
    let charsUpdated = 0;
    const charNotes: string[] = [];
    for (const u of charUpdates) {
      const name = String(u?.name || "").trim();
      const fields = u?.fields && typeof u.fields === "object" ? u.fields : null;
      if (!name || !fields) continue;
      const match = (characters || []).find(
        (c: any) => String(c.name || "").toLowerCase() === name.toLowerCase(),
      );
      if (!match) {
        charNotes.push(
          `- SKIPPED "${name}": no matching character found in the roster.`,
        );
        continue;
      }
      const stringFields: Record<string, string> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined && v !== null) stringFields[k] = String(v);
      }
      const ok = await neo4jStorage.updateCharacterMeta(match.id, stringFields);
      if (ok) {
        charsUpdated++;
        charNotes.push(
          `- ${match.name}: ${Object.keys(stringFields).join(", ")} updated.${u.reason ? ` (${u.reason})` : ""}`,
        );
      } else {
        charNotes.push(`- FAILED to update "${match.name}".`);
      }
    }
    if (charsUpdated > 0)
      changes.push(`${charsUpdated} character record(s) patched in the graph.`);

    // 5. Persist a changelog entry linked to this review/version, since tool
    // responses are ephemeral and the workflow promises a written record.
    const changelogEntry = `## Canon reconciliation — ${new Date().toISOString()}

Source review: ${story_id} / ${version}

${planSummary ? `${planSummary}\n\n` : ""}${changes.length ? changes.map((c) => `- ${c}`).join("\n") : "- No changes applied."}
${charNotes.length ? `\n### Character detail\n${charNotes.join("\n")}` : ""}
`;
    await workspaceExporter.appendStoryscopeChangelog(
      story_id,
      version,
      changelogEntry,
    );

    return {
      content: [
        {
          type: "text",
          text: `Canon reconciliation complete for ${story_id} (${version}):\n${changes.length ? changes.map((c) => `- ${c}`).join("\n") : "- Nothing needed updating."}\n\nChangelog saved to storyscope-reports/${version}/changelog.md.`,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error running reconcile_storyscope_canon: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
