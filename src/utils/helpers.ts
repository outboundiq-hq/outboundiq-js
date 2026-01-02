import { SENSITIVE_HEADERS } from '../types';

/**
 * Generate a unique ID for tracking
 */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Sanitize headers by redacting sensitive values
 */
export function sanitizeHeaders(
  headers: Headers | Record<string, string> | null | undefined
): Record<string, string> {
  if (!headers) return {};

  const result: Record<string, string> = {};
  const entries = headers instanceof Headers 
    ? Array.from(headers.entries())
    : Object.entries(headers);

  for (const [key, value] of entries) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_HEADERS.some(h => lowerKey.includes(h))) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Safely stringify a body for logging
 */
export function safeStringify(body: unknown, maxLength = 10000): string | null {
  if (body === null || body === undefined) return null;
  
  try {
    if (typeof body === 'string') {
      return body.length > maxLength ? body.substring(0, maxLength) + '...[truncated]' : body;
    }
    
    if (body instanceof ArrayBuffer || body instanceof Uint8Array) {
      return `[Binary data: ${body.byteLength} bytes]`;
    }
    
    if (typeof body === 'object') {
      const str = JSON.stringify(body);
      return str.length > maxLength ? str.substring(0, maxLength) + '...[truncated]' : str;
    }
    
    return String(body);
  } catch {
    return '[Unable to serialize body]';
  }
}

/**
 * Check if a URL should be ignored
 */
export function shouldIgnore(url: string, patterns: (string | RegExp)[]): boolean {
  for (const pattern of patterns) {
    if (typeof pattern === 'string') {
      if (url.includes(pattern)) return true;
    } else if (pattern instanceof RegExp) {
      if (pattern.test(url)) return true;
    }
  }
  return false;
}

/**
 * Parse URL to extract host and path
 */
export function parseUrl(url: string | URL): { host: string; path: string; full: string } {
  try {
    const parsed = typeof url === 'string' ? new URL(url) : url;
    return {
      host: parsed.host,
      path: parsed.pathname + parsed.search,
      full: parsed.toString(),
    };
  } catch {
    return {
      host: 'unknown',
      path: String(url),
      full: String(url),
    };
  }
}

/**
 * Get current timestamp in ISO format
 */
export function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Calculate byte size of a string
 */
export function getByteSize(str: string | null | undefined): number {
  if (!str) return 0;
  return new TextEncoder().encode(str).length;
}

/**
 * Debug logger
 */
export function createLogger(debug: boolean) {
  return {
    log: (...args: unknown[]) => {
      if (debug) console.log('[OutboundIQ]', ...args);
    },
    warn: (...args: unknown[]) => {
      if (debug) console.warn('[OutboundIQ]', ...args);
    },
    error: (...args: unknown[]) => {
      // Always log errors
      console.error('[OutboundIQ]', ...args);
    },
  };
}

