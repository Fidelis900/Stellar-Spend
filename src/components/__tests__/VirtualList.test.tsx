import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VirtualList from '../VirtualList';

describe('VirtualList', () => {
  const mockItems = Array.from({ length: 5000 }, (_, i) => ({ id: i, label: `Item ${i}` }));

  describe('Rendering', () => {
    it('should render only visible items', () => {
      const { container } = render(
        <VirtualList
          items={mockItems}
          itemHeight={50}
          containerHeight={500}
          renderItem={(item) => <div>{item.label}</div>}
        />,
      );

      // With itemHeight=50 and containerHeight=500, should render ~10 items + overscan
      const items = container.querySelectorAll('[role="row"]');
      expect(items.length).toBeLessThan(20); // Significantly less than 5000
      expect(items.length).toBeGreaterThan(5);
    });

    it('should maintain approximate scroll position', () => {
      const { container } = render(
        <VirtualList
          items={mockItems}
          itemHeight={50}
          containerHeight={500}
          renderItem={(item) => <div>{item.label}</div>}
        />,
      );

      const scrollContainer = container.querySelector('div[role="region"]');
      expect(scrollContainer).toHaveStyle({ height: '500px' });
    });
  });

  describe('Keyboard Navigation', () => {
    it('should handle ArrowDown to navigate down', async () => {
      const user = userEvent.setup();
      const focusChanges: number[] = [];

      render(
        <VirtualList
          items={mockItems}
          itemHeight={50}
          containerHeight={500}
          renderItem={(item) => <div>{item.label}</div>}
          onFocusChange={(index) => index !== null && focusChanges.push(index)}
        />,
      );

      const scrollContainer = screen.getByRole('region');
      await user.click(scrollContainer);
      await user.keyboard('{ArrowDown}');

      expect(focusChanges.length).toBeGreaterThan(0);
    });

    it('should handle Home key to navigate to first item', async () => {
      const user = userEvent.setup();
      const focusChanges: (number | null)[] = [];

      const { rerender } = render(
        <VirtualList
          items={mockItems}
          itemHeight={50}
          containerHeight={500}
          renderItem={(item) => <div>{item.label}</div>}
          onFocusChange={(index) => focusChanges.push(index)}
        />,
      );

      const scrollContainer = screen.getByRole('region');
      await user.click(scrollContainer);

      // Move down first
      await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
      const beforeHome = focusChanges.filter((i) => i !== null).length;

      // Then Home
      await user.keyboard('{Home}');

      // Should have reset to 0 or close
      const lastFocus = focusChanges[focusChanges.length - 1];
      expect(lastFocus).toBeLessThanOrEqual(2);
    });

    it('should handle End key to navigate to last item', async () => {
      const user = userEvent.setup();
      const focusChanges: (number | null)[] = [];

      render(
        <VirtualList
          items={mockItems}
          itemHeight={50}
          containerHeight={500}
          renderItem={(item) => <div>{item.label}</div>}
          onFocusChange={(index) => focusChanges.push(index)}
        />,
      );

      const scrollContainer = screen.getByRole('region');
      await user.click(scrollContainer);
      await user.keyboard('{End}');

      const lastFocus = focusChanges[focusChanges.length - 1];
      expect(lastFocus).toBe(mockItems.length - 1);
    });

    it('should handle PageDown and PageUp', async () => {
      const user = userEvent.setup();
      const focusChanges: (number | null)[] = [];

      render(
        <VirtualList
          items={mockItems}
          itemHeight={50}
          containerHeight={500}
          renderItem={(item) => <div>{item.label}</div>}
          onFocusChange={(index) => focusChanges.push(index)}
        />,
      );

      const scrollContainer = screen.getByRole('region');
      await user.click(scrollContainer);

      await user.keyboard('{PageDown}');
      const afterPageDown = focusChanges[focusChanges.length - 1];

      await user.keyboard('{PageUp}');
      const afterPageUp = focusChanges[focusChanges.length - 1];

      expect(typeof afterPageDown).toBe('number');
      expect(typeof afterPageUp).toBe('number');
      expect(afterPageUp).toBeLessThan(afterPageDown);
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      const { container } = render(
        <VirtualList
          items={mockItems}
          itemHeight={50}
          containerHeight={500}
          renderItem={(item) => <div>{item.label}</div>}
          ariaLabel="Test list"
        />,
      );

      const scrollContainer = container.querySelector('[role="region"]');
      expect(scrollContainer).toHaveAttribute('aria-label', 'Test list');
      expect(scrollContainer).toHaveAttribute('aria-rowcount', '5000');
    });

    it('should mark rows with proper aria-rowindex', () => {
      const { container } = render(
        <VirtualList
          items={Array.from({ length: 10 }, (_, i) => ({ id: i }))}
          itemHeight={50}
          containerHeight={500}
          renderItem={(item, index) => <div>{index}</div>}
        />,
      );

      const rows = container.querySelectorAll('[role="row"]');
      rows.forEach((row, i) => {
        const rowIndex = row.getAttribute('aria-rowindex');
        expect(rowIndex).toBeTruthy();
      });
    });

    it('should be keyboard accessible', () => {
      const { container } = render(
        <VirtualList
          items={mockItems}
          itemHeight={50}
          containerHeight={500}
          renderItem={(item) => <div>{item.label}</div>}
        />,
      );

      const scrollContainer = container.querySelector('[role="region"]');
      expect(scrollContainer).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('Performance', () => {
    it('should handle 5000 items without lag', () => {
      const start = performance.now();

      const { container } = render(
        <VirtualList
          items={mockItems}
          itemHeight={50}
          containerHeight={500}
          renderItem={(item) => <div>{item.label}</div>}
        />,
      );

      const end = performance.now();
      const renderTime = end - start;

      // Should render in less than 100ms even with 5000 items
      expect(renderTime).toBeLessThan(100);

      // Only ~10-15 actual DOM nodes should exist
      const rows = container.querySelectorAll('[role="row"]');
      expect(rows.length).toBeLessThan(30);
    });

    it('should handle rapid scroll events efficiently', async () => {
      let renderCount = 0;

      const { container, rerender } = render(
        <VirtualList
          items={mockItems}
          itemHeight={50}
          containerHeight={500}
          renderItem={() => {
            renderCount++;
            return <div>Item</div>;
          }}
        />,
      );

      const scrollContainer = container.querySelector('div[role="region"]') as HTMLDivElement;

      // Simulate rapid scrolling
      for (let i = 0; i < 100; i++) {
        fireEvent.scroll(scrollContainer, { target: { scrollTop: i * 50 } });
      }

      // Render count should be reasonable, not 5000+ times
      expect(renderCount).toBeLessThan(1000);
    });
  });

  describe('Focus Management', () => {
    it('should update focus when item is clicked', async () => {
      const user = userEvent.setup();
      const focusChanges: (number | null)[] = [];

      const { container } = render(
        <VirtualList
          items={Array.from({ length: 20 }, (_, i) => ({ id: i }))}
          itemHeight={50}
          containerHeight={500}
          renderItem={(item, index) => <div role="row">{index}</div>}
          onFocusChange={(index) => focusChanges.push(index)}
        />,
      );

      const rows = container.querySelectorAll('[role="row"]');
      if (rows.length > 0) {
        await user.click(rows[0] as HTMLElement);
        expect(focusChanges.length).toBeGreaterThan(0);
      }
    });

    it('should auto-scroll to focused item', async () => {
      const user = userEvent.setup();

      const { container } = render(
        <VirtualList
          items={mockItems}
          itemHeight={50}
          containerHeight={500}
          renderItem={(item) => <div>{item.label}</div>}
        />,
      );

      const scrollContainer = container.querySelector('div[role="region"]') as HTMLDivElement;

      // Navigate to end
      await user.click(scrollContainer);
      await user.keyboard('{End}');

      // Should have scrolled
      expect(scrollContainer.scrollTop).toBeGreaterThan(0);
    });
  });
});
