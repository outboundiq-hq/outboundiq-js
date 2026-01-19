# @outboundiq/core

Core JavaScript SDK for OutboundIQ - Third-party API monitoring and analytics.

This is the base package used by framework-specific SDKs like `@outboundiq/nextjs` and `@outboundiq/express`.

## Installation

```bash
npm install @outboundiq/core
```

## Quick Start

### Node.js (Automatic Tracking)

```typescript
import { registerFromEnv } from '@outboundiq/core/node';

// Initialize from environment and patch http/https
registerFromEnv();

// Now all HTTP requests are automatically tracked
await fetch('https://api.stripe.com/v1/charges');
await axios.get('https://api.twilio.com/messages');
```

### Manual Tracking

```typescript
import { init, track } from '@outboundiq/core';

init({ apiKey: process.env.OUTBOUNDIQ_KEY });

track({
  method: 'POST',
  url: 'https://api.stripe.com/v1/charges',
  statusCode: 200,
  duration: 150,
});
```

## Configuration

Add to your `.env` file:

```bash
# Required - your API key from OutboundIQ dashboard
OUTBOUNDIQ_KEY=your-api-key

# Custom endpoint URL (optional)
OUTBOUNDIQ_URL=https://agent.outboundiq.dev/api/metric

# Enable debug logging (optional)
OUTBOUNDIQ_DEBUG=true
```

## Framework SDKs

For the best experience, use the framework-specific SDK:

- **Next.js**: `@outboundiq/nextjs`
- **Express**: `@outboundiq/express`

## License

MIT
