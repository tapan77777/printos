import type { PrintStatus } from "@prisma/client";

const TRANSITIONS: Record<PrintStatus, PrintStatus[]> = {
  CREATED: ["QUEUED", "CANCELLED"],
  UPLOADED: ["QUEUED"],
  PAYMENT_PENDING: ["PAID", "FAILED", "CANCELLED"],
  PAID: ["QUEUED"],
  QUEUED: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["DOWNLOADING", "PRINTING", "FAILED", "CANCELLED"],
  REJECTED: [],
  DOWNLOADING: ["PRINTING", "FAILED", "RECONCILIATION_REQUIRED"],
  PRINTING: ["COMPLETED", "FAILED", "RECONCILIATION_REQUIRED"],
  RECONCILIATION_REQUIRED: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
  REFUNDED: [],
  EXPIRED: [],
};

export function canTransition(from: PrintStatus, to: PrintStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export const AGENT_ALLOWED_TRANSITIONS = new Set<PrintStatus>([
  "DOWNLOADING",
  "PRINTING",
  "COMPLETED",
  "FAILED",
  "RECONCILIATION_REQUIRED",
]);
