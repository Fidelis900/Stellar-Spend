# Request Signing Documentation

## Overview

Request signing provides HMAC-based authentication for API requests. Each request is signed with a shared secret, ensuring that only authorized clients can access protected endpoints.

## How It Works

1. **Generate Signature**: Client creates a signature by hashing the request method, path, body, and timestamp with a shared secret
2. **Send Request**: Client includes the signature and timestamp in request headers
3. **Verify Signature**: Server verifies the signature using the same secret
4. **Prevent Replay**: Server tracks used timestamps to prevent replay attacks

## Request Format

### Headers

```
X-Signature: <hmac-signature>
X-Timestamp: <unix-timestamp-ms>
```

### Example

```bash
curl -X POST https://api.example.com/api/offramp/quote \
  -H "Content-Type: application/json" \
  -H "X-Signature: abc123def456..." \
  -H "X-Timestamp: 1234567890000" \
  -d '{"amount": "100", "currency": "NGN"}'
```

## Signature Generation

### Algorithm

```
message = METHOD + "\n" + PATH + "\n" + BODY + "\n" + TIMESTAMP
signature = HMAC-SHA256(message, SECRET)
```

### Example (Node.js)

```javascript
import crypto from 'crypto';

const method = 'POST';
const path = '/api/offramp/quote';
const body = JSON.stringify({ amount: '100', currency: 'NGN' });
const timestamp = Date.now().toString();
const secret = 'your-shared-secret';

const message = [method, path, body, timestamp].join('\n');
const hmac = crypto.createHmac('sha256', secret);
hmac.update(message);
const signature = hmac.digest('hex');
```

### Example (Python)

```python
import hmac
import hashlib
import json
import time

method = "POST"
path = "/api/offramp/quote"
body = json.dumps({"amount": "100", "currency": "NGN"})
timestamp = str(int(time.time() * 1000))
secret = "your-shared-secret"

message = "\n".join([method, path, body, timestamp])
signature = hmac.new(
    secret.encode(),
    message.encode(),
    hashlib.sha256
).hexdigest()
```

## Timestamp Validation

- Timestamps must be within 5 minutes of server time
- Prevents replay attacks by tracking used timestamps
- Format: Unix timestamp in milliseconds

## Error Responses

### Invalid Signature

```json
{
  "error": "Invalid signature",
  "message": "Request signature verification failed"
}
```

Status: 401 Unauthorized

### Replay Attack Detected

```json
{
  "error": "Replay attack detected",
  "message": "This request has already been processed"
}
```

Status: 401 Unauthorized

### Missing Headers

```json
{
  "error": "Invalid signature",
  "message": "Missing signature header (x-signature or x-hmac-signature)"
}
```

Status: 401 Unauthorized

## Best Practices

1. **Secure Secret Storage**: Store the shared secret securely, never commit to version control
2. **Use HTTPS**: Always use HTTPS to prevent man-in-the-middle attacks
3. **Rotate Secrets**: Regularly rotate shared secrets
4. **Monitor Failures**: Log and monitor signature verification failures
5. **Timestamp Accuracy**: Ensure client and server clocks are synchronized
6. **Request Body**: Include the full request body in the signature, even if empty

## Configuration

### Signature Algorithm

Default: SHA256

Supported: SHA256, SHA512

### Encoding

Default: Hex

Supported: Hex, Base64

### Timestamp Tolerance

Default: 5 minutes (300,000 ms)

Configurable via `SignatureConfig.timestampTolerance`

## Testing

### Using the Signing Utilities

```typescript
import {
  generateSignature,
  verifySignature,
  createSignedRequestHeaders,
} from '@/lib/request-signing';

// Generate signature
const signature = generateSignature(
  'POST',
  '/api/offramp/quote',
  '{"amount":"100"}',
  '1234567890000',
  'secret',
);

// Verify signature
const result = verifySignature(
  'POST',
  '/api/offramp/quote',
  '{"amount":"100"}',
  '1234567890000',
  signature,
  'secret',
);

console.log(result.valid); // true

// Create signed headers
const headers = createSignedRequestHeaders(
  'POST',
  '/api/offramp/quote',
  '{"amount":"100"}',
  'secret',
);
```

## Endpoints Requiring Signatures

- POST /api/offramp/quote
- POST /api/offramp/bridge/build-tx
- POST /api/offramp/bridge/submit-soroban
- POST /api/offramp/paycrest/order
- POST /api/offramp/execute-payout

## Endpoints NOT Requiring Signatures

- GET /api/offramp/currencies
- GET /api/offramp/rate
- GET /api/health
- POST /api/webhooks/paycrest (uses webhook signature verification instead)
