import { AIRouter } from '../ai/router.js';
import { DiagnosticResult, DiagnosticProfile, Pathology, AgencyResult } from '../types/narrative.js';
import { ENV } from '../config.js';

export class DiagnosticLoop {
  constructor(private aiRouter: AIRouter) {}

  async run(text: string, maxIterations: number): Promise<{ finalText: string; history: DiagnosticResult[] }> {
    let currentText = text;
    const history: DiagnosticResult[] = [];

    for (let i = 0; i < maxIterations; i++) {
      const result = await this.scoreText(currentText);
      history.push(result);

      if (result.pass) {
        break;
      }

      currentText = await this.rewriteText(currentText, result.rewriteDirectives);
    }

    return { finalText: currentText, history };
  }

  private async scoreText(text: string): Promise<DiagnosticResult> {
    const systemPrompt = "Analyze the provided narrative text and output JSON with cortisol, oxytocin, and dopamine scores (1-10), profile, pathologies, agencyCheck, pass, and rewriteDirectives.";
    const response = await this.aiRouter.generateCompletion({
      taskType: 'diagnostic',
      systemPrompt,
      userMessage: text,
      temperature: 0.2
    });
    
    try {
      const cleanJson = response.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson);
    } catch (e) {
      throw new Error("Failed to parse diagnostic JSON output from AI.");
    }
  }

  private async rewriteText(text: string, directives: string[]): Promise<string> {
    const systemPrompt = `Rewrite the following text applying these directives:\n- ${directives.join('\n- ')}`;
    const response = await this.aiRouter.generateCompletion({
      taskType: 'generation',
      systemPrompt,
      userMessage: text,
      temperature: 0.8
    });
    return response;
  }
}
