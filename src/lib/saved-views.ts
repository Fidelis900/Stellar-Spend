import type { SearchFilters } from '@/lib/transaction-search';

export interface SavedView {
  id: string;
  name: string;
  filters: SearchFilters;
  createdAt: number;
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: SearchFilters;
}

const STORAGE_KEY = 'stellar_spend_saved_views';

/** Quick presets that aren't persisted but are always offered to the user */
export const FILTER_PRESETS: FilterPreset[] = [
  {
    id: 'failed-last-30-days',
    name: 'Failed last 30 days',
    filters: {
      status: 'failed',
      dateFrom: Date.now() - 30 * 24 * 60 * 60 * 1000,
    },
  },
  {
    id: 'favorites',
    name: 'Favorites',
    filters: { isFavorite: true },
  },
  {
    id: 'pending',
    name: 'Pending',
    filters: { status: 'pending' },
  },
];

function readAll(): SavedView[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(views: SavedView[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    // localStorage may be unavailable (quota, private mode); fail silently.
  }
}

export class SavedViewsStorage {
  // Persisted locally for now; cross-device sync is tracked separately (#1).
  // save() always appends, so reversing gives most-recently-created first
  // without relying on Date.now() ties (saves in the same millisecond).
  static list(): SavedView[] {
    return [...readAll()].reverse();
  }

  static save(name: string, filters: SearchFilters): SavedView {
    const view: SavedView = {
      id: `view_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      filters,
      createdAt: Date.now(),
    };
    writeAll([...readAll(), view]);
    return view;
  }

  static remove(id: string): void {
    writeAll(readAll().filter((v) => v.id !== id));
  }

  static getById(id: string): SavedView | undefined {
    return readAll().find((v) => v.id === id);
  }
}
