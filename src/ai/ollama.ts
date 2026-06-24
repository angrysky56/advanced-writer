import { ENV } from "../config.js";

export class OllamaClient {
  private baseUrl = ENV.OLLAMA_BASE_URL;

  async generateCompletion(
    model: string,
    systemPrompt: string,
    userMessage: string,
    temperature = 0.8,
  ) {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        stream: false,
        options: {
          temperature,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.message.content;
  }

  async getEmbeddings(model: string, inputs: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: inputs,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama Embedding API error: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.embeddings) {
      throw new Error(`Ollama response did not contain embeddings`);
    }
    return data.embeddings;
  }
}

export const ollamaClient = new OllamaClient();
