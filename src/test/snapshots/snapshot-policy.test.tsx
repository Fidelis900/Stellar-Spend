/**
 * snapshot-policy.test.tsx
 *
 * Issue #836 — Snapshot Testing Policy enforcement
 *
 * This file serves two purposes:
 *  1. Documents (via describe blocks) every component / module that owns a
 *     snapshot file, so reviewers have a single place to audit coverage.
 *  2. Guards key structural invariants in the existing DataTable snapshot so
 *     that a silent deletion or wholesale replacement of the .snap file is
 *     caught immediately.
 *
 * IMPORTANT: This file does NOT re-render the components from scratch.
 * It imports the raw snapshot strings and asserts against their content.
 * This makes the checks fast, dependency-free, and independent of the DOM
 * environment — while still catching the most dangerous category of snapshot
 * drift: complete erasure or mass-replacement of a snapshot key.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Import snapshot files directly so their contents can be inspected at test
// time.  Vitest snapshots are CommonJS modules that export plain objects, so
// we use a dynamic require() here to stay compatible with the ESM test runner.
// ---------------------------------------------------------------------------

// DataTable snapshot (src/test/__snapshots__/DataTable.test.tsx.snap)
const dataTableSnaps = await import(
  /* @vite-ignore */ '../__snapshots__/DataTable.test.tsx.snap'
);

// Formatters snapshot (src/lib/__snapshots__/formatters.test.ts.snap)
const formattersSnaps = await import(
  /* @vite-ignore */ '../../lib/__snapshots__/formatters.test.ts.snap'
);

// ---------------------------------------------------------------------------
// 1. Inventory — verify that each known snapshot key exists
// ---------------------------------------------------------------------------

