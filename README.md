# @outboundiq/core

Core JavaScript SDK for OutboundIQ - Track and monitor your outbound API calls.

This is the base package used by framework-specific SDKs like `@outboundiq/nextjs`.

## Installation

```bash
npm install @outboundiq/core
```

## Usage

### Basic Usage

```typescript
import { init, track } from '@outboundiq/core';

// Initialize the client
init({
  apiKey: process.env.OUTBOUNDIQ_API_KEY!,
  projectId: process.env.OUTBOUNDIQ_PROJECT_ID!,
});

// Track an API call manually
track({
  method: 'POST',
  url: 'https://api.stripe.com/v1/charges',
  statusCode: 200,
  duration: 150,
});
```

### Automatic Tracking (Node.js)

```typescript
import { registerFromEnv } from '@outboundiq/core/node';

// Initialize from environment and patch http/https
registerFromEnv();

// Now all HTTP requests are automatically tracked:
await fetch('https://api.stripe.com/v1/charges');
await axios.get('https://api.twilio.com/messages');
```

### Edge Runtime

```typescript
import { registerFromEnv } from '@outboundiq/core/edge';

// Initialize from environment and patch fetch
registerFromEnv();

// Fetch calls are automatically tracked
await fetch('https://api.example.com/data');
```

## Framework SDKs

For the best experience, use the framework-specific SDK:

- **Next.js**: `@outboundiq/nextjs` - Zero-config setup with instrumentation.ts
- **Express** (coming soon): `@outboundiq/express`
- **Hono** (coming soon): `@outboundiq/hono`

## API Reference

### `init(config)`

Initialize the OutboundIQ client.

```typescript
init({
  apiKey: string;          // Required: Your API key
  projectId: string;       // Required: Your project ID
  endpoint?: string;       // Optional: Custom ingest endpoint
  debug?: boolean;         // Optional: Enable debug logging
  batchSize?: number;      // Optional: Batch size (default: 10)
  flushInterval?: number;  // Optional: Flush interval in ms (default: 5000)
  timeout?: number;        // Optional: Request timeout (default: 5000)
  ignorePatterns?: (string | RegExp)[]; // Optional: URLs to ignore
});
```

### `track(call)`

Track an API call manually.

```typescript
track({
  method: string;          // HTTP method
  url: string;             // Full URL
  statusCode: number;      // HTTP status code (0 for errors)
  duration: number;        // Request duration in ms
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  userContext?: UserContext;
  error?: string;
});
```

### `setUserContext(context)`

Set user context for subsequent calls.

```typescript
setUserContext({
  userId: '123',
  userType: 'User',
  context: 'authenticated', // or 'anonymous', 'job', 'console', 'api'
  metadata: { /* custom data */ },
});
```

### `flush()`

Flush pending calls immediately.

### `shutdown()`

Gracefully shutdown the client (flushes remaining calls).

## License

MIT

