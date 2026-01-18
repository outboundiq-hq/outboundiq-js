import { O as OutboundIQConfig } from './fetch-C93DNU19.mjs';
export { A as ApiCall, a as OutboundIQClient, U as UserContext, f as flush, g as getClient, i as init, p as patchFetch, c as setFetchUserContextResolver, s as setUserContext, b as shutdown, t as track, u as unpatchFetch } from './fetch-C93DNU19.mjs';

/**
 * @outboundiq/core/edge
 *
 * Edge runtime entry point - for Vercel Edge, Cloudflare Workers, etc.
 *
 * Edge runtimes don't have Node.js http/https modules, so we only patch fetch.
 *
 * @example
 * ```typescript
 * import { init, register } from '@outboundiq/core/edge';
 *
 * // Initialize and start tracking
 * init({
 *   apiKey: process.env.OUTBOUNDIQ_KEY!,
 *   projectId: process.env.OUTBOUNDIQ_PROJECT_ID!,
 * });
 *
 * register();
 *
 * // Now all fetch requests are tracked
 * await fetch('https://api.stripe.com/v1/charges');
 * ```
 */

/**
 * Initialize OutboundIQ and patch fetch for Edge runtime
 */
declare function register(config?: OutboundIQConfig): void;
/**
 * Initialize from environment variables and register
 */
declare function registerFromEnv(): void;

export { OutboundIQConfig, register, registerFromEnv };
