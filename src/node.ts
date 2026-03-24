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
import { getClient, shutdown } from './client/OutboundIQClient';

// Set the native http/https modules BEFORE any patching
// This ensures the SDK can send metrics using the unpatched modules
setNativeHttp(originalHttpModule, originalHttpsModule);

let processHooksRegistered = false;

function registerProcessHooks(): void {
  if (processHooksRegistered || typeof process === 'undefined') {
    return;
  }

  process.once('beforeExit', () => {
    const client = getClient();
    if (client && client.getPendingCount() > 0) {
      void shutdown();
    }
  });

  // Graceful shutdown on termination signals.
  const shutdownOnSignal = () => {
    const client = getClient();
    if (!client || client.getPendingCount() === 0) {
      return;
    }

    void shutdown();
  };

  process.once('SIGINT', shutdownOnSignal);
  process.once('SIGTERM', shutdownOnSignal);
  processHooksRegistered = true;
}

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
  registerProcessHooks();
}

/**
 * Initialize from environment variables and register
 * Convenience function for minimal setup
 */
export function registerFromEnv(): void {
  const apiKey = process.env.OUTBOUNDIQ_KEY;
  
  if (!apiKey) {
    console.warn('[OutboundIQ] Missing OUTBOUNDIQ_KEY environment variable');
    return;
  }

  register({
    apiKey,
    endpoint: process.env.OUTBOUNDIQ_URL,
    debug: process.env.OUTBOUNDIQ_DEBUG === 'true',
  });
}

