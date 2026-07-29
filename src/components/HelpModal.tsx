'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { useFocusTrap, useFocusRestore } from '@/hooks/useFocusTrap';

export interface HelpTopic {
  id: string;
  /** Optional category slug for grouping (e.g. "getting-started", "fees") */
  category?: string;
  title: string;
  content: string;
  keywords?: string[];
}

export interface HelpModalLabels {
  /** Modal heading */
  title?: string;
  /** Search input placeholder */
  searchPlaceholder?: string;
  /** Shown when no results match the query */
  noResults?: string;
  /** Default right-pane prompt */
  selectPrompt?: string;
  /** "All" category filter label */
  allCategories?: string;
  /** Close button aria-label */
  closeAriaLabel?: string;
}

export interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  topics: HelpTopic[];
  /** Optional category list; if provided, renders a category filter row */
  categories?: { id: string; label: string }[];
  /** Optional label overrides for localization */
  labels?: HelpModalLabels;
  /** If provided, pre-selects this topic id on open */
  initialTopicId?: string;
}

const DEFAULT_LABELS: Required<HelpModalLabels> = {
  title: 'Help & Documentation',
  searchPlaceholder: 'Search help…',
  noResults: 'No topics found',
  selectPrompt: 'Select a topic to view details',
  allCategories: 'All',
  closeAriaLabel: 'Close help modal',
};

export function HelpModal({
  isOpen,
  onClose,
  topics,
  categories,
  labels,
  initialTopicId,
}: HelpModalProps) {
  const l = { ...DEFAULT_LABELS, ...labels };

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(initialTopicId ?? null);
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useFocusTrap(dialogRef, isOpen);
  useFocusRestore(isOpen);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setActiveCategory('all');
      setSelectedTopic(initialTopicId ?? null);
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [isOpen, initialTopicId]);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const filteredTopics = topics.filter((topic) => {
    const matchesCategory = activeCategory === 'all' || topic.category === activeCategory;

    if (!matchesCategory) return false;

    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;

    return (
      topic.title.toLowerCase().includes(query) ||
      topic.content.toLowerCase().includes(query) ||
      topic.keywords?.some((kw) => kw.toLowerCase().includes(query))
    );
  });

  const activeTopic = selectedTopic ? topics.find((t) => t.id === selectedTopic) : null;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
      aria-hidden="true"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-modal-title"
        className="bg-[#111111] border border-[#333333] rounded-lg max-w-2xl w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#333333]">
          <h2 id="help-modal-title" className="text-lg font-semibold text-white">
            {l.title}
          </h2>
          <button
            onClick={onClose}
            className={cn(
              'text-[#777777] hover:text-white transition-colors',
              'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a962]',
            )}
            aria-label={l.closeAriaLabel}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Category filter */}
        {categories && categories.length > 0 && (
          <div className="px-4 py-2 border-b border-[#333333] flex gap-2 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setActiveCategory('all')}
              className={cn(
                'flex-shrink-0 px-3 py-1 text-xs rounded-full border transition-colors',
                'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a962]',
                activeCategory === 'all'
                  ? 'border-[#c9a962] text-[#c9a962] bg-[#c9a962]/10'
                  : 'border-[#444444] text-[#888888] hover:border-[#666666] hover:text-[#aaaaaa]',
              )}
            >
              {l.allCategories}
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  'flex-shrink-0 px-3 py-1 text-xs rounded-full border transition-colors',
                  'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a962]',
                  activeCategory === cat.id
                    ? 'border-[#c9a962] text-[#c9a962] bg-[#c9a962]/10'
                    : 'border-[#444444] text-[#888888] hover:border-[#666666] hover:text-[#aaaaaa]',
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left — search + topic list */}
          <div className="w-full md:w-1/3 border-r border-[#333333] flex flex-col">
            <div className="p-4 border-b border-[#333333]">
              <input
                ref={searchRef}
                type="text"
                placeholder={l.searchPlaceholder}
                aria-label={l.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(
                  'w-full bg-[#0a0a0a] border border-[#333333] px-3 py-2 text-sm text-white',
                  'placeholder-[#555555] rounded',
                  'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a962]',
                )}
              />
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredTopics.length === 0 ? (
                <div className="p-4 text-center text-sm text-[#777777]">{l.noResults}</div>
              ) : (
                filteredTopics.map((topic) => (
                  <button
                    key={topic.id}
                    onClick={() => setSelectedTopic(topic.id)}
                    className={cn(
                      'w-full text-left px-4 py-3 border-b border-[#222222] transition-colors',
                      'hover:bg-[#1a1a1a] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a962]',
                      selectedTopic === topic.id ? 'bg-[#1a1a1a] text-[#c9a962]' : 'text-[#aaaaaa]',
                    )}
                  >
                    <div className="text-sm font-medium">{topic.title}</div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right — topic content */}
          <div className="hidden md:flex flex-1 flex-col overflow-hidden">
            {activeTopic ? (
              <>
                <div className="px-6 py-4 border-b border-[#333333]">
                  <h3 className="text-base font-semibold text-white">{activeTopic.title}</h3>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-4">
                  <p className="text-sm text-[#aaaaaa] whitespace-pre-wrap leading-relaxed">
                    {activeTopic.content}
                  </p>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-[#777777]">
                <p className="text-sm">{l.selectPrompt}</p>
              </div>
            )}
          </div>
        </div>

        {/* Mobile content panel */}
        {activeTopic && (
          <div className="md:hidden border-t border-[#333333] p-4 max-h-48 overflow-y-auto">
            <p className="text-sm text-[#aaaaaa] whitespace-pre-wrap leading-relaxed">
              {activeTopic.content}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
