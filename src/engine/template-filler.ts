import fs from 'node:fs/promises';
import path from 'node:path';

export class TemplateFiller {
  private skillDir = path.resolve(process.cwd(), 'skill', 'templates');

  async loadTemplate(filename: string): Promise<string> {
    const filePath = path.join(this.skillDir, filename);
    return await fs.readFile(filePath, 'utf-8');
  }

  fillTemplate(templateContent: string, data: Record<string, any>): string {
    let filled = templateContent;
    for (const [key, value] of Object.entries(data)) {
      const regex = new RegExp(`\\[${key}\\]`, 'g');
      filled = filled.replace(regex, String(value));
    }
    return filled;
  }
}

export const templateFiller = new TemplateFiller();
