/**
 * publish_story — Phase 1 of the "Publish & Ship" subsystem.
 *
 * Turns a finished, compiled manuscript into a clean, shareable e-book (.epub)
 * with a title page, auto table of contents, chapters, and a copilot-drafted
 * back-cover blurb embedded as the description. NON-DESTRUCTIVE: output goes to
 * the project's own `publish/ebook/` folder; the manuscript and drafts are never
 * touched. (PDF + cover are the next phase.)
 */
import fs from "fs";
import path from "path";
import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";
import { storySlug } from "../storage/story-id.js";
import { buildEpub } from "../publish/epub.js";
import { buildPdf, buildCoverPng } from "../publish/pdf.js";
import { loadChapters } from "../publish/chapters.js";
import {
  generateListing,
  renderListingMd,
  renderGuideMd,
} from "../publish/amazon.js";

export const publishStoryDef = {
  name: "publish_story",
  description:
    "Package a finished story for publishing. target='amazon' (default) produces the full Amazon/KDP kit: e-book, cover image, print-ready paperback PDF, a listing sheet (description, keywords, categories), and a plain-language upload walkthrough. target='share' produces just a clean e-book + reading PDF. Non-destructive: writes to the project's publish/ folder. Use when the user wants to publish, sell, export, or ship their finished book.",
  inputSchema: {
    type: "object",
    properties: {
      story_id: { type: "string", description: "The story/project to publish" },
      target: {
        type: "string",
        enum: ["amazon", "share"],
        description:
          "'amazon' = full KDP kit (default); 'share' = just a nice e-book + PDF.",
      },
      version: {
        type: "string",
        description:
          "Which draft version to publish (e.g. 'v1', 'v3'). Defaults to the most recent version.",
      },
      title: {
        type: "string",
        description: "Book title. If omitted, derived from the project.",
      },
      author: {
        type: "string",
        description: "Author name as it should appear on the book.",
      },
    },
    required: ["story_id"],
  },
};

// Words that stay lowercase in a title unless first or last.
const MINOR_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into",
  "nor", "of", "on", "onto", "or", "over", "per", "the", "to", "up", "via",
  "with", "without",
]);

