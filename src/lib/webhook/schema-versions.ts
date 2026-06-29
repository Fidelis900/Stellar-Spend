/**
 * Webhook payload schema versions.
 *
 * Subscribers can pin to a supported schema version (see WebhookSubscription.schemaVersion);
 * deliveries are transformed to that version before being sent. See
 * docs/webhook-integration.md for the deprecation policy.
 */

export type SchemaVersion = '1' | '2';

export const DEFAULT_SCHEMA_VERSION: SchemaVersion = '2';

export const SUPPORTED_SCHEMA_VERSIONS: SchemaVersion[] = ['1', '2'];

/** Versions still served but scheduled for removal; subscribers should migrate off these. */
export const DEPRECATED_SCHEMA_VERSIONS: SchemaVersion[] = ['1'];

export function isSupportedSchemaVersion(version: string): version is SchemaVersion {
  return (SUPPORTED_SCHEMA_VERSIONS as string[]).includes(version);
}

export function isDeprecatedSchemaVersion(version: SchemaVersion): boolean {
  return (DEPRECATED_SCHEMA_VERSIONS as string[]).includes(version);
}

/** v2 envelope: adds a stable event id, ISO timestamp, and explicit schema metadata. */
export interface SchemaV2Payload {
  event: string;
  id: string;
  createdAt: string;
  data: unknown;
  meta: { schemaVersion: '2' };
}

/** v1 envelope: legacy flat shape kept for backward compatibility. */
export interface SchemaV1Payload {
  event: string;
  data: unknown;
  timestamp: number;
}

export type VersionedPayload = SchemaV1Payload | SchemaV2Payload;

export interface BuildPayloadInput {
  event: string;
  id: string;
  timestamp: number;
  data: unknown;
}

function buildV2(input: BuildPayloadInput): SchemaV2Payload {
  return {
    event: input.event,
    id: input.id,
    createdAt: new Date(input.timestamp).toISOString(),
    data: input.data,
    meta: { schemaVersion: '2' },
  };
}

/** Builds the canonical (latest) payload, then transforms it down to the requested version. */
export function buildPayloadForVersion(
  input: BuildPayloadInput,
  version: SchemaVersion = DEFAULT_SCHEMA_VERSION
): VersionedPayload {
  const canonical = buildV2(input);
  return transformPayload(canonical, version);
}

/** Transforms a v2 (canonical) payload into the shape of any supported version. */
export function transformPayload(payload: SchemaV2Payload, toVersion: SchemaVersion): VersionedPayload {
  switch (toVersion) {
    case '2':
      return payload;
    case '1':
      return {
        event: payload.event,
        data: payload.data,
        timestamp: Date.parse(payload.createdAt),
      };
    default:
      throw new Error(`Unsupported schema version: ${toVersion}`);
  }
}
