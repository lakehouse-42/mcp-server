/**
 * MCP Resource definitions for Lakehouse42.
 *
 * Resources expose Lakehouse42 data through the MCP resource protocol,
 * allowing AI assistants to read documents, collections, and other data.
 */

import type { ApiClient } from "./api-client.js";
import type {
  Document,
  DocumentContent,
  Collection,
  ListDocumentsResponse,
  ListCollectionsResponse,
} from "./types.js";

// =============================================================================
// Resource Types
// =============================================================================

export interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface ResourceContent {
  uri: string;
  mimeType: string;
  text?: string;
  blob?: string;
}

// =============================================================================
// Resource Templates
// =============================================================================

export const RESOURCE_TEMPLATES = [
  {
    uriTemplate: "lakehouse://documents/{documentId}",
    name: "Document",
    description: "A document in the Lakehouse42 knowledge base",
    mimeType: "application/json",
  },
  {
    uriTemplate: "lakehouse://documents/{documentId}/content",
    name: "Document Content",
    description: "Full content of a document including all chunks",
    mimeType: "text/plain",
  },
  {
    uriTemplate: "lakehouse://collections/{collectionId}",
    name: "Collection",
    description: "A document collection with retrieval configuration",
    mimeType: "application/json",
  },
  {
    uriTemplate: "lakehouse://collections",
    name: "All Collections",
    description: "List of all document collections",
    mimeType: "application/json",
  },
  {
    uriTemplate: "lakehouse://documents",
    name: "Recent Documents",
    description: "List of recent documents in the knowledge base",
    mimeType: "application/json",
  },
];

// =============================================================================
// Resource Handler
// =============================================================================

export class ResourceHandler {
  constructor(private readonly client: ApiClient) {}

  /**
   * List available resources.
   */
  async listResources(): Promise<ResourceDefinition[]> {
    const resources: ResourceDefinition[] = [];

    try {
      // List recent documents
      const docsResponse = await this.client.get<ListDocumentsResponse>(
        "/api/v1/documents",
        { limit: 20 }
      );

      for (const doc of docsResponse.documents) {
        resources.push({
          uri: `lakehouse://documents/${doc.id}`,
          name: doc.title,
          description: `Document: ${doc.title} (${doc.status}, ${doc.chunk_count} chunks)`,
          mimeType: "application/json",
        });
      }

      // List collections
      const collectionsResponse = await this.client.get<ListCollectionsResponse>(
        "/api/v1/collections",
        { limit: 20 }
      );

      for (const collection of collectionsResponse.collections) {
        resources.push({
          uri: `lakehouse://collections/${collection.id}`,
          name: collection.name,
          description: `Collection: ${collection.name} (${collection.document_count} documents)`,
          mimeType: "application/json",
        });
      }

      // Add aggregate resources
      resources.push({
        uri: "lakehouse://documents",
        name: "All Documents",
        description: "List of all documents in the knowledge base",
        mimeType: "application/json",
      });

      resources.push({
        uri: "lakehouse://collections",
        name: "All Collections",
        description: "List of all document collections",
        mimeType: "application/json",
      });
    } catch (error) {
      // Return empty list if API is unavailable
      console.error("Failed to list resources:", error);
    }

    return resources;
  }

  /**
   * Read a resource by URI.
   */
  async readResource(uri: string): Promise<ResourceContent> {
    const parsedUri = this.parseUri(uri);

    switch (parsedUri.type) {
      case "document":
        return this.readDocument(parsedUri.id, parsedUri.includeContent);
      case "collection":
        return this.readCollection(parsedUri.id);
      case "documents-list":
        return this.readDocumentsList();
      case "collections-list":
        return this.readCollectionsList();
      default:
        throw new Error(`Unknown resource URI: ${uri}`);
    }
  }

  private parseUri(uri: string): {
    type: "document" | "collection" | "documents-list" | "collections-list";
    id?: string;
    includeContent?: boolean;
  } {
    // lakehouse://documents
    if (uri === "lakehouse://documents") {
      return { type: "documents-list" };
    }

    // lakehouse://collections
    if (uri === "lakehouse://collections") {
      return { type: "collections-list" };
    }

    // lakehouse://documents/{id}/content
    const docContentMatch = uri.match(
      /^lakehouse:\/\/documents\/([^/]+)\/content$/
    );
    if (docContentMatch) {
      return { type: "document", id: docContentMatch[1], includeContent: true };
    }

    // lakehouse://documents/{id}
    const docMatch = uri.match(/^lakehouse:\/\/documents\/([^/]+)$/);
    if (docMatch) {
      return { type: "document", id: docMatch[1] };
    }

    // lakehouse://collections/{id}
    const collectionMatch = uri.match(/^lakehouse:\/\/collections\/([^/]+)$/);
    if (collectionMatch) {
      return { type: "collection", id: collectionMatch[1] };
    }

    throw new Error(`Invalid resource URI format: ${uri}`);
  }

  private async readDocument(
    id: string | undefined,
    includeContent?: boolean
  ): Promise<ResourceContent> {
    if (!id) {
      throw new Error("Document ID is required");
    }

    if (includeContent) {
      const doc = await this.client.get<DocumentContent>(
        `/api/v1/documents/${id}`,
        { include_content: true }
      );

      return {
        uri: `lakehouse://documents/${id}/content`,
        mimeType: doc.content_type || "text/plain",
        text: doc.content,
      };
    }

    const doc = await this.client.get<Document>(`/api/v1/documents/${id}`);

    return {
      uri: `lakehouse://documents/${id}`,
      mimeType: "application/json",
      text: JSON.stringify(doc, null, 2),
    };
  }

  private async readCollection(id: string | undefined): Promise<ResourceContent> {
    if (!id) {
      throw new Error("Collection ID is required");
    }

    const collection = await this.client.get<Collection>(
      `/api/v1/collections/${id}`
    );

    return {
      uri: `lakehouse://collections/${id}`,
      mimeType: "application/json",
      text: JSON.stringify(collection, null, 2),
    };
  }

  private async readDocumentsList(): Promise<ResourceContent> {
    const response = await this.client.get<ListDocumentsResponse>(
      "/api/v1/documents",
      { limit: 100 }
    );

    return {
      uri: "lakehouse://documents",
      mimeType: "application/json",
      text: JSON.stringify(response, null, 2),
    };
  }

  private async readCollectionsList(): Promise<ResourceContent> {
    const response = await this.client.get<ListCollectionsResponse>(
      "/api/v1/collections",
      { limit: 100 }
    );

    return {
      uri: "lakehouse://collections",
      mimeType: "application/json",
      text: JSON.stringify(response, null, 2),
    };
  }
}
