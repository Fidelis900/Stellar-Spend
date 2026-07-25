import type { Transaction } from "@/lib/transaction-storage";

// ---------------------------------------------------------------------------
// Presentation helpers shared across the history components.
// ---------------------------------------------------------------------------

export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function truncateTxHash(hash: string): string {
  if (!hash || hash.length <= 12) return hash || "—";
  return `${hash.slice(0, 6)}...${hash.slice(-6)}`;
}

export function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    NGN: "₦",
    USD: "$",
    EUR: "€",
    GBP: "£",
    KES: "KSh",
    GHS: "₵",
    ZAR: "R",
  };
  return symbols[currency.toUpperCase()] || currency.toUpperCase();
}

export function formatUsdc(amount: number): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

export function getInsuranceStatusLabel(
  status: NonNullable<Transaction["insurance"]>["status"],
): string {
  const labels: Record<NonNullable<Transaction["insurance"]>["status"], string> = {
    pending: "Pending",
    active: "Active",
    claimed: "Claim filed",
    claim_approved: "Approved",
    claim_rejected: "Rejected",
    paid: "Paid",
  };
  return labels[status];
}

export function canFileClaim(tx: Transaction): boolean {
  return !!tx.insurance && tx.insurance.status === "active";
}
