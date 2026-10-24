"use client";
import { useEffect, useId, useRef } from "react";
import { Icon } from "./Icon";

export function ConfirmDialog({ open, title, children, confirmLabel, busy, danger = false, onCancel, onConfirm }: {
  open: boolean; title: string; children: React.ReactNode; confirmLabel: string; busy: boolean; danger?: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null); const titleId = useId(); const descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className="confirm-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }} onClick={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <div className="dialog-inner"><div className={`dialog-icon ${danger ? "danger" : ""}`}><Icon name={danger ? "alert" : "printer"} size={26}/></div><h2 id={titleId}>{title}</h2><div id={descriptionId} className="dialog-description">{children}</div><div className="dialog-actions"><button autoFocus className="btn btn-secondary" disabled={busy} onClick={onCancel}>Cancel</button><button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} disabled={busy} onClick={onConfirm}>{busy ? "Saving…" : confirmLabel}</button></div></div>
  </dialog>;
}
