export type WorkflowMode = 'brainstorm' | 'collaborative' | 'fast-auto';
export type TaskType = 'generation' | 'diagnostic' | 'embedding' | 'brainstorm';

export interface WorkflowState {
  workflow: string;
  currentStep: number;
  totalSteps: number;
  mode: WorkflowMode;
  context: Map<string, any>;
  storyId?: string;
  characterIds: string[];
  diagnosticHistory: any[]; // Avoid circular dep for now
}

export type StepBehavior = 'ask_questions' | 'generate_chunk_and_pause' | 'generate_and_continue';

export interface WorkflowStep {
  name: string;
  requiredReferences: string[];
  template?: string;
  taskType: TaskType;
  modeOverrides: {
    brainstorm: StepBehavior;
    collaborative: StepBehavior;
    fastAuto: StepBehavior;
  };
  storageOperations?: {
    read?: any[]; // Simplified for scaffold
    write?: any[];
  };
  hooks?: {
    before?: (state: WorkflowState, storage: any) => Promise<void>;
    after?: (state: WorkflowState, storage: any) => Promise<void>;
  };
}
