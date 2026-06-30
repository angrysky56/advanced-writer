import { aiRouter } from "../ai/router.js";
import { neo4jStorage } from "../storage/neo4j.js";
import { workspaceExporter } from "../storage/workspace.js";
import { safeParseJson } from "../ai/extract.js";

interface PriorCharacter {
  name: string;
  role?: string;
  scratchpad?: string;
}

/**
 * The story's "script supervisor". After each scene it reads the prose, MERGES
 * each present character's living state sheet (scratchpad) with their prior
 * state, and persists: scratchpad, arc beat, affect snapshot, new entities and
 * relationships. This is the single source of continuity truth that gets read
 * back into the next scene's prompt.
 *
 * Best-effort: never throws (a tracking hiccup must not abort drafting).
 */
export async function recordSceneTracking(
  storyId: string,
  sceneId: string,
  sceneText: string,
  canonCast: string,
  priorCharacters: PriorCharacter[],
): Promise<void> {
  const priorState =
    (priorCharacters || [])
      .map((c) => {
        let sp: any = {};
        try {
          sp = c.scratchpad ? JSON.parse(c.scratchpad) : {};
        } catch {
          sp = {};
        }
        return `- ${c.name}: ${JSON.stringify(sp)}`;
      })
      .join("\n") || "No prior state on record.";

  const prompt = `You are the story's CONTINUITY SUPERVISOR (like a film script supervisor). Read the new scene and update each present character's living state sheet ("scratchpad"). MERGE the scene's events into their PRIOR state: keep prior facts that still hold, change only what changed, and never silently drop established facts.

CANON CAST — use these EXACT full names; include EVERY canon character who is present in the scene:
${canonCast}

PRIOR STATE (each character's scratchpad before this scene):
${priorState}

Output ONLY valid JSON (no markdown):
{
  "character_updates": [ {
    "name": "Exact Full Name from the canon cast",
    "arc_progression": "one sentence: what changed for them this scene",
    "scratchpad": {
      "location": "where they physically are at scene end",
      "knows": "key things they now know or believe (especially secrets and revelations)",
      "wants": "their current immediate goal",
      "holding": "physical state: notable possessions, injuries, appearance changes",
      "relationships": "their current stance toward each other named character",
      "last_action": "what they actually did in this scene"
    },
    "panksepp": { "SEEKING":5,"FEAR":5,"RAGE":5,"LUST":5,"CARE":5,"PANIC_GRIEF":5,"PLAY":5 },
    "plutchik": { "joy":5,"trust":5,"fear":5,"surprise":5,"sadness":5,"disgust":5,"anger":5,"anticipation":5 }
  } ],
  "new_characters": [ {
    "name": "Full Name of a SIGNIFICANT character who appears in this scene but is NOT in the canon cast above",
    "role": "their role/function (e.g. 'crew medic', 'the hive intelligence', 'the captain's dog')",
    "brief": "one line: who they are",
    "arc_progression": "one sentence: what they did / what changed for them this scene",
    "scratchpad": {
      "location": "where they are at scene end",
      "knows": "what they know or believe",
      "wants": "their current goal (or instinct, for a creature/animal)",
      "holding": "physical state",
      "relationships": "stance toward named characters",
      "last_action": "what they did this scene"
    },
    "panksepp": { "SEEKING":5,"FEAR":5,"RAGE":5,"LUST":5,"CARE":5,"PANIC_GRIEF":5,"PLAY":5 },
    "plutchik": { "joy":5,"trust":5,"fear":5,"surprise":5,"sadness":5,"disgust":5,"anger":5,"anticipation":5 }
  } ],
  "new_entities": [ { "name": "", "type": "Prop/Location/Animal/Org", "description": "" } ],
  "new_relationships": [ { "subject": "", "relation": "KNOWS/OWNS/AT/LOVES/FEARS/etc", "object": "" } ],
  "world_facts": [ "a NEW global/world fact this scene ESTABLISHED that future scenes must stay consistent with — a place and where it is, a rule of how the world or its central mechanic works, a date/timeline/duration, a significant object, a faction or political fact. NOT a character's emotional state (that goes in character_updates). Leave empty if this scene established nothing new about the world." ]
}
Score panksepp 1-10 (drives) and plutchik 1-10 (felt emotion) AS OF THIS SCENE. Only include characters actually present. If nothing is new for characters/entities/relationships, use empty arrays.
PROMOTION RULE for "new_characters": leave this array EMPTY almost always. The cast is planned in full before drafting, so virtually every character who appears is already in the canon cast — match them there. Add an entry ONLY in the rare case that the scene introduces a genuinely NEW, plot-essential individuated being who is absent from the canon cast and could not reasonably have been planned. A minor unnamed presence is NOT a new character — that belongs in new_entities. If in doubt, leave new_characters empty.
SCENE:
${sceneText}`;

  let data: any = null;
  try {
    const resp = await aiRouter.generateCompletion({
      taskType: "generation",
      systemPrompt: prompt,
      userMessage: "Update the continuity state.",
    });
    data = safeParseJson<any>(resp);
  } catch {
    data = null;
  }
  if (!data) return;

  // Promote significant NEW characters the scene introduced (a fresh crewmate,
  // a creature/AI, the emergent "them", a notable pet) to tracked Character
  // nodes, then seed their first scratchpad + affect snapshot. Done BEFORE the
  // canon updates so a being introduced and developed in the same scene lands.
  if (Array.isArray(data.new_characters)) {
    for (const nc of data.new_characters) {
      if (!nc?.name) continue;
      try {
        await neo4jStorage.ensureCharacter(
          storyId,
          nc.name,
          nc.role || "Supporting",
          nc.brief || "",
        );
        if (nc.arc_progression) {
          await neo4jStorage.updateCharacterState(
            storyId,
            nc.name,
            nc.arc_progression,
          );
        }
        if (nc.scratchpad) {
          await neo4jStorage.updateScratchpad(
            storyId,
            nc.name,
            JSON.stringify(nc.scratchpad),
          );
        }
        if (nc.panksepp || nc.plutchik) {
          await neo4jStorage.appendAffectSnapshot(
            storyId,
            nc.name,
            sceneId,
            nc.panksepp || {},
            nc.plutchik || {},
          );
        }
      } catch (e) {
        console.warn("recordSceneTracking: new character promotion failed", e);
      }
    }
  }

  if (Array.isArray(data.character_updates)) {
    for (const u of data.character_updates) {
      if (!u?.name) continue;
      try {
        await neo4jStorage.updateCharacterState(
          storyId,
          u.name,
          u.arc_progression || "",
        );
        if (u.scratchpad) {
          await neo4jStorage.updateScratchpad(
            storyId,
            u.name,
            JSON.stringify(u.scratchpad),
          );
        }
        if (u.panksepp || u.plutchik) {
          await neo4jStorage.appendAffectSnapshot(
            storyId,
            u.name,
            sceneId,
            u.panksepp || {},
            u.plutchik || {},
          );
        }
      } catch (e) {
        console.warn("recordSceneTracking: character update failed", e);
      }
    }
  }

  if (Array.isArray(data.new_entities)) {
    for (const e of data.new_entities) {
      if (!e?.name) continue;
      try {
        await neo4jStorage.addEntity(
          storyId,
          e.name,
          e.type || "Thing",
          e.description || "",
        );
      } catch {
        /* non-fatal */
      }
    }
  }

  if (Array.isArray(data.new_relationships)) {
    for (const r of data.new_relationships) {
      if (!r?.subject || !r?.object) continue;
      try {
        await neo4jStorage.addEntityRelationship(
          storyId,
          r.subject,
          r.object,
          r.relation || "RELATED_TO",
        );
      } catch {
        /* non-fatal */
      }
    }
  }

  // Fill in the world bible's continuity ledger with whatever global facts this
  // scene established, so the world model grows FROM the story and later scenes
  // can be verified against it.
  if (Array.isArray(data.world_facts) && data.world_facts.length) {
    try {
      await workspaceExporter.appendWorldContinuity(
        storyId,
        sceneId,
        data.world_facts.map((f: any) => String(f)),
      );
    } catch (e) {
      console.warn("recordSceneTracking: world continuity update failed", e);
    }
  }
}

