import { aiRouter } from '../ai/router.js';
import { workspaceExporter } from '../storage/workspace.js';
import { neo4jStorage } from '../storage/neo4j.js';

export const developCharacterDef = {
  name: 'develop_character',
  description: 'Create, update, query, or shadow-match characters in the persistent Archetypal Database.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['create', 'update', 'get', 'list', 'shadow_match', 'cross_pollinate'] },
      character_id: { type: 'string', description: 'For update/get/shadow_match' },
      name: { type: 'string', description: 'For create' },
      archetype: { type: 'string', description: 'For create — one of 12 Jungian archetypes' },
      story_name: { type: 'string', description: 'Story to associate this character with' },
      mode: { type: 'string', enum: ['brainstorm', 'collaborative', 'fast-auto'], default: 'brainstorm' }
    },
    required: ['action']
  }
};

export async function executeDevelopCharacter(args: any) {
  const { action, name, archetype, story_name = 'default_story' } = args;

  try {
    if (action === 'create') {
      const charPrompt = `You are a character psychology expert. Generate a deeply flawed Jungian character profile for a character named ${name} with the ${archetype} archetype.`;
      
      const characterDoc = await aiRouter.generateCompletion({
        taskType: 'generation',
        systemPrompt: charPrompt,
        userMessage: 'Generate the character profile.'
      });

      await workspaceExporter.saveCharacterProfile(story_name, name || 'unknown', characterDoc);

      const characterId = `${story_name}_${(name || 'unknown').replace(/\\s+/g, '_').toLowerCase()}`;
      await neo4jStorage.createCharacterNode({
        id: characterId,
        document: characterDoc,
        metadata: {
          name: name || 'Unknown',
          archetype: archetype || 'Unknown',
          hamartia: 'TBD',
          shadow: 'TBD',
          moral_weakness: 'TBD',
          individuation_state: 'Pre-Awareness',
          role: 'TBD',
          panksepp_primary: 'SEEKING',
          story_ids: [story_name],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      });

      return {
        content: [{ type: 'text', text: `Character ${name} created successfully and saved to ${story_name} workspace.` }]
      };
    }

    return {
      content: [{ type: 'text', text: `Action ${action} is not yet fully implemented for develop_character. Only 'create' is supported.` }]
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Error running develop_character: ${error.message}` }],
      isError: true
    };
  }
}
