import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  FormCardSkeleton,
  TransactionTableSkeleton,
  QuoteDisplaySkeleton,
  WalletConnectionSkeleton,
  AnalyticsDashboardSkeleton,
  BankAccountInputSkeleton,
} from "../index";

/**
 * Every skeleton composes the shared SkeletonBase primitive, so the shimmer
 * animation is single-sourced. These tests assert each component renders,
 * routes its placeholders through the `.skeleton` class, and stays visually
 * stable via snapshots.
 */
describe("skeleton components", () => {
  it("FormCardSkeleton renders and uses the shared shimmer primitive", () => {
    const { container } = render(<FormCardSkeleton />);
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });

  it("TransactionTableSkeleton renders the requested number of rows", () => {
    const { container } = render(<TransactionTableSkeleton rows={4} />);
    // 4 skeleton cells per row * 4 rows + 2 header skeletons = 18
    expect(container.querySelectorAll(".skeleton").length).toBe(18);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("QuoteDisplaySkeleton renders and uses the shared shimmer primitive", () => {
    const { container } = render(<QuoteDisplaySkeleton />);
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("WalletConnectionSkeleton renders two balance placeholders", () => {
    const { container } = render(<WalletConnectionSkeleton />);
    expect(container.querySelectorAll(".skeleton").length).toBe(2);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("AnalyticsDashboardSkeleton renders and uses the shared shimmer primitive", () => {
    const { container } = render(<AnalyticsDashboardSkeleton />);
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("BankAccountInputSkeleton renders a field row per requested field", () => {
    const { container } = render(<BankAccountInputSkeleton fields={2} />);
    // 3 mode tabs + (label + input) * 2 fields = 7
    expect(container.querySelectorAll(".skeleton").length).toBe(7);
    expect(container.firstChild).toMatchSnapshot();
  });
});