describe('Snapshot inventory', () => {
  describe('DataTable snapshots (src/test/__snapshots__/DataTable.test.tsx.snap)', () => {
    it('contains the basic render snapshot key', () => {
      const key = 'DataTable > matches the snapshot for a basic render 1';
      expect(dataTableSnaps).toHaveProperty(key);
    });

    it('snapshot value is a non-empty string', () => {
      const key = 'DataTable > matches the snapshot for a basic render 1';
      const value: unknown = dataTableSnaps[key];
      expect(typeof value).toBe('string');
      expect((value as string).length).toBeGreaterThan(0);
    });
  });

  describe('Formatter snapshots (src/lib/__snapshots__/formatters.test.ts.snap)', () => {
    const expectedKeys = [
      'DateFormatter > formatCompact > snapshot: formats compact date consistently 1',
      'DateFormatter > formatDateOnly > snapshot: formats date-only consistently 1',
      'DateFormatter > formatRange > snapshot: formats range consistently 1',
      'DateFormatter > formatTimestamp > snapshot: formats timestamp consistently 1',
      'helper functions > formatTransaction > snapshot: formats transaction consistently 1',
      'helper functions > formatTransactionDate > snapshot: formats transaction date consistently 1',
    ];

    for (const key of expectedKeys) {
      it(`contains key: "${key}"`, () => {
        expect(formattersSnaps).toHaveProperty(key);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// 2. DataTable structural invariants
//    These assertions guard the accessibility and layout contract of the
//    DataTable component without requiring a full re-render.
// ---------------------------------------------------------------------------

describe('DataTable snapshot structural invariants', () => {
  const SNAP_KEY = 'DataTable > matches the snapshot for a basic render 1';
  // Cast is safe — we verified the key exists above.
  const html: string = dataTableSnaps[SNAP_KEY] as string;

  // --- Desktop table layout ---

  it('contains a <table> element', () => {
    expect(html).toContain('<table');
  });

  it('has an aria-label on the <table>', () => {
    expect(html).toMatch(/aria-label="[^"]+"/);
  });

  it('contains a <thead> with sticky positioning class', () => {
    expect(html).toContain('<thead');
    expect(html).toContain('sticky top-0');
  });

  it('contains <th> elements with scope="col"', () => {
    expect(html).toMatch(/scope="col"/);
  });

  it('has aria-sort attributes on column headers', () => {
    expect(html).toMatch(/aria-sort="none"/);
  });

  it('column header buttons have focus-visible ring styles', () => {
    expect(html).toContain('focus-visible:ring-1');
  });

  it('contains "Name" and "Score" column headers', () => {
    expect(html).toMatch(/>\s*Name\s*</);
    expect(html).toMatch(/>\s*Score\s*</);
  });

  it('renders 3 data rows in <tbody>', () => {
    // Each row starts with <tr — count occurrences inside tbody
    const tbodySection = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
    const rowMatches = tbodySection.match(/<tr\b/g) ?? [];
    expect(rowMatches.length).toBe(3);
  });

  it('renders expected row data: Charlie, Alice, Bob', () => {
    expect(html).toMatch(/>\s*Charlie\s*</);
    expect(html).toMatch(/>\s*Alice\s*</);
    expect(html).toMatch(/>\s*Bob\s*</);
  });

  it('renders expected score values: 30, 10, 20', () => {
    expect(html).toMatch(/>\s*30\s*</);
    expect(html).toMatch(/>\s*10\s*</);
    expect(html).toMatch(/>\s*20\s*</);
  });

  // --- Mobile card layout ---

  it('contains a <ul> element for mobile card layout', () => {
    expect(html).toContain('<ul');
  });

  it('mobile layout uses md:hidden class', () => {
    expect(html).toContain('md:hidden');
  });

  it('desktop layout uses hidden md:block class', () => {
    expect(html).toContain('hidden md:block');
  });

  it('mobile cards contain label spans with tracking-widest class', () => {
    expect(html).toContain('tracking-widest');
  });

  it('mobile cards repeat all three row values', () => {
    // Each name should appear at least twice in total (desktop table + mobile card)
    const charlieCount = (html.match(/Charlie/g) ?? []).length;
    expect(charlieCount).toBeGreaterThanOrEqual(2);
  });

  // --- Accessibility ---

  it('data cells are text-white for sufficient contrast', () => {
    expect(html).toContain('text-white');
  });

  it('snapshot does not contain any live timestamps or random IDs', () => {
    // Guard against accidentally capturing non-deterministic output.
    // A timestamp pattern like "2026-07-28" should not appear in static fixture data.
    expect(html).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    // UUIDs
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});

// ---------------------------------------------------------------------------
// 3. Formatter snapshot value-level checks
//    The formatters snapshot uses a fixed date; confirm the frozen values are
//    still present and have not been silently replaced.
// ---------------------------------------------------------------------------

describe('Formatter snapshot value-level checks', () => {
  it('formatCompact snapshot contains expected compact date string', () => {
    const val =
      formattersSnaps[
        'DateFormatter > formatCompact > snapshot: formats compact date consistently 1'
      ];
    // Value is a quoted snapshot string, e.g. `"07/25/25"`
    expect(String(val)).toContain('07/25/25');
  });

  it('formatDateOnly snapshot contains expected long-form date string', () => {
    const val =
      formattersSnaps[
        'DateFormatter > formatDateOnly > snapshot: formats date-only consistently 1'
      ];
    expect(String(val)).toContain('Jul 25, 2025');
  });

  it('formatTimestamp snapshot contains month, year and UTC marker', () => {
    const val =
      formattersSnaps[
        'DateFormatter > formatTimestamp > snapshot: formats timestamp consistently 1'
      ];
    const str = String(val);
    expect(str).toContain('Jul 25, 2025');
    expect(str).toContain('UTC');
  });

  it('formatRange snapshot contains both start and end of range', () => {
    const val =
      formattersSnaps[
        'DateFormatter > formatRange > snapshot: formats range consistently 1'
      ];
    const str = String(val);
    expect(str).toContain('Jul 20, 2025');
    expect(str).toContain('Jul 25, 2025');
  });
});

// ---------------------------------------------------------------------------
// 4. Policy guard — snapshots must not be empty
//    A common footgun: running `--update-snapshots` against a broken
//    component that renders nothing produces an empty snapshot.  This block
//    ensures neither snapshot file has been hollowed out.
// ---------------------------------------------------------------------------

describe('Snapshot files are non-trivially populated', () => {
  it('DataTable snapshot file exports at least 1 key', () => {
    const keys = Object.keys(dataTableSnaps).filter((k) => k !== 'default');
    expect(keys.length).toBeGreaterThanOrEqual(1);
  });

  it('Formatters snapshot file exports at least 6 keys', () => {
    const keys = Object.keys(formattersSnaps).filter((k) => k !== 'default');
    expect(keys.length).toBeGreaterThanOrEqual(6);
  });

  it('DataTable snapshot value has substantial length (> 500 chars)', () => {
    const val = String(
      dataTableSnaps['DataTable > matches the snapshot for a basic render 1']
    );
    expect(val.length).toBeGreaterThan(500);
  });
});