/** Build a human-readable state-sheet block to inject before writing a scene. */
/** Top-N highest-scoring keys of an affect object, as "key N, key N". */
function topAffect(obj: any, n = 3): string {
  if (!obj || typeof obj !== "object") return "";
  return Object.entries(obj)
    .filter(([, v]) => typeof v === "number")
    .sort((a: any, b: any) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");
}

/**
 * The DIRECTOR. Before a scene is written, give each present character a precise
 * performance note — the emotion to play and where the beat must move it (from
 * the feeling they carry in), their objective in the scene, and how to play it —
 * grounded in the beat and obeying any AUTHOR DIRECTION. This is handed to the
 * writer ("the actors") so they play the scene to intent instead of guessing.
 *
 * `characters` should be the RICH state objects from getStoryState (they carry
 * current_affect, hamartia, scratchpad, author_note). Fail-open to "".
 */
export async function buildDirectorNotes(
  beatDirective: string,
  characters: any[],
): Promise<string> {
  const present = (characters || []).filter((c) => c && c.name);
  if (present.length === 0) return "";

  const roster = present
    .map((c) => {
      const aff = c.current_affect;
      const feeling =
        [
          topAffect(aff?.panksepp) && `drives ${topAffect(aff?.panksepp)}`,
          topAffect(aff?.plutchik) && `emotions ${topAffect(aff?.plutchik)}`,
        ]
          .filter(Boolean)
          .join("; ") || "(no prior feeling tracked)";
      let wants = "";
      try {
        const sp = c.scratchpad ? JSON.parse(c.scratchpad) : {};
        wants = typeof sp.wants === "string" ? sp.wants : "";
      } catch {
        /* ignore */
      }
      return (
        `- ${c.name}${c.role ? ` (${c.role})` : ""}\n` +
        `  carries in: ${feeling}\n` +
        (wants ? `  wants: ${wants}\n` : "") +
        (c.hamartia ? `  flaw: ${c.hamartia}\n` : "") +
        (c.author_note && String(c.author_note).trim()
          ? `  AUTHOR DIRECTION (obey exactly): ${String(c.author_note).trim()}\n`
          : "")
      );
    })
    .join("\n");

  const prompt = `You are a film DIRECTOR giving each actor a precise note in the moment before this scene is performed. For EACH character below, write 2-4 sentences of actable direction:
1) EMOTION: what they play, and the arc of it — name where they START (use "carries in") and where THIS BEAT must move them by the end.
2) OBJECTIVE: what they are actively trying to get or do in this scene (their motivation, concrete).
3) HOW TO PLAY IT: the subtext, restraint vs. release, the physical/verbal tell.
Obey any AUTHOR DIRECTION exactly. Ground every note in THIS BEAT — no generic notes. Output ONLY a list: "- Name: <direction>".

=== THIS BEAT ===
${beatDirective || "(no beat — continue naturally)"}

=== ACTORS (and what they carry into the scene) ===
${roster}`;

  try {
    const out = await aiRouter.generateCompletion({
      taskType: "brainstorm",
      systemPrompt: prompt,
      userMessage: "Give each actor their precise direction for this scene.",
    });
    return (out || "").trim();
  } catch {
    return "";
  }
}

export function buildScratchpadContext(characters: any[]): string {
  const lines = (characters || [])
    .map((c) => {
      let sp: any = {};
      try {
        sp = c.scratchpad ? JSON.parse(c.scratchpad) : {};
      } catch {
        sp = {};
      }
      // Render values readably — relationships/holding are often objects or
      // arrays, and "${obj}" yields "[object Object]", which fed the AGENT
      // garbage and lost relationship continuity.
      const fmt = (v: any): string => {
        if (v == null) return "";
        if (Array.isArray(v)) return v.map(fmt).filter(Boolean).join("; ");
        if (typeof v === "object")
          return Object.entries(v)
            .map(([k, val]) => `${k}: ${fmt(val)}`)
            .filter(Boolean)
            .join(", ");
        return String(v);
      };
      const fields = [
        "location",
        "wants",
        "knows",
        "holding",
        "relationships",
        "last_action",
      ]
        .filter((k) => sp[k])
        .map((k) => `${k}: ${fmt(sp[k])}`)
        .join("; ");
      // CURRENT FEELING — the character's live affect, carried into this scene so
      // it acts knowing how it feels, then lets the scene shift it believably.
      const top = (obj: any): string => {
        if (!obj || typeof obj !== "object") return "";
        return Object.entries(obj)
          .filter(([, v]) => typeof v === "number")
          .sort((a: any, b: any) => b[1] - a[1])
          .slice(0, 3)
          .map(([k, v]) => `${k} ${v}`)
          .join(", ");
      };
      const aff = c.current_affect;
      const drives = top(aff?.panksepp);
      const emotions = top(aff?.plutchik);
      const feeling =
        drives || emotions
          ? `\n    ↳ CURRENT FEELING (write them true to this, then let the scene move it): ${[drives && `drives — ${drives}`, emotions && `emotions — ${emotions}`].filter(Boolean).join("; ")}`
          : "";
      // The author's persistent steering note (set in the Studio) carries the
      // most weight — surface it explicitly so authorial intent overrides drift.
      const note =
        c.author_note && String(c.author_note).trim()
          ? `\n    ↳ AUTHOR DIRECTION (honor this): ${String(c.author_note).trim()}`
          : "";
      return `- ${c.name}${c.role ? ` (${c.role})` : ""}: ${fields || "no state recorded yet"}${feeling}${note}`;
    })
    .join("\n");
  return lines || "No character state on record yet.";
}
