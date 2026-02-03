/**
 * MCP Tool definitions for Lakehouse42 with code-first optimization patterns.
 */

import { z } from "zod";
import type { ApiClient } from "./api-client.js";
import type {
  SearchResponse,
  ChatCompletionResponse,
  Document,
  DocumentContent,
  ListDocumentsResponse,
  ListCollectionsResponse,
  ListSnapshotsResponse,
  TimeTravelQueryResponse,
  TimeTravelDiffResponse,
  SlimSearchResponse,
  SlimChatResponse,
  SlimListDocumentsResponse,
  SlimListCollectionsResponse,
  SlimTimeTravelQueryResponse,
  SlimListSnapshotsResponse,
} from "./types.js";

// =============================================================================
// Tool Tags & Registry (Code-First Pattern)
// =============================================================================

export type ToolTag = "read" | "write" | "admin" | "search" | "time-travel";
export type DetailLevel = "name" | "summary" | "full";

export interface TaggedTool {
  name: string;
  tags: ToolTag[];
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// =============================================================================
// Response Transformers
// =============================================================================

const MAX_SNIPPET_LENGTH = 200;
const MAX_SEARCH_RESULTS = 5;
const MAX_DOCUMENTS = 10;
const MAX_COLLECTIONS = 10;
const MAX_SAMPLE_ROWS = 3;
const MAX_SNAPSHOTS = 10;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toSlimSearchResponse(
  response: SearchResponse,
  query: string,
  offset: number = 0
): SlimSearchResponse & { next_cursor?: string } {
  const results = response.results.slice(0, MAX_SEARCH_RESULTS).map((r) => ({
    document_id: r.document_id,
    title: r.document_name,
    snippet: truncate(r.content, MAX_SNIPPET_LENGTH),
    score: round2(r.score),
  }));

  const hasMore = response.total_results > offset + MAX_SEARCH_RESULTS;
  const nextCursor = hasMore
    ? Buffer.from(JSON.stringify({ offset: offset + MAX_SEARCH_RESULTS, query })).toString("base64")
    : undefined;

  return {
    query,
    total: response.total_results,
    results,
    has_more: hasMore,
    ...(nextCursor && { next_cursor: nextCursor }),
  };
}

function toSlimChatResponse(response: ChatCompletionResponse): SlimChatResponse {
  return {
    answer: response.choices[0]?.message.content || "",
    sources_used: response.sources?.length || 0,
    model: "default",
  };
}

function toSlimListDocumentsResponse(
  response: ListDocumentsResponse
): SlimListDocumentsResponse & { next_cursor?: string } {
  const documents = response.documents.slice(0, MAX_DOCUMENTS).map((d) => ({
    id: d.id,
    title: d.title,
    status: d.status,
    chunk_count: d.chunk_count,
  }));

  return {
    total: response.total_count,
    documents,
    has_more: response.has_more || response.total_count > MAX_DOCUMENTS,
    ...(response.next_cursor && { next_cursor: response.next_cursor }),
  };
}

function toSlimListCollectionsResponse(
  response: ListCollectionsResponse
): SlimListCollectionsResponse & { next_cursor?: string } {
  const collections = response.collections.slice(0, MAX_COLLECTIONS).map((c) => ({
    id: c.id,
    name: c.name,
    document_count: c.document_count,
  }));

  return {
    total: response.collections.length,
    collections,
    has_more: response.has_more || response.collections.length > MAX_COLLECTIONS,
    ...(response.next_cursor && { next_cursor: response.next_cursor }),
  };
}

function toSlimTimeTravelQueryResponse(
  response: TimeTravelQueryResponse
): SlimTimeTravelQueryResponse {
  return {
    table_name: response.table_name,
    row_count: response.row_count,
    columns: response.columns,
    sample_rows: response.rows.slice(0, MAX_SAMPLE_ROWS),
    truncated: response.row_count > MAX_SAMPLE_ROWS,
    snapshot_id: response.snapshot_id,
  };
}

function toSlimListSnapshotsResponse(
  response: ListSnapshotsResponse
): SlimListSnapshotsResponse {
  const snapshots = response.snapshots.slice(0, MAX_SNAPSHOTS).map((s) => ({
    snapshot_id: s.snapshot_id,
    operation: s.operation,
    committed_at: s.committed_at,
  }));

  return {
    table_name: response.table_name,
    total: response.total,
    snapshots,
    has_more: response.total > MAX_SNAPSHOTS,
  };
}

// =============================================================================
// Tool Schemas (Zod)
// =============================================================================

export const searchToolsSchema = z.object({
  query: z.string().optional().describe("Filter tools by name/description"),
  tags: z.array(z.enum(["read", "write", "admin", "search", "time-travel"])).optional(),
  detail: z.enum(["name", "summary", "full"]).default("summary"),
});

export const searchSchema = z.object({
  query: z.string(),
  collection_ids: z.array(z.string()).optional(),
  top_k: z.number().int().min(1).max(100).default(10),
  rerank: z.boolean().default(true),
  cursor: z.string().optional(),
});

export const askQuestionSchema = z.object({
  question: z.string(),
  collection_ids: z.array(z.string()).optional(),
  model: z.string().optional(),
});

export const getDocumentSchema = z.object({
  document_id: z.string(),
  include_content: z.boolean().default(false),
});

export const listDocumentsSchema = z.object({
  collection_id: z.string().optional(),
  status: z.enum(["pending", "processing", "ready", "failed"]).optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const listCollectionsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const uploadDocumentSchema = z.object({
  title: z.string(),
  content: z.string(),
  content_type: z.enum(["text/plain", "text/markdown", "text/html"]).default("text/plain"),
  collection_id: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const timeTravelQuerySchema = z.object({
  table_name: z.string(),
  namespace: z.string().optional(),
  snapshot_id: z.string().optional(),
  as_of_timestamp: z.string().optional(),
  columns: z.array(z.string()).optional(),
  where: z.string().optional(),
  limit: z.number().int().min(1).max(10000).default(100),
});

export const timeTravelDiffSchema = z.object({
  table_name: z.string(),
  namespace: z.string().optional(),
  from_snapshot_id: z.string(),
  to_snapshot_id: z.string(),
});

export const listSnapshotsSchema = z.object({
  table_name: z.string(),
  namespace: z.string().optional(),
  limit: z.number().int().min(1).max(1000).default(50),
});

// =============================================================================
// Tagged Tool Definitions (Optimized Descriptions)
// =============================================================================

export const TAGGED_TOOLS: TaggedTool[] = [
  {
    name: "search_tools",
    tags: ["read"],
    description: "Find available tools by name, tag, or description. Returns tool info at specified detail level.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term" },
        tags: { type: "array", items: { type: "string", enum: ["read", "write", "admin", "search", "time-travel"] } },
        detail: { type: "string", enum: ["name", "summary", "full"], description: "name=names only, summary=+descriptions, full=+schemas" },
      },
    },
  },
  {
    name: "search",
    tags: ["read", "search"],
    description: "Hybrid search (dense+sparse+BM25). Returns ranked chunks with cursor pagination.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        collection_ids: { type: "array", items: { type: "string" } },
        top_k: { type: "number", description: "1-100, default 10" },
        rerank: { type: "boolean", description: "default true" },
        cursor: { type: "string", description: "Pagination cursor" },
      },
      required: ["query"],
    },
  },
  {
    name: "ask_question",
    tags: ["read", "search"],
    description: "RAG-based Q&A. Returns AI answer with source count.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string" },
        collection_ids: { type: "array", items: { type: "string" } },
        model: { type: "string" },
      },
      required: ["question"],
    },
  },
  {
    name: "get_document",
    tags: ["read"],
    description: "Get document by ID. Optionally include full content.",
    inputSchema: {
      type: "object",
      properties: {
        document_id: { type: "string" },
        include_content: { type: "boolean" },
      },
      required: ["document_id"],
    },
  },
  {
    name: "list_documents",
    tags: ["read"],
    description: "List documents with filters. Cursor pagination.",
    inputSchema: {
      type: "object",
      properties: {
        collection_id: { type: "string" },
        status: { type: "string", enum: ["pending", "processing", "ready", "failed"] },
        search: { type: "string" },
        limit: { type: "number" },
        cursor: { type: "string" },
      },
    },
  },
  {
    name: "list_collections",
    tags: ["read"],
    description: "List all collections. Cursor pagination.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number" },
        cursor: { type: "string" },
      },
    },
  },
  {
    name: "upload_document",
    tags: ["write"],
    description: "Upload text document. Auto-chunked and indexed.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        content_type: { type: "string", enum: ["text/plain", "text/markdown", "text/html"] },
        collection_id: { type: "string" },
        metadata: { type: "object" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "time_travel_query",
    tags: ["read", "time-travel", "admin"],
    description: "Query historical Iceberg data at snapshot/timestamp.",
    inputSchema: {
      type: "object",
      properties: {
        table_name: { type: "string", description: "documents|chunks|entities" },
        namespace: { type: "string" },
        snapshot_id: { type: "string" },
        as_of_timestamp: { type: "string", description: "ISO 8601" },
        columns: { type: "array", items: { type: "string" } },
        where: { type: "string" },
        limit: { type: "number" },
      },
      required: ["table_name"],
    },
  },
  {
    name: "time_travel_diff",
    tags: ["read", "time-travel", "admin"],
    description: "Compare two snapshots. Returns added/deleted/changed counts.",
    inputSchema: {
      type: "object",
      properties: {
        table_name: { type: "string" },
        namespace: { type: "string" },
        from_snapshot_id: { type: "string" },
        to_snapshot_id: { type: "string" },
      },
      required: ["table_name", "from_snapshot_id", "to_snapshot_id"],
    },
  },
  {
    name: "list_snapshots",
    tags: ["read", "time-travel"],
    description: "List Iceberg table snapshots for time-travel.",
    inputSchema: {
      type: "object",
      properties: {
        table_name: { type: "string" },
        namespace: { type: "string" },
        limit: { type: "number" },
      },
      required: ["table_name"],
    },
  },
];

