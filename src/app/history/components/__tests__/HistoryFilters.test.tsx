import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HistoryFilters } from "../HistoryFilters";
import { DEFAULT_FILTERS } from "../../filters";

const setup = (overrides = {}) => {
  const handlers = {
    onChange: vi.fn(),
    onClear: vi.fn(),
    onApplyPreset: vi.fn(),
    onApplySavedView: vi.fn(),
    onSaveCurrentView: vi.fn(),
    onDeleteSavedView: vi.fn(),
  };
  render(
    <HistoryFilters
      filters={DEFAULT_FILTERS}
      filterCount={0}
      availableCurrencies={["NGN", "USD"]}
      savedViews={[]}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
};

describe("HistoryFilters", () => {
  it("emits onChange when the search input changes", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText("Search transactions"), { target: { value: "hi" } });
    expect(onChange).toHaveBeenCalledWith("search", "hi");
  });

  it("renders available currencies as options", () => {
    setup();
    const select = screen.getByLabelText("Filter by currency");
    expect(select).not.toBeDisabled();
    expect(screen.getByRole("option", { name: /USD/ })).toBeInTheDocument();
  });

  it("disables the currency select when none are available", () => {
    setup({ availableCurrencies: [] });
    expect(screen.getByLabelText("Filter by currency")).toBeDisabled();
  });

  it("shows the active filter badge and clear button only when filters are active", () => {
    const { onClear } = setup({ filterCount: 2, filters: { ...DEFAULT_FILTERS, search: "x" } });
    expect(screen.getByLabelText("2 active filters")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Clear filters"));
    expect(onClear).toHaveBeenCalled();
  });

  it("hides the clear button when there are no active filters", () => {
    setup();
    expect(screen.queryByText("Clear filters")).not.toBeInTheDocument();
  });

  it("wires preset and save-view actions", () => {
    const { onApplyPreset, onSaveCurrentView } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Pending" }));
    expect(onApplyPreset).toHaveBeenCalledWith("pending");
    fireEvent.click(screen.getByText("+ Save current view"));
    expect(onSaveCurrentView).toHaveBeenCalled();
  });
});
