import { aiRouter } from "../ai/router.js";
import { neo4jStorage } from "../storage/neo4j.js";
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
  "new_entities": [ { "name": "", "type": "Prop/Location/Animal/Org", "description": "" } ],
  "new_relationships": [ { "subject": "", "relation": "KNOWS/OWNS/AT/LOVES/FEARS/etc", "object": "" } ]
}
Score panksepp 1-10 (drives) and plutchik 1-10 (felt emotion) AS OF THIS SCENE. Only include characters actually present. If nothing is new for entities/relationships, use empty arrays.
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
}

/** Build a human-readable state-sheet block to inject before writing a scene. */
export function buildScratchpadContext(characters: any[]): string {
  const lines = (characters || [])
    .map((c) => {
      let sp: any = {};
      try {
        sp = c.scratchpad ? JSON.parse(c.scratchpad) : {};
      } catch {
        sp = {};
      }
      const fields = [
        "location",
        "wants",
        "knows",
        "holding",
        "relationships",
        "last_action",
      ]
        .filter((k) => sp[k])
        .map((k) => `${k}: ${sp[k]}`)
        .join("; ");
      return `- ${c.name}${c.role ? ` (${c.role})` : ""}: ${fields || "no state recorded yet"}`;
    })
    .join("\n");
  return lines || "No character state on record yet.";
}
