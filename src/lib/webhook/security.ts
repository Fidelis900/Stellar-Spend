// Webhook signature verification now lives in the shared, provider-agnostic
// helper at src/lib/webhookVerify.ts. This module re-exports it for
// backward compatibility with existing importers.
export {
  verifyWebhookSignature,
  verifyProviderSignature,
  generateOutgoingSignature,
  buildSignedWebhookHeaders,
  createNonceTable,
  WebhookSecurityError,
  type VerificationResult,
  type VerificationOptions,
} from '../webhookVerify';

import {
  verifyProviderSignature,
  verifyWebhookSignature,
  generateOutgoingSignature,
  buildSignedWebhookHeaders,
  createNonceTable,
} from '../webhookVerify';

export class WebhookSecurity {
  static verifyProviderSignature = verifyProviderSignature;
  static verifyWebhookSignature = verifyWebhookSignature;
  static generateOutgoingSignature = generateOutgoingSignature;
  static buildSignedWebhookHeaders = buildSignedWebhookHeaders;
  static createNonceTable = createNonceTable;
}
