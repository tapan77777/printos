import type { ReactNode } from "react";
import Link from "next/link";
import { Icon, type IconName } from "./Icon";

export function Brand({ light = false }: { light?: boolean }) {
  return <span className={`brand ${light ? "brand-light" : ""}`}><span className="brand-mark"><Icon name="printer" size={21}/></span><span>Print<span className="brand-os">OS</span><span className="brand-period">.</span></span></span>;
}
export const statusLabels: Record<string, string> = {
  RECONCILIATION_REQUIRED: "Needs reconciliation", QUEUED: "Awaiting review", APPROVED: "Approved", DOWNLOADING: "Sending to printer", PRINTING: "Printing", COMPLETED: "Completed", FAILED: "Failed", REJECTED: "Rejected", CANCELLED: "Cancelled", CREATED: "Created", UPLOADED: "Uploaded", PAYMENT_PENDING: "Payment pending", PAID: "Paid", REFUNDED: "Refunded", EXPIRED: "Expired",
};
export function StatusBadge({ status }: { status: string }) {
  const tone = status === "COMPLETED" ? "success" : ["FAILED", "REJECTED", "RECONCILIATION_REQUIRED"].includes(status) ? "danger" : status === "QUEUED" ? "warning" : ["APPROVED", "PRINTING", "DOWNLOADING"].includes(status) ? "blue" : "neutral";
  return <span className={`badge badge-${tone}`}><span className="badge-dot"/>{statusLabels[status] ?? status.replaceAll("_", " ").toLowerCase()}</span>;
}
export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" | "success" | "warning" }) {
  return <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : undefined}><Icon name={tone === "error" || tone === "warning" ? "alert" : tone === "success" ? "check" : "shield"}/><div>{children}</div></div>;
}
export function PageHeading({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description: string; children?: ReactNode }) {
  return <header className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1><p className="muted">{description}</p></div>{children && <div className="heading-actions">{children}</div>}</header>;
}
export function EmptyState({ title, children, icon = "jobs" }: { title: string; children: ReactNode; icon?: IconName }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name={icon} size={28}/></span><h2>{title}</h2><p className="muted">{children}</p></div>;
}
export function CustomerFrame({ printerId, children }: { printerId: string; children: ReactNode }) {
  return <div className="customer-page"><header className="customer-header"><Link href={`/p/${encodeURIComponent(printerId)}`} aria-label="PrintOS printer home"><Brand/></Link><span className="small muted">Self-service printing</span></header><main id="main-content" className="customer-main">{children}</main><footer className="customer-footer"><Icon name="printer" size={15}/> A little less waiting. A little more doing.</footer></div>;
}
export function Skeleton({ className = "" }: { className?: string }) { return <span aria-hidden="true" className={`skeleton ${className}`}/>; }
