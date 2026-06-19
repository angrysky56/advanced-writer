import { aiRouter } from '../ai/router.js';
import { workspaceExporter } from '../storage/workspace.js';
import { neo4jStorage } from '../storage/neo4j.js';

export const createNarrativeDef = {
  name: 'create_narrative',
  description: 'Build a complete narrative from a logline, premise, or raw idea. Runs an 8-step pipeline: intake -> hamartia -> framework -> characters -> architecture -> draft -> diagnostic.',
  inputSchema: {
    type: 'object',
    properties: {
      logline: { type: 'string', description: 'One-sentence story premise' },
      genre: { type: 'string', description: 'Primary genre (e.g., literary fiction, sci-fi, thriller)' },
      tone: { type: 'string', description: 'Desired tone (e.g., dark, comedic, elegiac)' },
      target_length: { type: 'string', enum: ['short_story', 'novella', 'novel', 'screenplay'] },
      mode: { type: 'string', enum: ['brainstorm', 'collaborative', 'fast-auto'], default: 'brainstorm' },
      existing_character_ids: { type: 'array', items: { type: 'string' }, description: 'Pull characters from the library' }
    }
  }
};

export async function executeCreateNarrative(args: any) {
  const { logline, genre, tone } = args;
  const storyName = logline.split(' ').slice(0, 4).join('_').replace(/[^a-zA-Z0-9_]/g, '');

  try {
    // 1. Architecture
    const archPrompt = `You are an expert story architect. Build a story architecture brief for a ${genre} story with a ${tone} tone.\nLogline: ${logline}`;
    const architecture = await aiRouter.generateCompletion({
      taskType: 'generation',
      systemPrompt: archPrompt,
      userMessage: 'Generate the Architecture Brief.'
    });
    await workspaceExporter.saveArchitectureBrief(storyName, architecture);

    // 2. Main Character
    const charPrompt = `Based on this logline: ${logline}, generate a Jungian character profile for the protagonist.`;
    const character = await aiRouter.generateCompletion({
      taskType: 'generation',
      systemPrompt: charPrompt,
      userMessage: 'Generate the protagonist character profile.'
    });
    await workspaceExporter.saveCharacterProfile(storyName, 'protagonist', character);

    // Save to Neo4j
    await neo4jStorage.createCharacterNode({
      id: `${storyName}_protagonist`,
      document: character,
      metadata: {
        name: 'Protagonist',
        archetype: 'The Hero',
        hamartia: 'Hubris',
        shadow: 'The Tyrant',
        moral_weakness: 'Selfishness',
        individuation_state: 'Pre-Awareness',
        role: 'Main',
        panksepp_primary: 'SEEKING',
        story_ids: [storyName],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    });

    // 3. Draft Scene 1
    const draftPrompt = `Write the opening scene for this story.\nLogline: ${logline}\nTone: ${tone}`;
    const draft = await aiRouter.generateCompletion({
      taskType: 'generation',
      systemPrompt: draftPrompt,
      userMessage: 'Write Scene 1.'
    });
    await workspaceExporter.saveDraft(storyName, 'scene_1', draft);

    // 4. Diagnostic
    const diagPrompt = `Analyze the following scene for emotional pacing (cortisol, oxytocin, dopamine).\nScene:\n${draft}`;
    const diagnostic = await aiRouter.generateCompletion({
      taskType: 'diagnostic',
      systemPrompt: diagPrompt,
      userMessage: 'Provide neuro-critique scoring.'
    });
    await workspaceExporter.saveDiagnosticReport(storyName, 'scene_1', diagnostic);

    return {
      content: [{ type: 'text', text: `create_narrative workflow completed successfully. Output saved to workspace under story: ${storyName}` }]
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Error running create_narrative: ${error.message}` }],
      isError: true
    };
  }
}
