'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Transaction } from '@/lib/transaction-storage';
import { cn } from '@/lib/cn';

interface TransactionSearchProps {
  wallet?: string;
  onSearch: (results: Transaction[]) => void;
  onFiltersChange?: (filters: Record<string, unknown>) => void;
}

type SearchMode = 'general' | 'hash' | 'amount' | 'recipient';

const RECENT_KEY = 'stellar_recent_searches';
const MAX_RECENT = 8;

function loadRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string): void {
  if (!query.trim()) return;
  try {
    const existing = loadRecentSearches().filter((q) => q !== query);
    localStorage.setItem(RECENT_KEY, JSON.stringify([query, ...existing].slice(0, MAX_RECENT)));
  } catch {
    /* ignore */
  }
}

const MODE_PREFIXES: Record<SearchMode, string> = {
  general: '',
  hash: 'hash:',
  amount: 'amount:',
  recipient: 'recipient:',
};

const MODE_PLACEHOLDERS: Record<SearchMode, string> = {
  general: 'Search by ID, hash, account name...',
  hash: 'Enter transaction hash...',
  amount: 'Enter amount (e.g. 100 or 50-200)...',
  recipient: 'Enter recipient name or account...',
};

export function TransactionSearch({ wallet, onSearch, onFiltersChange }: TransactionSearchProps) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('general');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [currency, setCurrency] = useState('');
  const [isFavorite, setIsFavorite] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load recent searches on mount
  useEffect(() => {
    setRecentSearches(loadRecentSearches());
  }, []);

  // Build the effective query with mode prefix
  const effectiveQuery = query ? `${MODE_PREFIXES[mode]}${query}` : '';

  // Fetch API suggestions
  useEffect(() => {
    if (!query.trim() || !wallet) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/transactions/search/suggestions?wallet=${encodeURIComponent(wallet)}&q=${encodeURIComponent(effectiveQuery)}`,
        );
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions ?? []);
        }
      } catch {
        // ignore
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, wallet, effectiveQuery]);

  // Combined dropdown items: suggestions first, then recent searches (filtered)
  const dropdownItems: Array<{ label: string; type: 'suggestion' | 'recent' }> = [
    ...suggestions.map((s) => ({ label: s, type: 'suggestion' as const })),
    ...recentSearches
      .filter((r) => !suggestions.includes(r) && r.toLowerCase().includes(query.toLowerCase()))
      .map((r) => ({ label: r, type: 'recent' as const })),
  ];

  const performSearch = useCallback(
    async (overrideQuery?: string) => {
      if (!wallet) return;
      const q = overrideQuery ?? effectiveQuery;
      setIsLoading(true);
      setShowDropdown(false);
      if (q.trim()) saveRecentSearch(q);
      setRecentSearches(loadRecentSearches());

      try {
        const params = new URLSearchParams({
          wallet,
          ...(q && { q }),
          ...(status !== 'all' && { status }),
          ...(dateFrom && { dateFrom: new Date(dateFrom).getTime().toString() }),
          ...(dateTo && { dateTo: new Date(dateTo).getTime().toString() }),
          ...(amountMin && { amountMin }),
          ...(amountMax && { amountMax }),
          ...(currency && { currency }),
          ...(isFavorite && { isFavorite }),
        });

        const res = await fetch(`/api/transactions/search?${params}`);
        if (res.ok) {
          const data = await res.json();
          onSearch(data.results);
          onFiltersChange?.({
            query: q,
            status,
            dateFrom,
            dateTo,
            amountMin,
            amountMax,
            currency,
            isFavorite,
          });
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    },
    [
      wallet,
      effectiveQuery,
      status,
      dateFrom,
      dateTo,
      amountMin,
      amountMax,
      currency,
      isFavorite,
      onSearch,
      onFiltersChange,
    ],
  );

  const selectItem = (label: string) => {
    setQuery(label.replace(/^(hash:|amount:|recipient:)/, ''));
    setShowDropdown(false);
    setActiveIdx(-1);
    performSearch(label);
  };

  const clearRecent = () => {
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      /* ignore */
    }
    setRecentSearches([]);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || dropdownItems.length === 0) {
      if (e.key === 'Enter') performSearch();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, dropdownItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && dropdownItems[activeIdx]) {
        selectItem(dropdownItems[activeIdx].label);
      } else {
        performSearch();
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setActiveIdx(-1);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
        setActiveIdx(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const showDropdownContent =
    showDropdown && (dropdownItems.length > 0 || recentSearches.length > 0);

  return (
    <div className="space-y-4">
      {/* Search mode tabs */}
      <div className="flex gap-1 flex-wrap">
        {(Object.keys(MODE_PREFIXES) as SearchMode[]).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              inputRef.current?.focus();
            }}
            className={cn(
              'px-2 py-1 text-[10px] uppercase tracking-widest border transition-colors',
              mode === m
                ? 'border-[#c9a962] text-[#c9a962] bg-[#c9a962]/5'
                : 'border-[#333333] text-[#555555] hover:border-[#555555] hover:text-[#777777]',
            )}
          >
            {m === 'general' ? 'All' : m}
          </button>
        ))}
      </div>

      {/* Search bar with autocomplete dropdown */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            {mode !== 'general' && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-[#c9a962] tracking-widest pointer-events-none select-none">
                {MODE_PREFIXES[mode]}
              </span>
            )}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIdx(-1);
                setShowDropdown(true);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowDropdown(true)}
              placeholder={MODE_PLACEHOLDERS[mode]}
              aria-label="Search transactions"
              aria-autocomplete="list"
              aria-expanded={showDropdownContent}
              aria-activedescendant={activeIdx >= 0 ? `search-item-${activeIdx}` : undefined}
              className={cn(
                'w-full bg-[#0a0a0a] border border-[#333333] py-2 text-white text-sm',
                mode !== 'general' ? 'pl-20 pr-3' : 'px-3',
              )}
            />

            {/* Autocomplete dropdown */}
            {showDropdownContent && (
              <div
                ref={dropdownRef}
                role="listbox"
                aria-label="Search suggestions"
                className="absolute top-full left-0 right-0 bg-[#1a1a1a] border border-[#333333] border-t-0 z-20 max-h-60 overflow-y-auto"
              >
                {/* Recent searches header */}
                {recentSearches.length > 0 && suggestions.length === 0 && (
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#2a2a2a]">
                    <span className="text-[9px] text-[#555555] uppercase tracking-widest">
                      Recent
                    </span>
                    <button
                      onClick={clearRecent}
                      className="text-[9px] text-[#555555] hover:text-[#c9a962] transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                )}

                {dropdownItems.map((item, idx) => (
                  <button
                    key={idx}
                    id={`search-item-${idx}`}
                    role="option"
                    aria-selected={activeIdx === idx}
                    onClick={() => selectItem(item.label)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-xs border-b border-[#2a2a2a] last:border-b-0 flex items-center gap-2 transition-colors',
                      activeIdx === idx
                        ? 'bg-[#c9a962]/10 text-white'
                        : 'text-[#999999] hover:bg-[#222222]',
                    )}
                  >
                    {item.type === 'recent' ? (
                      <svg
                        className="w-3 h-3 text-[#555555] flex-shrink-0"
                        fill="none"
                        viewBox="0 0 12 12"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <circle cx="6" cy="6" r="4.5" />
                        <path strokeLinecap="round" d="M6 3.5V6l1.5 1.5" />
                      </svg>
                    ) : (
                      <svg
                        className="w-3 h-3 text-[#555555] flex-shrink-0"
                        fill="none"
                        viewBox="0 0 12 12"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <circle cx="5" cy="5" r="3.5" />
                        <path strokeLinecap="round" d="M8 8l2 2" />
                      </svg>
                    )}
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => performSearch()}
            disabled={isLoading}
            className={cn(
              'px-4 py-2 text-xs font-semibold transition-colors',
              isLoading
                ? 'bg-[#666666] text-[#999999] cursor-not-allowed'
                : 'bg-[#c9a962] text-[#0a0a0a] hover:bg-[#d4b574]',
            )}
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-[#0a0a0a] border border-[#333333] px-2 py-1 text-white text-xs"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="reversed">Reversed</option>
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="bg-[#0a0a0a] border border-[#333333] px-2 py-1 text-white text-xs"
          title="From date"
        />

        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="bg-[#0a0a0a] border border-[#333333] px-2 py-1 text-white text-xs"
          title="To date"
        />

        <input
          type="number"
          value={amountMin}
          onChange={(e) => setAmountMin(e.target.value)}
          placeholder="Min amount"
          className="bg-[#0a0a0a] border border-[#333333] px-2 py-1 text-white text-xs"
        />

        <input
          type="number"
          value={amountMax}
          onChange={(e) => setAmountMax(e.target.value)}
          placeholder="Max amount"
          className="bg-[#0a0a0a] border border-[#333333] px-2 py-1 text-white text-xs"
        />

        <select
          value={isFavorite}
          onChange={(e) => setIsFavorite(e.target.value)}
          className="bg-[#0a0a0a] border border-[#333333] px-2 py-1 text-white text-xs"
        >
          <option value="">All</option>
          <option value="true">Favorites Only</option>
          <option value="false">Non-Favorites</option>
        </select>
      </div>
    </div>
  );
}
