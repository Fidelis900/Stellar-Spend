import { describe, it, expect, beforeEach } from 'vitest';
import { SavedViewsStorage, FILTER_PRESETS } from '../saved-views';

describe('SavedViewsStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts empty', () => {
    expect(SavedViewsStorage.list()).toEqual([]);
  });

  it('saves and lists a named view with its filters', () => {
    const view = SavedViewsStorage.save('Failed NGN', { status: 'failed', currency: 'NGN' });
    const all = SavedViewsStorage.list();

    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(view.id);
    expect(all[0].name).toBe('Failed NGN');
    expect(all[0].filters).toEqual({ status: 'failed', currency: 'NGN' });
  });

  it('lists views most-recently-created first', () => {
    SavedViewsStorage.save('First', { status: 'all' });
    SavedViewsStorage.save('Second', { status: 'completed' });

    const all = SavedViewsStorage.list();
    expect(all.map((v) => v.name)).toEqual(['Second', 'First']);
  });

  it('removes a view by id', () => {
    const view = SavedViewsStorage.save('Temp', { status: 'pending' });
    SavedViewsStorage.remove(view.id);
    expect(SavedViewsStorage.list()).toEqual([]);
  });

  it('retrieves a view by id', () => {
    const view = SavedViewsStorage.save('Lookup', { isFavorite: true });
    expect(SavedViewsStorage.getById(view.id)?.name).toBe('Lookup');
    expect(SavedViewsStorage.getById('missing')).toBeUndefined();
  });
});

describe('FILTER_PRESETS', () => {
  it('exposes the "Failed last 30 days" preset', () => {
    const preset = FILTER_PRESETS.find((p) => p.id === 'failed-last-30-days');
    expect(preset).toBeDefined();
    expect(preset?.filters.status).toBe('failed');
    expect(preset?.filters.dateFrom).toBeLessThan(Date.now());
  });

  it('has unique preset ids', () => {
    const ids = FILTER_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
