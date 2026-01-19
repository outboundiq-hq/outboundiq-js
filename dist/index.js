'use strict';

// src/types/index.ts
var SENSITIVE_HEADERS = [
  "authorization",
  "x-api-key",
  "api-key",
  "apikey",
  "x-auth-token",
  "cookie",
  "set-cookie",
  "x-csrf-token",
  "x-xsrf-token"
];

// src/utils/helpers.ts
function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 11)}`;
}
function sanitizeHeaders(headers) {
  if (!headers) return {};
  const result = {};
  const entries = headers instanceof Headers ? Array.from(headers.entries()) : Object.entries(headers);
  for (const [key, value] of entries) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_HEADERS.some((h) => lowerKey.includes(h))) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = value;
    }
  }
  return result;
}
function safeStringify(body, maxLength = 1e4) {
  if (body === null || body === void 0) return null;
  try {
    if (typeof body === "string") {
      return body.length > maxLength ? body.substring(0, maxLength) + "...[truncated]" : body;
    }
    if (body instanceof ArrayBuffer || body instanceof Uint8Array) {
      return `[Binary data: ${body.byteLength} bytes]`;
    }
    if (typeof body === "object") {
      const str = JSON.stringify(body);
      return str.length > maxLength ? str.substring(0, maxLength) + "...[truncated]" : str;
    }
    return String(body);
  } catch {
    return "[Unable to serialize body]";
  }
}
function shouldIgnore(url, patterns) {
  for (const pattern of patterns) {
    if (typeof pattern === "string") {
      if (url.includes(pattern)) return true;
    } else if (pattern instanceof RegExp) {
      if (pattern.test(url)) return true;
    }
  }
  return false;
}
function parseUrl(url) {
  try {
    const parsed = typeof url === "string" ? new URL(url) : url;
    return {
      host: parsed.host,
      path: parsed.pathname + parsed.search,
      full: parsed.toString()
    };
  } catch {
    return {
      host: "unknown",
      path: String(url),
      full: String(url)
    };
  }
}
function getTimestamp() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function getByteSize(str) {
  if (!str) return 0;
  return new TextEncoder().encode(str).length;
}
function createLogger(debug) {
  return {
    log: (...args) => {
      if (debug) console.log("[OutboundIQ]", ...args);
    },
    warn: (...args) => {
      if (debug) console.warn("[OutboundIQ]", ...args);
    },
    error: (...args) => {
      console.error("[OutboundIQ]", ...args);
    }
  };
}

// src/client/OutboundIQClient.ts
var SDK_VERSION = "0.1.0";
var nativeHttpRequest = null;
var nativeHttpsRequest = null;
function setNativeHttp(httpModule, httpsModule) {
  if (httpModule && typeof httpModule.request === "function") {
    nativeHttpRequest = httpModule.request.bind(httpModule);
  }
  if (httpsModule && typeof httpsModule.request === "function") {
    nativeHttpsRequest = httpsModule.request.bind(httpsModule);
  }
  console.log("[OutboundIQ] Native http/https modules set for metrics sending");
}
var originalFetch = typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null;
var OutboundIQClient = class {
  constructor(config) {
    this.queue = [];
    this.flushTimer = null;
    this.isFlushing = false;
    this.runtime = "node";
    this.currentUserContext = null;
    this.config = {
      endpoint: config.endpoint ?? "https://agent.outboundiq.dev/api/metric",
      debug: config.debug ?? false,
      batchSize: config.batchSize ?? 10,
      flushInterval: config.flushInterval ?? 5e3,
      timeout: config.timeout ?? 5e3,
      ignorePatterns: config.ignorePatterns ?? [],
      autoTrack: config.autoTrack ?? true,
      apiKey: config.apiKey
      // projectId is deprecated - determined from API key on backend
    };
    this.logger = createLogger(this.config.debug);
    this.detectRuntime();
    this.startFlushInterval();
    this.logger.log("Initialized with config:", {
      endpoint: this.config.endpoint,
      batchSize: this.config.batchSize,
      runtime: this.runtime
    });
  }
  /**
   * Detect the current runtime environment
   */
  detectRuntime() {
    if (typeof globalThis.EdgeRuntime !== "undefined") {
      this.runtime = "edge";
    } else if (typeof globalThis !== "undefined" && "window" in globalThis) {
      this.runtime = "browser";
    } else {
      this.runtime = "node";
    }
  }
  /**
   * Get the configured API key
   */
  getApiKey() {
    return this.config.apiKey;
  }
  /**
   * Get the configured endpoint
   */
  getEndpoint() {
    return this.config.endpoint;
  }
  /**
   * Start the automatic flush interval
   */
  startFlushInterval() {
    if (this.flushTimer) return;
    if (this.runtime !== "edge") {
      this.flushTimer = setInterval(() => {
        this.flush();
      }, this.config.flushInterval);
      if (typeof this.flushTimer === "object" && "unref" in this.flushTimer) {
        this.flushTimer.unref();
      }
    }
  }
  /**
   * Stop the automatic flush interval
   */
  stopFlushInterval() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
  /**
   * Set the user context for subsequent API calls
   */
  setUserContext(context) {
    this.currentUserContext = context;
  }
  /**
   * Get the current user context
   */
  getUserContext() {
    return this.currentUserContext;
  }
  /**
   * Track an API call
   */
  track(call) {
    if (shouldIgnore(call.url, this.config.ignorePatterns)) {
      this.logger.log("Ignoring URL:", call.url);
      return;
    }
    if (call.url.includes("outboundiq.io") || call.url.includes("outboundiq.test")) {
      return;
    }
    const apiCall = {
      ...call,
      id: generateId(),
      timestamp: getTimestamp(),
      userContext: call.userContext ?? this.currentUserContext
    };
    this.queue.push(apiCall);
    this.logger.log("Tracked call:", apiCall.method, apiCall.url, apiCall.statusCode);
    if (this.queue.length >= this.config.batchSize) {
      this.flush();
    }
  }
  /**
   * Flush the queue - send all pending calls to OutboundIQ
   * This is non-blocking and fire-and-forget
   */
  flush() {
    if (this.queue.length === 0 || this.isFlushing) return;
    const batch = this.queue.splice(0);
    this.isFlushing = true;
    this.logger.log(`Flushing ${batch.length} calls`);
    this.sendBatch(batch).catch((error) => {
      this.logger.error("Failed to send batch:", error);
      if (this.queue.length < 100) {
        this.queue.unshift(...batch.slice(0, 10));
      }
    }).finally(() => {
      this.isFlushing = false;
    });
  }
  /**
   * Convert API calls to the format expected by the backend
   * Matches the PHP SDK's ApiCall::toArray() format
   */
  formatCallsForBackend(calls) {
    return calls.map((call) => ({
      transaction_id: call.id,
      url: call.url,
      method: call.method,
      duration: call.duration,
      status_code: call.statusCode,
      request_headers: call.requestHeaders || {},
      request_body: call.requestBody,
      response_headers: call.responseHeaders || {},
      response_body: call.responseBody,
      timestamp: new Date(call.timestamp).getTime() / 1e3,
      // Unix timestamp
      memory_usage: 0,
      // Not available in JS
      memory_peak: 0,
      // Not available in JS
      request_type: "javascript",
      ...call.error && { error: { message: call.error, type: "network" } },
      ...call.userContext && { user_context: call.userContext }
    }));
  }
  /**
   * Base64 encode a string (works in both Node.js and browser)
   */
  base64Encode(str) {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(str, "utf-8").toString("base64");
    } else {
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
  async sendBatch(calls) {
    const payload = this.formatCallsForBackend(calls);
    const jsonData = JSON.stringify(payload);
    const encodedData = this.base64Encode(jsonData);
    const isHttps = this.config.endpoint.startsWith("https://");
    const nativeRequest = isHttps ? nativeHttpsRequest : nativeHttpRequest;
    if (nativeRequest && this.runtime === "node") {
      this.logger.log("Using native", isHttps ? "https" : "http", "for metrics");
      return this.sendWithNativeHttp(encodedData, nativeRequest, isHttps);
    }
    this.logger.log("Using fetch for metrics (runtime:", this.runtime, ")");
    if (!originalFetch) {
      throw new Error("fetch is not available");
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
    try {
      const response = await originalFetch(this.config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.apiKey}`,
          "User-Agent": `OutboundIQ-JS/${SDK_VERSION}`
        },
        body: encodedData,
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      this.logger.log("Batch sent successfully");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Request timeout");
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
  sendWithNativeHttp(encodedData, requestFn, isHttps) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.config.endpoint);
      const isLocalDev = url.hostname.endsWith(".test") || url.hostname.endsWith(".local") || url.hostname === "localhost";
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.apiKey}`,
          "User-Agent": `OutboundIQ-JS/${SDK_VERSION}`,
          "Content-Length": Buffer.byteLength(encodedData)
        },
        timeout: this.config.timeout,
        // Skip SSL verification for local development (only for https)
        ...isHttps && { rejectUnauthorized: !isLocalDev }
      };
      const req = requestFn(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            this.logger.log("Batch sent successfully");
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });
      req.on("error", (err) => {
        reject(err);
      });
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });
      req.write(encodedData);
      req.end();
    });
  }
  /**
   * Flush and shutdown the client
   */
  async shutdown() {
    this.stopFlushInterval();
    if (this.queue.length > 0) {
      const batch = this.queue.splice(0);
      try {
        await this.sendBatch(batch);
      } catch (error) {
        this.logger.error("Final flush failed:", error);
      }
    }
    this.logger.log("Client shutdown complete");
  }
  /**
   * Get pending queue size
   */
  getPendingCount() {
    return this.queue.length;
  }
  /**
   * Get configuration
   */
  getConfig() {
    return { ...this.config };
  }
  /**
   * Get the base URL (endpoint without /metric)
   */
  getBaseUrl() {
    return this.config.endpoint.replace("/metric", "");
  }
  /**
   * Ping the OutboundIQ API to verify the API key and get project info
   */
  async ping() {
    const url = this.getBaseUrl() + "/ping";
    try {
      if (this.runtime === "node" && nativeHttpsRequest) {
        return await this.pingWithNativeHttp(url);
      }
      if (!originalFetch) {
        throw new Error("fetch is not available");
      }
      const response = await originalFetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${this.config.apiKey}`,
          "Accept": "application/json"
        }
      });
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      this.logger.error("Ping failed:", error);
      return null;
    }
  }
  /**
   * Ping using native Node.js https
   */
  pingWithNativeHttp(url) {
    return new Promise((resolve) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === "https:";
      const requestFn = isHttps ? nativeHttpsRequest : nativeHttpRequest;
      if (!requestFn) {
        resolve(null);
        return;
      }
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: "GET",
        headers: {
          "Authorization": `Bearer ${this.config.apiKey}`,
          "Accept": "application/json"
        },
        timeout: this.config.timeout
      };
      const req = requestFn(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        });
      });
      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });
      req.end();
    });
  }
};
var instance = null;
function init(config) {
  if (instance) {
    console.warn("[OutboundIQ] Client already initialized. Returning existing instance.");
    return instance;
  }
  instance = new OutboundIQClient(config);
  return instance;
}
function getClient() {
  return instance;
}
function track(call) {
  if (!instance) {
    console.warn("[OutboundIQ] Client not initialized. Call init() first.");
    return;
  }
  instance.track(call);
}
function setUserContext(context) {
  if (!instance) {
    console.warn("[OutboundIQ] Client not initialized. Call init() first.");
    return;
  }
  instance.setUserContext(context);
}
function flush() {
  instance?.flush();
}
async function shutdown() {
  await instance?.shutdown();
  instance = null;
}

