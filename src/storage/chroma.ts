import { ChromaClient, Collection } from "chromadb";
import { ENV } from "../config.js";
import { OllamaEmbeddingFunction } from "@chroma-core/ollama";
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
  public lore!: Collection;
  public beats!: Collection;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.client = new ChromaClient({
      host: ENV.CHROMA_HOST,
      port: ENV.CHROMA_PORT,
    });
  }

  async ensureInitialized() {
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    await this.initPromise;
  }

  async initialize() {
    const ollamaEmbeddingFunction = new OllamaEmbeddingFunction({
      url: ENV.OLLAMA_BASE_URL,
      model: ENV.OLLAMA_EMBEDDING_MODEL,
    });

    this.characters = await this.client.getOrCreateCollection({
      name: "characters",
      embeddingFunction: ollamaEmbeddingFunction,
    });
    this.stories = await this.client.getOrCreateCollection({
      name: "stories",
      embeddingFunction: ollamaEmbeddingFunction,
    });
    this.scenes = await this.client.getOrCreateCollection({
      name: "scenes",
      embeddingFunction: ollamaEmbeddingFunction,
    });
    this.archetypes = await this.client.getOrCreateCollection({
      name: "archetypes",
      embeddingFunction: ollamaEmbeddingFunction,
    });
    this.lore = await this.client.getOrCreateCollection({
      name: "lore",
      embeddingFunction: ollamaEmbeddingFunction,
    });
    this.beats = await this.client.getOrCreateCollection({
      name: "beats",
      embeddingFunction: ollamaEmbeddingFunction,
    });
  }

  /** Embed one arc beat so it can be semantically retrieved while drafting. */
  async addBeat(
    id: string,
    story_id: string,
    order: number,
    document: string,
  ) {
    await this.ensureInitialized();
    try {
      await this.beats.upsert({
        ids: [id],
        documents: [document],
        metadatas: [{ story_id, order, created_at: new Date().toISOString() }],
      });
    } catch (e) {
      console.error("Chroma upsert beat error:", e);
    }
  }

  async searchBeats(query: string, nResults: number = 2): Promise<string[]> {
    await this.ensureInitialized();
    try {
      const results = await this.beats.query({
        queryTexts: [query],
        nResults,
      });
      if (results.documents && results.documents[0]) {
        return results.documents[0].filter((d: any) => d !== null) as string[];
      }
      return [];
    } catch (e) {
      console.error("Chroma search beats error:", e);
      return [];
    }
  }

  async addCharacter(record: CharacterRecord) {
    await this.ensureInitialized();
    await this.characters.upsert({
      ids: [record.id],
      documents: [record.document],
      metadatas: [record.metadata as any],
    });
  }

  async addStory(record: StoryRecord) {
    await this.ensureInitialized();
    await this.stories.upsert({
      ids: [record.id],
      documents: [record.document],
      metadatas: [record.metadata as any],
    });
  }

  async addScene(record: SceneRecord) {
    await this.ensureInitialized();
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
    await this.ensureInitialized();
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

  async addLore(id: string, story_id: string, document: string) {
    await this.ensureInitialized();
    try {
      await this.lore.upsert({
        ids: [id],
        documents: [document],
        metadatas: [{ story_id, created_at: new Date().toISOString() }],
      });
    } catch (e) {
      console.error("Chroma upsert lore error:", e);
    }
  }

  async searchLore(query: string, nResults: number = 3): Promise<string[]> {
    await this.ensureInitialized();
    try {
      const results = await this.lore.query({
        queryTexts: [query],
        nResults,
      });
      if (results.documents && results.documents[0]) {
        return results.documents[0].filter((d: any) => d !== null) as string[];
      }
      return [];
    } catch (e) {
      console.error("Chroma search lore error:", e);
      return [];
    }
  }
}

export const chromaStorage = new ChromaStorage();
