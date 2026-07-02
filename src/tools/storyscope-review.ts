import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";
import { neo4jStorage } from "../storage/neo4j.js";
import { safeParseJson } from "../ai/extract.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const storyscopeFinalReviewDef = {
  name: "storyscope_final_review",
  description:
    "Runs the ultimate multi-agent StoryScope review on a finished manuscript. Dispatches 7 parallel analytical lenses (Plot, Agents, Style, etc.) and synthesizes them into an Executive Summary.",
  inputSchema: {
    type: "object",
    properties: {
      story_id: {
        type: "string",
        description:
          "The story to review. Must have a compiled final_manuscript.md.",
      },
      version: {
        type: "string",
        description:
          "Which draft version to review (e.g. 'v2'). Defaults to the latest draft. The review is saved under this version and never overwrites another version's review.",
      },
      async: {
        type: "boolean",
        description:
          "Run in the background and return a job id immediately (recommended — dispatches many lenses). Poll with check_job.",
        default: false,
      },
    },
    required: ["story_id"],
  },
};

export async function executeStoryscopeFinalReview(args: any) {
  const { story_id } = args;

  try {
    // Review the requested version's manuscript — or the latest draft by
    // default. The review is then stored under THIS version so it is linked to
    // the draft it actually critiques and never clobbers another version's.
    const versions = await workspaceExporter.listDraftVersions(story_id);
    const latestNum = versions.length
      ? Math.max(
          ...versions.map((v) => parseInt(v.replace(/\D/g, ""), 10) || 1),
        )
      : 1;
    const version =
      args.version || (versions.length ? `v${latestNum}` : "v1");

    const manuscript = await workspaceExporter.readManuscript(
      story_id,
      version,
    );
    if (!manuscript) {
      return {
        content: [
          {
            type: "text",
            text: `Error: No compiled manuscript found for story '${story_id}' version '${version}'. Please expand to novel or fast-auto complete first (or pass a version that has a compiled manuscript).`,
          },
        ],
        isError: true,
      };
    }

    const architecture =
      (await workspaceExporter.readArchitectureBrief(story_id)) ||
      "Architecture not found.";

    // We need a readWorldBible method, if it doesn't exist we can just read the file directly
    let worldBible = "";
    try {
      const storySlug = story_id.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      worldBible = await fs.promises.readFile(
        path.join(
          process.env.WORKSPACE_DIR || "./data/workspace",
          storySlug,
          "structure",
          "world-bible.md",
        ),
        "utf8",
      );
    } catch {
      worldBible = "World bible not found.";
    }

    const storyState = await neo4jStorage.getStoryState(story_id);
    const graphStateContext = JSON.stringify(storyState, null, 2);

    const promptsDir = path.join(__dirname, "../references/storyscope-prompts");
    const promptFiles = await fs.promises.readdir(promptsDir);
    const aspectFiles = promptFiles.filter(
      (f) => f.startsWith("aspect_") && f.endsWith(".md"),
    );

    if (aspectFiles.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `Error: No StoryScope prompt templates found.`,
          },
        ],
        isError: true,
      };
    }

    const reports: { aspect: string; report: string }[] = [];

    // Run parallel evaluations
    const promises = aspectFiles.map(async (file) => {
      const aspectName = file.replace("aspect_", "").replace(".md", "");
      const rawPrompt = await fs.promises.readFile(
        path.join(promptsDir, file),
        "utf8",
      );

      // Override the JSON extraction instructions
      const modifiedPrompt = `${rawPrompt}\n\n=== OVERRIDE INSTRUCTIONS ===\nIGNORE ANY INSTRUCTIONS ABOVE ASKING FOR JSON OUTPUT OR DATASET EXTRACTION. Your task is to act as an expert Editor applying the conceptual frameworks detailed above to the provided manuscript. Write a deep, comprehensive markdown prose report analyzing the manuscript's execution of this specific aspect. Be brutal but constructive.`;

      const report = await aiRouter.generateCompletion({
        taskType: "diagnostic",
        systemPrompt: modifiedPrompt,
        userMessage: `You are an expert editor reviewing a FINISHED manuscript. The Architecture Brief, World Bible, and Graph State below are EARLY PLANNING DRAFTS — reference material, NOT binding law. The manuscript is the living work and the AUTHOR'S INTENT IS PRIMARY. The plan serves the story, never the other way around.

Apply this aspect's framework to the manuscript and separate your findings into two clearly labelled categories:

1. CRAFT ISSUES — genuine problems INSIDE the manuscript: places where the story contradicts ITSELF, arcs that don't pay off, pacing or clarity failures, weak execution. These are real and should be fixed.

2. CANON DIVERGENCE — places where the manuscript departs from the planning documents. For EACH divergence, judge whether the manuscript's choice is as good or BETTER. If it is, do NOT call it an error — recommend UPDATING the planning document to match the manuscript. Only flag a divergence as a problem when it makes the STORY ITSELF worse or internally incoherent — never merely because it disagrees with the outline.

Do not penalize the manuscript for improving on its own plan. Be brutal about craft; be generous about intent.

=== ARCHITECTURE BRIEF (planning draft — not law) ===
${architecture}

=== WORLD BIBLE (planning draft — not law) ===
${worldBible}

=== NEO4J GRAPH STATE (CHARACTERS & ENTITIES) ===
${graphStateContext}

=== FINAL MANUSCRIPT (the living work — primary) ===
${manuscript}`,
      });

      await workspaceExporter.saveStoryscopeReport(
        story_id,
        aspectName,
        report,
        version,
      );
      reports.push({ aspect: aspectName, report });
      return report;
    });

    // Tolerate partial failures: a single lens erroring (e.g. one provider
    // hiccup, or the manuscript exceeding a model's context window) should not
    // discard the lenses that succeeded.
    const settled = await Promise.allSettled(promises);
    const failedCount = settled.filter((s) => s.status === "rejected").length;

    if (reports.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `Error: all ${aspectFiles.length} StoryScope lenses failed. The manuscript may exceed the diagnostic model's context window, or the provider returned errors. No reports were generated.`,
          },
        ],
        isError: true,
      };
    }

    // ACTORS' TABLE — the cast grades their own performance. Unlike the prose
    // lenses, this one also reads the DIRECTOR'S NOTES (the per-scene intent) and
    // each character's RECORDED emotional arc (the achieved affect), and judges
    // intended-vs-achieved across the whole manuscript. Additive + fail-open.
    try {
      const directorNotes = await workspaceExporter.readAllDirectorNotes(
        story_id,
        version,
      );
      const chars = await neo4jStorage.getCharactersForStory(story_id);
      const top = (o: any): string =>
        Object.entries(o || {})
          .filter(([, v]) => typeof v === "number")
          .sort((a: any, b: any) => b[1] - a[1])
          .slice(0, 3)
          .map(([k, v]) => `${k} ${v}`)
          .join(", ");
      const affectArc = (chars || [])
        .map((c: any) => {
          const log = Array.isArray(c.affect_log) ? c.affect_log : [];
          const arc = log
            .map((s: any) => {
              try {
                const o = typeof s === "string" ? JSON.parse(s) : s;
                return `${o.scene}: ${top(o.plutchik)}`;
              } catch {
                return "";
              }
            })
            .filter(Boolean)
            .join(" | ");
          return `### ${c.name}\nemotional arc (per scene): ${arc || "(none tracked)"}`;
        })
        .join("\n\n");

      if (directorNotes.trim() || affectArc.trim()) {
        const actorsPrompt = `You are the full CAST at a table read, with an acting coach. For EACH principal character, evaluate their PERFORMANCE across the finished manuscript:
- Did the scenes deliver the feeling and objective the DIRECTOR set (see Director's Notes), and a believable, non-flat emotional ARC (see the recorded per-scene affect)?
- Name the SPECIFIC scenes where the performance rang false, went flat, skipped an emotional beat, or contradicted who the character is.
- Distinguish a genuine performance failure from deliberate, earned restraint — do not punish a quiet beat that is doing real work.
End EACH character with a line starting "DEMAND:" — the one concrete, scene-referenced fix that character wants in the next draft. Be specific, brutal, and fair. Markdown.`;
        const actorsReport = await aiRouter.generateCompletion({
          taskType: "diagnostic",
          systemPrompt: actorsPrompt,
          userMessage: `=== DIRECTOR'S NOTES (the per-scene intent the actors were given) ===\n${directorNotes || "(none recorded)"}\n\n=== RECORDED EMOTIONAL ARCS (what each character actually felt, scene by scene) ===\n${affectArc || "(none)"}\n\n=== MANUSCRIPT ===\n${manuscript}`,
        });
        if (actorsReport && actorsReport.trim()) {
          await workspaceExporter.saveStoryscopeReport(
            story_id,
            "actors_table",
            actorsReport,
            version,
          );
          reports.push({ aspect: "actors_table", report: actorsReport });
        }
      }
    } catch (e) {
      console.error("Actors' Table lens failed (non-fatal):", e);
    }

    // PRIOR-ROUND CONTEXT: the individual lenses stay fresh-eyed (blind review
    // is a feature), but the SYNTHESIZER must know what previous rounds already
    // flagged, what the apply step actually did about it, and what was accepted
    // — otherwise reviews oscillate (re-litigating resolved choices, reversing
    // a decision the previous round praised) and the loop never converges.
    let priorContext = "";
    try {
      const verNum = parseInt(version.replace(/\D/g, ""), 10) || 1;
      const prevVersion = verNum > 1 ? `v${verNum - 1}` : null;
      const ledger = await workspaceExporter.readIssueLedger(story_id);
      const openIssues = (ledger.issues || []).filter(
        (i: any) => i.status !== "resolved",
      );
      const ledgerBlock = openIssues.length
        ? openIssues
            .map((i: any) => {
              const hist = Array.isArray(i.history)
                ? i.history
                    .slice(-3)
                    .map((h: any) => `${h.version}: ${h.event}`)
                    .join(" | ")
                : "";
              return `- [${i.id}] (${i.status}, first flagged ${i.first_flagged})${hist ? ` — ${hist}` : ""}`;
            })
            .join("\n")
        : "";
      const prevSummary = prevVersion
        ? await workspaceExporter.readStoryscopeExecutiveSummary(
            story_id,
            prevVersion,
          )
        : null;
      const prevChangelog = prevVersion
        ? await workspaceExporter.readStoryscopeChangelog(
            story_id,
            prevVersion,
          )
        : null;
      if (ledgerBlock || prevSummary || prevChangelog) {
        priorContext = `

=== PRIOR ROUND CONTEXT (for the LEDGER VERDICTS section — the lenses did not see this) ===
${ledgerBlock ? `OPEN ISSUES FROM THE CROSS-VERSION LEDGER:\n${ledgerBlock}\n` : ""}${prevSummary ? `\nPREVIOUS EXECUTIVE SUMMARY (of ${prevVersion}):\n${prevSummary}\n` : ""}${prevChangelog ? `\nCHANGELOG (what the apply step actually DID to produce the draft you are reviewing):\n${prevChangelog}` : ""}`;
      }
    } catch {
      priorContext = "";
    }

    // Synthesize Executive Summary
    const synthesisPrompt = `You are the Executive Editor-in-Chief. Your team of specialist dramaturgs and structuralists have provided deep-dive reports on the manuscript from multiple distinct analytical lenses (Plot, Agents, Perspective, etc.).

GUIDING PRINCIPLE: the manuscript is the living work and the AUTHOR'S INTENT IS PRIMARY. The Architecture Brief and World Bible are early planning drafts, not law. Divergence from the plan is NOT a failure — when the manuscript's choice is as good or better, the plan should be updated to match it, not the prose reverted.

Read all reports and synthesize them into a single, cohesive "Executive Summary" with these sections:
1. The manuscript's 3 greatest narrative strengths.
2. GENUINE CRAFT WEAKNESSES — only problems that make the STORY ITSELF worse: internal contradictions, unpaid-off arcs, pacing/clarity failures, weak execution. Do NOT list mere divergences from the planning documents here.
3. CANON RECONCILIATION — places where the manuscript has intentionally and effectively moved beyond the Architecture Brief / World Bible / Graph State, and those documents should be UPDATED to match the manuscript.
4. A prioritized To-Do List split into exactly two buckets:
   - (A) REVISE PROSE — craft fixes only (the genuine weaknesses from section 2).
   - (B) UPDATE CANON — reconcile the planning docs to the manuscript (from section 3).

One lens, ACTORS_TABLE, is the cast grading their own emotional performance scene by scene against the Director's intent. Treat its "DEMAND:" lines as first-class craft fixes — fold the genuine ones (a character feeling false, flat, or off-arc in a specific scene) into bucket (A) REVISE PROSE, scene-referenced.

${priorContext ? `5. LEDGER VERDICTS — using the PRIOR ROUND CONTEXT below, give a one-line verdict for EACH open ledger issue: RESOLVED (cite the evidence in this draft), IMPROVED (what remains), or PERSISTS (why the applied fix didn't land). Reference issues by their [id].

CONVERGENCE RULES (critical — this is round N of an iterating loop, not a first review):
- Do NOT re-litigate a choice the previous round explicitly praised or accepted. If you genuinely believe a prior accepted decision must be reversed, you MUST prefix the item with "REVERSAL:" and justify why the previous round was wrong — silent flip-flops are forbidden.
- Do NOT recommend re-adding what a previous round deliberately cut, or re-cutting what it deliberately added, unless the execution (not the idea) failed.
- Your To-Do list must be INTERNALLY CONSISTENT with your own Strengths section: never demand a change that would undo something you list as a strength.
` : ""}Never recommend rewriting good prose merely to conform to an earlier outline. Format beautifully in Markdown.`;

    const allReportsContext = reports
      .map((r) => `## LENS: ${r.aspect.toUpperCase()}\n${r.report}`)
      .join("\n\n");

    let executiveSummary = await aiRouter.generateCompletion({
      taskType: "diagnostic",
      systemPrompt: synthesisPrompt,
      userMessage: `Synthesize the following reports:${priorContext}\n\n${allReportsContext}`,
    });

    // SELF-CONSISTENCY CHECK: a synthesis of 10+ lens reports can contradict
    // itself (e.g. praising a structural choice as a top strength while a To-Do
    // item demands undoing it). Catch and repair that before the summary drives
    // an apply run. Best-effort — a checker failure never blocks the review.
    let selfCheckNote = "";
    try {
      const checkResp = await aiRouter.generateCompletion({
        taskType: "diagnostic",
        systemPrompt: `You are a logic auditor. Read this editorial Executive Summary and find INTERNAL CONTRADICTIONS ONLY — e.g. a To-Do item that would undo something the Strengths section praises, two action items that conflict with each other, or a Canon verdict that conflicts with a prose fix. Do not judge the editorial opinions themselves. Output ONLY JSON:
{ "consistent": true, "contradictions": ["specific contradiction, citing both conflicting passages"] }`,
        userMessage: executiveSummary,
      });
      const check = safeParseJson<any>(checkResp);
      const contradictions: string[] =
        check && Array.isArray(check.contradictions)
          ? check.contradictions.map((c: any) => String(c)).filter(Boolean)
          : [];
      if (check && check.consistent === false && contradictions.length > 0) {
        const repaired = await aiRouter.generateCompletion({
          taskType: "diagnostic",
          systemPrompt: `You are the Executive Editor-in-Chief revising your own Executive Summary to resolve the internal contradictions listed below. For each one, DECIDE which position is right and make the whole document consistent with that decision (usually: the Strengths assessment wins over a To-Do item that would undo it). Change nothing else. Output the full corrected Executive Summary in Markdown only.

=== CONTRADICTIONS TO RESOLVE ===
${contradictions.map((c) => `- ${c}`).join("\n")}`,
          userMessage: executiveSummary,
        });
        if (repaired && repaired.trim()) {
          executiveSummary = repaired;
          selfCheckNote = ` Self-consistency check found ${contradictions.length} internal contradiction(s) in the synthesis and repaired them.`;
        } else {
          selfCheckNote = ` Self-consistency check found ${contradictions.length} internal contradiction(s) but the repair call failed — review the summary's To-Do list against its Strengths section manually.`;
        }
      }
    } catch {
      /* self-check is best-effort */
    }

    await workspaceExporter.saveStoryscopeExecutiveSummary(
      story_id,
      executiveSummary,
      version,
    );

    // ISSUE LEDGER UPDATE: extract this round's issues with stable ids (reusing
    // existing ids when it's the same underlying issue) so the next apply run
    // and the next review can track resolution instead of re-litigating.
    try {
      const ledger = await workspaceExporter.readIssueLedger(story_id);
      const known = (ledger.issues || [])
        .map((i: any) => `- ${i.id} (${i.status}): ${i.title || ""}`)
        .join("\n");
      const extractResp = await aiRouter.generateCompletion({
        taskType: "diagnostic",
        systemPrompt: `Extract every actionable issue from this Executive Summary as JSON. Reuse an EXISTING id whenever the issue is the same underlying problem (even if worded differently); invent a short kebab-case id only for genuinely new issues. status: "resolved" if the summary says it is fixed in this draft, "persists" if flagged before and still present, "open" if new. Output ONLY JSON:
{ "issues": [ { "id": "kebab-case-id", "title": "one line", "bucket": "prose|canon", "scene_refs": ["scene_3"], "status": "open|persists|resolved" } ] }

=== EXISTING LEDGER IDS ===
${known || "(none yet)"}`,
        userMessage: executiveSummary,
      });
      const extracted = safeParseJson<any>(extractResp);
      if (extracted && Array.isArray(extracted.issues)) {
        for (const e of extracted.issues) {
          if (!e?.id) continue;
          const id = String(e.id);
          let issue = ledger.issues.find((i: any) => i.id === id);
          if (!issue) {
            issue = {
              id,
              title: String(e.title || ""),
              bucket: e.bucket === "canon" ? "canon" : "prose",
              first_flagged: version,
              status: "open",
              history: [],
            };
            ledger.issues.push(issue);
          }
          if (e.title) issue.title = String(e.title);
          const st = String(e.status || "open");
          // A re-flagged issue reopens even if previously marked resolved.
          issue.status = st === "resolved" ? "resolved" : "open";
          issue.history.push({
            version,
            event: `review: ${st}${Array.isArray(e.scene_refs) && e.scene_refs.length ? ` (${e.scene_refs.join(", ")})` : ""}`,
          });
        }
        await workspaceExporter.saveIssueLedger(story_id, ledger);
      }
    } catch {
      /* ledger is best-effort */
    }

    return {
      content: [
        {
          type: "text",
          text: `StoryScope Final Review Complete for ${version}! Generated ${reports.length} of ${aspectFiles.length} aspect reports${failedCount > 0 ? ` (${failedCount} lens(es) failed and were skipped)` : ""} and 1 Executive Summary.${selfCheckNote} Saved to workspace under ${story_id}/storyscope-reports/${version}. Cross-version issue statuses updated in storyscope-reports/issue-ledger.json.`,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error running storyscope review: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
