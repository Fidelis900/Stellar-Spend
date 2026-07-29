import { render } from '@testing-library/react';
import { ReactElement } from 'react';

/**
 * Snapshot testing utilities for React components
 */

export interface SnapshotTestOptions {
  props?: Record<string, unknown>;
  children?: ReactElement;
  errorBoundary?: boolean;
}

/**
 * Create a snapshot test for a component
 */
export function createComponentSnapshot(
  Component: React.ComponentType<any>,
  options?: SnapshotTestOptions,
) {
  const { props = {}, children, errorBoundary = false } = options || {};

  const element = children ? (
    <Component {...props}>{children}</Component>
  ) : (
    <Component {...props} />
  );

  const { container } = render(element);
  return container.firstChild;
}

/**
 * Test component with different prop variations
 */
export function testComponentVariations(
  Component: React.ComponentType<any>,
  variations: Array<{ name: string; props: Record<string, unknown> }>,
) {
  return variations.map(({ name, props }) => ({
    name,
    snapshot: createComponentSnapshot(Component, { props }),
  }));
}

/**
 * Test component error states
 */
export function testComponentErrorStates(
  Component: React.ComponentType<any>,
  errorProps: Record<string, unknown>[],
) {
  return errorProps.map((props, index) => ({
    name: `error-state-${index}`,
    snapshot: createComponentSnapshot(Component, { props, errorBoundary: true }),
  }));
}

/**
 * Normalize snapshot for consistent testing
 */
export function normalizeSnapshot(snapshot: unknown): string {
  if (snapshot instanceof HTMLElement) {
    return snapshot.outerHTML
      .replace(/data-testid="[^"]*"/g, 'data-testid="[testid]"')
      .replace(/id="[^"]*"/g, 'id="[id]"')
      .replace(/key="[^"]*"/g, 'key="[key]"');
  }
  return String(snapshot);
}

/**
 * Compare snapshots for regression detection
 */
export function compareSnapshots(
  current: string,
  previous: string,
): { matches: boolean; diff?: string } {
  if (current === previous) {
    return { matches: true };
  }

  // Simple diff: show lines that differ
  const currentLines = current.split('\n');
  const previousLines = previous.split('\n');
  const diff: string[] = [];

  const maxLines = Math.max(currentLines.length, previousLines.length);
  for (let i = 0; i < maxLines; i++) {
    if (currentLines[i] !== previousLines[i]) {
      diff.push(`Line ${i + 1}:`);
      diff.push(`- ${previousLines[i] || '[missing]'}`);
      diff.push(`+ ${currentLines[i] || '[missing]'}`);
    }
  }

  return { matches: false, diff: diff.join('\n') };
}

/**
 * Update snapshot with new value
 */
export function updateSnapshot(
  snapshotName: string,
  newValue: string,
  snapshotMap: Map<string, string>,
): void {
  snapshotMap.set(snapshotName, newValue);
}

/**
 * Retrieve snapshot by name
 */
export function getSnapshot(
  snapshotName: string,
  snapshotMap: Map<string, string>,
): string | undefined {
  return snapshotMap.get(snapshotName);
}

/**
 * Create snapshot map from test file
 */
export function createSnapshotMap(): Map<string, string> {
  return new Map();
}
