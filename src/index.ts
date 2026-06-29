import { server } from "./server.js";
import { ENV } from "./config.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { ensureChromaServer } from "./storage/chroma-server.js";

async function main() {
  // Bring up the bundled (no-Python) Chroma vector server eagerly so semantic
  // retrieval is ready before any tool runs. Fail-open: never block startup.
  ensureChromaServer().catch((e) =>
    console.error("[chroma] auto-start error:", e),
  );
  if (ENV.MCP_TRANSPORT === "stdio") {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Advanced Writer MCP Server running on stdio");
  } else {
    const app = express();
    let transport: SSEServerTransport;

    app.get("/sse", async (req, res) => {
      transport = new SSEServerTransport("/message", res);
      await server.connect(transport);
    });

    app.post("/message", async (req, res) => {
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.status(503).send("SSE not initialized");
      }
    });

    app.listen(ENV.MCP_PORT, () => {
      console.error(
        `Advanced Writer MCP Server running on SSE at http://localhost:${ENV.MCP_PORT}`,
      );
    });
  }
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
