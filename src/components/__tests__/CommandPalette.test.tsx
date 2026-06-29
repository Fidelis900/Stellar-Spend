import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CommandPalette, CommandAction } from "../CommandPalette";

const mockCommands: CommandAction[] = [
  {
    id: "test-1",
    label: "Test Command 1",
    description: "First test command",
    keywords: ["test", "first"],
    section: "Test",
    action: jest.fn(),
    shortcut: "Ctrl+1",
  },
  {
    id: "test-2",
    label: "Test Command 2",
    description: "Second test command",
    keywords: ["test", "second"],
    section: "Test",
    action: jest.fn(),
  },
  {
    id: "nav-home",
    label: "Go Home",
    description: "Navigate home",
    keywords: ["home", "navigate"],
    section: "Navigation",
    action: jest.fn(),
  },
];

describe("CommandPalette", () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    commands: mockCommands,
    onCommandExecute: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders when open", () => {
    render(<CommandPalette {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/type a command/i)).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<CommandPalette {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("displays all commands initially", () => {
    render(<CommandPalette {...defaultProps} />);
    expect(screen.getByText("Test Command 1")).toBeInTheDocument();
    expect(screen.getByText("Test Command 2")).toBeInTheDocument();
    expect(screen.getByText("Go Home")).toBeInTheDocument();
  });

  it("filters commands based on search", async () => {
    render(<CommandPalette {...defaultProps} />);
    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "home" } });

    await waitFor(() => {
      expect(screen.getByText("Go Home")).toBeInTheDocument();
      expect(screen.queryByText("Test Command 1")).not.toBeInTheDocument();
    });
  });

  it("searches by keywords", async () => {
    render(<CommandPalette {...defaultProps} />);
    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "navigate" } });

    await waitFor(() => {
      expect(screen.getByText("Go Home")).toBeInTheDocument();
    });
  });

  it("executes command on click", () => {
    render(<CommandPalette {...defaultProps} />);

    fireEvent.click(screen.getByText("Test Command 1"));

    expect(mockCommands[0].action).toHaveBeenCalled();
    expect(defaultProps.onCommandExecute).toHaveBeenCalledWith("test-1");
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("executes command on Enter key", () => {
    render(<CommandPalette {...defaultProps} />);
    const input = screen.getByRole("textbox");

    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockCommands[0].action).toHaveBeenCalled();
    expect(defaultProps.onCommandExecute).toHaveBeenCalledWith("test-1");
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("navigates down with arrow keys", () => {
    render(<CommandPalette {...defaultProps} />);
    const input = screen.getByRole("textbox");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockCommands[1].action).toHaveBeenCalled();
  });

  it("navigates up with arrow keys", () => {
    render(<CommandPalette {...defaultProps} />);
    const input = screen.getByRole("textbox");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockCommands[1].action).toHaveBeenCalled();
  });

  it("closes on Escape key", () => {
    render(<CommandPalette {...defaultProps} />);
    const input = screen.getByRole("textbox");

    fireEvent.keyDown(input, { key: "Escape" });

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("closes on backdrop click", () => {
    render(<CommandPalette {...defaultProps} />);
    const backdrop = screen.getByRole("dialog").parentElement!;

    fireEvent.click(backdrop);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("does not close on content click", () => {
    render(<CommandPalette {...defaultProps} />);
    const content = screen.getByRole("textbox").closest("div")!;

    fireEvent.click(content);

    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it("shows recent commands first when no search", () => {
    const propsWithRecent = {
      ...defaultProps,
      recentCommands: ["test-2", "nav-home"],
    };

    render(<CommandPalette {...propsWithRecent} />);
    const options = screen.getAllByRole("option");

    // Recent commands should appear first
    expect(options[0]).toHaveTextContent("Test Command 2");
    expect(options[1]).toHaveTextContent("Go Home");
  });

  it("groups commands by section", () => {
    render(<CommandPalette {...defaultProps} />);

    expect(screen.getByText("Test")).toBeInTheDocument();
    expect(screen.getByText("Navigation")).toBeInTheDocument();
  });

  it("displays shortcuts when provided", () => {
    render(<CommandPalette {...defaultProps} />);

    expect(screen.getByText("Ctrl+1")).toBeInTheDocument();
  });

  it("shows empty state when no commands match", async () => {
    render(<CommandPalette {...defaultProps} />);
    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "nonexistent" } });

    await waitFor(() => {
      expect(screen.getByText(/no commands found/i)).toBeInTheDocument();
    });
  });

  it("is keyboard accessible", () => {
    render(<CommandPalette {...defaultProps} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Command palette");

    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-controls", "command-list");
  });

  it("updates selection on mouse enter", () => {
    render(<CommandPalette {...defaultProps} />);

    const secondOption = screen.getByText("Test Command 2").closest("button")!;
    fireEvent.mouseEnter(secondOption);

    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockCommands[1].action).toHaveBeenCalled();
  });
});