// src/interceptors/fetch.ts
var originalFetch2 = null;
var isPatched = false;
var userContextResolver = null;
function setFetchUserContextResolver(resolver) {
  userContextResolver = resolver;
}
function extractRequestHeaders(input, init2) {
  const headers = {};
  if (init2?.headers) {
    if (init2.headers instanceof Headers) {
      init2.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(init2.headers)) {
      init2.headers.forEach(([key, value]) => {
        headers[key] = value;
      });
    } else {
      Object.assign(headers, init2.headers);
    }
  }
  if (input instanceof Request) {
    input.headers.forEach((value, key) => {
      if (!headers[key]) {
        headers[key] = value;
      }
    });
  }
  return headers;
}
function getUrl(input) {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  if (input instanceof Request) {
    return input.url;
  }
  return String(input);
}
function getMethod(input, init2) {
  if (init2?.method) {
    return init2.method.toUpperCase();
  }
  if (input instanceof Request) {
    return input.method.toUpperCase();
  }
  return "GET";
}
async function getRequestBody(input, init2) {
  try {
    if (init2?.body) {
      if (typeof init2.body === "string") {
        return init2.body.substring(0, 5e3);
      }
      if (init2.body instanceof FormData) {
        return "[FormData]";
      }
      if (init2.body instanceof URLSearchParams) {
        return init2.body.toString().substring(0, 5e3);
      }
      if (init2.body instanceof ArrayBuffer || init2.body instanceof Uint8Array) {
        return `[Binary: ${init2.body.byteLength} bytes]`;
      }
      return "[Body Stream]";
    }
    if (input instanceof Request && input.body) {
      return "[Request Body]";
    }
    return null;
  } catch {
    return null;
  }
}
async function getResponseBody(response) {
  try {
    const clone = response.clone();
    const text = await clone.text();
    return text.substring(0, 5e3);
  } catch {
    return null;
  }
}
function patchFetch() {
  if (isPatched || typeof globalThis.fetch !== "function") {
    return;
  }
  originalFetch2 = globalThis.fetch;
  globalThis.fetch = async function patchedFetch(input, init2) {
    const startTime = performance.now();
    const url = getUrl(input);
    const method = getMethod(input, init2);
    if (url.includes("outboundiq.dev") || url.includes("outboundiq.io") || url.includes("outboundiq.test") || url.includes("outboundiq.com")) {
      return originalFetch2(input, init2);
    }
    const userContext = userContextResolver?.() ?? null;
    const requestHeaders = extractRequestHeaders(input, init2);
    const requestBody = await getRequestBody(input, init2);
    let response;
    let error = null;
    try {
      response = await originalFetch2(input, init2);
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
      const client = getClient();
      if (client) {
        client.track({
          method,
          url,
          statusCode: 0,
          duration: performance.now() - startTime,
          requestHeaders: sanitizeHeaders(requestHeaders),
          requestBody: safeStringify(requestBody),
          error: error.message,
          userContext
        });
      }
      throw err;
    }
    const duration = performance.now() - startTime;
    (async () => {
      try {
        const responseBody = await getResponseBody(response);
        const client = getClient();
        if (client) {
          client.track({
            method,
            url,
            statusCode: response.status,
            duration,
            requestHeaders: sanitizeHeaders(requestHeaders),
            responseHeaders: sanitizeHeaders(Object.fromEntries(response.headers.entries())),
            requestBody: safeStringify(requestBody),
            responseBody: safeStringify(responseBody),
            requestSize: getByteSize(requestBody),
            responseSize: getByteSize(responseBody),
            userContext
          });
        }
      } catch {
      }
    })();
    return response;
  };
  isPatched = true;
  console.log("[OutboundIQ] Fetch patched");
}
function unpatchFetch() {
  if (!isPatched || !originalFetch2) {
    return;
  }
  globalThis.fetch = originalFetch2;
  originalFetch2 = null;
  isPatched = false;
  console.log("[OutboundIQ] Fetch restored");
}

