#!/usr/bin/env node
/**
 * Lakehouse42 MCP Server
 *
 * A Model Context Protocol server that exposes Lakehouse42's document search,
 * time-travel queries, and RAG capabilities to AI assistants like Claude.
 *
 * Usage:
 *   npx @lakehouse/mcp-server
 *
 * Required environment variables:
 *   LAKEHOUSE42_API_KEY - Your Lakehouse42 API key
 *
 * Optional environment variables:
 *   LAKEHOUSE42_BASE_URL - API base URL (default: https://api.lakehouse42.com)
 *
 * For Claude Desktop, add this to your claude_desktop_config.json:
 * {
 *   "mcpServers": {
 *     "lakehouse42": {
 *       "command": "npx",
 *       "args": ["@lakehouse/mcp-server"],
 *       "env": {
 *         "LAKEHOUSE42_API_KEY": "your-api-key"
 *       }
 *     }
 *   }
 * }
 */

import { createServer } from "./server.js";

// Re-export for programmatic usage
export { createServer, Lakehouse42Server } from "./server.js";
export { ApiClient } from "./api-client.js";
export {
  TOOL_DEFINITIONS,
  TAGGED_TOOLS,
  ToolExecutor,
  searchTools,
  type ToolTag,
  type DetailLevel,
  type TaggedTool,
  type ToolSearchResult,
} from "./tools.js";
export { ResourceHandler, RESOURCE_TEMPLATES } from "./resources.js";
export { HttpTransport, createHttpHandler } from "./http-transport.js";
export * from "./types.js";

// =============================================================================
// CLI Entry Point
// =============================================================================

async function main(): Promise<void> {
  // Check for help flag
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  // Check for version flag
  if (process.argv.includes("--version") || process.argv.includes("-v")) {
    console.log("0.1.0");
    process.exit(0);
  }

  try {
    const server = createServer();
    await server.start();

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      console.error("\n[lakehouse42] Shutting down...");
      await server.stop();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.error("[lakehouse42] Received SIGTERM, shutting down...");
      await server.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error(
      "[lakehouse42] Failed to start server:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

function printHelp(): void {
  console.log(`
Lakehouse42 MCP Server

A Model Context Protocol server that connects AI assistants to your
Lakehouse42 knowledge base for document search and RAG capabilities.

USAGE:
  npx @lakehouse/mcp-server [OPTIONS]

OPTIONS:
  -h, --help      Show this help message
  -v, --version   Show version number

ENVIRONMENT VARIABLES:
  LAKEHOUSE42_API_KEY     Your Lakehouse42 API key (required)
  LAKEHOUSE42_BASE_URL    API endpoint (default: https://api.lakehouse42.com)

CLAUDE DESKTOP CONFIGURATION:

Add the following to your claude_desktop_config.json:

{
  "mcpServers": {
    "lakehouse42": {
      "command": "npx",
      "args": ["@lakehouse/mcp-server"],
      "env": {
        "LAKEHOUSE42_API_KEY": "your-api-key-here"
      }
    }
  }
}

AVAILABLE TOOLS:
  search_tools        Find tools by name/tag/description (code-first pattern)
  search              Hybrid search with cursor pagination
  ask_question        RAG-powered Q&A
  get_document        Get document by ID
  list_documents      List documents with filters
  list_collections    List all collections
  upload_document     Upload text document
  time_travel_query   Query historical Iceberg data
  time_travel_diff    Compare two snapshots
  list_snapshots      List table snapshots

TOOL TAGS:
  read                Read-only operations
  write               Write operations
  admin               Administrative operations
  search              Search-related tools
  time-travel         Time-travel/history tools

HTTP MODE:
  For Streamable HTTP transport, use the HttpTransport class:

  import { HttpTransport, ToolExecutor, ApiClient } from '@lakehouse/mcp-server';

  const client = new ApiClient({ apiKey: 'your-key', baseUrl: 'https://api.lakehouse42.com' });
  const handler = new HttpTransport({ toolExecutor: new ToolExecutor(client) });

For more information, visit: https://docs.lakehouse42.com/mcp
`);
}

// Run if this is the main module
main().catch((error) => {
  console.error("[lakehouse42] Unexpected error:", error);
  process.exit(1);
});
