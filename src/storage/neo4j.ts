import neo4j, { Driver } from "neo4j-driver";
import { ENV } from "../config.js";
import { CharacterRecord, StoryRecord, SceneRecord } from "./types.js";

export class Neo4jStorage {
  private driver: Driver;

  constructor() {
    this.driver = neo4j.driver(
      ENV.NEO4J_URI,
      neo4j.auth.basic(ENV.NEO4J_USER, ENV.NEO4J_PASSWORD),
    );
  }

  async close() {
    await this.driver.close();
  }

  private getSession() {
    return this.driver.session({
      database: ENV.NEO4J_DATABASE || undefined,
    });
  }

  async createCharacterNode(character: CharacterRecord) {
    const session = this.getSession();
    try {
      await session.run(
        `
        MERGE (c:Character { id: $id })
        SET c += {
          name: $name,
          archetype: $archetype,
          hamartia: $hamartia,
          shadow: $shadow,
          individuation_state: $individuation_state,
          panksepp_primary: $panksepp_primary,
          story_ids: $story_ids,
          current_state: $current_state
        }
        `,
        {
          id: character.id,
          name: character.metadata.name,
          archetype: character.metadata.archetype,
          hamartia: character.metadata.hamartia,
          shadow: character.metadata.shadow,
          individuation_state: character.metadata.individuation_state,
          panksepp_primary: character.metadata.panksepp_primary,
          story_ids: character.metadata.story_ids || [],
          current_state: "Initial state.",
        },
      );
    } finally {
      await session.close();
    }
  }

  async createShadowEdge(characterId1: string, characterId2: string) {
    const session = this.getSession();
    try {
      await session.run(
        `
        MATCH (c1:Character {id: $id1})
        MATCH (c2:Character {id: $id2})
        MERGE (c1)-[:SHADOWS]->(c2)
        `,
        { id1: characterId1, id2: characterId2 },
      );
    } finally {
      await session.close();
    }
  }

  async getStoryState(storyId: string): Promise<any> {
    const session = this.getSession();
    try {
      const charsResult = await session.run(
        `
        MATCH (c:Character)
        WHERE $storyId IN c.story_ids
        RETURN c
        `,
        { storyId },
      );
      // Project a lean character summary. Injecting the full node (raw profile
      // document + unbounded logs) into every scene prompt is a major drift and
      // token-bloat source, so we expose only the live arc-relevant fields.
      const characters = charsResult.records.map((record) => {
        const p = record.get("c").properties;
        return {
          name: p.name,
          archetype: p.archetype,
          role: p.role,
          hamartia: p.hamartia,
          shadow: p.shadow,
          individuation_state: p.individuation_state,
          panksepp_primary: p.panksepp_primary,
          current_state: p.current_state,
        };
      });

      const entitiesResult = await session.run(
        `
        MATCH (e:Entity)
        WHERE $storyId IN e.story_ids
        RETURN e
        `,
        { storyId },
      );
      const entities = entitiesResult.records.map(
        (record) => record.get("e").properties,
      );

      const relsResult = await session.run(
        `
        MATCH (n)-[r]->(m)
        WHERE ($storyId IN n.story_ids) AND ($storyId IN m.story_ids)
        RETURN n.name AS subject, type(r) AS relation, m.name AS object
        `,
        { storyId },
      );
      const relationships = relsResult.records.map((r) => ({
        subject: r.get("subject"),
        relation: r.get("relation"),
        object: r.get("object"),
      }));

      return { characters, entities, relationships };
    } catch (e) {
      console.error("Neo4j retrieve error:", e);
      return { characters: [], entities: [], relationships: [] };
    } finally {
      await session.close();
    }
  }

  async getCharactersForStory(storyId: string): Promise<any[]> {
    const session = this.getSession();
    try {
      const result = await session.run(
        `
        MATCH (c:Character)
        WHERE $storyId IN c.story_ids
        RETURN c
        `,
        { storyId },
      );
      return result.records.map((record) => record.get("c").properties);
    } catch (e) {
      console.error("Neo4j retrieve error:", e);
      return [];
    } finally {
      await session.close();
    }
  }

