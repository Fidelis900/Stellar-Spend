'use client';

import { memo, useCallback, useRef, useState, useEffect } from 'react';
import { useVirtualScroll } from '@/lib/performance-hooks';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  renderItem: (item: T, index: number, isFocused: boolean) => React.ReactNode;
  className?: string;
  overscan?: number;
  onFocusChange?: (index: number | null) => void;
  role?: string;
  ariaLabel?: string;
}

/**
 * Virtual scrolling component for rendering large lists efficiently.
 * Only renders visible items to improve performance.
 * Supports keyboard navigation and focus management.
 * Memoized to prevent unnecessary re-renders.
 */
const VirtualList = memo(function VirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  className = '',
  overscan = 3,
  onFocusChange,
  role = 'region',
  ariaLabel = 'Virtual list',
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<(HTMLDivElement | null)[]>([]);

  const { startIndex, endIndex, offsetY } = useVirtualScroll(
    items.length,
    itemHeight,
    containerHeight,
    scrollTop,
  );

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop((e.target as HTMLDivElement).scrollTop);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (focusedIndex === null) return;

      let nextIndex = focusedIndex;
      let shouldScroll = false;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          nextIndex = Math.min(focusedIndex + 1, items.length - 1);
          shouldScroll = true;
          break;
        case 'ArrowUp':
          e.preventDefault();
          nextIndex = Math.max(focusedIndex - 1, 0);
          shouldScroll = true;
          break;
        case 'Home':
          e.preventDefault();
          nextIndex = 0;
          shouldScroll = true;
          break;
        case 'End':
          e.preventDefault();
          nextIndex = items.length - 1;
          shouldScroll = true;
          break;
        case 'PageDown':
          e.preventDefault();
          nextIndex = Math.min(
            focusedIndex + Math.floor(containerHeight / itemHeight),
            items.length - 1,
          );
          shouldScroll = true;
          break;
        case 'PageUp':
          e.preventDefault();
          nextIndex = Math.max(focusedIndex - Math.floor(containerHeight / itemHeight), 0);
          shouldScroll = true;
          break;
        default:
          return;
      }

      if (nextIndex !== focusedIndex) {
        setFocusedIndex(nextIndex);
        onFocusChange?.(nextIndex);

        if (shouldScroll) {
          // Scroll to make focused item visible
          const itemTop = nextIndex * itemHeight;
          const itemBottom = itemTop + itemHeight;
          const containerScrollTop = containerRef.current?.scrollTop ?? 0;
          const containerScrollBottom = containerScrollTop + containerHeight;

          if (itemTop < containerScrollTop) {
            containerRef.current?.scrollTo({ top: itemTop, behavior: 'smooth' });
          } else if (itemBottom > containerScrollBottom) {
            containerRef.current?.scrollTo({
              top: itemBottom - containerHeight,
              behavior: 'smooth',
            });
          }
        }
      }
    },
    [focusedIndex, items.length, containerHeight, itemHeight, onFocusChange],
  );

  const visibleItems = items.slice(
    Math.max(0, startIndex - overscan),
    Math.min(items.length, endIndex + overscan),
  );

  const visibleStartIndex = Math.max(0, startIndex - overscan);

  return (
    <div
      ref={containerRef}
      className={`overflow-y-auto focus:outline-none focus:ring-1 focus:ring-[#c9a962] ${className}`}
      style={{ height: containerHeight }}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      role={role}
      aria-label={ariaLabel}
      tabIndex={items.length > 0 ? 0 : -1}
      aria-rowcount={items.length}
    >
      <div style={{ height: items.length * itemHeight, position: 'relative' }}>
        <div
          style={{
            transform: `translateY(${visibleStartIndex * itemHeight + offsetY - startIndex * itemHeight}px)`,
          }}
        >
          {visibleItems.map((item, index) => {
            const absoluteIndex = visibleStartIndex + index;
            const isFocused = focusedIndex === absoluteIndex;

            return (
              <div
                key={absoluteIndex}
                ref={(el) => {
                  itemsRef.current[absoluteIndex] = el;
                }}
                style={{ height: itemHeight, overflow: 'hidden' }}
                role="row"
                aria-rowindex={absoluteIndex + 1}
                tabIndex={isFocused ? 0 : -1}
                onClick={() => {
                  setFocusedIndex(absoluteIndex);
                  onFocusChange?.(absoluteIndex);
                }}
                onFocus={() => {
                  setFocusedIndex(absoluteIndex);
                  onFocusChange?.(absoluteIndex);
                }}
              >
                {renderItem(item, absoluteIndex, isFocused)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default VirtualList;
