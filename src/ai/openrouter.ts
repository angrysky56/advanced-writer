import { ENV } from "../config.js";

export class OpenRouterClient {
  private apiKey = ENV.OPENROUTER_API_KEY;

  async generateCompletion(
    model: string,
    systemPrompt: string,
    userMessage: string,
    temperature = 0.8,
  ) {
    if (!this.apiKey) {
      throw new Error("OPENROUTER_API_KEY is not set");
    }

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3100", // Required by OpenRouter
          "X-Title": "Advanced Writer MCP", // Required by OpenRouter
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          temperature,
        }),
      },
    );

    if (!response.ok) {
      // Surface the response body — it usually contains the real error
      // (bad model slug, rate limit, etc.), which statusText alone hides.
      let body = "";
      try {
        body = await response.text();
      } catch {
        /* ignore */
      }
      throw new Error(
        `OpenRouter API error ${response.status} ${response.statusText}${body ? `: ${body.slice(0, 800)}` : ""}`,
      );
    }

    const data = await response.json();
    const message = data?.choices?.[0]?.message;
    // Some reasoning models return content in `reasoning` with null `content`.
    const content = message?.content ?? message?.reasoning ?? "";
    if (!content) {
      throw new Error(
        `OpenRouter returned no content: ${JSON.stringify(data).slice(0, 800)}`,
      );
    }
    return content;
  }
}

export const openRouterClient = new OpenRouterClient();
