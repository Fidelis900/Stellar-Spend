'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

interface FavoriteButtonProps {
  transactionId: string;
  isFavorite?: boolean;
  onToggle?: (isFavorite: boolean) => void;
}

export function FavoriteButton({
  transactionId,
  isFavorite = false,
  onToggle,
}: FavoriteButtonProps) {
  const [favorite, setFavorite] = useState(isFavorite);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    // Optimistic flip — show the new state immediately.
    const previous = favorite;
    const next = !previous;
    setFavorite(next);
    setError(null);
    onToggle?.(next);

    try {
      const res = await fetch('/api/transactions/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId, isFavorite: next }),
      });
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      // Reconcile with server truth in case it differs.
      if (typeof data.isFavorite === 'boolean' && data.isFavorite !== next) {
        setFavorite(data.isFavorite);
        onToggle?.(data.isFavorite);
      }
    } catch (err) {
      // Rollback on failure.
      setFavorite(previous);
      onToggle?.(previous);
      setError(err instanceof Error ? err.message : 'Failed to update favorite');
    }
  };

  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'p-1 transition-colors',
          favorite
            ? 'text-yellow-500 hover:text-yellow-600'
            : 'text-[#666666] hover:text-[#999999]',
        )}
        title={favorite ? 'Remove from favorites' : 'Add to favorites'}
        aria-pressed={favorite}
        aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        <span className="text-lg" aria-hidden="true">
          {favorite ? '★' : '☆'}
        </span>
      </button>
      {error && (
        <span role="alert" className="text-[10px] text-red-400 mt-0.5">
          {error}
        </span>
      )}
    </span>
  );
}
