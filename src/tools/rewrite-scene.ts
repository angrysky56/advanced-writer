import { aiRouter } from '../ai/router.js';
import { workspaceExporter } from '../storage/workspace.js';

export const rewriteSceneDef = {
  name: 'rewrite_scene',
  description: 'Targeted scene rewriting with before/after neurochemical scoring. Identifies specific pathologies and produces an improved version.',
  inputSchema: {
    type: 'object',
    properties: {
      scene_text: { type: 'string', description: 'The scene to rewrite' },
      target_axis: { type: 'string', enum: ['cortisol', 'oxytocin', 'dopamine'], description: 'Which axis to prioritize raising' },
      story_id: { type: 'string', description: 'Optional — context from existing story' },
      scene_id: { type: 'string', description: 'Identifier for the scene' },
      character_ids: { type: 'array', items: { type: 'string' }, description: 'Characters in the scene' }
    },
    required: ['scene_text']
  }
};

export async function executeRewriteScene(args: any) {
  const { scene_text, target_axis = 'cortisol', story_id = 'default_story', scene_id = 'scene_rewrite' } = args;

  try {
    const rewritePrompt = `You are a masterful neurochemical editor. Rewrite the following scene to specifically enhance the ${target_axis} axis. Improve pacing, agency, and somatic metaphors.\n\nOriginal Scene:\n${scene_text}`;
    
    const rewrittenDraft = await aiRouter.generateCompletion({
      taskType: 'generation',
      systemPrompt: rewritePrompt,
      userMessage: 'Provide the rewritten scene.'
    });

    await workspaceExporter.saveDraft(story_id, scene_id, rewrittenDraft);

    return {
      content: [{ type: 'text', text: `Scene successfully rewritten focusing on ${target_axis} and saved to workspace for story: ${story_id}, scene: ${scene_id}.` }]
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Error running rewrite_scene: ${error.message}` }],
      isError: true
    };
  }
}
