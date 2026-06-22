import { NextResponse } from "next/server";
import { ENV } from "../../../src/config";

export async function GET() {
  const openrouterModels: { id: string; name: string }[] = [];
  const ollamaModels: { id: string; name: string }[] = [];

  // 1. Fetch OpenRouter models
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    
    const headers: Record<string, string> = {};
    if (ENV.OPENROUTER_API_KEY) {
      headers["Authorization"] = `Bearer ${ENV.OPENROUTER_API_KEY}`;
    }

    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.data)) {
        data.data.forEach((m: any) => {
          openrouterModels.push({
            id: `openrouter/${m.id}`,
            name: m.name || m.id,
          });
        });
      }
    }
  } catch (err) {
    console.warn("Failed to fetch models from OpenRouter:", err);
  }

  // Fallback OpenRouter models if fetch failed or returned empty
  if (openrouterModels.length === 0) {
    openrouterModels.push(
      { id: "openrouter/deepseek/deepseek-v4-pro", name: "DeepSeek v4 Pro" },
      { id: "openrouter/deepseek/deepseek-v4-flash", name: "DeepSeek v4 Flash" },
      { id: "openrouter/anthropic/claude-3.7-sonnet", name: "Claude 3.7 Sonnet" },
      { id: "openrouter/anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
      { id: "openrouter/google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "openrouter/google/gemini-2.5-flash", name: "Gemini 2.5 Flash" }
    );
  }

  // 2. Fetch Ollama models
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const baseUrl = ENV.OLLAMA_BASE_URL || "http://localhost:11434";
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.models)) {
        data.models.forEach((m: any) => {
          ollamaModels.push({
            id: `ollama/${m.name}`,
            name: m.name,
          });
        });
      }
    }
  } catch (err) {
    console.warn("Failed to fetch models from Ollama:", err);
  }

  // Add default env models to lists if not present, to ensure they're selectable
  const ensurePresent = (modelStr: string) => {
    if (!modelStr) return;
    const parts = modelStr.split("/");
    const provider = parts[0];
    const rest = parts.slice(1).join("/");
    if (provider === "openrouter") {
      if (!openrouterModels.some(m => m.id === modelStr)) {
        openrouterModels.unshift({ id: modelStr, name: `${rest} (Env Default)` });
      }
    } else if (provider === "ollama") {
      if (!ollamaModels.some(m => m.id === modelStr)) {
        ollamaModels.unshift({ id: modelStr, name: `${rest} (Env Default)` });
      }
    }
  };

  ensurePresent(ENV.MODEL_GENERATION);
  ensurePresent(ENV.MODEL_DIAGNOSTIC);
  ensurePresent(ENV.MODEL_BRAINSTORM);
  ensurePresent(ENV.MODEL_EMBEDDING);

  return NextResponse.json({
    openrouter: openrouterModels,
    ollama: ollamaModels,
    defaults: {
      generation: ENV.MODEL_GENERATION,
      diagnostic: ENV.MODEL_DIAGNOSTIC,
      brainstorm: ENV.MODEL_BRAINSTORM,
      embedding: ENV.MODEL_EMBEDDING,
    },
  });
}
