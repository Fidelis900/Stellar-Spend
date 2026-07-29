'use client';

import { useMemo, useCallback, ReactNode, memo } from 'react';

/**
 * Performance optimization utilities for React components.
 * Provides helpers for memoization, expensive calculations, and re-render optimization.
 */

/**
 * Memoize expensive components to prevent unnecessary re-renders.
 * Use when component receives stable props or when re-renders are expensive.
 */
export function withMemo<P extends object>(
  Component: React.ComponentType<P>,
  propsAreEqual?: (prevProps: P, nextProps: P) => boolean,
): React.MemoExoticComponent<React.ComponentType<P>> {
  return memo(Component, propsAreEqual);
}

/**
 * Debounce a callback function to reduce re-renders.
 * Useful for search, resize, and scroll handlers.
 */
export function useDebounce<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number,
): T {
  return useMemo(() => {
    let timeoutId: NodeJS.Timeout;

    return ((...args: unknown[]) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => callback(...args), delay);
    }) as T;
  }, [callback, delay]);
}

/**
 * Throttle a callback function to limit execution frequency.
 * Useful for scroll and resize events.
 */
export function useThrottle<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number,
): T {
  return useMemo(() => {
    let lastRun = 0;

    return ((...args: unknown[]) => {
      const now = Date.now();
      if (now - lastRun >= delay) {
        lastRun = now;
        callback(...args);
      }
    }) as T;
  }, [callback, delay]);
}

/**
 * Memoize expensive calculations with dependency tracking.
 * Automatically re-computes when dependencies change.
 */
export function useMemoized<T>(factory: () => T, deps: React.DependencyList): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(factory, deps);
}

/**
 * Create a stable callback that doesn't change between renders.
 * Prevents child components from re-rendering unnecessarily.
 */
export function useStableCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  deps: React.DependencyList,
): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(callback, deps) as T;
}

/**
 * Virtual scrolling hook for rendering large lists efficiently.
 * Only renders visible items to improve performance.
 */
export function useVirtualScroll(
  itemCount: number,
  itemHeight: number,
  containerHeight: number,
  scrollTop: number,
) {
  return useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 1);
    const endIndex = Math.min(itemCount, Math.ceil((scrollTop + containerHeight) / itemHeight) + 1);
    const offsetY = startIndex * itemHeight;

    return {
      startIndex,
      endIndex,
      offsetY,
      visibleItems: endIndex - startIndex,
    };
  }, [itemCount, itemHeight, containerHeight, scrollTop]);
}

/**
 * Intersection Observer hook for lazy loading and visibility detection.
 */
export function useIntersectionObserver(
  ref: React.RefObject<HTMLElement>,
  options: IntersectionObserverInit = {},
): boolean {
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting);
    }, options);

    observer.observe(ref.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);

  return isVisible;
}

/**
 * Batch state updates to reduce re-renders.
 * Useful for multiple state changes in event handlers.
 */
export function useBatchUpdate<T extends Record<string, unknown>>(
  initialState: T,
): [T, (updates: Partial<T>) => void] {
  const [state, setState] = React.useState(initialState);

  const batchUpdate = useCallback((updates: Partial<T>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  return [state, batchUpdate];
}

/**
 * Memoize object/array props to prevent unnecessary re-renders.
 * Compares by value instead of reference.
 */
export function useMemoizedValue<T>(value: T, isEqual?: (a: T, b: T) => boolean): T {
  const ref = React.useRef<T>(value);
  const defaultIsEqual = (a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
  const compare = isEqual || defaultIsEqual;

  if (!compare(ref.current, value)) {
    ref.current = value;
  }

  return ref.current;
}

/**
 * Lazy load a component dynamically to reduce initial bundle size.
 */
export function useLazyComponent<P extends object>(
  importFn: () => Promise<{ default: React.ComponentType<P> }>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fallback: ReactNode = null,
): React.ComponentType<P> | null {
  const [Component, setComponent] = React.useState<React.ComponentType<P> | null>(null);

  React.useEffect(() => {
    importFn().then((module) => setComponent(() => module.default));
  }, [importFn]);

  return Component;
}
