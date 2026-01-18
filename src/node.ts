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

// CRITICAL: Import http/https BEFORE patching to capture the original modules
// This import happens at module load time, before any patching can occur
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const originalHttpModule = require('http');
const originalHttpsModule = require('https');

// Re-export everything from main
export * from './index';

// Node-specific exports
export { 
  patchNodeHttp, 
  unpatchNodeHttp,
  setUserContextResolver,
} from './interceptors/node';

import { init as baseInit, setNativeHttp, type OutboundIQConfig } from './client/OutboundIQClient';
import { patchNodeHttp } from './interceptors/node';
import { patchFetch } from './interceptors/fetch';

// Set the native http/https modules BEFORE any patching
// This ensures the SDK can send metrics using the unpatched modules
setNativeHttp(originalHttpModule, originalHttpsModule);

/**
 * Initialize OutboundIQ and patch all HTTP methods
 * This is the main entry point for Node.js applications
 */
export function register(config?: OutboundIQConfig): void {
  if (config) {
    baseInit(config);
  }
  
  // Patch both native http/https and fetch
  patchNodeHttp();
  patchFetch();
}

/**
 * Initialize from environment variables and register
 * Convenience function for minimal setup
 */
export function registerFromEnv(): void {
  const apiKey = process.env.OUTBOUNDIQ_KEY;
  const projectId = process.env.OUTBOUNDIQ_PROJECT_ID;
  
  if (!apiKey || !projectId) {
    console.warn('[OutboundIQ] Missing OUTBOUNDIQ_KEY or OUTBOUNDIQ_PROJECT_ID environment variables');
    return;
  }

  register({
    apiKey,
    projectId,
    endpoint: process.env.OUTBOUNDIQ_ENDPOINT,
    debug: process.env.OUTBOUNDIQ_DEBUG === 'true',
  });
}

