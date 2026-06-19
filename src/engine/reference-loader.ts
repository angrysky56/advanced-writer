import fs from 'node:fs/promises';
import path from 'node:path';

export class ReferenceLoader {
  private cache = new Map<string, string>();
  private skillDir = path.resolve(process.cwd(), 'skill', 'references');

  async loadReference(filename: string): Promise<string> {
    if (this.cache.has(filename)) {
      return this.cache.get(filename)!;
    }

    const filePath = path.join(this.skillDir, filename);
    const content = await fs.readFile(filePath, 'utf-8');
    this.cache.set(filename, content);
    return content;
  }

  async loadMultiple(filenames: string[]): Promise<string> {
    const contents = await Promise.all(filenames.map(f => this.loadReference(f)));
    return contents.join('\n\n---\n\n');
  }
}

export const referenceLoader = new ReferenceLoader();
