"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DEFAULT_FILTERS,
  FILTERS_STORAGE_KEY,
  activeFilterCount,
  filtersFromSearchParams,
  filtersToSearchParams,
  fromServiceFilters,
  loadStoredFilters,
  toServiceFilters,
  type Filters,
  type SortField,
} from "@/app/history/filters";
import {
  FILTER_PRESETS,
  SavedViewsStorage,
  type SavedView,
} from "@/lib/saved-views";
import type { SearchFilters } from "@/lib/transaction-search";

export interface UseHistoryFiltersResult {
  filters: Filters;
  filtersLoaded: boolean;
  filterCount: number;
  savedViews: SavedView[];
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  set: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  clear: () => void;
  toggleSort: (field: SortField) => void;
  applyPreset: (presetId: string) => void;
  applySavedView: (viewId: string) => void;
  saveCurrentView: (name: string) => void;
  deleteSavedView: (viewId: string) => void;
}

/**
 * Owns the history view's filter state: hydration from URL/localStorage,
 * persistence back to both, sorting, and saved-view/preset management.
 */
export function useHistoryFilters(): UseHistoryFiltersResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);

  // Hydrate on mount: URL params take precedence over localStorage so a shared
  // link reproduces the same view.
  useEffect(() => {
    const fromUrl = filtersFromSearchParams(searchParams);
    setFilters({ ...loadStoredFilters(), ...fromUrl } as Filters);
    setFiltersLoaded(true);
    setSavedViews(SavedViewsStorage.list());
    // Only run on mount; the URL is derived from filters afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist filters (after hydration) and mirror them into the URL.
  useEffect(() => {
    if (!filtersLoaded) return;
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // localStorage may be unavailable (quota, private mode); fail silently.
    }
    const qs = filtersToSearchParams(filters).toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [filters, filtersLoaded, pathname, router]);

  const set = useCallback(
    <K extends keyof Filters>(key: K, value: Filters[K]) =>
      setFilters((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const clear = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const toggleSort = useCallback(
    (field: SortField) =>
      setFilters((prev) => ({
        ...prev,
        sortField: field,
        sortDir:
          prev.sortField === field && prev.sortDir === "desc" ? "asc" : "desc",
      })),
    [],
  );

  const applyServiceFilters = useCallback((next: SearchFilters) => {
    setFilters((prev) => fromServiceFilters(next, prev));
  }, []);

  const applyPreset = useCallback(
    (presetId: string) => {
      const preset = FILTER_PRESETS.find((p) => p.id === presetId);
      if (preset) applyServiceFilters(preset.filters);
    },
    [applyServiceFilters],
  );

  const applySavedView = useCallback(
    (viewId: string) => {
      const view = savedViews.find((v) => v.id === viewId);
      if (view) applyServiceFilters(view.filters);
    },
    [savedViews, applyServiceFilters],
  );

  const saveCurrentView = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      SavedViewsStorage.save(trimmed, toServiceFilters(filters));
      setSavedViews(SavedViewsStorage.list());
    },
    [filters],
  );

  const deleteSavedView = useCallback((viewId: string) => {
    SavedViewsStorage.remove(viewId);
    setSavedViews(SavedViewsStorage.list());
  }, []);

  return {
    filters,
    filtersLoaded,
    filterCount: activeFilterCount(filters),
    savedViews,
    setFilters,
    set,
    clear,
    toggleSort,
    applyPreset,
    applySavedView,
    saveCurrentView,
    deleteSavedView,
  };
}
