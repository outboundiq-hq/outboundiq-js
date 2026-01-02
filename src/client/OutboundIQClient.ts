import type { OutboundIQConfig, ApiCall, UserContext } from '../types';

export type { OutboundIQConfig, UserContext, ApiCall } from '../types';
import { generateId, createLogger, shouldIgnore, getTimestamp } from '../utils/helpers';

const SDK_VERSION = '0.1.0';

// For Node.js: We'll set these when we have access to the http/https modules
// These will be set from node.ts BEFORE patching occurs
let nativeHttpRequest: ((options: any, callback: (res: any) => void) => any) | null = null;
let nativeHttpsRequest: ((options: any, callback: (res: any) => void) => any) | null = null;

/**
 * Set the native http/https request functions (must be called BEFORE patching)
 * This is called from node.ts with the original http.request and https.request
 */
export function setNativeHttp(httpModule: any, httpsModule: any): void {
  if (httpModule && typeof httpModule.request === 'function') {
    nativeHttpRequest = httpModule.request.bind(httpModule);
  }
  if (httpsModule && typeof httpsModule.request === 'function') {
    nativeHttpsRequest = httpsModule.request.bind(httpsModule);
  }
  console.log('[OutboundIQ] Native http/https modules set for metrics sending');
}

// Store original fetch as fallback for non-Node environments
const originalFetch: typeof fetch = typeof globalThis.fetch === 'function' 
  ? globalThis.fetch.bind(globalThis) 
  : (null as any);

/**
 * Internal configuration with all required fields
 */
interface InternalConfig {
  apiKey: string;
  endpoint: string;
  debug: boolean;
  batchSize: number;
  flushInterval: number;
  timeout: number;
  ignorePatterns: (string | RegExp)[];
  autoTrack: boolean;
}

/**
 * Core OutboundIQ client for tracking API calls
 * 
 * This client handles:
 * - Batching API calls for efficient transmission
 * - Non-blocking sends (fire-and-forget)
 * - Automatic flushing based on batch size and interval
 * - Graceful degradation (never breaks user's app)
 */
