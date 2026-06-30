/**
 * Amazon KDP helpers — the non-technical-author value:
 *  - a LISTING sheet (description/blurb, 7 keywords, 2 categories, author bio)
 *    drafted by the AI, because these are what make a book findable and are
 *    exactly what beginners get wrong or skip;
 *  - a plain-language UPLOAD WALKTHROUGH tailored to this specific book, so a
 *    first-timer can follow it step by step.
 */
import { aiRouter } from "../ai/router.js";
import { safeParseJson } from "../ai/extract.js";

export interface Listing {
  description: string; // back-cover blurb / KDP description
  keywords: string[]; // up to 7
  categories: string[]; // 2 BISAC-style category paths
  bio: string; // short author bio
}

/** Ask the AI for the full retail listing. Fails open to sensible blanks. */
export async function generateListing(
  title: string,
  author: string,
  manuscript: string,
): Promise<Listing> {
  try {
    const raw = await aiRouter.generateCompletion({
      taskType: "brainstorm",
      systemPrompt:
        "You are a book-marketing specialist preparing an Amazon KDP listing. " +
        "From the manuscript opening, output ONLY JSON with these fields: " +
        '{"description": "a compelling 100-150 word back-cover blurb, no spoilers", ' +
        '"keywords": ["7 search phrases readers would actually type"], ' +
        '"categories": ["2 BISAC category paths, e.g. FICTION / Science Fiction / Dystopian"], ' +
        '"bio": "a short 2-sentence third-person author bio placeholder the author can edit"}',
      userMessage: `TITLE: ${title}\nAUTHOR: ${author}\n\nMANUSCRIPT OPENING:\n${manuscript.slice(0, 7000)}`,
    });
    const p = safeParseJson<any>(raw) || {};
    return {
      description: String(p.description || "").trim(),
      keywords: Array.isArray(p.keywords)
        ? p.keywords.map((k: any) => String(k).trim()).filter(Boolean).slice(0, 7)
        : [],
      categories: Array.isArray(p.categories)
        ? p.categories.map((c: any) => String(c).trim()).filter(Boolean).slice(0, 2)
        : [],
      bio: String(p.bio || "").trim(),
    };
  } catch {
    return { description: "", keywords: [], categories: [], bio: "" };
  }
}

/** A copy-paste listing sheet for the KDP form. */
export function renderListingMd(
  title: string,
  author: string,
  listing: Listing,
): string {
  const kw = listing.keywords.length
    ? listing.keywords.map((k, i) => `${i + 1}. ${k}`).join("\n")
    : "_(none generated — add your own)_";
  const cats = listing.categories.length
    ? listing.categories.map((c) => `- ${c}`).join("\n")
    : "_(pick 2 in the KDP category browser)_";
  return `# Amazon Listing — ${title}

Copy each field straight into the KDP form. **Everything here is editable — make it yours.**

## Title
${title}

## Author
${author}

## Description (back-cover blurb)
${listing.description || "_(write a 100-150 word hook here)_"}

## Keywords (up to 7)
${kw}

## Categories (choose 2)
${cats}

## Author bio
${listing.bio || "_(2 sentences about you)_"}
`;
}

/** A plain-language, step-by-step KDP upload guide tailored to this book. */
export function renderGuideMd(
  title: string,
  author: string,
  files: { epub?: string; coverPng?: string; printPdf?: string },
): string {
  return `# How to publish "${title}" on Amazon

No experience needed. This walks you through it start to finish. You'll need a free
KDP account and a bank account for royalties. Set aside about 30 minutes.

## Before you start
In the \`publish/amazon\` folder next to this guide you'll find everything you need:
- **Cover image** — \`${files.coverPng || "cover.png"}\`
- **E-book file** — \`${files.epub || "book.epub"}\`
- **Paperback interior** — \`${files.printPdf || "book-print.pdf"}\`
- **listing.md** — the title, description, keywords, and categories to paste in.

## Part 1 — The e-book (Kindle)
1. Go to **kdp.amazon.com** and sign in (or create a free account).
2. On your Bookshelf, click **+ Create** → **Kindle eBook**.
3. **Language**, **Book Title**: paste the Title from \`listing.md\`.
4. **Author**: ${author}.
5. **Description**: paste the Description from \`listing.md\`.
6. **Keywords**: paste the 7 keywords (one per box).
7. **Categories**: pick the 2 from \`listing.md\`.
8. Click **Save and Continue**.
9. **Manuscript**: upload the e-book file (**${files.epub || "book.epub"}**).
10. **Cover**: upload **${files.coverPng || "cover.png"}** (or use KDP's free Cover Creator).
11. Use the online previewer to flip through it, then **Save and Continue**.
12. Set your **price** (you choose), pick the 70% royalty option if eligible, and **Publish**.

## Part 2 — The paperback (optional, same book)
1. Back on your Bookshelf, next to your new title click the **+** → **Create Paperback**.
2. Most details carry over. For **print options** choose trim size **6 x 9 in**, white or cream paper.
3. **Manuscript**: upload the interior **${files.printPdf || "book-print.pdf"}**.
4. **Cover**: upload your cover, or use Cover Creator.
5. Approve the print previewer, set your price, and **Publish**.

## After you publish
- It takes up to ~72 hours to go live and for the Kindle + paperback to link on one page.
- You can edit the description, price, and even re-upload the book anytime — publishing isn't permanent.
- Tell people. A few early reviews matter more than anything else.

That's it — you're an author with a book for sale. 🎉
`;
}
