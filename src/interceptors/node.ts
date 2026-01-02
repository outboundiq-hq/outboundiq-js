/**
 * Node.js HTTP/HTTPS interceptor
 * 
 * This patches the native http and https modules to intercept ALL outbound requests,
 * regardless of which HTTP client library is used (axios, got, node-fetch, etc.)
 */

import { getClient } from '../client/OutboundIQClient';
import { sanitizeHeaders, safeStringify, getByteSize } from '../utils/helpers';
import type { UserContext } from '../types';
import type { ClientRequest, IncomingMessage, RequestOptions } from 'http';
import { createRequire } from 'module';

// Create a require function for ESM compatibility
const require = createRequire(import.meta.url);

// We need to use require to patch the modules (ESM imports are immutable)
const http = require('http') as typeof import('http');
const https = require('https') as typeof import('https');

// Store original functions
const originalHttpRequest = http.request;
const originalHttpsRequest = https.request;
const originalHttpGet = http.get;
const originalHttpsGet = https.get;

// Track if we've already patched
let isPatched = false;

// User context resolver function
let userContextResolver: (() => UserContext | null) | null = null;

/**
 * Set the user context resolver function
 * This is called for each request to get the current user context
 */
export function setUserContextResolver(resolver: () => UserContext | null): void {
  userContextResolver = resolver;
}

/**
 * Build full URL from request options
 */
function buildUrl(
  options: RequestOptions | string | URL,
  protocol: 'http:' | 'https:'
): string {
  if (typeof options === 'string') {
    return options;
  }

  if (options instanceof URL) {
    return options.toString();
  }

  const host = options.hostname || options.host || 'localhost';
  const port = options.port;
  const path = options.path || '/';
  
  let url = `${protocol}//${host}`;
  if (port && port !== 80 && port !== 443) {
    url += `:${port}`;
  }
  url += path;

  return url;
}

type RequestFn = typeof http.request;
type GetFn = typeof http.get;

/**
 * Wrap an HTTP request to track it
 */
function wrapRequest(
  originalFn: RequestFn,
  protocol: 'http:' | 'https:'
): RequestFn {
  return function wrappedRequest(
    this: unknown,
    urlOrOptions: string | URL | RequestOptions,
    optionsOrCallback?: RequestOptions | ((res: IncomingMessage) => void),
    maybeCallback?: (res: IncomingMessage) => void
  ): ClientRequest {
    const startTime = performance.now();

    // Parse arguments (Node.js http.request has multiple signatures)
    let options: RequestOptions;
    let url: string;

    if (typeof urlOrOptions === 'string' || urlOrOptions instanceof URL) {
      url = urlOrOptions.toString();
      if (typeof optionsOrCallback === 'function') {
        options = {};
      } else {
        options = optionsOrCallback || {};
      }
    } else {
      options = urlOrOptions;
      url = buildUrl(options, protocol);
    }

    const method = (options.method || 'GET').toUpperCase();

    // Skip tracking OutboundIQ calls (don't track our own metrics sending)
    if (url.includes('outboundiq.dev') || url.includes('outboundiq.io') || url.includes('outboundiq.test') || url.includes('outboundiq.com')) {
      return originalFn.apply(this, [urlOrOptions, optionsOrCallback, maybeCallback] as any) as ClientRequest;
    }

    // Get user context
    const userContext = userContextResolver?.() ?? null;

    // Collect request body
    let requestBody = '';
    
    // Create the actual request using the original function
    const req = originalFn.apply(
      this,
      [urlOrOptions, optionsOrCallback, maybeCallback] as any
    ) as ClientRequest;

    // Intercept write to capture request body
    const originalWrite = req.write.bind(req);
    req.write = function(
      chunk: string | Buffer,
      encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
      maybeCallback?: (error?: Error | null) => void
    ): boolean {
      if (chunk) {
        requestBody += chunk.toString().substring(0, 5000); // Limit body capture
      }
      return originalWrite(chunk, encodingOrCallback as BufferEncoding, maybeCallback);
    };

    // Handle response
    req.on('response', (res: IncomingMessage) => {
      const duration = performance.now() - startTime;
      let responseBody = '';

      // Capture response body
      res.on('data', (chunk: Buffer) => {
        if (responseBody.length < 5000) {
          responseBody += chunk.toString();
        }
      });

      res.on('end', () => {
        const client = getClient();
        if (client) {
          client.track({
            method,
            url,
            statusCode: res.statusCode || 0,
            duration,
            requestHeaders: sanitizeHeaders(options.headers as Record<string, string>),
            responseHeaders: sanitizeHeaders(res.headers as Record<string, string>),
            requestBody: safeStringify(requestBody),
            responseBody: safeStringify(responseBody),
            requestSize: getByteSize(requestBody),
            responseSize: getByteSize(responseBody),
            userContext,
          });
        }
      });
    });

    // Handle errors
    req.on('error', (error: Error) => {
      const duration = performance.now() - startTime;
      const client = getClient();
      if (client) {
        client.track({
          method,
          url,
          statusCode: 0,
          duration,
          requestHeaders: sanitizeHeaders(options.headers as Record<string, string>),
          requestBody: safeStringify(requestBody),
          error: error.message,
          userContext,
        });
      }
    });

    return req;
  } as RequestFn;
}

/**
 * Wrap http.get / https.get
 */
function wrapGet(
  _originalFn: GetFn,
  wrappedRequest: RequestFn
): GetFn {
  return function wrappedGet(
    this: unknown,
    urlOrOptions: string | URL | RequestOptions,
    optionsOrCallback?: RequestOptions | ((res: IncomingMessage) => void),
    maybeCallback?: (res: IncomingMessage) => void
  ): ClientRequest {
    const req = wrappedRequest.apply(
      this,
      [urlOrOptions, optionsOrCallback, maybeCallback] as any
    );
    req.end();
    return req;
  } as GetFn;
}

/**
 * Patch Node.js http and https modules
 */
export function patchNodeHttp(): void {
  if (isPatched) {
    console.warn('[OutboundIQ] Node.js HTTP already patched');
    return;
  }

  // Patch http
  const wrappedHttpRequest = wrapRequest(originalHttpRequest, 'http:');
  http.request = wrappedHttpRequest;
  http.get = wrapGet(originalHttpGet, wrappedHttpRequest);

  // Patch https
  const wrappedHttpsRequest = wrapRequest(originalHttpsRequest, 'https:');
  https.request = wrappedHttpsRequest;
  https.get = wrapGet(originalHttpsGet, wrappedHttpsRequest);

  isPatched = true;
  console.log('[OutboundIQ] Node.js HTTP/HTTPS patched');
}

/**
 * Restore original http and https modules
 */
export function unpatchNodeHttp(): void {
  if (!isPatched) return;

  http.request = originalHttpRequest;
  http.get = originalHttpGet;
  https.request = originalHttpsRequest;
  https.get = originalHttpsGet;

  isPatched = false;
  console.log('[OutboundIQ] Node.js HTTP/HTTPS restored');
}
