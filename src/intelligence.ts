/**
 * API Intelligence Methods
 * 
 * Smart routing and health check functions for making intelligent
 * decisions about which API providers/endpoints to use.
 */

import type { UserContext } from './types';
import { getClient } from './client/OutboundIQClient';

// Store for original fetch (to avoid recursion with patched fetch)
const originalFetch = globalThis.fetch;

/**
 * Get the base URL for the OutboundIQ API
 */
function getBaseUrl(): string {
  // Try to get from initialized client first
  const client = getClient();
  if (client) {
    return client.getEndpoint().replace('/api/metric', '/api');
  }
  // Fall back to env var
  const endpoint = process.env.OUTBOUNDIQ_ENDPOINT || 'https://agent.outboundiq.dev/api/metric';
  return endpoint.replace('/api/metric', '/api');
}

/**
 * Get API key from initialized client or environment
 */
function getApiKey(): string | undefined {
  // Try to get from initialized client first
  const client = getClient();
  if (client) {
    return client.getApiKey();
  }
  // Fall back to env var
  return process.env.OUTBOUNDIQ_API_KEY;
}

// ============================================================================
// Types
// ============================================================================

export interface RecommendationResult {
  success: boolean;
  decision?: {
    action: 'proceed' | 'use_alternative' | 'delay' | 'abort';
    reason: string;
    confidence: number;
  };
  recommendation?: {
    provider: string;
    endpoint: string;
    confidence: number;
    reason: string;
  };
  alternatives?: Array<{
    provider: string;
    endpoint: string;
    confidence: number;
    reason: string;
  }>;
  error?: string;
}

export interface ProviderStatusResult {
  success: boolean;
  decision?: {
    action: 'proceed' | 'use_alternative' | 'delay' | 'abort';
    reason: string;
    confidence: number;
  };
  provider?: {
    name: string;
    slug: string;
  };
  metrics?: {
    success_rate: number;
    avg_latency: number;
    total_calls: number;
    error_rate: number;
  };
  status?: {
    current: 'operational' | 'degraded' | 'partial_outage' | 'major_outage' | 'unknown';
    description: string;
    updated_at: string;
  };
  incidents?: Array<{
    id: string;
    name: string;
    status: string;
    impact: string;
    created_at: string;
  }>;
  components?: Array<{
    name: string;
    status: string;
  }>;
  error?: string;
}

export interface EndpointStatusResult {
  success: boolean;
  decision?: {
    action: 'proceed' | 'use_alternative' | 'delay' | 'abort';
    reason: string;
    confidence: number;
  };
  endpoint?: {
    name: string;
    slug: string;
    method: string;
    pattern: string;
  };
  provider?: {
    name: string;
    slug: string;
  };
  metrics?: {
    success_rate: number;
    avg_latency: number;
    total_calls: number;
    error_rate: number;
    p95_latency?: number;
    schema_stability?: number;
    latency_trend?: 'improving' | 'stable' | 'degrading';
  };
  status?: {
    current: 'operational' | 'degraded' | 'partial_outage' | 'major_outage' | 'unknown';
    description: string;
  };
  incidents?: Array<{
    id: string;
    name: string;
    status: string;
    impact: string;
  }>;
  components?: Array<{
    name: string;
    status: string;
  }>;
  error?: string;
}

export interface IntelligenceOptions {
  userContext?: UserContext;
  timeout?: number;
}

// ============================================================================
// API Intelligence Functions
// ============================================================================

/**
 * Get a smart recommendation for which provider/endpoint to use for a service.
 * 
 * @param serviceName - The service slug (e.g., 'payment-processing', 'sms-notifications')
 * @param options - Optional configuration
 * @returns Recommendation with decision, confidence score, and alternatives
 * 
 * @example
 * ```typescript
 * import { recommend } from '@outboundiq/core';
 * 
 * const result = await recommend('payment-processing');
 * 
 * if (result?.decision?.action === 'proceed') {
 *   // Use the recommended provider
 *   const provider = result.recommendation?.provider;
 *   console.log(`Using ${provider} with ${result.recommendation?.confidence}% confidence`);
 * } else if (result?.decision?.action === 'use_alternative') {
 *   // Primary is having issues, use alternative
 *   const alt = result.alternatives?.[0];
 *   console.log(`Switching to ${alt?.provider}`);
 * }
 * ```
 */
