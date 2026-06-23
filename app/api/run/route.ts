import { NextResponse } from "next/server";
import { executeTool } from "../../../src/tools/index";

// Deterministic one-click tool runner for the Studio action buttons — runs the
// tool server-side with explicit args (version-aware) instead of relying on the
// copilot to decide to call it. Whitelisted for safety.
export const maxDuration = 86400;

const ALLOWED = new Set([
  "rewrite_scene",
  "review_narrative",
  "build_world_bible",
  "develop_character",
]);

export async function POST(req: Request) {
  try {
    const { tool, args } = await req.json();
    if (!ALLOWED.has(tool)) {
      return NextResponse.json(
        { error: `Tool not permitted here: ${tool}` },
        { status: 400 },
      );
    }
    const res = await executeTool(tool, args || {});
    const text = res?.content?.[0]?.text ?? "done";
    return NextResponse.json({ ok: !res?.isError, text });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
