import { NextResponse } from "next/server";
import { neo4jStorage } from "../../../src/storage/neo4j";

// Per-character emotional arc: reads the `affect_log` timeline (Panksepp +
// Plutchik snapshots) that continue_narrative appends to each Neo4j character
// node, scene by scene. This is how we VERIFY the affect tracking is real.
export async function GET(req: Request) {
  const storyId = new URL(req.url).searchParams.get("story_id") || "";
  if (!storyId) return NextResponse.json({ characters: [] });

  try {
    const chars = await neo4jStorage.getCharactersForStory(storyId);
    const characters = (chars || []).map((c: any) => {
      const raw = Array.isArray(c.affect_log) ? c.affect_log : [];
      const snapshots = raw
        .map((s: any) => {
          try {
            return typeof s === "string" ? JSON.parse(s) : s;
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      return {
        name: c.name,
        role: c.role || "",
        panksepp_primary: c.panksepp_primary || "",
        snapshots,
      };
    });
    return NextResponse.json({ characters });
  } catch (e: any) {
    return NextResponse.json(
      { characters: [], error: e?.message },
      { status: 200 },
    );
  }
}
