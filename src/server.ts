/**
 * MCP Server implementation for Lakehouse42.
 *
 * This server exposes Lakehouse42's document search, time-travel queries,
 * and RAG capabilities through the Model Context Protocol.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { ApiClient } from "./api-client.js";
import { TOOL_DEFINITIONS, ToolExecutor } from "./tools.js";
import { ResourceHandler } from "./resources.js";
import type { ServerConfig } from "./types.js";

// =============================================================================
// Server Constants
// =============================================================================

const SERVER_NAME = "lakehouse42";
const SERVER_VERSION = "0.1.0";

// =============================================================================
// MCP Server Class
// =============================================================================

export class Lakehouse42Server {
  private readonly server: Server;
  private readonly client: ApiClient;
  private readonly toolExecutor: ToolExecutor;
  private readonly resourceHandler: ResourceHandler;

  constructor(config: ServerConfig) {
    // Initialize API client
    this.client = new ApiClient(config);
    this.toolExecutor = new ToolExecutor(this.client);
    this.resourceHandler = new ResourceHandler(this.client);

    // Initialize MCP server
    this.server = new Server(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Set up MCP protocol handlers.
   */
  private setupHandlers(): void {
    // Handle tools/list
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: TOOL_DEFINITIONS,
      };
    });

    // Handle tools/call
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        const result = await this.toolExecutor.execute(name, args || {});

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    });

    // Handle resources/list
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = await this.resourceHandler.listResources();
      return { resources };
    });

    // Handle resources/read
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      try {
        const content = await this.resourceHandler.readResource(uri);

        return {
          contents: [
            {
              uri: content.uri,
              mimeType: content.mimeType,
              text: content.text,
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error occurred";
        throw new Error(`Failed to read resource ${uri}: ${message}`);
      }
    });

    // Handle errors
    this.server.onerror = (error) => {
      console.error("[MCP Server Error]", error);
    };
  }

  /**
   * Start the server using stdio transport.
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`[${SERVER_NAME}] MCP server started (v${SERVER_VERSION})`);
  }

  /**
   * Stop the server.
   */
  async stop(): Promise<void> {
    await this.server.close();
  }
}

// =============================================================================
// Server Factory
// =============================================================================

/**
 * Create and configure a Lakehouse42 MCP server.
 */
export function createServer(config?: Partial<ServerConfig>): Lakehouse42Server {
  const apiKey = config?.apiKey || process.env.LAKEHOUSE42_API_KEY;
  const baseUrl =
    config?.baseUrl ||
    process.env.LAKEHOUSE42_BASE_URL ||
    "https://api.lakehouse42.com";

  if (!apiKey) {
    throw new Error(
      "LAKEHOUSE42_API_KEY environment variable is required. " +
        "Get your API key at https://app.lakehouse42.com/settings/api"
    );
  }

  return new Lakehouse42Server({
    apiKey,
    baseUrl,
    timeout: config?.timeout,
  });
}
