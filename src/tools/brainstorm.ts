import { aiRouter } from "../ai/router.js";
import { safeParseJson } from "../ai/extract.js";

/**
 * Idea cannon for the Brainstorm board. Generates a batch of deliberately
 * varied story concepts — a couple are meant to be a little "wrong", because an
 * off idea sparks a better one. Discussion-first: nothing is committed to a
 * story until the user says so.
 */

export interface BrainstormIdea {
  id: string;
  logline: string;
  genre: string;
  tone: string;
  hook: string;
}

export interface BrainstormOptions {
  /** Optional theme/genre/keywords/vibe to steer around. Blank = range widely. */
  seed?: string;
  /** 0 (grounded) … 100 (wildly experimental). Maps to temperature + framing. */
  wildness?: number;
  /** How many concepts to return (1–8). */
  count?: number;
  /** Existing loglines to avoid repeating (for "give me more"). */
  avoid?: string[];
}

// The dial scales AMBITION and conceptual reach — never coherence. Even the top
// end must stay resonant and earned; strangeness is a lens on meaning, not a
// gimmick. "Creativity" here means depth and originality, not absurdity.
function ambitionFraming(level: number): string {
  if (level < 25)
    return "Calibrate to GROUNDED: literary realism — ordinary lives and relationships rendered with depth and a quiet, telling tension. No speculative elements; the power is in observation and emotional truth.";
  if (level < 55)
    return "Calibrate to ELEVATED: largely grounded, each premise turning on a SINGLE clear unusual or lightly speculative element used as a lens on real emotion or society.";
  if (level < 80)
    return "Calibrate to BOLD: conceptually ambitious and strange, but every strange choice must earn its place by deepening character, theme, or feeling. Coherent and inevitable — never random.";
  return "Calibrate to VISIONARY: singular, formally daring, mythic or speculative in scope — the rare premise a cult classic is built on. Strange strictly in service of meaning; never absurd, jokey, or silly.";
}

export async function runBrainstorm(
  opts: BrainstormOptions,
): Promise<BrainstormIdea[]> {
  const count = Math.min(Math.max(Math.floor(opts.count ?? 4), 1), 8);
  const level = Math.min(Math.max(opts.wildness ?? 40, 0), 100);
  // Keep temperature moderate — high temperature buys randomness, not quality.
  const temperature = 0.7 + (level / 100) * 0.35; // 0.7 → 1.05

  const seedLine = opts.seed?.trim()
    ? `Steer them around this seed (theme / genre / keywords / vibe): "${opts.seed.trim()}". Interpret it with taste; find the real, resonant story inside it.`
    : "No seed — range widely across genres, settings, eras, and emotional registers.";

  const avoidLine =
    opts.avoid && opts.avoid.length
      ? `Do NOT repeat or closely echo these existing ideas:\n${opts.avoid
          .map((a) => `- ${a}`)
          .join("\n")}`
      : "";

  const systemPrompt = `You are a discerning developmental editor generating story concepts for a serious novelist's brainstorming board. Produce ${count} DISTINCT, genuinely good premises — the kind that could grow into a beloved or cult-classic novel — NOT gimmicks.

What makes a premise good here:
- A real emotional or philosophical engine: a human longing, fear, or question at its heart that a reader would actually feel.
- Specificity and restraint: ONE strong, fresh idea rendered concretely — not a pile of quirks or a mashup of unrelated elements.
- Originality with coherence: a familiar truth seen from a new angle, or a single speculative element used as a lens on something real. Strangeness must illuminate, never merely decorate.
- Inevitability: the premise already implies character, conflict, and stakes — you can sense the novel it wants to become.
Stories are to be logically feasable, historically, and scientifically accurate.
Science fiction and fantasy require plausible rules, focusing on the technology or mechanics is a sign of a weak story.
We are looking for willing suspension of disbelief and the human element.

Hard avoids: memory selling, tear collecting, cartographer, lighthouse, maudlin, X but also Y and Z mashups; joke, pun, or absurdist premises; quirky-for-quirkiness's-sake whimsy; cute talking objects or animals; tone-stacking adjectives ("charmingly macabre"); random profession + random fantastical object. A premise may be strange, but never silly or incoherent. Taste over novelty, always.

Give the ${count} concepts real range across genre, scale, and emotional register. ${ambitionFraming(
    level,
  )}

Each concept is ONE evocative single-sentence logline (a real sentence, not a high-concept tagline), plus a genre, a tone, and a single sharp hook that DEEPENS the premise rather than gimmicks it up.

Output ONLY JSON in exactly this shape, no prose around it:
{"ideas":[{"logline":"...","genre":"...","tone":"...","hook":"..."}]}`;

  const userMessage = [seedLine, avoidLine].filter(Boolean).join("\n\n");

  const raw = await aiRouter.generateCompletion({
    taskType: "brainstorm",
    systemPrompt,
    userMessage: userMessage || "Generate the ideas now.",
    temperature,
  });

  const parsed = safeParseJson<{ ideas?: any[] }>(raw);
  const list = Array.isArray(parsed?.ideas) ? parsed!.ideas : [];

  return list
    .slice(0, count)
    .map((x: any, i: number) => ({
      id: `idea_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      logline: String(x?.logline || "").trim(),
      genre: String(x?.genre || "").trim(),
      tone: String(x?.tone || "").trim(),
      hook: String(x?.hook || "").trim(),
    }))
    .filter((x) => x.logline);
}

/* --------------------------- MCP tool surface --------------------------- */

export const brainstormDef = {
  name: "brainstorm_ideas",
  description:
    "Generate a batch of genuinely good, distinct story concepts (logline + genre + tone + hook) for brainstorming — premises with a real emotional core and a fresh angle, the kind that could become a beloved or cult-classic novel, never gimmicks or absurdist mashups. Use when the user wants fresh story ideas, riffs on a seed, or 'more like that' — discussion only; this never starts writing a story.",
  inputSchema: {
    type: "object",
    properties: {
      seed: {
        type: "string",
        description:
          "Optional theme / genre / keywords / vibe to steer around. Omit to range widely.",
      },
      wildness: {
        type: "number",
        description:
          "Ambition: 0 (grounded literary realism) to 100 (visionary/speculative). Scales conceptual reach, NOT absurdity — even high values stay coherent and resonant. Default 40.",
      },
      count: {
        type: "number",
        description: "How many concepts (1–8). Default 4.",
      },
      avoid: {
        type: "array",
        items: { type: "string" },
        description:
          "Existing loglines to avoid repeating (for 'give me more').",
      },
    },
  },
};

export async function executeBrainstorm(args: any) {
  const ideas = await runBrainstorm({
    seed: args?.seed,
    wildness: args?.wildness,
    count: args?.count,
    avoid: args?.avoid,
  });
  if (ideas.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "Could not generate ideas this time — try again, optionally with a seed or different wildness.",
        },
      ],
      isError: true,
    };
  }
  const text = ideas
    .map(
      (x, i) =>
        `${i + 1}. ${x.logline}\n   ${[x.genre, x.tone].filter(Boolean).join(" · ")}${x.hook ? ` — ${x.hook}` : ""}`,
    )
    .join("\n\n");
  return {
    content: [{ type: "text", text }],
    structuredContent: { ideas },
  };
}
