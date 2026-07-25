"use client";

import { useState } from "react";
import type { Transaction } from "@/lib/transaction-storage";

interface NoteCellProps {
  tx: Transaction;
  onSave: (id: string, note: string) => void;
}

/** Inline-editable note cell for a transaction row. */
export function NoteCell({ tx, onSave }: NoteCellProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(tx.note ?? "");

  const commit = () => {
    setEditing(false);
    onSave(tx.id, value);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          maxLength={500}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="flex-1 bg-[#0a0a0a] border border-[#c9a962] px-2 py-1 text-xs text-white focus:outline-none"
          aria-label="Edit note"
        />
        <button
          onClick={commit}
          className="text-[#c9a962] hover:text-white text-[10px] px-1"
          aria-label="Save note"
        >
          ✓
        </button>
        <button
          onClick={() => setEditing(false)}
          className="text-[#777777] hover:text-white text-[10px] px-1"
          aria-label="Cancel"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        setValue(tx.note ?? "");
        setEditing(true);
      }}
      className="text-left text-[#777777] hover:text-[#c9a962] transition-colors duration-150 truncate max-w-[180px] block"
      title={tx.note || "Add note"}
      aria-label={tx.note ? `Edit note: ${tx.note}` : "Add note"}
    >
      {tx.note || <span className="text-[#444444] italic">+ add note</span>}
    </button>
  );
}
