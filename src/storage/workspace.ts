import fs from 'fs';
import path from 'path';
import { ENV } from '../config.js';

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
    return name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  }

  async saveCharacterProfile(storyName: string, characterName: string, content: string): Promise<string> {
    const storySlug = this.sanitizeFilename(storyName);
    const charSlug = this.sanitizeFilename(characterName);
    const dir = path.join(this.baseDir, storySlug, 'characters');
    await this.ensureDir(dir);
    
    const filePath = path.join(dir, `${charSlug}.md`);
    await fs.promises.writeFile(filePath, content, 'utf8');
    return filePath;
  }

  async saveArchitectureBrief(storyName: string, content: string): Promise<string> {
    const storySlug = this.sanitizeFilename(storyName);
    const dir = path.join(this.baseDir, storySlug, 'structure');
    await this.ensureDir(dir);
    
    const filePath = path.join(dir, 'story-architecture-brief.md');
    await fs.promises.writeFile(filePath, content, 'utf8');
    return filePath;
  }

  async saveDiagnosticReport(storyName: string, sceneId: string, content: string): Promise<string> {
    const storySlug = this.sanitizeFilename(storyName);
    const sceneSlug = this.sanitizeFilename(sceneId);
    const dir = path.join(this.baseDir, storySlug, 'diagnostics');
    await this.ensureDir(dir);
    
    const filePath = path.join(dir, `neuro-critique-${sceneSlug}.md`);
    await fs.promises.writeFile(filePath, content, 'utf8');
    return filePath;
  }

  async saveDraft(storyName: string, sceneId: string, content: string): Promise<string> {
    const storySlug = this.sanitizeFilename(storyName);
    const sceneSlug = this.sanitizeFilename(sceneId);
    const dir = path.join(this.baseDir, storySlug, 'drafts');
    await this.ensureDir(dir);
    
    const filePath = path.join(dir, `${sceneSlug}.md`);
    await fs.promises.writeFile(filePath, content, 'utf8');
    return filePath;
  }
}

export const workspaceExporter = new WorkspaceExporter();
