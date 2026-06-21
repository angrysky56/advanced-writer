import fs from "fs";
import path from "path";
import { executeExpandToNovel } from "../tools/expand-to-novel.js";

async function main() {
  const args = process.argv.slice(2);
  let storyId = "default_story";
  let targetLength = "novella";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--story_id" && args[i + 1]) {
      storyId = args[i + 1];
      i++;
    } else if (args[i] === "--target_length" && args[i + 1]) {
      targetLength = args[i + 1];
      i++;
    }
  }

  console.log(`Starting Auto-Draft Sequence for story: ${storyId}`);
  
  const workspaceDir = process.env.WORKSPACE_DIR || "./data/workspace";
  const storySlug = storyId.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const architecturePath = path.join(workspaceDir, storySlug, "structure", "story-architecture-brief.md");
  
  let synopsis = "";
  try {
    synopsis = fs.readFileSync(architecturePath, "utf8");
  } catch (e) {
    console.error(`Error: Could not find architecture brief at ${architecturePath}`);
    process.exit(1);
  }

  try {
    const result = await executeExpandToNovel({
      story_id: storyId,
      synopsis: synopsis,
      target_length: targetLength,
      auto_draft: true
    });
    console.log("Auto-Draft Sequence Completed Successfully!");
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Auto-Draft Sequence Failed:", err);
    process.exit(1);
  }
}

main();
