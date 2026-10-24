"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Icon } from "./Icon";
export function RefreshButton() {
  const router = useRouter(); const [pending, startTransition] = useTransition();
  return <button className="btn btn-secondary" disabled={pending} aria-label="Refresh data" onClick={() => startTransition(() => router.refresh())}><Icon name="refresh" className={pending ? "spin" : ""}/>{pending ? "Refreshing…" : "Refresh"}</button>;
}
