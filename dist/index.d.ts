import { U as UserContext } from './fetch-C93DNU19.js';
export { e as ApiBatch, A as ApiCall, a as OutboundIQClient, O as OutboundIQConfig, f as flush, g as getClient, i as init, p as patchFetch, c as setFetchUserContextResolver, d as setNativeHttp, s as setUserContext, b as shutdown, t as track, u as unpatchFetch } from './fetch-C93DNU19.js';

/**
 * Generate a unique ID for tracking
 */
declare function generateId(): string;
/**
 * Sanitize headers by redacting sensitive values
 */
declare function sanitizeHeaders(headers: Headers | Record<string, string> | null | undefined): Record<string, string>;
/**
 * Safely stringify a body for logging
 */
declare function safeStringify(body: unknown, maxLength?: number): string | null;
/**
 * Check if a URL should be ignored
 */
declare function shouldIgnore(url: string, patterns: (string | RegExp)[]): boolean;
/**
 * Parse URL to extract host and path
 */
declare function parseUrl(url: string | URL): {
    host: string;
    path: string;
    full: string;
};

/**
 * API Intelligence Methods
 *
 * Smart routing and health check functions for making intelligent
 * decisions about which API providers/endpoints to use.
 */

interface RecommendationResult {
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
interface ProviderStatusResult {
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
interface EndpointStatusResult {
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
interface IntelligenceOptions {
    userContext?: UserContext;
    timeout?: number;
}
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
declare function recommend(serviceName: string, options?: IntelligenceOptions): Promise<RecommendationResult | null>;
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
declare function providerStatus(providerSlug: string, options?: IntelligenceOptions): Promise<ProviderStatusResult | null>;
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
declare function endpointStatus(endpointSlug: string, options?: IntelligenceOptions): Promise<EndpointStatusResult | null>;

export { type EndpointStatusResult, type IntelligenceOptions, type ProviderStatusResult, type RecommendationResult, UserContext, endpointStatus, generateId, parseUrl, providerStatus, recommend, safeStringify, sanitizeHeaders, shouldIgnore };
