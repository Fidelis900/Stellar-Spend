import { describe, it, expect } from 'vitest';
import {
  buildPayloadForVersion,
  transformPayload,
  isSupportedSchemaVersion,
  isDeprecatedSchemaVersion,
  DEFAULT_SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  type SchemaV2Payload,
} from './schema-versions';

const INPUT = {
  event: 'transaction.completed',
  id: 'evt_123',
  timestamp: 1_700_000_000_000,
  data: { id: 'tx_1', status: 'completed' },
};

describe('isSupportedSchemaVersion', () => {
  it('accepts every version in SUPPORTED_SCHEMA_VERSIONS', () => {
    for (const v of SUPPORTED_SCHEMA_VERSIONS) {
      expect(isSupportedSchemaVersion(v)).toBe(true);
    }
  });

  it('rejects unknown versions', () => {
    expect(isSupportedSchemaVersion('99')).toBe(false);
    expect(isSupportedSchemaVersion('latest')).toBe(false);
  });
});

describe('isDeprecatedSchemaVersion', () => {
  it('flags v1 as deprecated', () => {
    expect(isDeprecatedSchemaVersion('1')).toBe(true);
  });

  it('does not flag the default version as deprecated', () => {
    expect(isDeprecatedSchemaVersion(DEFAULT_SCHEMA_VERSION)).toBe(false);
  });
});

describe('buildPayloadForVersion', () => {
  it('builds the v2 envelope with schema metadata by default', () => {
    const payload = buildPayloadForVersion(INPUT) as SchemaV2Payload;
    expect(payload.meta.schemaVersion).toBe('2');
    expect(payload.event).toBe(INPUT.event);
    expect(payload.id).toBe(INPUT.id);
    expect(payload.data).toEqual(INPUT.data);
    expect(new Date(payload.createdAt).getTime()).toBe(INPUT.timestamp);
  });

  it('builds the legacy v1 flat envelope when requested', () => {
    const payload = buildPayloadForVersion(INPUT, '1');
    expect(payload).toEqual({
      event: INPUT.event,
      data: INPUT.data,
      timestamp: INPUT.timestamp,
    });
  });
});

describe('transformPayload (cross-version transforms)', () => {
  it('transforms v2 -> v1 without losing event or data', () => {
    const v2 = buildPayloadForVersion(INPUT, '2') as SchemaV2Payload;
    const v1 = transformPayload(v2, '1');

    expect(v1).toEqual({
      event: INPUT.event,
      data: INPUT.data,
      timestamp: INPUT.timestamp,
    });
  });

  it('transforms v2 -> v2 as a no-op', () => {
    const v2 = buildPayloadForVersion(INPUT, '2') as SchemaV2Payload;
    expect(transformPayload(v2, '2')).toBe(v2);
  });

  it('throws for an unsupported target version', () => {
    const v2 = buildPayloadForVersion(INPUT, '2') as SchemaV2Payload;
    // @ts-expect-error testing runtime guard against an invalid version
    expect(() => transformPayload(v2, '3')).toThrow(/Unsupported schema version/);
  });
});