// Legacy format for MCP compatibility
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = TAGGED_TOOLS.map(({ name, description, inputSchema }) => ({
  name,
  description,
  inputSchema,
}));

// =============================================================================
// Tool Discovery (Code-First Pattern)
// =============================================================================

export interface ToolSearchResult {
  name: string;
  tags?: ToolTag[];
  description?: string;
  inputSchema?: TaggedTool["inputSchema"];
}

export function searchTools(
  query?: string,
  tags?: ToolTag[],
  detail: DetailLevel = "summary"
): ToolSearchResult[] {
  let tools = TAGGED_TOOLS;

  // Filter by tags
  if (tags && tags.length > 0) {
    tools = tools.filter((t) => tags.some((tag) => t.tags.includes(tag)));
  }

  // Filter by query
  if (query) {
    const q = query.toLowerCase();
    tools = tools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    );
  }

  // Return at specified detail level
  return tools.map((t) => {
    switch (detail) {
      case "name":
        return { name: t.name };
      case "summary":
        return { name: t.name, tags: t.tags, description: t.description };
      case "full":
        return { name: t.name, tags: t.tags, description: t.description, inputSchema: t.inputSchema };
    }
  });
}

// =============================================================================
// Tool Executor
// =============================================================================

export class ToolExecutor {
  constructor(private readonly client: ApiClient) {}

