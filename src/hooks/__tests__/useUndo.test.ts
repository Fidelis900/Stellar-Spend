import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUndo } from '../useUndo';
import type { UndoableAction } from '../useUndo';

function makeAction(id: string, overrides?: Partial<UndoableAction>): UndoableAction {
  return {
    id,
    description: `Action ${id}`,
    undo: vi.fn(),
    redo: vi.fn(),
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('useUndo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('should start with empty history and no available undo/redo', () => {
    const { result } = renderHook(() => useUndo());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.history).toHaveLength(0);
    expect(result.current.lastAction).toBeNull();
  });

  it('should add an action and enable undo', () => {
    const { result } = renderHook(() => useUndo());
    const action = makeAction('a1');

    act(() => { result.current.addAction(action); });

    expect(result.current.canUndo).toBe(true);
    expect(result.current.history).toHaveLength(1);
    expect(result.current.lastAction?.id).toBe('a1');
  });

  it('should call action.undo() when undo is invoked', () => {
    const { result } = renderHook(() => useUndo());
    const action = makeAction('a1');

    act(() => { result.current.addAction(action); });
    act(() => { result.current.undo(); });

    expect(action.undo).toHaveBeenCalledTimes(1);
  });

  it('should call action.redo() when redo is invoked after undo', () => {
    const { result } = renderHook(() => useUndo());
    const action = makeAction('a1');

    act(() => { result.current.addAction(action); });
    act(() => { result.current.undo(); });
    act(() => { result.current.redo(); });

    expect(action.redo).toHaveBeenCalledTimes(1);
  });

  it('should not redo when already at the latest action', () => {
    const { result } = renderHook(() => useUndo());
    const action = makeAction('a1');

    act(() => { result.current.addAction(action); });

    expect(result.current.canRedo).toBe(false);
    act(() => { result.current.redo(); }); // no-op

    expect(action.redo).not.toHaveBeenCalled();
  });

  it('should expire actions after the timeout', () => {
    const { result } = renderHook(() => useUndo({ timeout: 1000 }));
    const action = makeAction('a1');

    act(() => { result.current.addAction(action); });
    expect(result.current.history).toHaveLength(1);

    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.history).toHaveLength(0);
  });

  it('should respect maxHistory limit', () => {
    const { result } = renderHook(() => useUndo({ maxHistory: 3 }));

    act(() => {
      result.current.addAction(makeAction('a1'));
      result.current.addAction(makeAction('a2'));
      result.current.addAction(makeAction('a3'));
    });

    expect(result.current.history.length).toBeLessThanOrEqual(3);
  });
});
