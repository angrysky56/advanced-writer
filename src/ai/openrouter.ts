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

    const timeoutMs = ENV.AI_REQUEST_TIMEOUT_MS;
    const maxAttempts = Math.max(1, (ENV.AI_MAX_RETRIES ?? 2) + 1);
    let lastErr: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Hard per-attempt timeout: a model that never finishes streaming must
        // not hang the whole run. AbortSignal.timeout fires after timeoutMs.
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
            signal: AbortSignal.timeout(timeoutMs),
          },
        );

        if (!response.ok) {
          let body = "";
          try {
            body = await response.text();
          } catch {
            /* ignore */
          }
          // 4xx (except 429) are permanent — bad model slug, auth, bad request.
          // Don't waste retries on them; fail fast with the real error body.
          const permanent =
            response.status >= 400 &&
            response.status < 500 &&
            response.status !== 429;
          const err = new Error(
            `OpenRouter API error ${response.status} ${response.statusText}${body ? `: ${body.slice(0, 800)}` : ""}`,
          );
          if (permanent || attempt === maxAttempts) throw err;
          lastErr = err;
          await this.backoff(attempt);
          continue; // retry transient (429 / 5xx)
        }

        const data = await response.json();
        const message = data?.choices?.[0]?.message;
        // Some reasoning models return content in `reasoning` with null `content`.
        const content = message?.content ?? message?.reasoning ?? "";
        if (!content) {
          const err = new Error(
            `OpenRouter returned no content: ${JSON.stringify(data).slice(0, 800)}`,
          );
          if (attempt === maxAttempts) throw err;
          lastErr = err;
          await this.backoff(attempt);
          continue; // empty body is often transient — retry
        }
        return content;
      } catch (e: any) {
        // Network error, or our AbortSignal.timeout fired (hang). Retry.
        const isTimeout = e?.name === "TimeoutError" || e?.name === "AbortError";
        const reason = isTimeout
          ? `request timed out after ${timeoutMs}ms`
          : e?.message || String(e);
        lastErr = e instanceof Error ? e : new Error(reason);
        if (attempt === maxAttempts) {
          throw new Error(
            `OpenRouter call failed after ${maxAttempts} attempt(s): ${reason}`,
          );
        }
        console.error(
          `[openrouter] attempt ${attempt}/${maxAttempts} failed (${reason}); retrying...`,
        );
        await this.backoff(attempt);
      }
    }
    // Unreachable, but satisfies the type checker.
    throw lastErr instanceof Error ? lastErr : new Error("OpenRouter failed");
  }

  /** Exponential backoff with jitter between retry attempts. */
  private async backoff(attempt: number) {
    const ms = Math.min(15000, 1000 * 2 ** (attempt - 1)) + Math.random() * 500;
    await new Promise((r) => setTimeout(r, ms));
  }
}

export const openRouterClient = new OpenRouterClient();
