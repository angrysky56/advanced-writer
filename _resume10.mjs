import { executeContinueNarrative } from "./dist/tools/continue-narrative.js";
console.log("Attempting scene_10 (beat 10) for compatibility...", new Date().toISOString());
try {
  const res = await executeContinueNarrative({ story_id: "compatibility", previous_scene_id: "scene_9", next_scene_id: "scene_10", beat_order: 10, version: "v1" });
  console.log("isError:", !!res.isError);
  console.log("MSG:", res.content?.[0]?.text);
} catch (e) {
  console.log("THREW:", e?.message);
  console.log((e?.stack||"").split("\n").slice(0,6).join("\n"));
}
console.log("DONE", new Date().toISOString());
process.exit(0);
