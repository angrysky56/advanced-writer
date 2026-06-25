import { NextResponse } from "next/server";
import { runFindReplace } from "../../../src/tools/find-replace";
import type { FindReplaceOptions } from "../../../src/tools/find-replace";

/**
 * Deterministic find & replace for the Studio UI. POST a preview (apply:false)
 * to see what would change, then POST again with apply:true to write it. The
 * full structured result is returned both times so the panel can render the
 * per-file match list.
 */
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.find) {
      return NextResponse.json({ error: "find is required." }, { status: 400 });
    }
    const opts: FindReplaceOptions = {
      find: body.find,
      replace: body.replace ?? "",
      storyId: body.storyId,
      relPath: body.relPath,
      kinds: body.kinds,
      version: body.version,
      mode: body.mode,
      caseSensitive: body.caseSensitive,
      limit: body.limit,
      apply: body.apply === true,
    };
    const result = await runFindReplace(opts);
    const status = result.error ? 400 : 200;
    return NextResponse.json(result, { status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
