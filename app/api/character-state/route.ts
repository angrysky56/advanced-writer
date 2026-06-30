import { NextResponse } from "next/server";
import { neo4jStorage } from "../../../src/storage/neo4j";

/**
 * Save the author-controlled steering note for a character. This persists on the
 * Neo4j character node and is injected into drafting (buildScratchpadContext),
 * so the author's edit steers the next scene. Scene tracking never overwrites it.
 */
export async function POST(req: Request) {
  try {
    const { story_id, name, author_note } = await req.json();
    if (!story_id || !name) {
      return NextResponse.json(
        { error: "story_id and name are required." },
        { status: 400 },
      );
    }
    const ok = await neo4jStorage.setCharacterAuthorNote(
      story_id,
      name,
      typeof author_note === "string" ? author_note : "",
    );
    return NextResponse.json({ ok });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
