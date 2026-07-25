import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HistoryPagination } from "../HistoryPagination";

const setup = (props = {}) => {
  const onPageChange = vi.fn();
  const onPageSizeChange = vi.fn();
  render(
    <HistoryPagination
      page={1}
      pageSize={25}
      totalItems={60}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      {...props}
    />,
  );
  return { onPageChange, onPageSizeChange };
};

describe("HistoryPagination", () => {
  it("shows the current range and page count", () => {
    setup();
    expect(screen.getByText("1–25 of 60")).toBeInTheDocument();
    expect(screen.getByText("Page 1 / 3")).toBeInTheDocument();
  });

  it("disables Prev on the first page", () => {
    setup();
    expect(screen.getByLabelText("Previous page")).toBeDisabled();
    expect(screen.getByLabelText("Next page")).not.toBeDisabled();
  });

  it("disables Next when on the final page and shows the last range", () => {
    setup({ page: 3 });
    expect(screen.getByLabelText("Next page")).toBeDisabled();
    expect(screen.getByText("51–60 of 60")).toBeInTheDocument();
  });

  it("emits page changes for Prev/Next", () => {
    const { onPageChange } = setup({ page: 2 });
    fireEvent.click(screen.getByLabelText("Next page"));
    expect(onPageChange).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByLabelText("Previous page"));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("emits page-size changes", () => {
    const { onPageSizeChange } = setup();
    fireEvent.change(screen.getByLabelText("Rows per page"), { target: { value: "50" } });
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it("handles an empty result set gracefully", () => {
    setup({ totalItems: 0 });
    expect(screen.getByText("0–0 of 0")).toBeInTheDocument();
    expect(screen.getByLabelText("Previous page")).toBeDisabled();
    expect(screen.getByLabelText("Next page")).toBeDisabled();
  });
});