  async execute(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case "search_tools":
        return this.searchToolsHandler(args);
      case "search":
        return this.search(args);
      case "ask_question":
        return this.askQuestion(args);
      case "get_document":
        return this.getDocument(args);
      case "list_documents":
        return this.listDocuments(args);
      case "list_collections":
        return this.listCollections(args);
      case "upload_document":
        return this.uploadDocument(args);
      case "time_travel_query":
        return this.timeTravelQuery(args);
      case "time_travel_diff":
        return this.timeTravelDiff(args);
      case "list_snapshots":
        return this.listSnapshots(args);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private searchToolsHandler(args: Record<string, unknown>) {
    const validated = searchToolsSchema.parse(args);
    return searchTools(validated.query, validated.tags, validated.detail);
  }

  private async search(args: Record<string, unknown>) {
    const validated = searchSchema.parse(args);

    // Handle cursor-based pagination
    let offset = 0;
    if (validated.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(validated.cursor, "base64").toString());
        offset = decoded.offset || 0;
      } catch {
        // Invalid cursor, start from beginning
      }
    }

    const response = await this.client.post<SearchResponse>("/api/v1/search", {
      query: validated.query,
      collection_ids: validated.collection_ids,
      top_k: validated.top_k + offset,
      enable_reranking: validated.rerank,
    });