export class OutboundIQClient {
  private config: InternalConfig;
  private queue: ApiCall[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;
  private logger: ReturnType<typeof createLogger>;
  private runtime: 'node' | 'edge' | 'browser' = 'node';
  private currentUserContext: UserContext | null = null;

  constructor(config: OutboundIQConfig) {
    // Merge with defaults
    this.config = {
      endpoint: config.endpoint ?? 'https://agent.outboundiq.dev/api/metric',
      debug: config.debug ?? false,
      batchSize: config.batchSize ?? 10,
      flushInterval: config.flushInterval ?? 5000,
      timeout: config.timeout ?? 5000,
      ignorePatterns: config.ignorePatterns ?? [],
      autoTrack: config.autoTrack ?? true,
      apiKey: config.apiKey,
      // projectId is deprecated - determined from API key on backend
    };

    this.logger = createLogger(this.config.debug);
    this.detectRuntime();
    this.startFlushInterval();

    this.logger.log('Initialized with config:', {
      endpoint: this.config.endpoint,
      batchSize: this.config.batchSize,
      runtime: this.runtime,
    });
  }

  /**
   * Detect the current runtime environment
   */
  private detectRuntime(): void {
    // Check for Edge runtime (Vercel Edge, Cloudflare Workers)
    if (typeof (globalThis as any).EdgeRuntime !== 'undefined') {
      this.runtime = 'edge';
    } else if (typeof globalThis !== 'undefined' && 'window' in globalThis) {
      this.runtime = 'browser';
    } else {
      this.runtime = 'node';
    }
  }

  /**
   * Start the automatic flush interval
   */
  private startFlushInterval(): void {
    if (this.flushTimer) return;

    // Don't use setInterval in Edge runtime (short-lived)
    if (this.runtime !== 'edge') {
      this.flushTimer = setInterval(() => {
        this.flush();
      }, this.config.flushInterval);

      // Unref the timer so it doesn't keep the process alive
      if (typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
        this.flushTimer.unref();
      }
    }
  }

  /**
   * Stop the automatic flush interval
   */
  private stopFlushInterval(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Set the user context for subsequent API calls
   */
  setUserContext(context: UserContext | null): void {
    this.currentUserContext = context;
  }

  /**
   * Get the current user context
   */
  getUserContext(): UserContext | null {
    return this.currentUserContext;
  }

  /**
   * Track an API call
   */
  track(call: Omit<ApiCall, 'id' | 'timestamp' | 'userContext'> & { userContext?: UserContext | null }): void {
    // Check if URL should be ignored
    if (shouldIgnore(call.url, this.config.ignorePatterns)) {
      this.logger.log('Ignoring URL:', call.url);
      return;
    }

    // Don't track calls to OutboundIQ itself
    if (call.url.includes('outboundiq.io') || call.url.includes('outboundiq.test')) {
      return;
    }

    const apiCall: ApiCall = {
      ...call,
      id: generateId(),
      timestamp: getTimestamp(),
      userContext: call.userContext ?? this.currentUserContext,
    };

    this.queue.push(apiCall);
    this.logger.log('Tracked call:', apiCall.method, apiCall.url, apiCall.statusCode);

    // Auto-flush if batch size reached
    if (this.queue.length >= this.config.batchSize) {
      this.flush();
    }
  }

  /**
   * Flush the queue - send all pending calls to OutboundIQ
   * This is non-blocking and fire-and-forget
   */
  flush(): void {
    if (this.queue.length === 0 || this.isFlushing) return;

    // Grab current queue and reset
    const batch = this.queue.splice(0);
    this.isFlushing = true;

    this.logger.log(`Flushing ${batch.length} calls`);

    // Fire and forget - don't await
    this.sendBatch(batch)
      .catch((error) => {
        this.logger.error('Failed to send batch:', error);
        // Optionally re-queue failed calls (with limit to prevent memory issues)
        if (this.queue.length < 100) {
          this.queue.unshift(...batch.slice(0, 10)); // Re-queue first 10
        }
      })
      .finally(() => {
        this.isFlushing = false;
      });
  }

  /**
   * Convert API calls to the format expected by the backend
   * Matches the PHP SDK's ApiCall::toArray() format
   */
  private formatCallsForBackend(calls: ApiCall[]): object[] {
    return calls.map(call => ({
      transaction_id: call.id,
      url: call.url,
      method: call.method,
      duration: call.duration,
      status_code: call.statusCode,
      request_headers: call.requestHeaders || {},
      request_body: call.requestBody,
      response_headers: call.responseHeaders || {},
      response_body: call.responseBody,
      timestamp: new Date(call.timestamp).getTime() / 1000, // Unix timestamp
      memory_usage: 0, // Not available in JS
      memory_peak: 0, // Not available in JS
      request_type: 'javascript',
      ...(call.error && { error: { message: call.error, type: 'network' } }),
      ...(call.userContext && { user_context: call.userContext }),
    }));
  }

  /**
   * Base64 encode a string (works in both Node.js and browser)
   */
  private base64Encode(str: string): string {
    if (typeof Buffer !== 'undefined') {
      // Node.js
      return Buffer.from(str, 'utf-8').toString('base64');
    } else {
      // Browser
      return btoa(unescape(encodeURIComponent(str)));
    }
  }

  /**
   * Send a batch of API calls to OutboundIQ
   * 
   * The payload is base64 encoded to match the PHP SDK format.
   * The backend decodes it and determines the project from the API key.
   * 
   * IMPORTANT: In Node.js, we use the native https module directly to avoid
   * any patched fetch/http issues. In browser/edge, we use fetch.
   */
  private async sendBatch(calls: ApiCall[]): Promise<void> {
    // Format payload as array (same as PHP SDK)
    const payload = this.formatCallsForBackend(calls);
    
    // JSON encode then base64 encode (matching PHP SDK)
    const jsonData = JSON.stringify(payload);
    const encodedData = this.base64Encode(jsonData);

    // In Node.js, use native http/https to avoid patching issues
    const isHttps = this.config.endpoint.startsWith('https://');
    const nativeRequest = isHttps ? nativeHttpsRequest : nativeHttpRequest;
    
    if (nativeRequest && this.runtime === 'node') {
      this.logger.log('Using native', isHttps ? 'https' : 'http', 'for metrics');
      return this.sendWithNativeHttp(encodedData, nativeRequest, isHttps);
    }
    
    this.logger.log('Using fetch for metrics (runtime:', this.runtime, ')');

    // Fallback to fetch for browser/edge
    if (!originalFetch) {
      throw new Error('fetch is not available');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await originalFetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'User-Agent': `OutboundIQ-JS/${SDK_VERSION}`,
        },
        body: encodedData,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.logger.log('Batch sent successfully');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Send metrics using native Node.js http/https module
   * This completely bypasses any patched fetch/http
   */
  private sendWithNativeHttp(
    encodedData: string, 
    requestFn: (options: any, callback: (res: any) => void) => any,
    isHttps: boolean
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.config.endpoint);
      
      // Skip SSL verification for local development (.test, .local, localhost)
      const isLocalDev = url.hostname.endsWith('.test') || 
                         url.hostname.endsWith('.local') || 
                         url.hostname === 'localhost';
      
      const options: Record<string, unknown> = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'User-Agent': `OutboundIQ-JS/${SDK_VERSION}`,
          'Content-Length': Buffer.byteLength(encodedData),
        },
        timeout: this.config.timeout,
        // Skip SSL verification for local development (only for https)
        ...(isHttps && { rejectUnauthorized: !isLocalDev }),
      };

      const req = requestFn(options, (res: any) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            this.logger.log('Batch sent successfully');
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', (err: Error) => {
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(encodedData);
      req.end();
    });
  }

  /**
   * Flush and shutdown the client
   */
  async shutdown(): Promise<void> {
    this.stopFlushInterval();
    
    // Final flush - wait for it
    if (this.queue.length > 0) {
      const batch = this.queue.splice(0);
      try {
        await this.sendBatch(batch);
      } catch (error) {
        this.logger.error('Final flush failed:', error);
      }
    }

    this.logger.log('Client shutdown complete');
  }

  /**
   * Get pending queue size
   */
  getPendingCount(): number {
    return this.queue.length;
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<OutboundIQConfig> {
    return { ...this.config };
  }
}

// Singleton instance for easy access
let instance: OutboundIQClient | null = null;

/**
 * Initialize the OutboundIQ client
 */
export function init(config: OutboundIQConfig): OutboundIQClient {
  if (instance) {
    console.warn('[OutboundIQ] Client already initialized. Returning existing instance.');
    return instance;
  }
  instance = new OutboundIQClient(config);
  return instance;
}

/**
 * Get the OutboundIQ client instance
 */
export function getClient(): OutboundIQClient | null {
  return instance;
}

/**
 * Track an API call using the global instance
 */
export function track(call: Parameters<OutboundIQClient['track']>[0]): void {
  if (!instance) {
    console.warn('[OutboundIQ] Client not initialized. Call init() first.');
    return;
  }
  instance.track(call);
}

/**
 * Set user context for subsequent calls
 */
export function setUserContext(context: UserContext | null): void {
  if (!instance) {
    console.warn('[OutboundIQ] Client not initialized. Call init() first.');
    return;
  }
  instance.setUserContext(context);
}

/**
 * Flush pending calls
 */
export function flush(): void {
  instance?.flush();
}

/**
 * Shutdown the client
 */
export async function shutdown(): Promise<void> {
  await instance?.shutdown();
  instance = null;
}

