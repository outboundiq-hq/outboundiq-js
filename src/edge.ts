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

// Re-export main client functionality
export {
  OutboundIQClient,
  init,
  getClient,
  track,
  setUserContext,
  flush,
  shutdown,
} from './client/OutboundIQClient';

// Type exports
export type {
  OutboundIQConfig,
  UserContext,
  ApiCall,
} from './types';

// Fetch interceptor
export { 
  patchFetch, 
  unpatchFetch,
  setFetchUserContextResolver,
} from './interceptors/fetch';

import { init as baseInit, type OutboundIQConfig } from './client/OutboundIQClient';
import { patchFetch } from './interceptors/fetch';

/**
 * Initialize OutboundIQ and patch fetch for Edge runtime
 */
export function register(config?: OutboundIQConfig): void {
  if (config) {
    baseInit(config);
  }
  
  patchFetch();
}

/**
 * Initialize from environment variables and register
 */
export function registerFromEnv(): void {
  const apiKey = process.env.OUTBOUNDIQ_KEY;
  const projectId = process.env.OUTBOUNDIQ_PROJECT_ID;
  
  if (!apiKey || !projectId) {
    console.warn('[OutboundIQ] Missing environment variables');
    return;
  }

  register({
    apiKey,
    projectId,
    endpoint: process.env.OUTBOUNDIQ_URL,
    debug: process.env.OUTBOUNDIQ_DEBUG === 'true',
  });
}

