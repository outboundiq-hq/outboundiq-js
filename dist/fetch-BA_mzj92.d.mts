/**
 * Configuration options for the OutboundIQ client
 */
interface OutboundIQConfig {
    /**
     * Your OutboundIQ API key
     * The project is determined from the API key on the backend
     */
    apiKey: string;
    /**
     * @deprecated Project ID is not needed - determined from API key
     */
    projectId?: string;
    /**
     * OutboundIQ ingest endpoint (defaults to production)
     */
    endpoint?: string;
    /**
     * Enable debug logging
     */
    debug?: boolean;
    /**
     * Maximum batch size before auto-flush (default: 10)
     */
    batchSize?: number;
    /**
     * Flush interval in milliseconds (default: 5000)
     */
    flushInterval?: number;
    /**
     * Request timeout in milliseconds (default: 5000)
     */
    timeout?: number;
    /**
     * Patterns to ignore (regex or string)
     * Requests matching these patterns won't be tracked
     */
    ignorePatterns?: (string | RegExp)[];
    /**
     * Whether to track requests automatically (default: true)
     */
    autoTrack?: boolean;
}
/**
 * User context for tracking who made the API call
 */
interface UserContext {
    /**
     * User ID (string or number)
     */
    userId?: string | number | null;
    /**
     * User type/model (e.g., 'User', 'Admin', 'Customer')
     */
    userType?: string | null;
    /**
     * Context type: how the request was made
     */
    context?: 'authenticated' | 'anonymous' | 'job' | 'console' | 'api' | 'webhook' | string;
    /**
     * Additional metadata
     */
    metadata?: Record<string, unknown>;
}
/**
 * Represents a tracked API call
 */
interface ApiCall {
    /**
     * Unique identifier for this call
     */
    id?: string;
    /**
     * HTTP method (GET, POST, PUT, DELETE, etc.)
     */
    method: string;
    /**
     * Full URL of the request
     */
    url: string;
    /**
     * HTTP status code (0 for network errors)
     */
    statusCode: number;
    /**
     * Request duration in milliseconds
     */
    duration: number;
    /**
     * Request headers (sanitized)
     */
    requestHeaders?: Record<string, string>;
    /**
     * Response headers (sanitized)
     */
    responseHeaders?: Record<string, string>;
    /**
     * Request body (if captured)
     */
    requestBody?: string | null;
    /**
     * Response body (if captured)
     */
    responseBody?: string | null;
    /**
     * Request size in bytes
     */
    requestSize?: number;
    /**
     * Response size in bytes
     */
    responseSize?: number;
    /**
     * User context
     */
    userContext?: UserContext | null;
    /**
     * Timestamp when the request was made
     */
    timestamp: string;
    /**
     * Error message if the request failed
     */
    error?: string | null;
    /**
     * Custom tags
     */
    tags?: string[];
}
/**
 * Batch of API calls to send to OutboundIQ
 */
interface ApiBatch {
    projectId: string;
    calls: ApiCall[];
    sdkVersion: string;
    runtime: 'node' | 'edge' | 'browser';
}

/**
 * Set the native http/https request functions (must be called BEFORE patching)
 * This is called from node.ts with the original http.request and https.request
 */
declare function setNativeHttp(httpModule: any, httpsModule: any): void;
/**
 * Core OutboundIQ client for tracking API calls
 *
 * This client handles:
 * - Batching API calls for efficient transmission
 * - Non-blocking sends (fire-and-forget)
 * - Automatic flushing based on batch size and interval
 * - Graceful degradation (never breaks user's app)
 */
declare class OutboundIQClient {
    private config;
    private queue;
    private flushTimer;
    private isFlushing;
    private logger;
    private runtime;
    private currentUserContext;
    constructor(config: OutboundIQConfig);
    /**
     * Detect the current runtime environment
     */
    private detectRuntime;
    /**
     * Start the automatic flush interval
     */
    private startFlushInterval;
    /**
     * Stop the automatic flush interval
     */
    private stopFlushInterval;
    /**
     * Set the user context for subsequent API calls
     */
    setUserContext(context: UserContext | null): void;
    /**
     * Get the current user context
     */
    getUserContext(): UserContext | null;
    /**
     * Track an API call
     */
    track(call: Omit<ApiCall, 'id' | 'timestamp' | 'userContext'> & {
        userContext?: UserContext | null;
    }): void;
    /**
     * Flush the queue - send all pending calls to OutboundIQ
     * This is non-blocking and fire-and-forget
     */
    flush(): void;
    /**
     * Convert API calls to the format expected by the backend
     * Matches the PHP SDK's ApiCall::toArray() format
     */
    private formatCallsForBackend;
    /**
     * Base64 encode a string (works in both Node.js and browser)
     */
    private base64Encode;
    /**
     * Send a batch of API calls to OutboundIQ
     *
     * The payload is base64 encoded to match the PHP SDK format.
     * The backend decodes it and determines the project from the API key.
     *
     * IMPORTANT: In Node.js, we use the native https module directly to avoid
     * any patched fetch/http issues. In browser/edge, we use fetch.
     */
    private sendBatch;
    /**
     * Send metrics using native Node.js http/https module
     * This completely bypasses any patched fetch/http
     */
    private sendWithNativeHttp;
    /**
     * Flush and shutdown the client
     */
    shutdown(): Promise<void>;
    /**
     * Get pending queue size
     */
    getPendingCount(): number;
    /**
     * Get configuration
     */
    getConfig(): Readonly<OutboundIQConfig>;
}
/**
 * Initialize the OutboundIQ client
 */
declare function init(config: OutboundIQConfig): OutboundIQClient;
/**
 * Get the OutboundIQ client instance
 */
declare function getClient(): OutboundIQClient | null;
/**
 * Track an API call using the global instance
 */
declare function track(call: Parameters<OutboundIQClient['track']>[0]): void;
/**
 * Set user context for subsequent calls
 */
declare function setUserContext(context: UserContext | null): void;
/**
 * Flush pending calls
 */
declare function flush(): void;
/**
 * Shutdown the client
 */
declare function shutdown(): Promise<void>;

/**
 * Fetch interceptor for Edge runtime and modern Node.js
 *
 * This patches the global fetch function to intercept outbound requests.
 * Works in Edge Runtime (Vercel, Cloudflare Workers) and Node.js 18+.
 */

/**
 * Set the user context resolver function
 */
declare function setFetchUserContextResolver(resolver: () => UserContext | null): void;
/**
 * Patch global fetch
 */
declare function patchFetch(): void;
/**
 * Restore original fetch
 */
declare function unpatchFetch(): void;

export { type ApiCall as A, type OutboundIQConfig as O, type UserContext as U, OutboundIQClient as a, shutdown as b, setFetchUserContextResolver as c, setNativeHttp as d, type ApiBatch as e, flush as f, getClient as g, init as i, patchFetch as p, setUserContext as s, track as t, unpatchFetch as u };
