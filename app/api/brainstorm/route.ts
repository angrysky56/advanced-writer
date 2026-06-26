import { NextResponse } from "next/server";
import { runBrainstorm } from "../../../src/tools/brainstorm";

// Generate a batch of varied story concepts for the Brainstorm board.
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const ideas = await runBrainstorm({
      seed: body?.seed,
      wildness: body?.wildness,
      count: body?.count,
      avoid: body?.avoid,
    });
    return NextResponse.json({ ideas });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || String(e), ideas: [] },
      { status: 500 },
    );
  }
}
