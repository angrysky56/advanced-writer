import { workspaceExporter } from './src/storage/workspace.js';
import fs from 'fs';

async function main() {
  const storyName = "The Neon Codex";
  
  console.log("Saving Character Profile...");
  const charPath = await workspaceExporter.saveCharacterProfile(storyName, "Lexa", "# Lexa\n\nCyberpunk hacker archetype.");
  console.log("Character saved to:", charPath);

  console.log("Saving Architecture Brief...");
  const archPath = await workspaceExporter.saveArchitectureBrief(storyName, "# Story Architecture\n\n3 Act Structure.");
  console.log("Architecture saved to:", archPath);

  console.log("Saving Diagnostic...");
  const diagPath = await workspaceExporter.saveDiagnosticReport(storyName, "scene-1", "# Diagnostic\n\nHigh cortisol.");
  console.log("Diagnostic saved to:", diagPath);

  console.log("Saving Draft...");
  const draftPath = await workspaceExporter.saveDraft(storyName, "scene-1", "# Scene 1\n\nThe rain fell like static.");
  console.log("Draft saved to:", draftPath);
}

main().catch(console.error);
