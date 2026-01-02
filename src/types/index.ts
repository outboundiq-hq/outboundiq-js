/**
 * Configuration options for the OutboundIQ client
 */
export interface OutboundIQConfig {
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
export interface UserContext {
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
export interface ApiCall {
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
export interface ApiBatch {
  projectId: string;
  calls: ApiCall[];
  sdkVersion: string;
  runtime: 'node' | 'edge' | 'browser';
}

/**
 * Headers to always redact for security
 */
export const SENSITIVE_HEADERS = [
  'authorization',
  'x-api-key',
  'api-key',
  'apikey',
  'x-auth-token',
  'cookie',
  'set-cookie',
  'x-csrf-token',
  'x-xsrf-token',
] as const;

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<Omit<OutboundIQConfig, 'apiKey' | 'projectId'>> = {
  endpoint: 'https://agent.outboundiq.dev/api/metric',
  debug: false,
  batchSize: 10,
  flushInterval: 5000,
  timeout: 5000,
  ignorePatterns: [],
  autoTrack: true,
};

