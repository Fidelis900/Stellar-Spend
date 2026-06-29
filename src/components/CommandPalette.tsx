"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

export interface CommandAction {
  id: string;
  label: string;
  description?: string;
  keywords?: string[];
  icon?: string;
  section?: string;
  action: () => void;
  shortcut?: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandAction[];
  recentCommands?: string[];
  onCommandExecute?: (commandId: string) => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  commands,
  recentCommands = [],
  onCommandExecute,
}: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter and rank commands based on search
  const filteredCommands = useMemo(() => {
    if (!search.trim()) {
      // Show recent commands first when no search
      const recent = commands
        .filter((cmd) => recentCommands.includes(cmd.id))
        .sort(
          (a, b) => recentCommands.indexOf(a.id) - recentCommands.indexOf(b.id),
        );
      const rest = commands.filter((cmd) => !recentCommands.includes(cmd.id));
      return [...recent, ...rest];
    }

    const query = search.toLowerCase();
    const scored = commands
      .map((cmd) => {
        let score = 0;
        const label = cmd.label.toLowerCase();
        const description = cmd.description?.toLowerCase() || "";
        const keywords = cmd.keywords?.map((k) => k.toLowerCase()) || [];

        // Exact match
        if (label === query) score += 100;
        // Starts with query
        else if (label.startsWith(query)) score += 50;
        // Contains query
        else if (label.includes(query)) score += 25;

        // Check description
        if (description.includes(query)) score += 15;

        // Check keywords
        keywords.forEach((kw) => {
          if (kw === query) score += 40;
          else if (kw.startsWith(query)) score += 20;
          else if (kw.includes(query)) score += 10;
        });

        // Boost recent commands
        if (recentCommands.includes(cmd.id)) score += 10;

        return { command: cmd, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ command }) => command);

    return scored;
  }, [search, commands, recentCommands]);

  // Group commands by section
  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandAction[]> = {};
    filteredCommands.forEach((cmd) => {
      const section = cmd.section || "Commands";
      if (!groups[section]) groups[section] = [];
      groups[section].push(cmd);
    });
    return groups;
  }, [filteredCommands]);

  // Reset selection when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setSearch("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          Math.min(prev + 1, filteredCommands.length - 1),
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filteredCommands[selectedIndex];
        if (cmd) {
          cmd.action();
          onCommandExecute?.(cmd.id);
          onClose();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [filteredCommands, selectedIndex, onClose, onCommandExecute],
  );

  // Scroll selected item into view
  useEffect(() => {
    const selectedEl = listRef.current?.querySelector(
      `[data-index="${selectedIndex}"]`,
    );
    selectedEl?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="border-b border-gray-200 dark:border-gray-700 p-4">
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-transparent text-lg outline-none placeholder-gray-500 dark:placeholder-gray-400"
            placeholder="Type a command or search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Command search"
            aria-autocomplete="list"
            aria-controls="command-list"
            aria-activedescendant={`command-${selectedIndex}`}
          />
        </div>

        {/* Commands List */}
        <div
          ref={listRef}
          id="command-list"
          className="max-h-96 overflow-y-auto"
          role="listbox"
        >
          {filteredCommands.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              No commands found
            </div>
          ) : (
            Object.entries(groupedCommands).map(([section, cmds]) => (
              <div key={section}>
                {Object.keys(groupedCommands).length > 1 && (
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {section}
                  </div>
                )}
                {cmds.map((cmd, idx) => {
                  const globalIndex = filteredCommands.indexOf(cmd);
                  const isSelected = globalIndex === selectedIndex;
                  return (
                    <button
                      key={cmd.id}
                      data-index={globalIndex}
                      id={`command-${globalIndex}`}
                      role="option"
                      aria-selected={isSelected}
                      className={`w-full text-left px-4 py-3 flex items-center justify-between transition-colors ${
                        isSelected
                          ? "bg-blue-50 dark:bg-blue-900/20"
                          : "hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}
                      onClick={() => {
                        cmd.action();
                        onCommandExecute?.(cmd.id);
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(globalIndex)}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {cmd.icon && (
                          <span className="text-xl">{cmd.icon}</span>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                            {cmd.label}
                          </div>
                          {cmd.description && (
                            <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                              {cmd.description}
                            </div>
                          )}
                        </div>
                      </div>
                      {cmd.shortcut && (
                        <kbd className="px-2 py-1 text-xs font-mono bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded border border-gray-300 dark:border-gray-600">
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-2 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-4">
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600">
              ↑↓
            </kbd>{" "}
            Navigate
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600">
              Enter
            </kbd>{" "}
            Select
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600">
              Esc
            </kbd>{" "}
            Close
          </span>
        </div>
      </div>
    </div>
  );
}
