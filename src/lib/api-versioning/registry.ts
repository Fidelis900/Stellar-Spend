export type VersionStatus = 'supported' | 'deprecated';

export interface VersionEntry {
  version: string; // e.g. 'v1'
  status: VersionStatus;
  prefix: string; // e.g. '/api/v1'
  deprecatedAt?: string; // ISO 8601 date string, present when status === 'deprecated'
  sunsetAt?: string; // ISO 8601 date string, present when status === 'deprecated'
  migrationGuideUrl?: string;
}

export interface VersionRegistry {
  getAll(): VersionEntry[];
  get(version: string): VersionEntry | undefined;
  isKnown(version: string): boolean;
  isSupported(version: string): boolean;
  isDeprecated(version: string): boolean;
  isSunset(version: string): boolean;
}

const VERSION_REGISTRY_DATA: VersionEntry[] = [
  {
    version: 'v1',
    status: 'supported',
    prefix: '/api/v1',
  },
];

export function validateRegistry(entries: VersionEntry[]): void {
  for (const entry of entries) {
    if (!entry.version || typeof entry.version !== 'string') {
      throw new Error(`VersionRegistry misconfiguration: entry missing 'version' field`);
    }
    if (!entry.status || !['supported', 'deprecated'].includes(entry.status)) {
      throw new Error(
        `VersionRegistry misconfiguration: entry '${entry.version}' has invalid status '${entry.status}'`,
      );
    }
    if (!entry.prefix || typeof entry.prefix !== 'string') {
      throw new Error(
        `VersionRegistry misconfiguration: entry '${entry.version}' missing 'prefix' field`,
      );
    }
    if (entry.status === 'deprecated') {
      if (!entry.deprecatedAt) {
        throw new Error(
          `VersionRegistry misconfiguration: deprecated entry '${entry.version}' missing 'deprecatedAt'`,
        );
      }
      if (!entry.sunsetAt) {
        throw new Error(
          `VersionRegistry misconfiguration: deprecated entry '${entry.version}' missing 'sunsetAt'`,
        );
      }
    }
  }
}

// Validate at module load time
validateRegistry(VERSION_REGISTRY_DATA);

function createRegistry(entries: VersionEntry[]): VersionRegistry {
  return {
    getAll(): VersionEntry[] {
      return [...entries];
    },

    get(version: string): VersionEntry | undefined {
      return entries.find((e) => e.version === version);
    },

    isKnown(version: string): boolean {
      return entries.some((e) => e.version === version);
    },

    isSupported(version: string): boolean {
      const entry = entries.find((e) => e.version === version);
      return entry?.status === 'supported';
    },

    isDeprecated(version: string): boolean {
      const entry = entries.find((e) => e.version === version);
      if (!entry || entry.status !== 'deprecated') return false;
      if (!entry.sunsetAt) return true;
      return new Date(entry.sunsetAt) > new Date();
    },

    isSunset(version: string): boolean {
      const entry = entries.find((e) => e.version === version);
      if (!entry || entry.status !== 'deprecated') return false;
      if (!entry.sunsetAt) return false;
      return new Date(entry.sunsetAt) <= new Date();
    },
  };
}

export const registry: VersionRegistry = createRegistry(VERSION_REGISTRY_DATA);
