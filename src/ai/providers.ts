import { ENV } from "../config.js";

/**
 * Single source of truth for every OpenAI-compatible provider this app talks
 * to. Both the MCP tools' one-shot completion client (src/ai/router.ts +
 * openai-compat-client.ts) and the Studio's streaming chat route
 * (app/api/chat/route.ts, via the Vercel AI SDK) read from this registry.
 *
 * Before this file existed, each of those two call sites hand-wrote its own
 * "if (provider === 'openrouter') ... else if 'ollama' ... " chain. Adding
 * Refiant meant updating both — and only one got updated, which is exactly
 * how the two lists drifted out of sync. Add a provider ONCE, here, and it's
 * available in both places.
 *
 * Anthropic and native OpenAI are deliberately NOT in this registry — they
 * use a genuinely different SDK shape (Anthropic's own client; native OpenAI
 * needs no baseURL override), not just a different baseURL/key pair, so they
 * stay special-cased in app/api/chat/route.ts.
 */
export interface OpenAICompatProvider {
  name: string;
  /** Chat-completions base URL, e.g. ".../v1" (no trailing "/chat/completions"). */
  baseURL: string;
  /** Resolved API key value, if this provider requires one. */
  apiKey?: string;
  /** Env var name the key comes from — used only for error messages. */
  apiKeyEnvVar?: string;
  /** Extra headers some providers require (e.g. OpenRouter attribution). */
  extraHeaders?: Record<string, string>;
}

export const OPENAI_COMPAT_PROVIDERS: Record<string, OpenAICompatProvider> = {
  openrouter: {
    name: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: ENV.OPENROUTER_API_KEY,
    apiKeyEnvVar: "OPENROUTER_API_KEY",
    extraHeaders: {
      "HTTP-Referer": "http://localhost:3100", // Required by OpenRouter
      "X-Title": "Advanced Writer",
    },
  },
  refiant: {
    name: "refiant",
    baseURL: ENV.REFIANT_BASE_URL,
    apiKey: ENV.REFIANT_API_KEY,
    apiKeyEnvVar: "REFIANT_API_KEY",
  },
  ollama: {
    name: "ollama",
    // Ollama's OpenAI-compatibility layer lives under /v1. The MCP tools'
    // one-shot client (ollama.ts) uses Ollama's own native /api/chat instead
    // (different request/response shape, no key) — this entry exists so the
    // Studio chat route (which goes through the Vercel AI SDK's OpenAI
    // wrapper for every local/remote model uniformly) has one place to read
    // the base URL from too.
    baseURL: `${ENV.OLLAMA_BASE_URL}/v1`,
    apiKey: "ollama", // dummy value; Ollama's /v1 layer ignores it but the SDK requires a non-empty string
  },
};
