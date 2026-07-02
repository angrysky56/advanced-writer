import { NextResponse } from "next/server";
import { chromaStorage } from "../../../src/storage/chroma.js";
import { neo4jStorage } from "../../../src/storage/neo4j.js";

export async function GET() {
  const [chromaOk, neo4jOk] = await Promise.all([
    chromaStorage.verifyConnection().catch(() => false),
    neo4jStorage.verifyConnection().catch(() => false),
  ]);

  return NextResponse.json({
    chroma: chromaOk ? "online" : "offline",
    neo4j: neo4jOk ? "online" : "offline",
  });
}