/** Proper book/title casing: lowercases minor words, leaves "Seducer's" intact. */
function titleCase(s: string): string {
  const words = (s || "").toLowerCase().trim().split(/\s+/).filter(Boolean);
  return words
    .map((w, i) => {
      if (i !== 0 && i !== words.length - 1 && MINOR_WORDS.has(w)) return w;
      // Capitalize only the first character so "seducer's" -> "Seducer's".
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

/** Derive a title from the architecture brief, else the project name. */
async function deriveTitle(storyId: string): Promise<string> {
  const arch = (await workspaceExporter.readArchitectureBrief(storyId)) || "";
  const m = arch.match(/^\s*\**\s*Title\s*\**\s*:\s*(.+?)\s*$/im);
  if (m && m[1].trim()) {
    // Strip markdown emphasis BEFORE casing, else a leading "*" eats the cap.
    const cleaned = m[1].replace(/[*_`#]/g, "").trim();
    if (cleaned) return titleCase(cleaned);
  }
  return titleCase(storyId.replace(/[_-]+/g, " "));
}

/** Ask the AI for a short back-cover blurb. Fails open to empty. */
async function draftBlurb(title: string, manuscript: string): Promise<string> {
  try {
    const out = await aiRouter.generateCompletion({
      taskType: "brainstorm",
      systemPrompt:
        "You are a publishing copywriter. Write a compelling back-cover blurb (2 short paragraphs, ~90 words total) for the book below. Hook the reader; do NOT spoil the ending; no headings, no quotes, just the blurb prose.",
      userMessage: `TITLE: ${title}\n\nOPENING OF THE BOOK:\n${manuscript.slice(0, 6000)}`,
    });
    return (out || "").trim();
  } catch {
    return "";
  }
}

export async function executePublishStory(args: any) {
  const story_id = storySlug(args.story_id);
  // Default to the MOST RECENT draft version when none is specified, so
  // "publish my book" ships the latest work, not an old v1.
  let version = args.version;
  if (!version) {
    const versions = await workspaceExporter.listDraftVersions(story_id);
    version = versions.length ? versions[versions.length - 1] : "v1";
  }

  try {
    const manuscript = await workspaceExporter.readManuscript(story_id, version);
    if (!manuscript || !manuscript.trim()) {
      return {
        content: [
          {
            type: "text",
            text: `No compiled manuscript found for "${story_id}" (${version}). Draft and compile the story first, then publish.`,
          },
        ],
        isError: true,
      };
    }

    const rawTitle =
      (args.title && String(args.title).trim()) ||
      (await deriveTitle(story_id));
    // Strip stray markdown (asterisks, backticks, hashes, quotes) from the title.
    const title =
      rawTitle.replace(/[*_`#"]/g, "").replace(/\s+/g, " ").trim() || "Untitled";
    const author = (args.author && String(args.author).trim()) || "Anonymous";
    const chapters = await loadChapters(story_id, version);
    if (chapters.length === 0) {
      return {
        content: [
          { type: "text", text: `Nothing to publish for "${story_id}" (${version}) — no chapters found.` },
        ],
        isError: true,
      };
    }
    const target = args.target === "share" ? "share" : "amazon"; // default amazon
    const base = storySlug(title) || "book";
    const outDir = path.join(workspaceExporter.baseDir, story_id, "publish");
    const wordCount = manuscript.split(/\s+/).filter(Boolean).length;

    // ---- "Just share a nice copy" — e-book + reading PDF ----
    if (target === "share") {
      const description = await draftBlurb(title, manuscript);
      const meta = { title, author, language: "en-US", description };
      await fs.promises.mkdir(path.join(outDir, "ebook"), { recursive: true });
      await fs.promises.mkdir(path.join(outDir, "pdf"), { recursive: true });
      const epubPath = path.join(outDir, "ebook", `${base}.epub`);
      await fs.promises.writeFile(epubPath, await buildEpub(meta, chapters));
      let pdfPath = "";
      let pdfNote = "";
      try {
        pdfPath = path.join(outDir, "pdf", `${base}.pdf`);
        await fs.promises.writeFile(pdfPath, await buildPdf(meta, chapters));
      } catch (e: any) {
        pdfPath = "";
        pdfNote = `\n(PDF render failed: ${e?.message || e}. The e-book was still created.)`;
      }
      return {
        content: [
          {
            type: "text",
            text:
              `Published "${title}" by ${author} — ${chapters.length} chapters, ~${wordCount.toLocaleString()} words.\n` +
              `• E-book: ${epubPath}\n` +
              (pdfPath ? `• PDF: ${pdfPath}\n` : "") +
              (description ? `\nBlurb (edit anytime):\n"${description}"` : "") +
              pdfNote,
          },
        ],
      };
    }

    // ---- "Sell on Amazon" — everything a first-timer needs to upload ----
    const listing = await generateListing(title, author, manuscript);
    const meta = { title, author, language: "en-US", description: listing.description };
    const amzDir = path.join(outDir, "amazon");
    await fs.promises.mkdir(amzDir, { recursive: true });

    const epubName = `${base}.epub`;
    const coverName = "cover.png";
    const printName = `${base}-paperback.pdf`;

    // E-book (KDP accepts EPUB) — also kept in publish/ebook for the share flow.
    const epubBuf = await buildEpub(meta, chapters);
    await fs.promises.mkdir(path.join(outDir, "ebook"), { recursive: true });
    await fs.promises.writeFile(path.join(outDir, "ebook", epubName), epubBuf);
    await fs.promises.writeFile(path.join(amzDir, epubName), epubBuf);

    // Cover image, print-ready paperback interior. Fail-soft per item.
    const notes: string[] = [];
    try {
      await fs.promises.writeFile(path.join(amzDir, coverName), await buildCoverPng(meta));
    } catch (e: any) {
      notes.push(`cover image failed: ${e?.message || e}`);
    }
    try {
      await fs.promises.writeFile(
        path.join(amzDir, printName),
        await buildPdf(meta, chapters, { print: true }),
      );
    } catch (e: any) {
      notes.push(`paperback PDF failed: ${e?.message || e}`);
    }

    // Listing sheet + tailored upload walkthrough.
    await fs.promises.writeFile(
      path.join(amzDir, "listing.md"),
      renderListingMd(title, author, listing),
    );
    await fs.promises.writeFile(
      path.join(amzDir, "how-to-publish-on-amazon.md"),
      renderGuideMd(title, author, {
        epub: epubName,
        coverPng: coverName,
        printPdf: printName,
      }),
    );

    return {
      content: [
        {
          type: "text",
          text:
            `Amazon package ready for "${title}" by ${author} — ${chapters.length} chapters, ~${wordCount.toLocaleString()} words.\n` +
            `Everything is in: ${amzDir}\n` +
            `• ${epubName} (Kindle e-book)\n• ${coverName} (cover image)\n• ${printName} (paperback interior)\n` +
            `• listing.md (description, keywords, categories — copy/paste into KDP)\n` +
            `• how-to-publish-on-amazon.md (step-by-step guide)\n` +
            (listing.keywords.length ? `\nSuggested keywords: ${listing.keywords.join(", ")}` : "") +
            (listing.categories.length ? `\nSuggested categories: ${listing.categories.join(" | ")}` : "") +
            (notes.length ? `\n\nNotes: ${notes.join("; ")}` : ""),
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error publishing "${story_id}": ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
