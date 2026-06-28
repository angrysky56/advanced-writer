/**
 * One-off (idempotent) migration: canonicalize every `story_ids` value in the
 * Neo4j graph to the same slug the workspace folder uses.
 *
 * Why: historically the graph stored the raw, caller-supplied story name
 * ("The Last Frequency") while the workspace folder slugged it
 * ("the_last_frequency"). The reuse guards query by story_id, so any mismatch
 * caused the cast/arc to be regenerated instead of reused (split canon).
 * The code now always queries with the slug, so the stored values must be
 * slugged too or EVERY existing story would miss its own reuse guard.
 *
 * Safe to re-run: it only rewrites a node/edge when the slugged+deduped array
 * differs from what is stored.
 *
 * Usage (from repo root, with .env loaded):
 *   node scripts/migrate-story-ids.mjs            # apply
 *   DRY_RUN=1 node scripts/migrate-story-ids.mjs  # preview only
 */
import neo4j from "neo4j-driver";

const slug = (n) => (n ?? "").replace(/[^a-z0-9]/gi, "_").toLowerCase();
const DRY = process.env.DRY_RUN === "1";

function canonicalize(sids) {
  const out = [];
  for (const s of sids || []) {
    const v = slug(s);
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD),
);
const session = driver.session({
  database: process.env.NEO4J_DATABASE || undefined,
});

let nodesChanged = 0;
let relsChanged = 0;

try {
  // ---- Nodes ----
  const nres = await session.run(
    "MATCH (n) WHERE n.story_ids IS NOT NULL RETURN elementId(n) AS eid, n.story_ids AS sids",
  );
  for (const rec of nres.records) {
    const eid = rec.get("eid");
    const before = rec.get("sids") || [];
    const after = canonicalize(before);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      nodesChanged++;
      if (nodesChanged <= 20)
        console.log(`  node ${eid}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
      if (!DRY) {
        await session.run(
          "MATCH (n) WHERE elementId(n) = $eid SET n.story_ids = $sids",
          { eid, sids: after },
        );
      }
    }
  }

  // ---- Relationships ----
  const rres = await session.run(
    "MATCH ()-[r]->() WHERE r.story_ids IS NOT NULL RETURN elementId(r) AS eid, r.story_ids AS sids",
  );
  for (const rec of rres.records) {
    const eid = rec.get("eid");
    const before = rec.get("sids") || [];
    const after = canonicalize(before);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      relsChanged++;
      if (!DRY) {
        await session.run(
          "MATCH ()-[r]->() WHERE elementId(r) = $eid SET r.story_ids = $sids",
          { eid, sids: after },
        );
      }
    }
  }

  console.log(
    `\n${DRY ? "[DRY RUN] " : ""}story_ids canonicalized — nodes changed: ${nodesChanged}, relationships changed: ${relsChanged}`,
  );
} finally {
  await session.close();
  await driver.close();
}
