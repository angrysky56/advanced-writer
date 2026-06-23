import { server } from "./server.js";
import { ENV } from "./config.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";

async function main() {
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
