/**
 * Minimal, dependency-light EPUB 3 builder.
 *
 * Takes a book's metadata + ordered chapters (each chapter is a title plus
 * markdown body) and produces a valid `.epub` (a zip of XHTML + a few control
 * files). No system tools required — just the small `jszip` library — so the
 * publish feature stays self-contained and install-free for the user.
 *
 * Phase 1 scope: clean reflowable e-book with a title page, an auto table of
 * contents (the EPUB nav), per-chapter pages, and embedded metadata (title,
 * author, description) — the things Amazon/Apple/Kobo expect.
 */
import JSZip from "jszip";

export interface BookMeta {
  title: string;
  author: string;
  language: string; // e.g. "en-US"
  description?: string; // back-cover blurb
  identifier?: string; // urn/uuid; generated if absent
  publisher?: string;
}

export interface Chapter {
  title: string; // reader-facing, e.g. "Chapter One — The Threshold"
  markdown: string; // chapter body (prose markdown)
}

const esc = (s: string): string =>
  (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Tiny prose-markdown to XHTML: headings, paragraphs, bold and italic. */
function bodyToXhtml(markdown: string): string {
  const blocks = (markdown || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  const inline = (t: string): string =>
    esc(t)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/_([^_\n]+)_/g, "<em>$1</em>");

  const out: string[] = [];
  for (const block of blocks) {
    const h = block.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      // Drop in-body chapter headers — the chapter already has its own <h1>.
      // Keep deeper headers (e.g., a section break) as <h2>.
      if (h[1].length <= 1) continue;
      out.push(`<h2>${inline(h[2])}</h2>`);
      continue;
    }
    // Join soft-wrapped lines into one paragraph.
    const text = block
      .split("\n")
      .map((l) => l.trim())
      .join(" ");
    out.push(`<p>${inline(text)}</p>`);
  }
  return out.join("\n");
}

function xhtmlDoc(title: string, bodyInner: string, lang: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${esc(lang)}" lang="${esc(lang)}">
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css" />
</head>
<body>
${bodyInner}
</body>
</html>`;
}

const STYLESHEET = `body { font-family: Georgia, 'Times New Roman', serif; line-height: 1.5; margin: 0 5%; }
h1 { text-align: center; margin: 2em 0 1em; font-size: 1.6em; line-height: 1.2; }
h2 { margin: 1.5em 0 0.5em; font-size: 1.15em; }
p { margin: 0; text-indent: 1.4em; }
p:first-of-type, h1 + p, h2 + p { text-indent: 0; }
.title-page { text-align: center; margin-top: 25%; }
.title-page .book-title { font-size: 2em; font-weight: bold; line-height: 1.2; }
.title-page .book-author { font-size: 1.2em; margin-top: 2em; }
.title-page .book-desc { font-style: italic; margin-top: 3em; text-align: left; }
nav ol { list-style: none; padding-left: 0; }
nav li { margin: 0.4em 0; }`;

function uuid(): string {
  // RFC4122-ish v4 without extra deps.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Build the EPUB and return it as a Buffer ready to write to disk. */
export async function buildEpub(
  meta: BookMeta,
  chapters: Chapter[],
): Promise<Buffer> {
  const id = meta.identifier || `urn:uuid:${uuid()}`;
  const lang = meta.language || "en-US";
  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const zip = new JSZip();

  // 1. mimetype — MUST be first and stored (uncompressed).
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  // 2. container points at the package document.
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  const oebps = zip.folder("OEBPS")!;
  oebps.file("style.css", STYLESHEET);

  // 3. Title page.
  const titlePage = `<div class="title-page">
  <div class="book-title">${esc(meta.title)}</div>
  <div class="book-author">${esc(meta.author)}</div>
  ${meta.description ? `<div class="book-desc">${esc(meta.description)}</div>` : ""}
</div>`;
  oebps.file("title.xhtml", xhtmlDoc(meta.title, titlePage, lang));

  // 4. Chapter pages.
  const chapterFiles = chapters.map((ch, i) => {
    const file = `chapter-${i + 1}.xhtml`;
    const inner = `<h1>${esc(ch.title)}</h1>\n${bodyToXhtml(ch.markdown)}`;
    oebps.file(file, xhtmlDoc(ch.title, inner, lang));
    return { file, title: ch.title, id: `ch${i + 1}` };
  });

  // 5. Navigation (EPUB3 TOC).
  const navList = chapterFiles
    .map((c) => `      <li><a href="${c.file}">${esc(c.title)}</a></li>`)
    .join("\n");
  oebps.file(
    "nav.xhtml",
    xhtmlDoc(
      "Contents",
      `<nav epub:type="toc" id="toc">
  <h1>Contents</h1>
  <ol>
${navList}
  </ol>
</nav>`,
      lang,
    ),
  );

  // 6. Package document (manifest + spine + metadata).
  const manifestItems = [
    `<item id="css" href="style.css" media-type="text/css"/>`,
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>`,
    ...chapterFiles.map(
      (c) =>
        `<item id="${c.id}" href="${c.file}" media-type="application/xhtml+xml"/>`,
    ),
  ].join("\n    ");
  const spine = [
    `<itemref idref="title"/>`,
    ...chapterFiles.map((c) => `<itemref idref="${c.id}"/>`),
  ].join("\n    ");

  oebps.file(
    "content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${esc(lang)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${esc(id)}</dc:identifier>
    <dc:title>${esc(meta.title)}</dc:title>
    <dc:creator>${esc(meta.author)}</dc:creator>
    <dc:language>${esc(lang)}</dc:language>
    ${meta.description ? `<dc:description>${esc(meta.description)}</dc:description>` : ""}
    ${meta.publisher ? `<dc:publisher>${esc(meta.publisher)}</dc:publisher>` : ""}
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine>
    ${spine}
  </spine>
</package>`,
  );

  return zip.generateAsync({
    type: "nodebuffer",
    mimeType: "application/epub+zip",
    compression: "DEFLATE",
  });
}
