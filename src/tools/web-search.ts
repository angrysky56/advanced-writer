import * as cheerio from "cheerio";

export const webSearchDef = {
  name: "web_search",
  description: "Searches the web for historical facts, data, or references.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query" },
    },
    required: ["query"],
  },
};

export async function executeWebSearch(args: any) {
  const { query } = args;

  try {
    // Pure fetch implementation using DuckDuckGo HTML search. No API keys required!
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
        },
      },
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch from search engine: ${res.statusText}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const results: Array<{ title: string; snippet: string; link: string }> = [];

    // DuckDuckGo HTML results wrapper
    $(".result").each((i, el) => {
      if (i >= 5) return false; // Limit to top 5 results to save tokens

      const title = $(el).find(".result__title").text().trim();
      const snippet = $(el).find(".result__snippet").text().trim();
      const link = $(el).find(".result__url").attr("href")?.trim() || "";

      if (title && snippet) {
        results.push({ title, snippet, link });
      }
    });

    if (results.length === 0) {
      return {
        content: [{ type: "text", text: "No results found." }],
      };
    }

    const formattedResults = results
      .map((r) => `Title: ${r.title}\nSnippet: ${r.snippet}\nLink: ${r.link}`)
      .join("\n\n");

    return {
      content: [
        {
          type: "text",
          text: `Search Results for "${query}":\n\n${formattedResults}`,
        },
      ],
    };
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `Search failed: ${err.message}` }],
      isError: true,
    };
  }
}
