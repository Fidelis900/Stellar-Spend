import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SkeletonBase } from "../SkeletonBase";

describe("SkeletonBase", () => {
  it("renders with role=status and aria-busy", () => {
    render(<SkeletonBase width={100} height={16} />);
    const el = screen.getByRole("status");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("aria-busy", "true");
  });

  it("applies the shared skeleton shimmer class", () => {
    render(<SkeletonBase width={80} height={14} />);
    expect(screen.getByRole("status")).toHaveClass("skeleton");
  });

  it("merges custom classNames alongside the skeleton class", () => {
    render(<SkeletonBase className="mb-4" />);
    const el = screen.getByRole("status");
    expect(el).toHaveClass("skeleton");
    expect(el).toHaveClass("mb-4");
  });

  it("applies explicit dimensions via inline style", () => {
    render(<SkeletonBase width={120} height={20} />);
    expect(screen.getByRole("status")).toHaveStyle({ width: "120px", height: "20px" });
  });

  it("accepts string dimensions (percentages)", () => {
    render(<SkeletonBase width="100%" height={42} />);
    expect(screen.getByRole("status")).toHaveStyle({ width: "100%" });
  });

  it("falls back to a default aria-label", () => {
    render(<SkeletonBase />);
    expect(screen.getByRole("status", { name: "Loading…" })).toBeInTheDocument();
  });

  it("uses a custom aria-label when provided", () => {
    render(<SkeletonBase aria-label="Loading balance…" />);
    expect(screen.getByRole("status", { name: "Loading balance…" })).toBeInTheDocument();
  });
});
