/**
 * Tests for useFocusTrap and useFocusRestore hooks (#835)
 *
 * Covers:
 *  useFocusTrap:
 *  - Does not trap focus when active=false
 *  - Tab wraps from last to first focusable element
 *  - Shift+Tab wraps from first to last focusable element
 *  - Does nothing when there are no focusable elements
 *  - Removes event listener on cleanup
 *
 *  useFocusRestore:
 *  - Saves trigger element when active becomes true
 *  - Restores focus to saved trigger when active becomes false
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFocusTrap, useFocusRestore } from '../useFocusTrap';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Create a container div with N buttons inside it, all attached to document */
function createFocusableContainer(buttonCount: number): HTMLDivElement {
  const container = document.createElement('div');
  for (let i = 0; i < buttonCount; i++) {
    const btn = document.createElement('button');
    btn.textContent = `Button ${i}`;
    container.appendChild(btn);
  }
  document.body.appendChild(container);
  return container;
}

/** Simulate a keydown event on the container element */
function fireKeyDown(
  container: HTMLElement,
  key: string,
  shiftKey = false,
): void {
  const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true });
  container.dispatchEvent(event);
}

// ── useFocusTrap ───────────────────────────────────────────────────────────

describe('useFocusTrap', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = createFocusableContainer(3);
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  it('does not attach keydown listener when active=false', () => {
    const spy = vi.spyOn(container, 'addEventListener');
    const ref = { current: container };

    renderHook(() => useFocusTrap(ref, false));

    expect(spy).not.toHaveBeenCalled();
  });

  it('attaches keydown listener when active=true', () => {
    const spy = vi.spyOn(container, 'addEventListener');
    const ref = { current: container };

    renderHook(() => useFocusTrap(ref, true));

    expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('wraps Tab from last focusable element to first', () => {
    const ref = { current: container };
    renderHook(() => useFocusTrap(ref, true));

    const buttons = container.querySelectorAll<HTMLElement>('button');
    const first = buttons[0];
    const last = buttons[buttons.length - 1];

    // Focus the last button
    last.focus();
    expect(document.activeElement).toBe(last);

    // Fire Tab on last element — should wrap to first
    fireKeyDown(container, 'Tab', false);

    expect(document.activeElement).toBe(first);
  });

  it('wraps Shift+Tab from first focusable element to last', () => {
    const ref = { current: container };
    renderHook(() => useFocusTrap(ref, true));

    const buttons = container.querySelectorAll<HTMLElement>('button');
    const first = buttons[0];
    const last = buttons[buttons.length - 1];

    // Focus the first button
    first.focus();
    expect(document.activeElement).toBe(first);

    // Fire Shift+Tab on first element — should wrap to last
    fireKeyDown(container, 'Tab', true);

    expect(document.activeElement).toBe(last);
  });

  it('does not move focus when Tab is pressed on a middle element', () => {
    const ref = { current: container };
    renderHook(() => useFocusTrap(ref, true));

    const buttons = container.querySelectorAll<HTMLElement>('button');
    const middle = buttons[1];

    middle.focus();
    fireKeyDown(container, 'Tab', false);

    // Default browser Tab behaviour is not simulated in jsdom;
    // the trap only acts on boundary elements, so focus stays on middle.
    expect(document.activeElement).toBe(middle);
  });

  it('ignores non-Tab key presses', () => {
    const ref = { current: container };
    renderHook(() => useFocusTrap(ref, true));

    const buttons = container.querySelectorAll<HTMLElement>('button');
    const first = buttons[0];
    first.focus();

    fireKeyDown(container, 'Escape', false);

    // Focus should not have changed
    expect(document.activeElement).toBe(first);
  });

  it('does nothing when there are no focusable elements', () => {
    const emptyContainer = document.createElement('div');
    document.body.appendChild(emptyContainer);
    const ref = { current: emptyContainer };

    expect(() => {
      renderHook(() => useFocusTrap(ref, true));
      fireKeyDown(emptyContainer, 'Tab', false);
    }).not.toThrow();

    document.body.removeChild(emptyContainer);
  });

  it('does nothing when ref.current is null', () => {
    const ref = { current: null };
    expect(() => {
      renderHook(() => useFocusTrap(ref, true));
    }).not.toThrow();
  });

  it('removes keydown listener on cleanup (active→false)', () => {
    const spy = vi.spyOn(container, 'removeEventListener');
    const ref = { current: container };

    const { unmount } = renderHook(() => useFocusTrap(ref, true));
    unmount();

    expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});

// ── useFocusRestore ────────────────────────────────────────────────────────

describe('useFocusRestore', () => {
  let triggerButton: HTMLButtonElement;

  beforeEach(() => {
    triggerButton = document.createElement('button');
    triggerButton.textContent = 'Open Modal';
    document.body.appendChild(triggerButton);
  });

  afterEach(() => {
    document.body.removeChild(triggerButton);
    vi.restoreAllMocks();
  });

  it('restores focus to the previously focused element when active becomes false', () => {
    // Focus the trigger first
    triggerButton.focus();
    expect(document.activeElement).toBe(triggerButton);

    // Mount with active=true (simulates modal open)
    const { rerender } = renderHook(({ active }) => useFocusRestore(active), {
      initialProps: { active: true },
    });

    // Move focus elsewhere
    const otherBtn = document.createElement('button');
    document.body.appendChild(otherBtn);
    otherBtn.focus();

    // Simulate modal close — active goes false
    act(() => {
      rerender({ active: false });
    });

    // Focus should be restored to the trigger
    expect(document.activeElement).toBe(triggerButton);

    document.body.removeChild(otherBtn);
  });

  it('does not restore focus when active was never true', () => {
    const initialFocus = document.activeElement;

    const { rerender } = renderHook(({ active }) => useFocusRestore(active), {
      initialProps: { active: false },
    });

    // active stays false — no restore expected
    act(() => {
      rerender({ active: false });
    });

    // Focus should not have changed unexpectedly
    expect(document.activeElement).toBe(initialFocus);
  });

  it('does not throw when document.activeElement is not focusable', () => {
    // No element focused
    (document.activeElement as HTMLElement | null)?.blur?.();

    expect(() => {
      const { rerender } = renderHook(({ active }) => useFocusRestore(active), {
        initialProps: { active: true },
      });
      act(() => {
        rerender({ active: false });
      });
    }).not.toThrow();
  });
});
