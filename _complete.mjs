import { executeExpandToNovel } from "./dist/tools/expand-to-novel.js";
console.log("RESUME START", new Date().toISOString());
const res = await executeExpandToNovel({ story_id:"compatibility", synopsis:"(resume existing project)", target_length:"screenplay", auto_draft:true, version:"v1" });
console.log("isError:", !!res.isError);
console.log("MSG:", res.content?.[0]?.text);
console.log("RESUME END", new Date().toISOString());
process.exit(0);
