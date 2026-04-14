import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// ── Class merging ────────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Currency formatting ──────────────────────────────────
export function formatKES(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-KE", {
    style:    "currency",
    currency: "KES",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

// ── Date formatting ──────────────────────────────────────
export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-KE", {
    day:   "numeric",
    month: "short",
    year:  "numeric",
  }).format(new Date(date));
}

export function formatDateTime(date: string): string {
  return new Intl.DateTimeFormat("en-KE", {
    day:    "numeric",
    month:  "short",
    year:   "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatRelativeTime(date: string): string {
  const now  = new Date();
  const then = new Date(date);
  const diff = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (diff < 60)    return "Just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return formatDate(date);
}

// ── Payment status helpers ───────────────────────────────
export function getPaymentStatusBadge(status: string) {
  const map: Record<string, { label: string; class: string }> = {
    success: { label: "Paid",    class: "badge-success" },
    pending: { label: "Pending", class: "badge-warning" },
    failed:  { label: "Failed",  class: "badge-danger"  },
  };
  return map[status] || { label: status, class: "badge-neutral" };
}

export function getTenancyStatusBadge(status: string) {
  const map: Record<string, { label: string; class: string }> = {
    active:  { label: "Active",  class: "badge-success" },
    pending: { label: "Pending", class: "badge-warning" },
    ended:   { label: "Ended",   class: "badge-neutral" },
  };
  return map[status] || { label: status, class: "badge-neutral" };
}

// ── Error message extraction ─────────────────────────────
export function getErrorMessage(error: any): string {
  if (!error?.response?.data) return "Something went wrong. Please try again.";
  const data = error.response.data;
  if (typeof data === "string")  return data;
  if (data.detail)               return data.detail;
  // DRF validation errors — grab first message
  const firstKey = Object.keys(data)[0];
  if (firstKey && Array.isArray(data[firstKey])) return data[firstKey][0];
  return "Something went wrong. Please try again.";
}

// ── Phone number formatting ──────────────────────────────
export function formatPhone(phone: string): string {
  if (phone.startsWith("254") && phone.length === 12) {
    return `+254 ${phone.slice(3, 6)} ${phone.slice(6, 9)} ${phone.slice(9)}`;
  }
  return phone;
}