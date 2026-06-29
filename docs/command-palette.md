# Command Palette

The Command Palette provides a fast, keyboard-driven interface for navigating the application and executing actions. Users can access any feature through a searchable command menu triggered by `Cmd/Ctrl+K`.

## Features

### Keyboard-First Navigation

- **Trigger**: Press `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux)
- **Search**: Start typing to filter commands with fuzzy matching
- **Navigate**: Use arrow keys (↑/↓) to select commands
- **Execute**: Press Enter to run the selected command
- **Close**: Press Escape or click outside to dismiss

### Intelligent Search

The command palette uses a scored ranking system:

1. **Exact matches** (highest priority)
2. **Starts-with matches**
3. **Contains matches**
4. **Keyword matches**
5. **Description matches**
6. **Recent commands** (boosted in rankings)

### Recent Commands

The palette tracks your 5 most recently used commands and displays them first when no search query is entered, providing quick access to frequent actions.

### Contextual Commands

Commands are organized into logical sections:

- **Navigation**: Page navigation commands
- **Actions**: Transaction and wallet operations
- **Appearance**: Theme and display settings
- **Help**: Documentation and support

## Architecture

### Components

#### `CommandPalette` Component

**File**: `src/components/CommandPalette.tsx`

Core component that renders the command palette UI. Features:

- Fuzzy search with ranking algorithm
- Keyboard navigation (arrow keys, Enter, Escape)
- Grouping by section
- Recent commands prioritization
- Full keyboard accessibility (ARIA attributes)

**Props**:

```typescript
interface CommandPaletteProps {
  isOpen: boolean; // Control visibility
  onClose: () => void; // Close handler
  commands: CommandAction[]; // Available commands
  recentCommands?: string[]; // Recent command IDs
  onCommandExecute?: (id: string) => void; // Execution callback
}
```

#### `useCommandPalette` Hook

**File**: `src/hooks/useCommandPalette.ts`

Manages command palette state and recent command tracking.

**Features**:

- Global `Cmd/Ctrl+K` keyboard listener
- LocalStorage persistence for recent commands
- Open/close/toggle methods

**Usage**:

```typescript
const { isOpen, open, close, toggle, recentCommands, onCommandExecute } =
  useCommandPalette();
```

#### Command Registry

**File**: `src/lib/command-registry.ts`

Centralized registry of all application commands. Exports `buildAppCommands()` function that generates command definitions with callbacks for navigation and actions.

**Command Definition**:

```typescript
interface CommandAction {
  id: string; // Unique identifier
  label: string; // Display name
  description?: string; // Optional description
  keywords?: string[]; // Search keywords
  icon?: string; // Optional emoji icon
  section?: string; // Grouping category
  action: () => void; // Execution callback
  shortcut?: string; // Display shortcut hint
}
```

## Integration

### Adding the Command Palette to Your App

1. **Import dependencies**:

```typescript
import { CommandPalette } from "@/components/CommandPalette";
import { useCommandPalette } from "@/hooks/useCommandPalette";
import { buildAppCommands } from "@/lib/command-registry";
```

2. **Set up in your layout/page**:

```typescript
export default function RootLayout() {
  const router = useRouter();
  const {
    isOpen,
    close,
    recentCommands,
    onCommandExecute
  } = useCommandPalette();

  const commands = buildAppCommands({
    router,
    onNewOfframp: () => {/* handler */},
    onConnectWallet: () => {/* handler */},
    onOpenSettings: () => {/* handler */},
    onToggleTheme: () => {/* handler */},
    onOpenNotifications: () => {/* handler */},
  });

  return (
    <>
      {/* Your app content */}
      <CommandPalette
        isOpen={isOpen}
        onClose={close}
        commands={commands}
        recentCommands={recentCommands}
        onCommandExecute={onCommandExecute}
      />
    </>
  );
}
```

### Adding Custom Commands

Extend the command list with application-specific commands:

```typescript
const customCommands: CommandAction[] = [
  {
    id: "export-data",
    label: "Export Transaction Data",
    description: "Download your transaction history as CSV",
    keywords: ["export", "download", "csv", "data"],
    icon: "📥",
    section: "Actions",
    action: () => {
      // Export logic
    },
  },
];

const allCommands = [...commands, ...customCommands];
```

### Integrating with Existing Keyboard Shortcuts

The command palette integrates with the existing `useKeyboardShortcuts` hook:

```typescript
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

// Existing shortcuts work alongside command palette
useKeyboardShortcuts([
  {
    key: "n",
    ctrl: true,
    description: "New transaction",
    action: () => startNewTransaction(),
  },
  // ... other shortcuts
]);
```

Commands can display their associated shortcuts for discoverability.

## Accessibility

The command palette is fully accessible:

### Keyboard Navigation

- All interactions operable via keyboard
- Logical tab order through results
- Clear focus indicators
- Shortcut hints displayed inline

### Screen Reader Support

- Proper ARIA roles (`dialog`, `listbox`, `option`)
- `aria-label` and `aria-describedby` attributes
- `aria-activedescendant` for active selection
- Status announcements for filtering results

### Focus Management

- Auto-focuses search input on open
- Traps focus within dialog
- Restores focus on close

## Testing

### Unit Tests

**File**: `src/components/__tests__/CommandPalette.test.tsx`

Tests cover:

- Rendering and visibility
- Command filtering and search
- Keyboard navigation (arrow keys, Enter, Escape)
- Command execution
- Recent commands display
- Accessibility attributes

### Search Ranking Tests

**File**: `src/components/__tests__/CommandPaletteSearchRanking.test.tsx`

Tests verify search ranking algorithm:

- Exact matches ranked highest
- Starts-with matches ranked second
- Contains matches ranked lower
- Keyword and description matches
- Recent command boosting
- Case-insensitive search

### Running Tests

```bash
npm test CommandPalette
```

## Performance Considerations

### Fuzzy Search Optimization

- Search algorithm runs in O(n) time where n = number of commands
- Results memoized with `useMemo` to avoid re-computation
- Efficient filtering using JavaScript native methods

### Recent Commands Storage

- Stores only command IDs (not full objects)
- Limited to 5 most recent (configurable via `MAX_RECENT`)
- LocalStorage persistence for cross-session retention

### Keyboard Event Handling

- Global keyboard listener debounced for Cmd/Ctrl+K
- Event handlers memoized with `useCallback`
- Cleanup on unmount prevents memory leaks

## Future Enhancements

Potential improvements for future iterations:

1. **Command History**: Full command execution history beyond 5 recent
2. **Command Aliases**: Multiple trigger phrases for same command
3. **Dynamic Commands**: Context-aware commands based on current page
4. **Command Chaining**: Execute multiple commands in sequence
5. **Command Suggestions**: AI-powered command recommendations
6. **Custom Themes**: User-customizable palette appearance
7. **Command Analytics**: Track most-used commands for UX insights

## Related Documentation

- [Keyboard Shortcuts](./keyboard-shortcuts.md)
- [Accessibility Guidelines](../ACCESSIBILITY.md)
- [Component Testing](../TESTING.md)
