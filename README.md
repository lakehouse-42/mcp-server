# @lakehouse42/mcp-server

[Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for Lakehouse42.

## Features

- **Code-First Pattern** - On-demand tool discovery (~98% token reduction)
- **Tool Tagging** - Filter tools by category (read/write/admin/search/time-travel)
- **Cursor Pagination** - Efficient browsing of large result sets
- **Streamable HTTP** - Scalable deployment with session recovery
- **Optimized Responses** - Compact JSON, truncated snippets, sample rows

## Quick Start

```bash
LAKEHOUSE42_API_KEY=lh_xxx npx @lakehouse42/mcp-server
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "lakehouse42": {
      "command": "npx",
      "args": ["@lakehouse42/mcp-server"],
      "env": {
        "LAKEHOUSE42_API_KEY": "lh_your_api_key"
      }
    }
  }
}
```

## Environment Variables

| Variable | Required | Default |
|----------|----------|---------|
| `LAKEHOUSE42_API_KEY` | Yes | - |
| `LAKEHOUSE42_BASE_URL` | No | `https://api.lakehouse42.com` |

## Tools

### search_tools

Discover tools on-demand (code-first pattern).

```json
{ "tags": ["search"], "detail": "summary" }
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Search term |
| `tags` | string[] | `read`, `write`, `admin`, `search`, `time-travel` |
| `detail` | string | `name` (10 tokens), `summary` (50), `full` (150) |

### search

Hybrid search with cursor pagination.

```json
{ "query": "revenue report", "top_k": 10 }
```

Returns: 5 results max, 200-char snippets, `next_cursor` for pagination.

### ask_question

RAG-powered Q&A.

```json
{ "question": "What is our refund policy?" }
```

Returns: answer + source count.

### get_document / list_documents / list_collections

Document and collection management with cursor pagination.

### upload_document

Upload text documents (auto-chunked and indexed).

### time_travel_query / time_travel_diff / list_snapshots

Iceberg time-travel queries. Returns row count + 3 sample rows.

## HTTP Transport

For web deployments:

```typescript
import { HttpTransport, ToolExecutor, ApiClient } from '@lakehouse42/mcp-server';

const client = new ApiClient({ apiKey: 'lh_xxx', baseUrl: 'https://api.lakehouse42.com' });
const transport = new HttpTransport({ toolExecutor: new ToolExecutor(client) });

http.createServer((req, res) => transport.handleRequest(req, res)).listen(3000);
```

**Features:**
- Session management (`Mcp-Session-Id` header)
- SSE streaming (`Accept: text/event-stream`)
- Disconnect recovery (`Last-Event-ID`)

**Endpoints:**
- `POST /mcp` - JSON-RPC requests
- `GET /mcp` - SSE stream
- `DELETE /mcp` - Close session
- `GET /health` - Health check

## Programmatic Usage

```typescript
import { createServer, searchTools, TAGGED_TOOLS } from '@lakehouse42/mcp-server';

// Stdio server
const server = createServer({ apiKey: 'lh_xxx' });
await server.start();

// Tool discovery
const readTools = searchTools(undefined, ['read'], 'name');
// → [{ name: 'search' }, { name: 'ask_question' }, ...]
```

## Response Optimization

| Tool | Optimization |
|------|--------------|
| search | 5 results, 200-char snippets |
| list_documents | 10 docs, essential fields |
| time_travel_query | 3 sample rows + count |

All responses use compact JSON (no pretty-printing).

## License

MIT
