"use client";

import type { SavedView } from "@/lib/saved-views";
import type { Filters } from "../filters";
import { SavedViewsBar } from "./SavedViewsBar";
import { FilterInputs } from "./FilterInputs";

interface HistoryFiltersProps {
  filters: Filters;
  filterCount: number;
  availableCurrencies: string[];
  savedViews: SavedView[];
  onChange: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  onClear: () => void;
  onApplyPreset: (presetId: string) => void;
  onApplySavedView: (viewId: string) => void;
  onSaveCurrentView: () => void;
  onDeleteSavedView: (viewId: string) => void;
}

/** Presentational filters panel: header, saved-view chips, and the filter inputs. */
export function HistoryFilters({
  filters,
  filterCount,
  availableCurrencies,
  savedViews,
  onChange,
  onClear,
  onApplyPreset,
  onApplySavedView,
  onSaveCurrentView,
  onDeleteSavedView,
}: HistoryFiltersProps) {
  const hasActiveFilters = filterCount > 0;

  return (
    <div className="border border-[#333333] bg-[#111111] p-4 mt-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[10px] tracking-widest uppercase text-[#aaaaaa]">Filters</h2>
        {hasActiveFilters && (
          <span
            aria-label={`${filterCount} active filter${filterCount === 1 ? "" : "s"}`}
            className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 text-[10px] font-bold rounded-full bg-[#c9a962] text-[#0a0a0a]"
          >
            {filterCount}
          </span>
        )}
      </div>

      <SavedViewsBar
        savedViews={savedViews}
        onApplyPreset={onApplyPreset}
        onApplySavedView={onApplySavedView}
        onSaveCurrentView={onSaveCurrentView}
        onDeleteSavedView={onDeleteSavedView}
      />

      <FilterInputs
        filters={filters}
        availableCurrencies={availableCurrencies}
        hasActiveFilters={hasActiveFilters}
        onChange={onChange}
        onClear={onClear}
      />
    </div>
  );
}
