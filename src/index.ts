/**
 * @outboundiq/core
 * 
 * Core JavaScript SDK for OutboundIQ - Track and monitor your outbound API calls
 * 
 * @example
 * ```typescript
 * import { init, track } from '@outboundiq/core';
 * 
 * // Initialize the client
 * init({
 *   apiKey: process.env.OUTBOUNDIQ_API_KEY!,
 *   projectId: process.env.OUTBOUNDIQ_PROJECT_ID!,
 * });
 * 
 * // Track an API call manually
 * track({
 *   method: 'POST',
 *   url: 'https://api.stripe.com/v1/charges',
 *   statusCode: 200,
 *   duration: 150,
 * });
 * ```
 */

// Client exports
export {
  OutboundIQClient,
  init,
  getClient,
  track,
  setUserContext,
  flush,
  shutdown,
  setNativeHttp,
} from './client/OutboundIQClient';

// Type exports
export type {
  OutboundIQConfig,
  UserContext,
  ApiCall,
  ApiBatch,
} from './types';

// Utility exports
export {
  sanitizeHeaders,
  safeStringify,
  shouldIgnore,
  parseUrl,
  generateId,
} from './utils/helpers';

// Interceptor exports (for advanced usage)
export { patchFetch, unpatchFetch, setFetchUserContextResolver } from './interceptors/fetch';

// API Intelligence exports
export {
  recommend,
  providerStatus,
  endpointStatus,
  type RecommendationResult,
  type ProviderStatusResult,
  type EndpointStatusResult,
  type IntelligenceOptions,
} from './intelligence';