  async updateCharacterState(
    storyId: string,
    characterName: string,
    stateUpdate: string,
  ) {
    const session = this.getSession();
    try {
      // Keep a bounded rolling arc log (last 8 beats) and rebuild current_state
      // from it. The previous unbounded `state + " | " + update` concatenation
      // grew without limit and was injected into every downstream prompt.
      await session.run(
        `
        MATCH (c:Character {name: $name})
        WHERE $storyId IN c.story_ids
        SET c.state_log = (coalesce(c.state_log, []) + $stateUpdate)[-8..],
            c.updated_at = $now
        WITH c
        SET c.current_state = reduce(
          s = '', x IN c.state_log |
          CASE WHEN s = '' THEN x ELSE s + ' | ' + x END
        )
        `,
        {
          name: characterName,
          storyId,
          stateUpdate,
          now: new Date().toISOString(),
        },
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Append a per-scene affect snapshot (Panksepp drives + Plutchik emotions) to
   * a character's bounded timeline, so emotional arcs can be reconstructed
   * across the story. Capped to the last 40 snapshots to avoid unbounded growth.
   */
  async appendAffectSnapshot(
    storyId: string,
    characterName: string,
    sceneId: string,
    panksepp: Record<string, number>,
    plutchik: Record<string, number>,
  ) {
    const session = this.getSession();
    try {
      const snapshot = JSON.stringify({
        scene: sceneId,
        panksepp: panksepp || {},
        plutchik: plutchik || {},
        at: new Date().toISOString(),
      });
      await session.run(
        `
        MATCH (c:Character {name: $name})
        WHERE $storyId IN c.story_ids
        SET c.affect_log = (coalesce(c.affect_log, []) + $snapshot)[-40..]
        `,
        { name: characterName, storyId, snapshot },
      );
    } finally {
      await session.close();
    }
  }

  async addEntity(
    storyId: string,
    entityName: string,
    type: string,
    description: string,
  ) {
    const session = this.getSession();
    try {
      const id = `${storyId}_entity_${entityName.replace(/\s+/g, "_").toLowerCase()}`;
      await session.run(
        `
        MERGE (e:Entity { id: $id })
        ON CREATE SET e.story_ids = [$storyId]
        ON MATCH SET e.story_ids = CASE WHEN NOT $storyId IN e.story_ids THEN e.story_ids + $storyId ELSE e.story_ids END
        SET e += {
          name: $name,
          type: $type,
          description: $description
        }
        `,
        { id, storyId, name: entityName, type, description },
      );
    } finally {
      await session.close();
    }
  }

  async addEntityRelationship(
    storyId: string,
    subjectName: string,
    objectName: string,
    relation: string,
  ) {
    const session = this.getSession();
    try {
      // Find nodes by name and storyId. relation cannot be parameterized as a label directly in cypher.
      // We will use APOC if available or dynamic query creation.
      // For simplicity, we just use string replacement for relation type (sanitize first)
      let relType = relation.replace(/[^A-Z_]/gi, "_").toUpperCase();
      if (!/[A-Z]/.test(relType)) relType = "RELATED_TO"; // guard empty/invalid

      await session.run(
        `
        MATCH (s) WHERE s.name = $subjectName AND $storyId IN s.story_ids
        MATCH (o) WHERE o.name = $objectName AND $storyId IN o.story_ids
        MERGE (s)-[r:${relType}]->(o)
        `,
        { storyId, subjectName, objectName },
      );
    } finally {
      await session.close();
    }
  }

  async getCharacterById(characterId: string): Promise<any | null> {
    const session = this.getSession();
    try {
      const result = await session.run(
        `MATCH (c:Character { id: $id }) RETURN c`,
        { id: characterId },
      );
      if (result.records.length === 0) return null;
      return result.records[0].get("c").properties;
    } catch (e) {
      console.error("Neo4j getCharacterById error:", e);
      return null;
    } finally {
      await session.close();
    }
  }

  async listAllCharacters(): Promise<any[]> {
    const session = this.getSession();
    try {
      const result = await session.run(
        `MATCH (c:Character) RETURN c ORDER BY c.name`,
      );
      return result.records.map((r) => r.get("c").properties);
    } catch (e) {
      console.error("Neo4j listAllCharacters error:", e);
      return [];
    } finally {
      await session.close();
    }
  }

  /** Patch arbitrary scalar metadata fields on a character node by id. */
  async updateCharacterMeta(
    characterId: string,
    fields: Record<string, string>,
  ): Promise<boolean> {
    const allowed = [
      "name",
      "archetype",
      "hamartia",
      "shadow",
      "moral_weakness",
      "individuation_state",
      "role",
      "panksepp_primary",
    ];
    const updates: Record<string, string> = {};
    for (const key of allowed) {
      if (fields[key] !== undefined) updates[key] = fields[key];
    }
    if (Object.keys(updates).length === 0) return false;

    const session = this.getSession();
    try {
      const result = await session.run(
        `MATCH (c:Character { id: $id })
         SET c += $updates, c.updated_at = $now
         RETURN c`,
        { id: characterId, updates, now: new Date().toISOString() },
      );
      return result.records.length > 0;
    } finally {
      await session.close();
    }
  }
}

export const neo4jStorage = new Neo4jStorage();
