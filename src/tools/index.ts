import {
  createNarrativeDef,
  executeCreateNarrative,
} from "./create-narrative.js";
import {
  developCharacterDef,
  executeDevelopCharacter,
} from "./develop-character.js";
import {
  reviewNarrativeDef,
  executeReviewNarrative,
} from "./review-narrative.js";
import {
  selectStructureDef,
  executeSelectStructure,
} from "./select-structure.js";
import { rewriteSceneDef, executeRewriteScene } from "./rewrite-scene.js";
import {
  continueNarrativeDef,
  executeContinueNarrative,
} from "./continue-narrative.js";

export const ALL_TOOLS = [
  createNarrativeDef,
  developCharacterDef,
  reviewNarrativeDef,
  selectStructureDef,
  rewriteSceneDef,
  continueNarrativeDef,
];

export async function executeTool(name: string, args: any) {
  switch (name) {
    case "create_narrative":
      return executeCreateNarrative(args);
    case "develop_character":
      return executeDevelopCharacter(args);
    case "review_narrative":
      return executeReviewNarrative(args);
    case "select_structure":
      return executeSelectStructure(args);
    case "rewrite_scene":
      return executeRewriteScene(args);
    case "continue_narrative":
      return executeContinueNarrative(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
