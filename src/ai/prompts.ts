import { WorkflowMode } from '../types/workflow.js';

export interface PromptAssemblyInput {
  workflow: string;
  currentStep: number;
  mode: WorkflowMode;
  characterContext?: string;
  storyContext?: string;
  userInput: string;
  referencesContext: string;
  templateContext?: string;
}

export function assembleSystemPrompt(input: PromptAssemblyInput): string {
  let prompt = `You are the Advanced Writer AI, operating in ${input.mode} mode for the workflow: ${input.workflow} (Step ${input.currentStep}).\n\n`;
  
  if (input.referencesContext) {
    prompt += `### Reference Material\n${input.referencesContext}\n\n`;
  }

  if (input.characterContext) {
    prompt += `### Character Context\n${input.characterContext}\n\n`;
  }

  if (input.storyContext) {
    prompt += `### Story Context\n${input.storyContext}\n\n`;
  }

  if (input.templateContext) {
    prompt += `### Required Output Template\nYou must output your result matching this template exactly:\n${input.templateContext}\n\n`;
  }

  return prompt;
}
