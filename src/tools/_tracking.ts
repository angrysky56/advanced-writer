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