    // Slice results based on offset
    if (offset > 0) {
      response.results = response.results.slice(offset);
    }

    return toSlimSearchResponse(response, validated.query, offset);
  }

  private async askQuestion(args: Record<string, unknown>) {
    const validated = askQuestionSchema.parse(args);

    const response = await this.client.post<ChatCompletionResponse>(
      "/api/v1/chat/completions",
      {
        messages: [{ role: "user", content: validated.question }],
        collection_ids: validated.collection_ids,
        model: validated.model,
      }
    );

    return toSlimChatResponse(response);
  }

  private async getDocument(args: Record<string, unknown>) {
    const validated = getDocumentSchema.parse(args);

    if (validated.include_content) {
      return this.client.get<DocumentContent>(
        `/api/v1/documents/${validated.document_id}`,
        { include_content: true }
      );
    }

    return this.client.get<Document>(`/api/v1/documents/${validated.document_id}`);
  }

  private async listDocuments(args: Record<string, unknown>) {
    const validated = listDocumentsSchema.parse(args);

    const response = await this.client.get<ListDocumentsResponse>("/api/v1/documents", {
      collection_id: validated.collection_id,
      status: validated.status,
      search: validated.search,
      limit: validated.limit,
      cursor: validated.cursor,
    });

    return toSlimListDocumentsResponse(response);
  }

  private async listCollections(args: Record<string, unknown>) {
    const validated = listCollectionsSchema.parse(args);

    const response = await this.client.get<ListCollectionsResponse>("/api/v1/collections", {
      limit: validated.limit,
      cursor: validated.cursor,
    });

    return toSlimListCollectionsResponse(response);
  }

  private async uploadDocument(args: Record<string, unknown>) {
    const validated = uploadDocumentSchema.parse(args);

    const response = await this.client.post<Document>("/api/v1/documents", {
      title: validated.title,
      content: validated.content,
      content_type: validated.content_type,
      collection_id: validated.collection_id,
      metadata: validated.metadata,
    });

    return {
      id: response.id,
      title: response.title,
      status: response.status,
      message: `Document created. Processing shortly.`,
    };
  }

  private async timeTravelQuery(args: Record<string, unknown>) {
    const validated = timeTravelQuerySchema.parse(args);

    const response = await this.client.post<TimeTravelQueryResponse>(
      "/api/v1/time-travel/query",
      {
        table_name: validated.table_name,
        namespace: validated.namespace,
        snapshot_id: validated.snapshot_id,
        as_of_timestamp: validated.as_of_timestamp,
        columns: validated.columns,
        where: validated.where,
        limit: validated.limit,
      }
    );

    return toSlimTimeTravelQueryResponse(response);
  }

  private async timeTravelDiff(args: Record<string, unknown>) {
    const validated = timeTravelDiffSchema.parse(args);

    return this.client.post<TimeTravelDiffResponse>("/api/v1/time-travel/diff", {
      table_name: validated.table_name,
      namespace: validated.namespace,
      from_snapshot_id: validated.from_snapshot_id,
      to_snapshot_id: validated.to_snapshot_id,
    });
  }

  private async listSnapshots(args: Record<string, unknown>) {
    const validated = listSnapshotsSchema.parse(args);

    const response = await this.client.get<ListSnapshotsResponse>(
      "/api/v1/time-travel/snapshots",
      {
        table_name: validated.table_name,
        namespace: validated.namespace,
        limit: validated.limit,
      }
    );

    return toSlimListSnapshotsResponse(response);
  }
}
