"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/pricing";
import { StatusBadge, Notice } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { ConfirmDialog } from "../../components/ConfirmDialog";

type Job = {
  id: string;
  attemptId?:string|null;
  printStatus: string;
  copies: number;
  colorMode: string;
  paperSize: string;
  duplex: boolean;
  pageRange: string;
  price: number;
  pageCount?: number | null;
  simulation?: boolean;
  rejectionReason: string | null;
  agentError: string | null;
  printer: { name: string; simulationOnly?: boolean };
  createdAt: string;
};

export function JobRow({ job, canResolve=false }: { job: Job;canResolve?:boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState(job.printStatus);

  const [dialog, setDialog] = useState<"approve" | "reject" | "resolve" | null>(null);
  const [resolution,setResolution]=useState("COMPLETED");
  const [reason, setReason] = useState("");
  const [rejectionReason, setRejectionReason] = useState(job.rejectionReason);
  useEffect(() => { setStatus(job.printStatus); setRejectionReason(job.rejectionReason); }, [job.printStatus, job.rejectionReason]);
  function openDialog(action: "approve" | "reject" | "resolve") { setErr(null); setReason(""); setDialog(action); }
  async function act(action: "approve" | "reject" | "resolve") {
    if (busy) return;
    if(action==="resolve" && (!reason.trim()||!job.attemptId)){setErr("Inspect the physical output and enter an inspection note first.");return;}
    setBusy(action); setErr(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}/${action==="resolve"?"reconcile":action}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "resolve" ? {attemptId:job.attemptId,resolution,note:reason}: action === "reject" ? { reason } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      setStatus(data.printStatus);
      if (action === "reject") setRejectionReason(reason);
      setDialog(null);
    } catch (error) { setErr(error instanceof Error ? error.message : "Action failed. Check your connection."); }
    finally { setBusy(null); }
  }
  return <tr>
    <td data-label="Job"><div className="job-reference">#{job.id.slice(-8)}<div className="small">Print request</div></div></td>
    <td data-label="Printer">{job.printer.name}{(job.simulation || job.printer.simulationOnly) && <div className="job-option-sub"><span className="badge badge-warning">Simulation</span></div>}</td>
    <td data-label="Document"><div className="job-option-main">{job.copies} {job.copies === 1 ? "copy" : "copies"} · {job.colorMode === "BW" ? "B&W" : "Colour"} · {job.paperSize}</div><div className="job-option-sub">{job.duplex ? "Double-sided" : "Single-sided"} · pages {job.pageRange}</div><div className="job-option-sub">{job.pageCount == null ? "Legacy quote · page count unknown" : `${job.pageCount} pages in document`}</div>{status === "REJECTED" && rejectionReason && <p className="job-error">{rejectionReason}</p>}{["FAILED", "RECONCILIATION_REQUIRED"].includes(status) && job.agentError && <p className="job-error">{job.agentError}</p>}</td>
    <td data-label="Price" className="job-price">{formatPrice(job.price)}{job.price === 0 && job.pageCount == null && <div className="job-option-sub" title="The stored amount is zero and no page count was recorded. Historical data has not been repriced.">Legacy amount</div>}</td>
    <td data-label="Status"><div aria-live="polite"><StatusBadge status={status}/></div></td>
    <td data-label="Created" className="muted"><time dateTime={job.createdAt}>{new Date(job.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time></td>
    <td data-label="Actions"><a href={`/api/jobs/${job.id}/file?preview=1`} target="_blank" rel="noopener noreferrer" className="job-preview" aria-label={`Preview PDF for job ${job.id.slice(-8)} (opens in new tab)`}><Icon name="eye" size={14}/>Preview PDF</a>{status === "QUEUED" && <div className="job-actions"><button disabled={!!busy} onClick={() => openDialog("approve")} className="btn btn-primary">Accept &amp; Print</button><button disabled={!!busy} onClick={() => openDialog("reject")} className="btn btn-secondary">Reject</button></div>}
      {status==="RECONCILIATION_REQUIRED"&&job.attemptId&&canResolve&&<button className="btn btn-secondary" disabled={!!busy} onClick={()=>openDialog("resolve")}>Record inspected outcome</button>}
      <ConfirmDialog open={dialog !== null} title={dialog==="resolve"?"Record the inspected outcome":dialog === "reject" ? "Reject this print job?" : "Ready to approve?"} confirmLabel={dialog==="resolve"?"Save inspected outcome":dialog === "reject" ? "Reject job" : "Accept & Print"} danger={dialog === "reject"} busy={!!busy} onCancel={() => { setDialog(null); setErr(null); }} onConfirm={() => { if (dialog) act(dialog); }}>
        {dialog==="resolve"&&<><p>Inspect the Windows queue and physical output. This records the result and never queues a reprint.</p><label>Observed outcome<select aria-label="Observed outcome" value={resolution} onChange={e=>setResolution(e.target.value)}><option value="COMPLETED">Output confirmed complete</option><option value="FAILED">Failed or incomplete output</option></select></label><label>Inspection note<textarea aria-label="Inspection note" required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label></>}
        <p>{dialog === "reject" ? "The customer will see that this job was rejected. Add a short reason to help them understand." : "This makes the job available to the printing agent. Preview the PDF and check the options before continuing."}</p><div className="summary-row"><span>Job #{job.id.slice(-8)}</span><strong>{formatPrice(job.price)}</strong></div>
        {dialog === "reject" && <label>Reason <span className="muted">(optional)</span><textarea aria-label="Rejection reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} placeholder="Let the customer know why…" disabled={!!busy}/></label>}
        {err && <div style={{ marginTop: 16 }}><Notice tone="error">{err} Check the current job status before trying again.</Notice></div>}
      </ConfirmDialog>
    </td>
  </tr>;
}
