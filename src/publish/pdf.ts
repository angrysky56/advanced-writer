/**
 * Book PDF builder — renders a clean, professional reading PDF via headless
 * Chromium (Puppeteer). Produces a 6x9" book-trim PDF with a typographic cover
 * page, a contents page, chapter-per-page bodies, justified serif text, and
 * footer page numbers. Self-contained: the browser is the one downloaded
 * component; no system print tools needed.
 */
import puppeteer from "puppeteer";
import { BookMeta, Chapter } from "./epub.js";

const esc = (s: string): string =>
  (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** prose markdown → HTML paragraphs (headings, bold, italic). */
function bodyHtml(markdown: string): string {
  const inline = (t: string): string =>
    esc(t)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/_([^_\n]+)_/g, "<em>$1</em>");
  const out: string[] = [];
  let first = true;
  for (const block of (markdown || "").replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const b = block.trim();
    if (!b) continue;
    const h = b.match(/^(#{2,6})\s+(.*)$/);
    if (h) {
      out.push(`<h2>${inline(h[2])}</h2>`);
      first = true;
      continue;
    }
    const text = b.split("\n").map((l) => l.trim()).join(" ");
    out.push(`<p class="${first ? "first" : ""}">${inline(text)}</p>`);
    first = false;
  }
  return out.join("\n");
}

function buildHtml(meta: BookMeta, chapters: Chapter[]): string {
  const toc = chapters
    .map((c, i) => `<li><a href="#ch${i + 1}">${esc(c.title)}</a></li>`)
    .join("\n");
  const body = chapters
    .map(
      (c, i) =>
        `<section class="chapter" id="ch${i + 1}">
  <h1>${esc(c.title)}</h1>
  ${bodyHtml(c.markdown)}
</section>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="${esc(meta.language || "en-US")}">
<head>
<meta charset="utf-8" />
<style>
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; line-height: 1.5; color: #111; }
  .cover { height: 7in; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; page-break-after: always; }
  .cover .band { border-top: 3px solid #222; border-bottom: 3px solid #222; padding: 0.6in 0.4in; }
  .cover .t { font-size: 30pt; font-weight: bold; line-height: 1.15; }
  .cover .a { font-size: 15pt; margin-top: 0.8in; letter-spacing: 0.04em; }
  .toc { page-break-after: always; }
  .toc h2 { text-align: center; font-size: 16pt; margin-bottom: 1em; }
  .toc ol { list-style: none; padding: 0; }
  .toc li { margin: 0.45em 0; font-size: 12pt; }
  .toc a { color: #111; text-decoration: none; }
  .chapter { page-break-before: always; }
  .chapter h1 { text-align: center; font-size: 18pt; margin: 1.2in 0 0.6in; line-height: 1.2; }
  h2 { font-size: 12.5pt; margin: 1.2em 0 0.4em; }
  p { margin: 0; text-indent: 1.4em; text-align: justify; orphans: 2; widows: 2; }
  p.first { text-indent: 0; }
</style>
</head>
<body>
  <div class="cover">
    <div class="band">
      <div class="t">${esc(meta.title)}</div>
    </div>
    <div class="a">${esc(meta.author)}</div>
  </div>
  <div class="toc">
    <h2>Contents</h2>
    <ol>
${toc}
    </ol>
  </div>
  ${body}
</body>
</html>`;
}

/** Render the book to a PDF Buffer. 6x9" trim with footer page numbers.
 *  `print: true` switches to a KDP paperback interior: mirrored gutter margins
 *  (larger on the binding/inside edge) via CSS @page, so the text doesn't
 *  disappear into the spine. */
export async function buildPdf(
  meta: BookMeta,
  chapters: Chapter[],
  opts: { print?: boolean } = {},
): Promise<Buffer> {
  let html = buildHtml(meta, chapters);
  if (opts.print) {
    // Inject paperback @page rules: 6x9 trim, 0.5" outside, 0.75" gutter inside.
    const pageCss = `<style>
      @page { size: 6in 9in; margin: 0.75in 0.5in 0.75in 0.75in; }
      @page :left  { margin: 0.75in 0.75in 0.75in 0.5in; }
      @page :right { margin: 0.75in 0.5in 0.75in 0.75in; }
    </style>`;
    html = html.replace("</head>", `${pageCss}</head>`);
  }
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdfOpts: any = {
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate:
        '<div style="width:100%; font-family:Georgia,serif; font-size:8pt; color:#555; text-align:center;"><span class="pageNumber"></span></div>',
    };
    if (opts.print) {
      pdfOpts.preferCSSPageSize = true; // use the @page gutter rules above
    } else {
      pdfOpts.width = "6in";
      pdfOpts.height = "9in";
      pdfOpts.margin = {
        top: "0.7in",
        bottom: "0.8in",
        left: "0.7in",
        right: "0.7in",
      };
    }
    const pdf = await page.pdf(pdfOpts);
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

/** Render a simple typographic cover image (PNG) at Kindle resolution. */
export async function buildCoverPng(meta: BookMeta): Promise<Buffer> {
  // Deterministic background colour from the title so each book looks distinct.
  let h = 0;
  for (const c of meta.title || "x") h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  const bg = `hsl(${hue}, 38%, 24%)`;
  const accent = `hsl(${hue}, 45%, 70%)`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    html,body{margin:0;padding:0;}
    .cv{width:1600px;height:2560px;background:${bg};color:#f4f1ea;
        font-family:Georgia,'Times New Roman',serif;display:flex;flex-direction:column;
        align-items:center;justify-content:center;text-align:center;box-sizing:border-box;padding:180px 140px;}
    .cv .rule{width:55%;border-top:6px solid ${accent};margin:60px 0;}
    .cv .title{font-size:150px;font-weight:bold;line-height:1.1;}
    .cv .author{font-size:74px;color:${accent};margin-top:auto;letter-spacing:2px;}
  </style></head><body>
    <div class="cv">
      <div class="rule"></div>
      <div class="title">${esc(meta.title)}</div>
      <div class="rule"></div>
      <div class="author">${esc(meta.author)}</div>
    </div>
  </body></html>`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 2560 });
    await page.setContent(html, { waitUntil: "load" });
    const png = await page.screenshot({ type: "png" });
    return Buffer.from(png);
  } finally {
    await browser.close();
  }
}
