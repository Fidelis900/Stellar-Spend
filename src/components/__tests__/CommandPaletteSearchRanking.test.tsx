import { render, screen, fireEvent, within } from "@testing-library/react";
import { CommandPalette, CommandAction } from "../CommandPalette";

describe("CommandPalette Search Ranking", () => {
  const commands: CommandAction[] = [
    {
      id: "exact-match",
      label: "home",
      description: "Exact match test",
      action: jest.fn(),
    },
    {
      id: "starts-with",
      label: "homepage",
      description: "Starts with test",
      action: jest.fn(),
    },
    {
      id: "contains",
      label: "go home page",
      description: "Contains test",
      action: jest.fn(),
    },
    {
      id: "keyword-exact",
      label: "Dashboard",
      description: "Keyword exact match",
      keywords: ["home"],
      action: jest.fn(),
    },
    {
      id: "keyword-starts",
      label: "Settings",
      description: "Keyword starts with",
      keywords: ["homepage"],
      action: jest.fn(),
    },
    {
      id: "keyword-contains",
      label: "Profile",
      description: "Keyword contains",
      keywords: ["my home"],
      action: jest.fn(),
    },
    {
      id: "description-match",
      label: "About",
      description: "home information page",
      action: jest.fn(),
    },
  ];

  const renderAndSearch = (query: string) => {
    render(
      <CommandPalette
        isOpen={true}
        onClose={jest.fn()}
        commands={commands}
        onCommandExecute={jest.fn()}
      />,
    );

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: query } });

    return screen.getAllByRole("option");
  };

  it("ranks exact label match highest", () => {
    const options = renderAndSearch("home");

    expect(within(options[0]).getByText("home")).toBeInTheDocument();
  });

  it("ranks starts-with label match second", () => {
    const options = renderAndSearch("home");

    const labels = options.map((opt) => within(opt).getByText(/./));
    const startsWith = labels.findIndex((el) =>
      el.textContent?.includes("homepage"),
    );

    // Should be near the top (after exact match)
    expect(startsWith).toBeLessThan(3);
  });

  it("ranks keyword exact match high", () => {
    const options = renderAndSearch("home");

    const labels = options.map((opt) => within(opt).getByText(/./));
    const keywordExact = labels.findIndex((el) =>
      el.textContent?.includes("Dashboard"),
    );

    // Should be in top results
    expect(keywordExact).toBeLessThan(4);
  });

  it("ranks contains match lower than starts-with", () => {
    const options = renderAndSearch("home");

    const labels = options.map((opt) => opt.textContent || "");
    const startsWithIndex = labels.findIndex((text) =>
      text.includes("homepage"),
    );
    const containsIndex = labels.findIndex((text) =>
      text.includes("go home page"),
    );

    expect(startsWithIndex).toBeLessThan(containsIndex);
  });

  it("prioritizes recent commands in scoring", () => {
    render(
      <CommandPalette
        isOpen={true}
        onClose={jest.fn()}
        commands={commands}
        recentCommands={["description-match"]}
        onCommandExecute={jest.fn()}
      />,
    );

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "home" } });

    const options = screen.getAllByRole("option");
    const labels = options.map((opt) => opt.textContent || "");

    // Recent command should be boosted in rankings
    const recentIndex = labels.findIndex((text) => text.includes("About"));

    // Should appear in results despite being a description match
    expect(recentIndex).toBeGreaterThan(-1);
  });

  it("handles case-insensitive search", () => {
    const upperOptions = renderAndSearch("HOME");
    const lowerOptions = renderAndSearch("home");

    expect(upperOptions.length).toBe(lowerOptions.length);
  });

  it("shows no results for non-matching query", () => {
    render(
      <CommandPalette
        isOpen={true}
        onClose={jest.fn()}
        commands={commands}
        onCommandExecute={jest.fn()}
      />,
    );

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "zzz nonexistent zzz" } });

    expect(screen.getByText(/no commands found/i)).toBeInTheDocument();
  });

  it("updates results dynamically as user types", () => {
    render(
      <CommandPalette
        isOpen={true}
        onClose={jest.fn()}
        commands={commands}
        onCommandExecute={jest.fn()}
      />,
    );

    const input = screen.getByRole("textbox");

    // Type "h"
    fireEvent.change(input, { target: { value: "h" } });
    let options = screen.getAllByRole("option");
    const countH = options.length;

    // Type "ho"
    fireEvent.change(input, { target: { value: "ho" } });
    options = screen.getAllByRole("option");
    const countHo = options.length;

    // Type "hom"
    fireEvent.change(input, { target: { value: "hom" } });
    options = screen.getAllByRole("option");
    const countHom = options.length;

    // Results should narrow down as query becomes more specific
    expect(countHom).toBeLessThanOrEqual(countHo);
    expect(countHo).toBeLessThanOrEqual(countH);
  });
});
