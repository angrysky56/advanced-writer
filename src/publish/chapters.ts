/**
 * Build clean chapters from a story's individual scene files.
 *
 * One scene file = one chapter (robust: revised scenes that lost their inline
 * "SCENE N" heading can't merge together). Chapter TITLES come from the beat
 * sheet, which holds all the titles already correctly cased ("The Voice of
 * Reason", "The Seducer's Offer") — far cleaner than re-title-casing the scene
 * headers (which were inconsistent and sometimes missing). Falls back to a
 * plain "Chapter N" only when no beat title exists.
 */
import { workspaceExporter } from "../storage/workspace.js";
import { Chapter } from "./epub.js";

/** Parse the ordered chapter titles out of a saved beat-sheet.md. */
function beatTitles(sheet: string): string[] {
  const titles: string[] = [];
  for (const line of (sheet || "").split("\n")) {
    // "## Beat 4 — Act II: Escalation: The Voice of Reason"  -> title after last ":"
    const m = line.match(/^##\s+Beat\s+\d+\s*[—-]\s*(.+?)\s*$/);
    if (!m) continue;
    const rest = m[1];
    const title = rest.includes(":")
      ? rest.slice(rest.lastIndexOf(":") + 1).trim()
      : rest.trim();
    titles.push(title.replace(/[*_#`]/g, "").trim());
  }
  return titles;
}

/** Strip a leading scene/chapter header line from a scene body. */
function stripHeader(content: string): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  if (
    /^[ \t]*[#*]{0,3}[ \t]*SCENE[ \t]+\d+/i.test(lines[0] || "") ||
    /^[ \t]*#/.test(lines[0] || "")
  ) {
    lines.shift();
  }
  return lines.join("\n").trim();
}

export async function loadChapters(
  storyId: string,
  version: string,
): Promise<Chapter[]> {
  const titles = beatTitles((await workspaceExporter.readBeatSheet(storyId)) || "");
  const files = await workspaceExporter.listDrafts(storyId, version);

  if (!files || files.length === 0) {
    const ms = await workspaceExporter.readManuscript(storyId, version);
    return ms && ms.trim() ? [{ title: "Chapter 1", markdown: ms.trim() }] : [];
  }

  const chapters: Chapter[] = [];
  let n = 0;
  for (const f of files) {
    const sceneId = f.replace(/\.md$/, "");
    const content =
      (await workspaceExporter.readDraft(storyId, sceneId, version)) || "";
    if (!content.trim()) continue;
    chapters.push({
      title: titles[n] || `Chapter ${n + 1}`,
      markdown: stripHeader(content),
    });
    n += 1;
  }
  return chapters;
}
