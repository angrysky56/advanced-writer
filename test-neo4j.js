import { neo4jStorage } from "./dist/storage/neo4j.js";
async function test() {
  const state = await neo4jStorage.getStoryState("an_ai_coding_assistant");
  console.log(JSON.stringify(state, null, 2));
  process.exit(0);
}
test();
