import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ALL_TOOLS, executeTool } from './tools/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';

export const server = new Server(
  {
    name: 'advanced-writer-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

const SKILL_DIR = path.resolve(process.cwd(), 'skill');
const REFERENCES_DIR = path.join(SKILL_DIR, 'references');

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: ALL_TOOLS,
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    return await executeTool(request.params.name, request.params.arguments);
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  try {
    const files = await fs.readdir(REFERENCES_DIR);
    const mdFiles = files.filter(f => f.endsWith('.md'));
    
    return {
      resources: mdFiles.map(file => ({
        uri: `advanced-writer://reference/${file}`,
        name: file,
        mimeType: 'text/markdown',
        description: `Reference file: ${file}`
      }))
    };
  } catch (error) {
    return { resources: [] };
  }
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  if (!uri.startsWith('advanced-writer://reference/')) {
    throw new Error(`Invalid resource URI: ${uri}`);
  }
  
  const filename = uri.replace('advanced-writer://reference/', '');
  const filePath = path.join(REFERENCES_DIR, filename);
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return {
      contents: [{
        uri,
        mimeType: 'text/markdown',
        text: content
      }]
    };
  } catch (error) {
    throw new Error(`Resource not found: ${uri}`);
  }
});

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [{
      name: 'advanced_writer_intake',
      description: 'The intake question from the Advanced Writer SKILL.md',
    }]
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name === 'advanced_writer_intake') {
    try {
      const skillMd = await fs.readFile(path.join(SKILL_DIR, 'SKILL.md'), 'utf-8');
      return {
        description: 'Advanced Writer Intake Prompt',
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: skillMd
          }
        }]
      };
    } catch (error) {
      throw new Error('Failed to load SKILL.md');
    }
  }
  throw new Error(`Prompt not found: ${request.params.name}`);
});
