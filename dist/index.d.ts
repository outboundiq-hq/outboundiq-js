export { e as ApiBatch, A as ApiCall, a as OutboundIQClient, O as OutboundIQConfig, U as UserContext, f as flush, g as getClient, i as init, p as patchFetch, c as setFetchUserContextResolver, d as setNativeHttp, s as setUserContext, b as shutdown, t as track, u as unpatchFetch } from './fetch-BA_mzj92.js';

/**
 * Generate a unique ID for tracking
 */
declare function generateId(): string;
/**
 * Sanitize headers by redacting sensitive values
 */
declare function sanitizeHeaders(headers: Headers | Record<string, string> | null | undefined): Record<string, string>;
/**
 * Safely stringify a body for logging
 */
declare function safeStringify(body: unknown, maxLength?: number): string | null;
/**
 * Check if a URL should be ignored
 */
declare function shouldIgnore(url: string, patterns: (string | RegExp)[]): boolean;
/**
 * Parse URL to extract host and path
 */
declare function parseUrl(url: string | URL): {
    host: string;
    path: string;
    full: string;
};

export { generateId, parseUrl, safeStringify, sanitizeHeaders, shouldIgnore };
