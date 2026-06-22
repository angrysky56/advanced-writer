import { ENV } from "../config.js";
import { ollamaClient } from "./ollama.js";
import { openRouterClient } from "./openrouter.js";
import { TaskType } from "../types/workflow.js";

interface CompletionRequest {
  taskType: TaskType;
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
}

export class AIRouter {
  private overrides: Partial<Record<TaskType, string>> = {};

  setOverrides(overrides: Partial<Record<TaskType, string>>) {
    this.overrides = { ...this.overrides, ...overrides };
  }

  private getConfigForTask(taskType: TaskType): {
    provider: string;
    model: string;
  } {
    let modelString = this.overrides[taskType] || "";

    if (!modelString) {
      switch (taskType) {
        case "generation":
          modelString = ENV.MODEL_GENERATION;
          break;
        case "diagnostic":
          modelString = ENV.MODEL_DIAGNOSTIC;
          break;
        case "brainstorm":
          modelString = ENV.MODEL_BRAINSTORM;
          break;
        default:
          throw new Error(`Unknown task type: ${taskType}`);
      }
    }

    const parts = modelString.split("/");
    const provider = parts[0];
    const model = parts.slice(1).join("/");

    return { provider, model };
  }

  async generateCompletion(request: CompletionRequest): Promise<string> {
    const { provider, model } = this.getConfigForTask(request.taskType);
    const temperature = request.temperature ?? 0.8;

    if (provider === "ollama") {
      return ollamaClient.generateCompletion(
        model,
        request.systemPrompt,
        request.userMessage,
        temperature,
      );
    } else if (provider === "openrouter") {
      return openRouterClient.generateCompletion(
        model,
        request.systemPrompt,
        request.userMessage,
        temperature,
      );
    } else {
      throw new Error(`Unsupported AI provider: ${provider}`);
    }
  }

}

export const aiRouter = new AIRouter();
