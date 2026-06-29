"use client";

import { useState, useEffect, useCallback } from "react";
import type { CommandAction } from "@/components/CommandPalette";

const RECENT_COMMANDS_KEY = "stellar_spend_recent_commands";
const MAX_RECENT = 5;

export function useCommandPalette() {
    const [isOpen, setIsOpen] = useState(false);
    const [recentCommands, setRecentCommands] = useState<string[]>([]);

    // Load recent commands from localStorage
    useEffect(() => {
        try {
            const stored = localStorage.getItem(RECENT_COMMANDS_KEY);
            if (stored) {
                setRecentCommands(JSON.parse(stored));
            }
        } catch (error) {
            console.error("Failed to load recent commands:", error);
        }
    }, []);

    const open = useCallback(() => setIsOpen(true), []);
    const close = useCallback(() => setIsOpen(false), []);
    const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

    const onCommandExecute = useCallback((commandId: string) => {
        setRecentCommands((prev) => {
            // Remove if already exists, add to front
            const filtered = prev.filter((id) => id !== commandId);
            const updated = [commandId, ...filtered].slice(0, MAX_RECENT);

            try {
                localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(updated));
            } catch (error) {
                console.error("Failed to save recent command:", error);
            }

            return updated;
        });
    }, []);

    // Listen for Cmd/Ctrl+K globally
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isMac = navigator.platform.toUpperCase().includes("MAC");
            const isCommandK = e.key === "k" && (isMac ? e.metaKey : e.ctrlKey);

            if (isCommandK) {
                e.preventDefault();
                toggle();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [toggle]);

    return {
        isOpen,
        open,
        close,
        toggle,
        recentCommands,
        onCommandExecute,
    };
}