// src/intelligence.ts
var originalFetch3 = globalThis.fetch;
function getBaseUrl() {
  const client = getClient();
  if (client) {
    return client.getEndpoint().replace("/api/metric", "/api");
  }
  const endpoint = process.env.OUTBOUNDIQ_URL || "https://agent.outboundiq.dev/api/metric";
  return endpoint.replace("/api/metric", "/api");
}
function getApiKey() {
  const client = getClient();
  if (client) {
    return client.getApiKey();
  }
  return process.env.OUTBOUNDIQ_KEY;
}
async function recommend(serviceName, options = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[OutboundIQ] Missing OUTBOUNDIQ_KEY for recommend()");
    return null;
  }
  try {
    const url = `${getBaseUrl()}/v1/recommend/${encodeURIComponent(serviceName)}`;
    const headers = {
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "application/json"
    };
    if (options.userContext) {
      headers["X-User-Context"] = JSON.stringify(options.userContext);
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 5e3);
    const response = await originalFetch3(url, {
      method: "GET",
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const data = await response.json();
    return { success: response.ok, ...data };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("[OutboundIQ] recommend() timeout");
      return { success: false, error: "Request timeout" };
    }
    console.error("[OutboundIQ] recommend() failed:", error);
    return { success: false, error: error.message };
  }
}
async function providerStatus(providerSlug, options = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[OutboundIQ] Missing OUTBOUNDIQ_KEY for providerStatus()");
    return null;
  }
  try {
    const url = `${getBaseUrl()}/v1/provider/${encodeURIComponent(providerSlug)}/status`;
    const headers = {
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "application/json"
    };
    if (options.userContext) {
      headers["X-User-Context"] = JSON.stringify(options.userContext);
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 5e3);
    const response = await originalFetch3(url, {
      method: "GET",
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const data = await response.json();
    return { success: response.ok, ...data };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("[OutboundIQ] providerStatus() timeout");
      return { success: false, error: "Request timeout" };
    }
    console.error("[OutboundIQ] providerStatus() failed:", error);
    return { success: false, error: error.message };
  }
}
async function endpointStatus(endpointSlug, options = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[OutboundIQ] Missing OUTBOUNDIQ_KEY for endpointStatus()");
    return null;
  }
  try {
    const url = `${getBaseUrl()}/v1/endpoint/${encodeURIComponent(endpointSlug)}/status`;
    const headers = {
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "application/json"
    };
    if (options.userContext) {
      headers["X-User-Context"] = JSON.stringify(options.userContext);
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 5e3);
    const response = await originalFetch3(url, {
      method: "GET",
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const data = await response.json();
    return { success: response.ok, ...data };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("[OutboundIQ] endpointStatus() timeout");
      return { success: false, error: "Request timeout" };
    }
    console.error("[OutboundIQ] endpointStatus() failed:", error);
    return { success: false, error: error.message };
  }
}

exports.OutboundIQClient = OutboundIQClient;
exports.endpointStatus = endpointStatus;
exports.flush = flush;
exports.generateId = generateId;
exports.getClient = getClient;
exports.init = init;
exports.parseUrl = parseUrl;
exports.patchFetch = patchFetch;
exports.providerStatus = providerStatus;
exports.recommend = recommend;
exports.safeStringify = safeStringify;
exports.sanitizeHeaders = sanitizeHeaders;
exports.setFetchUserContextResolver = setFetchUserContextResolver;
exports.setNativeHttp = setNativeHttp;
exports.setUserContext = setUserContext;
exports.shouldIgnore = shouldIgnore;
exports.shutdown = shutdown;
exports.track = track;
exports.unpatchFetch = unpatchFetch;
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map