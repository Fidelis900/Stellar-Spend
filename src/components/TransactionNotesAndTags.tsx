'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/cn';
import { TransactionStorage, type Transaction } from '@/lib/transaction-storage';

interface TransactionNotesAndTagsProps {
  transaction: Transaction;
  onUpdate?: (updated: Transaction) => void;
  className?: string;
}

const TAG_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
];

export default function TransactionNotesAndTags({
  transaction,
  onUpdate,
  className,
}: TransactionNotesAndTagsProps) {
  const [note, setNote] = useState(transaction.note || '');
  const [tags, setTags] = useState(transaction.tags || []);
  const [newTagName, setNewTagName] = useState('');
  const [selectedColor, setSelectedColor] = useState(TAG_COLORS[0]);
  const [allTags, setAllTags] = useState<Array<{ name: string; color: string; count: number }>>([]);
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setAllTags(TransactionStorage.getAllTags());
  }, []);

  const handleNoteChange = (value: string) => {
    const truncated = value.slice(0, 500);
    setNote(truncated);
    TransactionStorage.updateNote(transaction.id, truncated);
    onUpdate?.({ ...transaction, note: truncated });
  };

  const handleAddTag = () => {
    if (!newTagName.trim()) return;
    TransactionStorage.addTag(transaction.id, newTagName, selectedColor);
    const updated = TransactionStorage.getById(transaction.id);
    if (updated) {
      setTags(updated.tags || []);
      setAllTags(TransactionStorage.getAllTags());
      onUpdate?.(updated);
    }
    setNewTagName('');
    setShowTagSuggestions(false);
  };

  const handleRemoveTag = (tagId: string) => {
    TransactionStorage.removeTag(transaction.id, tagId);
    const updated = TransactionStorage.getById(transaction.id);
    if (updated) {
      setTags(updated.tags || []);
      setAllTags(TransactionStorage.getAllTags());
      onUpdate?.(updated);
    }
  };

  const handleAddSuggestedTag = (tagName: string, color: string) => {
    TransactionStorage.addTag(transaction.id, tagName, color);
    const updated = TransactionStorage.getById(transaction.id);
    if (updated) {
      setTags(updated.tags || []);
      onUpdate?.(updated);
    }
  };

  const filteredSuggestions = allTags.filter(
    (tag) =>
      tag.name.toLowerCase().includes(newTagName.toLowerCase()) &&
      !tags.some((t) => t.name === tag.name),
  );

  return (
    <div
      className={cn(
        'space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900',
        className,
      )}
    >
      {/* Notes Section */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Notes</label>
        <textarea
          value={note}
          onChange={(e) => handleNoteChange(e.target.value)}
          placeholder="Add a note about this transaction..."
          maxLength={500}
          className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
          rows={3}
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {note.length}/500 characters
        </p>
      </div>

      {/* Tags Section */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tags</label>

        {/* Display Tags */}
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm text-white"
                style={{ backgroundColor: tag.color }}
              >
                <span>{tag.name}</span>
                <button
                  onClick={() => handleRemoveTag(tag.id)}
                  className="hover:opacity-80"
                  aria-label={`Remove tag ${tag.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add Tag Input */}
        <div className="relative mt-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={newTagName}
              onChange={(e) => {
                setNewTagName(e.target.value);
                setShowTagSuggestions(true);
              }}
              onFocus={() => setShowTagSuggestions(true)}
              placeholder="Add a tag..."
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
            />
            <select
              value={selectedColor}
              onChange={(e) => setSelectedColor(e.target.value)}
              className="rounded border border-gray-300 px-2 py-2 dark:border-gray-600 dark:bg-gray-800"
              aria-label="Tag color"
            >
              {TAG_COLORS.map((color) => (
                <option key={color} value={color}>
                  ●
                </option>
              ))}
            </select>
            <button
              onClick={handleAddTag}
              className="rounded bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600"
            >
              Add
            </button>
          </div>

          {/* Tag Autocomplete */}
          {showTagSuggestions && filteredSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded border border-gray-300 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800">
              {filteredSuggestions.map((tag) => (
                <button
                  key={tag.name}
                  onClick={() => handleAddSuggestedTag(tag.name, tag.color)}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <span
                    className="mr-2 inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name} ({tag.count})
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tag Filtering */}
      {allTags.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">All Tags</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {allTags.map((tag) => (
              <button
                key={tag.name}
                onClick={() => handleAddSuggestedTag(tag.name, tag.color)}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-white hover:opacity-80"
                style={{ backgroundColor: tag.color }}
              >
                <span>{tag.name}</span>
                <span className="text-xs opacity-75">({tag.count})</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
