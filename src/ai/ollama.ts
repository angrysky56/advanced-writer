import { ENV } from "../config.js";

export class OllamaClient {
  private baseUrl = ENV.OLLAMA_BASE_URL;

  async generateCompletion(
    model: string,
    systemPrompt: string,
    userMessage: string,
    temperature = 0.8,
  ) {
    const timeoutMs = ENV.AI_REQUEST_TIMEOUT_MS;
    const maxAttempts = Math.max(1, (ENV.AI_MAX_RETRIES ?? 2) + 1);
    let lastErr: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
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
            options: { temperature },
          }),
          // Bound the wait so a stuck local model never hangs the run forever.
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok) {
          throw new Error(`Ollama API error: ${response.statusText}`);
        }
        const data = await response.json();
        return data.message.content;
      } catch (e: any) {
        const isTimeout =
          e?.name === "TimeoutError" || e?.name === "AbortError";
        const reason = isTimeout
          ? `request timed out after ${timeoutMs}ms`
          : e?.message || String(e);
        lastErr = e instanceof Error ? e : new Error(reason);
        if (attempt === maxAttempts) {
          throw new Error(
            `Ollama call failed after ${maxAttempts} attempt(s): ${reason}`,
          );
        }
        console.error(
          `[ollama] attempt ${attempt}/${maxAttempts} failed (${reason}); retrying...`,
        );
        await new Promise((r) =>
          setTimeout(r, Math.min(15000, 1000 * 2 ** (attempt - 1))),
        );
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("Ollama failed");
  }
}

export const ollamaClient = new OllamaClient();
