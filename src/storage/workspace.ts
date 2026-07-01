import fs from "fs";
import path from "path";
import { ENV } from "../config.js";
import { storySlug } from "./story-id.js";

export class WorkspaceExporter {
  get baseDir(): string {
    return process.env.WORKSPACE_DIR || ENV.WORKSPACE_DIR;
  }

  private async ensureDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
      await fs.promises.mkdir(dirPath, { recursive: true });
    }
  }

  // Story folders and Neo4j story_ids MUST normalize identically, so this
  // delegates to the shared canonical slug. (Kept as a method for the existing
  // call sites that also slug per-file character names.)
  private sanitizeFilename(name: string): string {
    return storySlug(name);
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
      fs.existsSync(
        path.join(this.baseDir, this.sanitizeFilename(candidate)),
      ) &&
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

  async readBeatSheet(storyName: string): Promise<string | null> {
    const storySlug = this.sanitizeFilename(storyName);
    const filePath = path.join(
      this.baseDir,
      storySlug,
      "structure",
      "beat-sheet.md",
    );
    try {
      return await fs.promises.readFile(filePath, "utf8");
    } catch {
      return null;
    }
  }

  /** Save the world-model self-consistency report (rules + arc reasoning pass). */
  async saveConsistencyReport(
    storyName: string,
    content: string,
  ): Promise<string> {
    const storySlug = this.sanitizeFilename(storyName);
    const dir = path.join(this.baseDir, storySlug, "structure");
    await this.ensureDir(dir);
    const filePath = path.join(dir, "world-model-consistency.md");
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

  /**
   * Fill in the world bible's living continuity ledger with global facts the
   * prose has ESTABLISHED (places, rules, timeline, objects, factions). This is
   * how the world bible grows from the story rather than being written up front:
   * an outline that gets filled in as scenes are drafted, so later scenes can be
   * kept consistent and verified against it. Deduplicates verbatim repeats and
   * creates the ledger section (and file) if absent.
   */
  async appendWorldContinuity(
    storyName: string,
    sceneId: string,
    facts: string[],
  ): Promise<void> {
    const clean = (facts || [])
      .map((f) =>
        String(f || "")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter((f) => f.length > 0);
    if (clean.length === 0) return;

    const storySlug = this.sanitizeFilename(storyName);
    const dir = path.join(this.baseDir, storySlug, "structure");
    await this.ensureDir(dir);
    const filePath = path.join(dir, "world-bible.md");

    let content = "";
    try {
      content = await fs.promises.readFile(filePath, "utf8");
    } catch {
      content = "";
    }

    const HEADING =
      "## ESTABLISHED CONTINUITY (filled in as the story is written)";
    if (!content.includes(HEADING)) {
      content = `${content.trim()}\n\n---\n\n${HEADING}\n\n_Global facts the prose has established, recorded for continuity. New scenes must stay consistent with these; update them as the story evolves._\n`;
    }

    // Skip facts already recorded verbatim so the ledger doesn't bloat on repeats.
    const lines = clean
      .filter((f) => !content.includes(f))
      .map((f) => `- [${sceneId}] ${f}`);
    if (lines.length === 0) return;

    content = `${content.trimEnd()}\n${lines.join("\n")}\n`;
    await fs.promises.writeFile(filePath, content, "utf8");
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

  /** Character display names derived from the profile filenames in the story. */
  async listCharacterNames(storyName: string): Promise<string[]> {
    const storySlug = this.sanitizeFilename(storyName);
    const dir = path.join(this.baseDir, storySlug, "characters");
    try {
      const files = await fs.promises.readdir(dir);
      return files
        .filter((f) => f.endsWith(".md"))
        .sort()
        .map((f) =>
          f
            .replace(/\.md$/, "")
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase()),
        );
    } catch {
      return [];
    }
  }

  /** Full markdown of all character profiles, concatenated (for read_story). */
  async readAllCharacterProfiles(storyName: string): Promise<string | null> {
    const storySlug = this.sanitizeFilename(storyName);
    const dir = path.join(this.baseDir, storySlug, "characters");
    try {
      const files = (await fs.promises.readdir(dir))
        .filter((f) => f.endsWith(".md"))
        .sort();
      if (files.length === 0) return null;
      const parts: string[] = [];
      for (const f of files) {
        parts.push(await fs.promises.readFile(path.join(dir, f), "utf8"));
      }
      return parts.join("\n\n---\n\n");
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

  /** Persist the Director's per-scene performance notes (the INTENT), so the
   *  StoryScope Actors' Table can later judge achieved-vs-intended. */
  async saveDirectorNotes(
    storyName: string,
    sceneId: string,
    notes: string,
    version: string = "v1",
  ): Promise<string> {
    const storySlug = this.sanitizeFilename(storyName);
    const dir = path.join(this.baseDir, storySlug, "direction", version);
    await this.ensureDir(dir);
    const filePath = path.join(dir, `${this.sanitizeFilename(sceneId)}.md`);
    await fs.promises.writeFile(filePath, notes || "", "utf8");
    return filePath;
  }

  /** All Director notes for a version, in scene order. */
  async readAllDirectorNotes(
    storyName: string,
    version: string = "v1",
  ): Promise<string> {
    const storySlug = this.sanitizeFilename(storyName);
    const dir = path.join(this.baseDir, storySlug, "direction", version);
    try {
      const files = (await fs.promises.readdir(dir))
        .filter((f) => f.endsWith(".md"))
        .sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
        );
      let out = "";
      for (const f of files) {
        const content = await fs.promises.readFile(path.join(dir, f), "utf8");
        out += `\n\n### ${f.replace(/\.md$/, "")}\n${content}`;
      }
      return out.trim();
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

  /**
   * Directory a StoryScope review lives in. Reviews are now scoped per draft
   * version (storyscope-reports/<version>/) so reviewing v2 never overwrites
   * v1's review. Legacy reviews written before this change live flat in
   * storyscope-reports/ and are treated as the v1 review (see resolveReportsDir).
   */
  private storyscopeDir(storySlug: string, version?: string): string {
    const root = path.join(this.baseDir, storySlug, "storyscope-reports");
    return version ? path.join(root, version) : root;
  }

  /**
   * Pick the directory to READ a version's review from: the versioned folder if
   * it exists; otherwise, for v1 only, fall back to the legacy flat folder so
   * pre-existing reviews remain visible. Returns null when nothing exists.
   */
  private resolveReportsDir(storySlug: string, version?: string): string | null {
    const root = path.join(this.baseDir, storySlug, "storyscope-reports");
    if (version) {
      const versioned = path.join(root, version);
      if (fs.existsSync(versioned)) return versioned;
      // Legacy flat reviews predate versioning → treat them as the v1 review.
      if (version === "v1" && fs.existsSync(root)) {
        // Only if the flat folder actually holds report files (not just the
        // version subfolders created later).
        const hasFlat = fs
          .readdirSync(root)
          .some((f) => f.endsWith(".md"));
        if (hasFlat) return root;
      }
      return fs.existsSync(versioned) ? versioned : null;
    }
    return fs.existsSync(root) ? root : null;
  }

  async saveStoryscopeReport(
    storyName: string,
    aspectName: string,
    content: string,
    version?: string,
  ): Promise<string> {
    const storySlug = this.sanitizeFilename(storyName);
    const aspectSlug = this.sanitizeFilename(aspectName);
    const dir = this.storyscopeDir(storySlug, version);
    await this.ensureDir(dir);

    const filePath = path.join(dir, `${aspectSlug}.md`);
    await fs.promises.writeFile(filePath, content, "utf8");
    return filePath;
  }

  async saveStoryscopeExecutiveSummary(
    storyName: string,
    content: string,
    version?: string,
  ): Promise<string> {
    const storySlug = this.sanitizeFilename(storyName);
    const dir = this.storyscopeDir(storySlug, version);
    await this.ensureDir(dir);

    const filePath = path.join(dir, "executive-summary.md");
    await fs.promises.writeFile(filePath, content, "utf8");
    return filePath;
  }

  /** All specialist lens reports (everything except the executive summary). */
  async readAllStoryscopeReports(
    storyName: string,
    version?: string,
  ): Promise<{ aspect: string; content: string }[]> {
    const storySlug = this.sanitizeFilename(storyName);
    const dir = this.resolveReportsDir(storySlug, version);
    if (!dir) return [];
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
    version?: string,
  ): Promise<string | null> {
    const storySlug = this.sanitizeFilename(storyName);
    const dir = this.resolveReportsDir(storySlug, version);
    if (!dir) return null;
    try {
      return await fs.promises.readFile(
        path.join(dir, "executive-summary.md"),
        "utf8",
      );
    } catch {
      return null;
    }
  }

  /**
   * Snapshot a canon planning document (World Bible / Architecture Brief)
   * before it is overwritten by canon reconciliation, so a bad AI rewrite is
   * always recoverable. Never overwrites — each backup gets its own timestamp.
   */
  async backupCanonDoc(
    storyName: string,
    docName: string,
    content: string,
  ): Promise<string> {
    const storySlug = this.sanitizeFilename(storyName);
    const dir = path.join(this.baseDir, storySlug, "structure", "canon-backups");
    await this.ensureDir(dir);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(dir, `${docName}.${stamp}.md`);
    await fs.promises.writeFile(filePath, content, "utf8");
    return filePath;
  }

  /**
   * Append one entry to the StoryScope changelog for a version — a persistent,
   * human-readable record of what apply_storyscope_revisions / the canon
   * reconciler actually did, since the tool responses themselves are ephemeral.
   */
  async appendStoryscopeChangelog(
    storyName: string,
    version: string | undefined,
    entryMarkdown: string,
  ): Promise<string> {
    const storySlug = this.sanitizeFilename(storyName);
    const dir = this.storyscopeDir(storySlug, version);
    await this.ensureDir(dir);
    const filePath = path.join(dir, "changelog.md");
    let existing = "";
    try {
      existing = await fs.promises.readFile(filePath, "utf8");
    } catch {
      existing = "# StoryScope Changelog\n";
    }
    const content = `${existing.trimEnd()}\n\n${entryMarkdown.trim()}\n`;
    await fs.promises.writeFile(filePath, content, "utf8");
    return filePath;
  }
}

export const workspaceExporter = new WorkspaceExporter();
