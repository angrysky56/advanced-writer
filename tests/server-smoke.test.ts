import { describe, it, expect } from 'vitest';
import { server } from '../src/server.js';
import { ALL_TOOLS } from '../src/tools/index.js';

describe('MCP Server Smoke Test', () => {
  it('should import the server successfully', () => {
    expect(server).toBeDefined();
  });

  it('should have all tools registered in the ALL_TOOLS array', () => {
    expect(ALL_TOOLS).toBeDefined();
    expect(Array.isArray(ALL_TOOLS)).toBe(true);
    expect(ALL_TOOLS.length).toBeGreaterThan(0);

    const toolNames = ALL_TOOLS.map((t) => t.name);
    expect(toolNames).toContain('create_narrative');
    expect(toolNames).toContain('develop_character');
    expect(toolNames).toContain('continue_narrative');
    expect(toolNames).toContain('find_replace');
  });
});
