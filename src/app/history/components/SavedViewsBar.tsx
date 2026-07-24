"use client";

import { FILTER_PRESETS, type SavedView } from "@/lib/saved-views";

interface SavedViewsBarProps {
  savedViews: SavedView[];
  onApplyPreset: (presetId: string) => void;
  onApplySavedView: (viewId: string) => void;
  onSaveCurrentView: () => void;
  onDeleteSavedView: (viewId: string) => void;
}

const chipClass =
  "text-[10px] tracking-widest uppercase px-2 py-1 border border-[#333333] text-[#999999] hover:border-[#c9a962] hover:text-[#c9a962] transition-colors duration-150";

/** Quick presets and persisted saved-view chips for the filters panel. */
export function SavedViewsBar({
  savedViews,
  onApplyPreset,
  onApplySavedView,
  onSaveCurrentView,
  onDeleteSavedView,
}: SavedViewsBarProps) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="text-[10px] text-[#777777] uppercase tracking-widest">Presets</span>
      {FILTER_PRESETS.map((preset) => (
        <button key={preset.id} onClick={() => onApplyPreset(preset.id)} className={chipClass}>
          {preset.name}
        </button>
      ))}

      <span className="ml-2 text-[10px] text-[#777777] uppercase tracking-widest">Saved views</span>
      {savedViews.length === 0 ? (
        <span className="text-[10px] text-[#555555]">None yet</span>
      ) : (
        savedViews.map((view) => (
          <span key={view.id} className="inline-flex items-center gap-1">
            <button onClick={() => onApplySavedView(view.id)} className={chipClass}>
              {view.name}
            </button>
            <button
              onClick={() => onDeleteSavedView(view.id)}
              aria-label={`Delete saved view ${view.name}`}
              className="text-[#555555] hover:text-red-400 text-[10px] px-1"
            >
              ×
            </button>
          </span>
        ))
      )}
      <button
        onClick={onSaveCurrentView}
        className="text-[10px] tracking-widest uppercase px-2 py-1 border border-[#c9a962] text-[#c9a962] hover:bg-[#c9a962] hover:text-[#0a0a0a] transition-colors duration-150"
      >
        + Save current view
      </button>
    </div>
  );
}
