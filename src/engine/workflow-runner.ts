import { WorkflowState, WorkflowStep, WorkflowMode } from '../types/workflow.js';
import { referenceLoader } from './reference-loader.js';
import { templateFiller } from './template-filler.js';
import { aiRouter } from '../ai/router.js';
import { assembleSystemPrompt } from '../ai/prompts.js';

export class WorkflowRunner {
  async executeStep(state: WorkflowState, step: WorkflowStep, userInput: string) {
    if (step.hooks?.before) {
      await step.hooks.before(state, null); // stub for storage
    }

    const referencesContext = await referenceLoader.loadMultiple(step.requiredReferences);
    const templateContext = step.template ? await templateFiller.loadTemplate(step.template) : undefined;
    
    const systemPrompt = assembleSystemPrompt({
      workflow: state.workflow,
      currentStep: state.currentStep,
      mode: state.mode,
      userInput,
      referencesContext,
      templateContext
    });

    const aiResponse = await aiRouter.generateCompletion({
      taskType: step.taskType,
      systemPrompt,
      userMessage: userInput
    });

    if (step.hooks?.after) {
      state.context.set('aiResponse', aiResponse);
      await step.hooks.after(state, null);
    }

    return aiResponse;
  }
}

export const workflowRunner = new WorkflowRunner();
