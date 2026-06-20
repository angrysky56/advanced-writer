import fs from "fs";
import path from "path";
import { ENV } from "../config.js";

export class WorkspaceExporter {
  private baseDir: string;

  constructor() {
    this.baseDir = ENV.WORKSPACE_DIR;
  }

  private async ensureDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
      await fs.promises.mkdir(dirPath, { recursive: true });
    }
  }

  private sanitizeFilename(name: string): string {
    return name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  }

  async saveCharacterProfile(
    storyName: string,
    characterName: string,
    content: string,
  ): Promise<string> {
    const storySlug = this.sanitizeFilename(storyName);
    const charSlug = this.sanitizeFilename(characterName);
    const dir = path.join(this.baseDir, storySlug, "characters");
    await this.ensureDir(dir);

    const filePath = path.join(dir, `${charSlug}.md`);
    await fs.promises.writeFile(filePath, content, "utf8");
    return filePath;
  }

  async saveArchitectureBrief(
    storyName: string,
    content: string,
  ): Promise<string> {
    const storySlug = this.sanitizeFilename(storyName);
    const dir = path.join(this.baseDir, storySlug, "structure");
    await this.ensureDir(dir);

    const filePath = path.join(dir, "story-architecture-brief.md");
    await fs.promises.writeFile(filePath, content, "utf8");
    return filePath;
  }

  async saveWorldBible(storyName: string, content: string): Promise<string> {
    const storySlug = this.sanitizeFilename(storyName);
    const dir = path.join(this.baseDir, storySlug, "structure");
    await this.ensureDir(dir);

    const filePath = path.join(dir, "world-bible.md");
    await fs.promises.writeFile(filePath, content, "utf8");
    return filePath;
  }

  async saveBeatSheet(storyName: string, content: string): Promise<string> {
    const storySlug = this.sanitizeFilename(storyName);
    const dir = path.join(this.baseDir, storySlug, "structure");
    await this.ensureDir(dir);

    const filePath = path.join(dir, "beat-sheet.md");
    await fs.promises.writeFile(filePath, content, "utf8");
    return filePath;
  }

  async saveDiagnosticReport(
    storyName: string,
    sceneId: string,
    content: string,
  ): Promise<string> {
    const storySlug = this.sanitizeFilename(storyName);
    const sceneSlug = this.sanitizeFilename(sceneId);
    const dir = path.join(this.baseDir, storySlug, "diagnostics");
    await this.ensureDir(dir);

    const filePath = path.join(dir, `neuro-critique-${sceneSlug}.md`);
    await fs.promises.writeFile(filePath, content, "utf8");
    return filePath;
  }

  async saveDraft(
    storyName: string,
    sceneId: string,
    content: string,
  ): Promise<string> {
    const storySlug = this.sanitizeFilename(storyName);
    const sceneSlug = this.sanitizeFilename(sceneId);
    const dir = path.join(this.baseDir, storySlug, "drafts");
    await this.ensureDir(dir);

    const filePath = path.join(dir, `${sceneSlug}.md`);
    await fs.promises.writeFile(filePath, content, "utf8");
    return filePath;
  }
  async readArchitectureBrief(storyName: string): Promise<string | null> {
    const storySlug = this.sanitizeFilename(storyName);
    const filePath = path.join(
      this.baseDir,
      storySlug,
      "structure",
      "story-architecture-brief.md",
    );
    try {
      return await fs.promises.readFile(filePath, "utf8");
    } catch {
      return null;
    }
  }

  async readDraft(storyName: string, sceneId: string): Promise<string | null> {
    const storySlug = this.sanitizeFilename(storyName);
    const sceneSlug = this.sanitizeFilename(sceneId);
    const filePath = path.join(
      this.baseDir,
      storySlug,
      "drafts",
      `${sceneSlug}.md`,
    );
    try {
      return await fs.promises.readFile(filePath, "utf8");
    } catch {
      return null;
    }
  }

  async readAllDrafts(storyName: string): Promise<string> {
    const storySlug = this.sanitizeFilename(storyName);
    const draftsDir = path.join(this.baseDir, storySlug, "drafts");

    try {
      const files = await fs.promises.readdir(draftsDir);
      const mdFiles = files.filter((f) => f.endsWith(".md")).sort();
      let combined = "";
      for (const file of mdFiles) {
        const content = await fs.promises.readFile(
          path.join(draftsDir, file),
          "utf8",
        );
        combined += `\n\n=== ${file} ===\n\n${content}`;
      }
      return combined;
    } catch {
      return "";
    }
  }

  async saveManuscript(storyName: string, content: string): Promise<string> {
    const storySlug = this.sanitizeFilename(storyName);
    const dir = path.join(this.baseDir, storySlug, "manuscript");
    await this.ensureDir(dir);

    const filePath = path.join(dir, "final_manuscript.md");
    await fs.promises.writeFile(filePath, content, "utf8");
    return filePath;
  }

  async readAllDiagnostics(
    storyName: string,
  ): Promise<{ sceneId: string; content: string }[]> {
    const storySlug = this.sanitizeFilename(storyName);
    const diagnosticsDir = path.join(this.baseDir, storySlug, "diagnostics");

    try {
      const files = await fs.promises.readdir(diagnosticsDir);
      const mdFiles = files.filter((f) => f.endsWith(".md")).sort();
      const results = [];
      for (const file of mdFiles) {
        const content = await fs.promises.readFile(
          path.join(diagnosticsDir, file),
          "utf8",
        );
        // Extract sceneSlug from filename (e.g., neuro-critique-scene_1.md)
        const match = file.match(/neuro-critique-(.*)\.md/);
        if (match) {
          results.push({ sceneId: match[1], content });
        }
      }
      return results;
    } catch {
      return [];
    }
  }

  async readManuscript(storyName: string): Promise<string | null> {
    const storySlug = this.sanitizeFilename(storyName);
    const filePath = path.join(
      this.baseDir,
      storySlug,
      "manuscript",
      "final_manuscript.md",
    );
    try {
      return await fs.promises.readFile(filePath, "utf8");
    } catch {
      return null;
    }
  }

  async saveStoryscopeReport(
    storyName: string,
    aspectName: string,
    content: string,
  ): Promise<string> {
    const storySlug = this.sanitizeFilename(storyName);
    const aspectSlug = this.sanitizeFilename(aspectName);
    const dir = path.join(this.baseDir, storySlug, "storyscope-reports");
    await this.ensureDir(dir);

    const filePath = path.join(dir, `${aspectSlug}.md`);
    await fs.promises.writeFile(filePath, content, "utf8");
    return filePath;
  }

  async saveStoryscopeExecutiveSummary(
    storyName: string,
    content: string,
  ): Promise<string> {
    const storySlug = this.sanitizeFilename(storyName);
    const dir = path.join(this.baseDir, storySlug, "storyscope-reports");
    await this.ensureDir(dir);

    const filePath = path.join(dir, "executive-summary.md");
    await fs.promises.writeFile(filePath, content, "utf8");
    return filePath;
  }
}

export const workspaceExporter = new WorkspaceExporter();
