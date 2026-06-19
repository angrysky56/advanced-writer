import neo4j, { Driver } from 'neo4j-driver';
import { ENV } from '../config.js';
import { CharacterRecord, StoryRecord, SceneRecord } from './types.js';

export class Neo4jStorage {
  private driver: Driver;

  constructor() {
    this.driver = neo4j.driver(
      ENV.NEO4J_URI,
      neo4j.auth.basic(ENV.NEO4J_USER, ENV.NEO4J_PASSWORD)
    );
  }

  async close() {
    await this.driver.close();
  }

  private getSession() {
    return this.driver.session({
      database: ENV.NEO4J_DATABASE || undefined
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
          panksepp_primary: $panksepp_primary
        }
        `,
        {
          id: character.id,
          name: character.metadata.name,
          archetype: character.metadata.archetype,
          hamartia: character.metadata.hamartia,
          shadow: character.metadata.shadow,
          individuation_state: character.metadata.individuation_state,
          panksepp_primary: character.metadata.panksepp_primary
        }
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
        { id1: characterId1, id2: characterId2 }
      );
    } finally {
      await session.close();
    }
  }

  // We can add more specific cypher queries here based on NEXT-STEPS.md
}

export const neo4jStorage = new Neo4jStorage();
