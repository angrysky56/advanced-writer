import { ChromaClient, Collection } from "chromadb";
import { ENV } from "../config.js";
import {
  CharacterRecord,
  StoryRecord,
  SceneRecord,
  ArchetypeRecord,
} from "./types.js";

export class ChromaStorage {
  private client: ChromaClient;
  public characters!: Collection;
  public stories!: Collection;
  public scenes!: Collection;
  public archetypes!: Collection;

  constructor() {
    // Note: The JS chromadb client typically connects to a running Chroma server
    // (e.g., via Docker) or uses a local path if supported by the specific version.
    this.client = new ChromaClient({ path: "http://localhost:8000" });
  }

  async initialize() {
    this.characters = await this.client.getOrCreateCollection({
      name: "characters",
    });
    this.stories = await this.client.getOrCreateCollection({ name: "stories" });
    this.scenes = await this.client.getOrCreateCollection({ name: "scenes" });
    this.archetypes = await this.client.getOrCreateCollection({
      name: "archetypes",
    });
  }

  async addCharacter(record: CharacterRecord) {
    await this.characters.upsert({
      ids: [record.id],
      documents: [record.document],
      metadatas: [record.metadata as any],
    });
  }

  async addStory(record: StoryRecord) {
    await this.stories.upsert({
      ids: [record.id],
      documents: [record.document],
      metadatas: [record.metadata as any],
    });
  }

  async addScene(record: SceneRecord) {
    try {
      await this.scenes.upsert({
        ids: [record.id],
        documents: [record.document],
        metadatas: [record.metadata as any],
      });
    } catch (e) {
      console.error("Chroma upsert error (is server running?):", e);
    }
  }

  async searchScenes(query: string, nResults: number = 2): Promise<string[]> {
    try {
      const results = await this.scenes.query({
        queryTexts: [query],
        nResults,
      });
      if (results.documents && results.documents[0]) {
        return results.documents[0].filter((d) => d !== null) as string[];
      }
      return [];
    } catch (e) {
      console.error("Chroma search error (is server running?):", e);
      return [];
    }
  }
}

export const chromaStorage = new ChromaStorage();
