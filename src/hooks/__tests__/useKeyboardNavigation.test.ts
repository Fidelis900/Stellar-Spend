import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardNavigation } from '../useKeyboardNavigation';

function fireKey(key: string, extra?: Partial<KeyboardEventInit>) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...extra }));
}

describe('useKeyboardNavigation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should call onEscape when Escape is pressed', () => {
    const onEscape = vi.fn();
    renderHook(() => useKeyboardNavigation({ onEscape }));

    fireKey('Escape');

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('should call onEnter when Enter is pressed (no modifier)', () => {
    const onEnter = vi.fn();
    renderHook(() => useKeyboardNavigation({ onEnter }));

    fireKey('Enter');

    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('should NOT call onEnter when Ctrl+Enter is pressed', () => {
    const onEnter = vi.fn();
    renderHook(() => useKeyboardNavigation({ onEnter }));

    fireKey('Enter', { ctrlKey: true });

    expect(onEnter).not.toHaveBeenCalled();
  });

  it('should call onArrowUp when ArrowUp is pressed', () => {
    const onArrowUp = vi.fn();
    renderHook(() => useKeyboardNavigation({ onArrowUp }));

    fireKey('ArrowUp');

    expect(onArrowUp).toHaveBeenCalledTimes(1);
  });

  it('should call onArrowDown when ArrowDown is pressed', () => {
    const onArrowDown = vi.fn();
    renderHook(() => useKeyboardNavigation({ onArrowDown }));

    fireKey('ArrowDown');

    expect(onArrowDown).toHaveBeenCalledTimes(1);
  });

  it('should call onArrowLeft / onArrowRight', () => {
    const onArrowLeft = vi.fn();
    const onArrowRight = vi.fn();
    renderHook(() => useKeyboardNavigation({ onArrowLeft, onArrowRight }));

    fireKey('ArrowLeft');
    fireKey('ArrowRight');

    expect(onArrowLeft).toHaveBeenCalledTimes(1);
    expect(onArrowRight).toHaveBeenCalledTimes(1);
  });

  it('should not fire any handler when enabled = false', () => {
    const onEscape = vi.fn();
    const onEnter = vi.fn();
    renderHook(() =>
      useKeyboardNavigation({ onEscape, onEnter, enabled: false }),
    );

    fireKey('Escape');
    fireKey('Enter');

    expect(onEscape).not.toHaveBeenCalled();
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('should remove the event listener on unmount', () => {
    const onEscape = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardNavigation({ onEscape }),
    );

    unmount();

    fireKey('Escape');

    expect(onEscape).not.toHaveBeenCalled();
  });
});
