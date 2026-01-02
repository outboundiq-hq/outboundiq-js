/**
 * Fetch interceptor for Edge runtime and modern Node.js
 * 
 * This patches the global fetch function to intercept outbound requests.
 * Works in Edge Runtime (Vercel, Cloudflare Workers) and Node.js 18+.
 */

import { getClient } from '../client/OutboundIQClient';
import { sanitizeHeaders, safeStringify, getByteSize } from '../utils/helpers';
import type { UserContext } from '../types';

// Store original fetch
let originalFetch: typeof fetch | null = null;
let isPatched = false;

// User context resolver function
let userContextResolver: (() => UserContext | null) | null = null;

/**
 * Set the user context resolver function
 */
export function setFetchUserContextResolver(resolver: () => UserContext | null): void {
  userContextResolver = resolver;
}

/**
 * Extract headers from Request or RequestInit
 */
function extractRequestHeaders(
  input: RequestInfo | URL,
  init?: RequestInit
): Record<string, string> {
  const headers: Record<string, string> = {};

  // From init.headers
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(init.headers)) {
      init.headers.forEach(([key, value]) => {
        headers[key] = value;
      });
    } else {
      Object.assign(headers, init.headers);
    }
  }

  // From Request object
  if (input instanceof Request) {
    input.headers.forEach((value, key) => {
      if (!headers[key]) {
        headers[key] = value;
      }
    });
  }

  return headers;
}

/**
 * Get URL from fetch input
 */
function getUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  if (input instanceof Request) {
    return input.url;
  }
  return String(input);
}

/**
 * Get method from fetch input
 */
function getMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) {
    return init.method.toUpperCase();
  }
  if (input instanceof Request) {
    return input.method.toUpperCase();
  }
  return 'GET';
}

/**
 * Safely read body from Request or RequestInit
 */
async function getRequestBody(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<string | null> {
  try {
    if (init?.body) {
      if (typeof init.body === 'string') {
        return init.body.substring(0, 5000);
      }
      if (init.body instanceof FormData) {
        return '[FormData]';
      }
      if (init.body instanceof URLSearchParams) {
        return init.body.toString().substring(0, 5000);
      }
      if (init.body instanceof ArrayBuffer || init.body instanceof Uint8Array) {
        return `[Binary: ${init.body.byteLength} bytes]`;
      }
      return '[Body Stream]';
    }

    if (input instanceof Request && input.body) {
      // Can't read body without consuming it
      return '[Request Body]';
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Safely read response body
 */
async function getResponseBody(response: Response): Promise<string | null> {
  try {
    // Clone to not consume the original
    const clone = response.clone();
    const text = await clone.text();
    return text.substring(0, 5000);
  } catch {
    return null;
  }
}

/**
 * Patch global fetch
 */
export function patchFetch(): void {
  if (isPatched || typeof globalThis.fetch !== 'function') {
    return;
  }

  originalFetch = globalThis.fetch;

  globalThis.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const startTime = performance.now();
    const url = getUrl(input);
    const method = getMethod(input, init);

    // Skip tracking OutboundIQ calls (don't track our own metrics sending)
    if (url.includes('outboundiq.dev') || url.includes('outboundiq.io') || url.includes('outboundiq.test') || url.includes('outboundiq.com')) {
      return originalFetch!(input, init);
    }

    // Get user context before the request
    const userContext = userContextResolver?.() ?? null;
    const requestHeaders = extractRequestHeaders(input, init);
    const requestBody = await getRequestBody(input, init);

    let response: Response;
    let error: Error | null = null;

    try {
      response = await originalFetch!(input, init);
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
      
      // Track failed request
      const client = getClient();
      if (client) {
        client.track({
          method,
          url,
          statusCode: 0,
          duration: performance.now() - startTime,
          requestHeaders: sanitizeHeaders(requestHeaders),
          requestBody: safeStringify(requestBody),
          error: error.message,
          userContext,
        });
      }

      throw err;
    }

    // Track successful request (fire and forget)
    const duration = performance.now() - startTime;
    
    // Don't await - track in background
    (async () => {
      try {
        const responseBody = await getResponseBody(response);
        const client = getClient();
        if (client) {
          client.track({
            method,
            url,
            statusCode: response.status,
            duration,
            requestHeaders: sanitizeHeaders(requestHeaders),
            responseHeaders: sanitizeHeaders(Object.fromEntries(response.headers.entries())),
            requestBody: safeStringify(requestBody),
            responseBody: safeStringify(responseBody),
            requestSize: getByteSize(requestBody),
            responseSize: getByteSize(responseBody),
            userContext,
          });
        }
      } catch {
        // Silently fail - never break user's app
      }
    })();

    return response;
  };

  isPatched = true;
  console.log('[OutboundIQ] Fetch patched');
}

/**
 * Restore original fetch
 */
export function unpatchFetch(): void {
  if (!isPatched || !originalFetch) {
    return;
  }

  globalThis.fetch = originalFetch;
  originalFetch = null;
  isPatched = false;
  console.log('[OutboundIQ] Fetch restored');
}

/**
 * Check if fetch is patched
 */
export function isFetchPatched(): boolean {
  return isPatched;
}

