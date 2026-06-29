import type { CommandAction } from "@/components/CommandPalette";

export function buildAppCommands({
    router,
    onNewOfframp,
    onConnectWallet,
    onOpenSettings,
    onToggleTheme,
    onOpenNotifications,
}: {
    router: {
        push: (path: string) => void;
    };
    onNewOfframp?: () => void;
    onConnectWallet?: () => void;
    onOpenSettings?: () => void;
    onToggleTheme?: () => void;
    onOpenNotifications?: () => void;
}): CommandAction[] {
    return [
        // Navigation
        {
            id: "nav-home",
            label: "Go to Home",
            description: "Navigate to the home page",
            keywords: ["home", "dashboard", "main"],
            icon: "🏠",
            section: "Navigation",
            action: () => router.push("/"),
            shortcut: "Ctrl+H",
        },
        {
            id: "nav-history",
            label: "View Transaction History",
            description: "See all your past transactions",
            keywords: ["history", "transactions", "past", "previous"],
            icon: "📜",
            section: "Navigation",
            action: () => router.push("/history"),
            shortcut: "Ctrl+J",
        },
        {
            id: "nav-settings",
            label: "Open Settings",
            description: "Manage your account settings",
            keywords: ["settings", "preferences", "config", "account"],
            icon: "⚙️",
            section: "Navigation",
            action: () => {
                if (onOpenSettings) {
                    onOpenSettings();
                } else {
                    router.push("/settings");
                }
            },
        },
        {
            id: "nav-dashboard",
            label: "View Dashboard",
            description: "Go to analytics dashboard",
            keywords: ["dashboard", "analytics", "stats", "overview"],
            icon: "📊",
            section: "Navigation",
            action: () => router.push("/dashboard"),
        },

        // Actions
        {
            id: "action-new-offramp",
            label: "New Off-Ramp",
            description: "Start a new off-ramp transaction",
            keywords: ["new", "offramp", "transaction", "send", "create"],
            icon: "💸",
            section: "Actions",
            action: () => {
                if (onNewOfframp) {
                    onNewOfframp();
                } else {
                    router.push("/?new=true");
                }
            },
            shortcut: "Ctrl+N",
        },
        {
            id: "action-connect-wallet",
            label: "Connect Wallet",
            description: "Connect your Stellar wallet",
            keywords: ["wallet", "connect", "freighter", "albedo"],
            icon: "👛",
            section: "Actions",
            action: () => {
                if (onConnectWallet) {
                    onConnectWallet();
                }
            },
        },
        {
            id: "action-notifications",
            label: "View Notifications",
            description: "Check your notifications",
            keywords: ["notifications", "alerts", "messages"],
            icon: "🔔",
            section: "Actions",
            action: () => {
                if (onOpenNotifications) {
                    onOpenNotifications();
                } else {
                    router.push("/notifications");
                }
            },
        },

        // Appearance
        {
            id: "theme-toggle",
            label: "Toggle Theme",
            description: "Switch between light and dark mode",
            keywords: ["theme", "dark", "light", "mode", "appearance"],
            icon: "🌓",
            section: "Appearance",
            action: () => {
                if (onToggleTheme) {
                    onToggleTheme();
                }
            },
            shortcut: "Ctrl+D",
        },

        // Help & Support
        {
            id: "help-docs",
            label: "View Documentation",
            description: "Read the user guide and documentation",
            keywords: ["help", "docs", "documentation", "guide", "manual"],
            icon: "📖",
            section: "Help",
            action: () => router.push("/docs"),
        },
        {
            id: "help-support",
            label: "Contact Support",
            description: "Get help from our support team",
            keywords: ["support", "help", "contact", "ticket"],
            icon: "💬",
            section: "Help",
            action: () => router.push("/support"),
        },
        {
            id: "help-shortcuts",
            label: "Keyboard Shortcuts",
            description: "View all keyboard shortcuts",
            keywords: ["shortcuts", "hotkeys", "keyboard"],
            icon: "⌨️",
            section: "Help",
            action: () => {
                // This will be handled by showing the keyboard shortcuts modal
            },
            shortcut: "?",
        },
    ];
}
