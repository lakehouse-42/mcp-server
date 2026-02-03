/**
 * Type definitions for the Lakehouse42 MCP Server.
 */

// =============================================================================
// Configuration Types
// =============================================================================

export interface ServerConfig {
  apiKey: string;
  baseUrl: string;
  timeout?: number;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface ApiResponse<T> {
  data: T;
  meta?: {
    request_id: string;
    timestamp: string;
  };
}

export interface ApiError {
  error: {
    type: string;
    message: string;
    code: string;
  };
}

// =============================================================================
// Document Types
// =============================================================================

export interface Document {
  id: string;
  title: string;
  content_type: string;
  status: string;
  chunk_count: number;
  word_count: number | null;
  collection_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ListDocumentsResponse {
  documents: Document[];
  has_more: boolean;
  next_cursor: string | null;
  total_count: number;
}

export interface DocumentContent {
  id: string;
  title: string;
  content: string;
  content_type: string;
  chunks: DocumentChunk[];
  metadata: Record<string, unknown>;
}

export interface DocumentChunk {
  id: string;
  content: string;
  position: number;
  page_number?: number;
  section_title?: string;
}

// =============================================================================
// Collection Types
// =============================================================================

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  is_default: boolean;
  document_count: number;
  retrieval_config: RetrievalConfig | null;
  metadata_schema: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface RetrievalConfig {
  default_weights?: {
    dense: number;
    sparse: number;
    bm25: number;
  };
  reranking_enabled?: boolean;
  top_k?: {
    initial: number;
    after_fusion: number;
    final: number;
  };
}

export interface ListCollectionsResponse {
  collections: Collection[];
  has_more: boolean;
  next_cursor: string | null;
}

// =============================================================================
// Search Types
// =============================================================================

export interface SearchResult {
  chunk_id: string;
  document_id: string;
  document_name: string;
  content: string;
  score: number;
  page_number?: number;
  section_title?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchResponse {
  results: SearchResult[];
  query_type: string;
  weights_used: {
    dense: number;
    sparse: number;
    bm25: number;
  };
  total_results: number;
  latency_ms: number;
}

// =============================================================================
// Chat/RAG Types
// =============================================================================

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  sources?: SearchResult[];
}

// =============================================================================
// Time-Travel Types
// =============================================================================

export interface Snapshot {
  snapshot_id: string;
  parent_id: string | null;
  operation: string;
  committed_at: string;
  summary: Record<string, string>;
  manifest_list: string;
}

export interface ListSnapshotsResponse {
  snapshots: Snapshot[];
  table_name: string;
  namespace: string;
  total: number;
}

export interface TimeTravelQueryResponse {
  rows: Record<string, unknown>[];
  columns: string[];
  row_count: number;
  table_name: string;
  snapshot_id: string | null;
  as_of_timestamp: string | null;
  latency_ms: number;
}

export interface TimeTravelDiffResponse {
  added_rows: number;
  deleted_rows: number;
  changed_rows: number;
  schema_changes: Array<{
    field: string;
    change: string;
  }>;
  changed_files: number;
  table_name: string;
  from_snapshot_id: string;
  to_snapshot_id: string;
  details: Record<string, unknown>[];
}

// =============================================================================
// Upload Types
// =============================================================================

export interface UploadDocumentResponse {
  id: string;
  title: string;
  content_type: string;
  status: string;
  message: string;
}

// =============================================================================
// Slim Response Types (Context Window Optimization)
// =============================================================================

/**
 * Slim search result with truncated content for MCP responses.
 */
export interface SlimSearchResult {
  document_id: string;
  title: string;
  snippet: string; // Truncated to 200 chars
  score: number; // Rounded to 2 decimals
}

/**
 * Optimized search response for MCP.
 */
export interface SlimSearchResponse {
  query: string;
  total: number;
  results: SlimSearchResult[];
  has_more: boolean;
}

/**
 * Optimized chat response for MCP.
 */
export interface SlimChatResponse {
  answer: string;
  sources_used: number;
  model: string;
}

/**
 * Minimal document info for MCP listings.
 */
export interface SlimDocument {
  id: string;
  title: string;
  status: string;
  chunk_count: number;
}

/**
 * Optimized document list response for MCP.
 */
export interface SlimListDocumentsResponse {
  total: number;
  documents: SlimDocument[];
  has_more: boolean;
}

/**
 * Minimal collection info for MCP listings.
 */
export interface SlimCollection {
  id: string;
  name: string;
  document_count: number;
}

/**
 * Optimized collection list response for MCP.
 */
export interface SlimListCollectionsResponse {
  total: number;
  collections: SlimCollection[];
  has_more: boolean;
}

/**
 * Optimized time-travel query response for MCP.
 */
export interface SlimTimeTravelQueryResponse {
  table_name: string;
  row_count: number;
  columns: string[];
  sample_rows: Record<string, unknown>[]; // Max 3 rows
  truncated: boolean;
  snapshot_id: string | null;
}

/**
 * Minimal snapshot info for MCP listings.
 */
export interface SlimSnapshot {
  snapshot_id: string;
  operation: string;
  committed_at: string;
}

/**
 * Optimized snapshot list response for MCP.
 */
export interface SlimListSnapshotsResponse {
  table_name: string;
  total: number;
  snapshots: SlimSnapshot[];
  has_more: boolean;
}
