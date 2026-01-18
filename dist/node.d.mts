import { U as UserContext, O as OutboundIQConfig } from './fetch-C93DNU19.mjs';
export { e as ApiBatch, A as ApiCall, a as OutboundIQClient, f as flush, g as getClient, i as init, p as patchFetch, c as setFetchUserContextResolver, d as setNativeHttp, s as setUserContext, b as shutdown, t as track, u as unpatchFetch } from './fetch-C93DNU19.mjs';
export { EndpointStatusResult, IntelligenceOptions, ProviderStatusResult, RecommendationResult, endpointStatus, generateId, parseUrl, providerStatus, recommend, safeStringify, sanitizeHeaders, shouldIgnore } from './index.mjs';

/**
 * Node.js HTTP/HTTPS interceptor
 *
 * This patches the native http and https modules to intercept ALL outbound requests,
 * regardless of which HTTP client library is used (axios, got, node-fetch, etc.)
 */

/**
 * Set the user context resolver function
 * This is called for each request to get the current user context
 */
declare function setUserContextResolver(resolver: () => UserContext | null): void;
/**
 * Patch Node.js http and https modules
 */
declare function patchNodeHttp(): void;
/**
 * Restore original http and https modules
 */
declare function unpatchNodeHttp(): void;

/**
 * @outboundiq/core/node
 *
 * Node.js entry point - includes HTTP/HTTPS patching for axios, got, etc.
 *
 * @example
 * ```typescript
 * import { init, register } from '@outboundiq/core/node';
 *
 * // Initialize and start tracking
 * init({
 *   apiKey: process.env.OUTBOUNDIQ_KEY!,
 *   projectId: process.env.OUTBOUNDIQ_PROJECT_ID!,
 * });
 *
 * // Patch http/https to track all requests
 * register();
 *
 * // Now all HTTP requests are automatically tracked:
 * await axios.get('https://api.stripe.com/v1/charges');
 * await got('https://api.twilio.com/messages');
 * await fetch('https://api.sendgrid.com/mail');
 * ```
 */

/**
 * Initialize OutboundIQ and patch all HTTP methods
 * This is the main entry point for Node.js applications
 */
declare function register(config?: OutboundIQConfig): void;
/**
 * Initialize from environment variables and register
 * Convenience function for minimal setup
 */
declare function registerFromEnv(): void;

export { OutboundIQConfig, UserContext, patchNodeHttp, register, registerFromEnv, setUserContextResolver, unpatchNodeHttp };