export async function recommend(
  serviceName: string,
  options: IntelligenceOptions = {}
): Promise<RecommendationResult | null> {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    console.warn('[OutboundIQ] Missing OUTBOUNDIQ_API_KEY for recommend()');
    return null;
  }

  try {
    const url = `${getBaseUrl()}/v1/recommend/${encodeURIComponent(serviceName)}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
    };

    if (options.userContext) {
      headers['X-User-Context'] = JSON.stringify(options.userContext);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 5000);

    const response = await originalFetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();
    return { success: response.ok, ...data };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[OutboundIQ] recommend() timeout');
      return { success: false, error: 'Request timeout' };
    }
    console.error('[OutboundIQ] recommend() failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Get the current status and health metrics for a provider.
 * 
 * @param providerSlug - The provider slug (e.g., 'stripe', 'twilio', 'sendgrid')
 * @param options - Optional configuration
 * @returns Provider status with metrics, incidents, and decision
 * 
 * @example
 * ```typescript
 * import { providerStatus } from '@outboundiq/core';
 * 
 * const status = await providerStatus('stripe');
 * 
 * if (status?.decision?.action === 'abort') {
 *   // Stripe is having major issues
 *   console.log(`Stripe issue: ${status.decision.reason}`);
 *   // Switch to backup payment provider
 * } else if (status?.metrics) {
 *   console.log(`Stripe success rate: ${status.metrics.success_rate}%`);
 *   console.log(`Average latency: ${status.metrics.avg_latency}ms`);
 * }
 * ```
 */
export async function providerStatus(
  providerSlug: string,
  options: IntelligenceOptions = {}
): Promise<ProviderStatusResult | null> {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    console.warn('[OutboundIQ] Missing OUTBOUNDIQ_API_KEY for providerStatus()');
    return null;
  }

  try {
    const url = `${getBaseUrl()}/v1/provider/${encodeURIComponent(providerSlug)}/status`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
    };

    if (options.userContext) {
      headers['X-User-Context'] = JSON.stringify(options.userContext);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 5000);

    const response = await originalFetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();
    return { success: response.ok, ...data };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[OutboundIQ] providerStatus() timeout');
      return { success: false, error: 'Request timeout' };
    }
    console.error('[OutboundIQ] providerStatus() failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Get the current status and health metrics for a specific endpoint.
 * 
 * @param endpointSlug - The endpoint slug (e.g., 'stripe-post-charges', 'twilio-post-messages')
 * @param options - Optional configuration
 * @returns Endpoint status with metrics, incidents, and decision
 * 
 * @example
 * ```typescript
 * import { endpointStatus } from '@outboundiq/core';
 * 
 * const status = await endpointStatus('stripe-post-charges');
 * 
 * if (status?.decision?.action === 'delay') {
 *   // Endpoint is slow, maybe wait before retrying
 *   console.log(`Stripe charges slow: ${status.metrics?.avg_latency}ms`);
 * }
 * 
 * // Check for degraded performance
 * if (status?.metrics?.latency_trend === 'degrading') {
 *   console.log('Latency is trending upward');
 * }
 * ```
 */
export async function endpointStatus(
  endpointSlug: string,
  options: IntelligenceOptions = {}
): Promise<EndpointStatusResult | null> {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    console.warn('[OutboundIQ] Missing OUTBOUNDIQ_API_KEY for endpointStatus()');
    return null;
  }

  try {
    const url = `${getBaseUrl()}/v1/endpoint/${encodeURIComponent(endpointSlug)}/status`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
    };

    if (options.userContext) {
      headers['X-User-Context'] = JSON.stringify(options.userContext);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 5000);

    const response = await originalFetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();
    return { success: response.ok, ...data };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[OutboundIQ] endpointStatus() timeout');
      return { success: false, error: 'Request timeout' };
    }
    console.error('[OutboundIQ] endpointStatus() failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

