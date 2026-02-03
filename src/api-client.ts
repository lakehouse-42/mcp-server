/**
 * HTTP client for communicating with the Lakehouse42 REST API.
 */

import type { ServerConfig, ApiResponse, ApiError } from "./types.js";

export class ApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(config: ServerConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.timeout = config.timeout ?? 30000;
  }

  /**
   * Make an authenticated request to the Lakehouse42 API.
   */
  async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      params?: Record<string, string | number | boolean | undefined>;
    }
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    // Add query parameters
    if (options?.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        const error = data as ApiError;
        throw new Error(
          error.error?.message ||
            `API request failed with status ${response.status}`
        );
      }

      // Handle wrapped API responses
      if (data !== null && typeof data === "object" && "data" in data) {
        return (data as ApiResponse<T>).data;
      }

      return data as T;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new Error(`Request timeout after ${this.timeout}ms`);
        }
        throw error;
      }
      throw new Error("Unknown error occurred");
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * GET request helper.
   */
  async get<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    return this.request<T>("GET", path, { params });
  }

  /**
   * POST request helper.
   */
  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, { body });
  }

  /**
   * PUT request helper.
   */
  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, { body });
  }

  /**
   * DELETE request helper.
   */
  async delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }
}
