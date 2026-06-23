import fs from "fs";
import path from "path";
import { ENV } from "../config.js";

export class WorkspaceExporter {
  get baseDir(): string {
    return process.env.WORKSPACE_DIR || ENV.WORKSPACE_DIR;
  }

  private async ensureDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
      await fs.promises.mkdir(dirPath, { recursive: true });
    }
  }

  private sanitizeFilename(name: string): string {
    return name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  }

  /**
   * Return a story name whose folder does not already exist, appending _2, _3…
   * if needed. Ensures create_narrative always makes a NEW story rather than
   * writing into an existing one.
   */
  async uniqueStoryName(name: string): Promise<string> {
    let candidate = name;
    let n = 2;
    while (
      fs.existsSync(path.join(this.baseDir, this.sanitizeFilename(candidate))) &&
      n < 1000
    ) {
      candidate = `${name}_${n}`;
      n++;
    }
    return candidate;
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
    version: string = "v1",
  ): Promise<string> {
    const storySlug = this.sanitizeFilename(storyName);
    const sceneSlug = this.sanitizeFilename(sceneId);
    const dir = path.join(this.baseDir, storySlug, "drafts", version);
    await this.ensureDir(dir);

    const filePath = path.join(dir, `${sceneSlug}.md`);
    await fs.promises.writeFile(filePath, content, "utf8");
    return filePath;
  }
  async readWorldBible(storyName: string): Promise<string | null> {
    const storySlug = this.sanitizeFilename(storyName);
    const filePath = path.join(
      this.baseDir,
      storySlug,
      "structure",
      "world-bible.md",
    );
    try {
      return await fs.promises.readFile(filePath, "utf8");
    } catch {
      return null;
    }
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

  async readDraft(
    storyName: string,
    sceneId: string,
    version: string = "v1",
  ): Promise<string | null> {
    const storySlug = this.sanitizeFilename(storyName);
    const sceneSlug = this.sanitizeFilename(sceneId);
    const filePath = path.join(
      this.baseDir,
      storySlug,
      "drafts",
      version,
      `${sceneSlug}.md`,
    );
    try {
      return await fs.promises.readFile(filePath, "utf8");
    } catch {
      return null;
    }
  }

  async readAllDrafts(
    storyName: string,
    version: string = "v1",
  ): Promise<string> {
    const storySlug = this.sanitizeFilename(storyName);
    const dir = path.join(this.baseDir, storySlug, "drafts", version);
    try {
      const files = await fs.promises.readdir(dir);
      const markdownFiles = files
        .filter((f) => f.endsWith(".md"))
        .sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
        );
      let compiled = "";
      for (const file of markdownFiles) {
        const content = await fs.promises.readFile(
          path.join(dir, file),
          "utf8",
        );
        compiled += `\n\n${content}`;
      }
      return compiled;
    } catch {
      return "";
    }
  }

  /** List existing draft version folders (e.g. ["v1","v2","v3"]). */
  async listDraftVersions(storyName: string): Promise<string[]> {
    const storySlug = this.sanitizeFilename(storyName);
    const dir = path.join(this.baseDir, storySlug, "drafts");
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory() && /^v\d+$/i.test(e.name))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    } catch {
      return [];
    }
  }

  async listDrafts(
    storyName: string,
    version: string = "v1",
  ): Promise<string[]> {
    const storySlug = this.sanitizeFilename(storyName);
    const dir = path.join(this.baseDir, storySlug, "drafts", version);
    try {
      const files = await fs.promises.readdir(dir);
      return files
        .filter((f) => f.endsWith(".md"))
        .sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
        );
    } catch {
      return [];
    }
  }

  async saveManuscript(
    storyName: string,
    content: string,
    version: string = "v1",
  ): Promise<string> {
    const storySlug = this.sanitizeFilename(storyName);
    const dir = path.join(this.baseDir, storySlug, "manuscript", version);
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
      const mdFiles = files
        .filter((f) => f.endsWith(".md"))
        .sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
        );
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

  async readManuscript(
    storyName: string,
    version: string = "v1",
  ): Promise<string | null> {
    const storySlug = this.sanitizeFilename(storyName);
    const filePath = path.join(
      this.baseDir,
      storySlug,
      "manuscript",
      version,
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

  /** All specialist lens reports (everything except the executive summary). */
  async readAllStoryscopeReports(
    storyName: string,
  ): Promise<{ aspect: string; content: string }[]> {
    const storySlug = this.sanitizeFilename(storyName);
    const dir = path.join(this.baseDir, storySlug, "storyscope-reports");
    try {
      const files = await fs.promises.readdir(dir);
      const out: { aspect: string; content: string }[] = [];
      for (const f of files
        .filter((x) => x.endsWith(".md") && x !== "executive-summary.md")
        .sort()) {
        const content = await fs.promises.readFile(path.join(dir, f), "utf8");
        out.push({ aspect: f.replace(".md", ""), content });
      }
      return out;
    } catch {
      return [];
    }
  }

  async readStoryscopeExecutiveSummary(
    storyName: string,
  ): Promise<string | null> {
    const storySlug = this.sanitizeFilename(storyName);
    const filePath = path.join(
      this.baseDir,
      storySlug,
      "storyscope-reports",
      "executive-summary.md",
    );
    try {
      return await fs.promises.readFile(filePath, "utf8");
    } catch {
      return null;
    }
  }
}

export const workspaceExporter = new WorkspaceExporter();
