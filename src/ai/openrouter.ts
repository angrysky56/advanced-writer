import { ENV } from '../config.js';

export class OpenRouterClient {
  private apiKey = ENV.OPENROUTER_API_KEY;

  async generateCompletion(model: string, systemPrompt: string, userMessage: string, temperature = 0.8) {
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY is not set');
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3100', // Required by OpenRouter
        'X-Title': 'Advanced Writer MCP', // Required by OpenRouter
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }
}

export const openRouterClient = new OpenRouterClient();
