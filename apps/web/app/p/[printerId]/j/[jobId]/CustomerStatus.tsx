"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/pricing";
import { CustomerFrame, Notice, Skeleton, StatusBadge } from "../../../../components/ui";
import { Icon } from "../../../../components/Icon";

type Job = {
  id: string;
  printStatus: string;
  copies: number;
  colorMode: string;
  paperSize: string;
  duplex: boolean;
  pageRange: string;
  price: number;
  pageCount: number | null;
  rejectionReason: string | null;
  createdAt: string;
};

const USER_LABELS: Record<string, string> = {
  RECONCILIATION_REQUIRED: "The shop needs to check this job’s printing outcome. Please speak to the owner before sending another copy.",
  QUEUED: "Waiting for shop owner to review your job...",
  APPROVED: "Approved. The printer will pick it up shortly.",
  DOWNLOADING: "Sending to the printer...",
  PRINTING: "Printing now...",
  COMPLETED: "Printed. Please collect your document.",
  FAILED: "Something went wrong. Please speak to the shop owner.",
  REJECTED: "The shop owner rejected this job.",
  CANCELLED: "Cancelled.",
};

export default function JobStatusPage({ params }: { params: { printerId: string; jobId: string } }) {
  const [downloading,setDownloading]=useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(true);
  useEffect(() => {
    const session = new URLSearchParams(window.location.search).get("s") ?? "";
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setError(null); setRefreshing(true);
    async function poll() {
      try {
        const res = await fetch(`/api/jobs/${params.jobId}/public?s=${encodeURIComponent(session)}`, { signal: controller.signal });
        if (!res.ok) throw new Error(res.status === 400 || res.status === 404 ? "This status link is not valid. Open the original link you received after submitting." : "We couldn’t refresh your job status. Please try again.");
        const data = await res.json() as Job;
        if (controller.signal.aborted) return;
        setJob(data); setRefreshing(false);
        if (!["COMPLETED", "FAILED", "REJECTED", "CANCELLED", "REFUNDED", "EXPIRED", "RECONCILIATION_REQUIRED"].includes(data.printStatus)) timer = setTimeout(poll, 3000);
      } catch (err) {
        if (!controller.signal.aborted) { setError(err instanceof Error ? err.message : "Connection interrupted. Your job has not been changed."); setRefreshing(false); }
      }
    }
    poll();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [params.jobId, attempt]);

  async function downloadDocument(){setDownloading(true);setError(null);try{const session=new URLSearchParams(window.location.search).get('s')??'';const response=await fetch(`/api/jobs/${params.jobId}/file`,{headers:{'x-printos-customer-session':session,'x-printos-download':'manifest-v1'}});if(!response.ok)throw Error(response.status===410?'This document is no longer retained. Your job receipt is still available.':'Unable to download your document');if(response.headers.get('content-type')?.includes('application/json')){const manifest=await response.json();const link=document.createElement("a");link.href=manifest.url;link.referrerPolicy="no-referrer";link.rel="noreferrer";link.click();}else{const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');link.href=url;link.download='document.pdf';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}}catch(e){setError(e instanceof Error?e.message:'Download failed');}finally{setDownloading(false);}}
  const stopped = job && ["FAILED", "REJECTED", "CANCELLED", "EXPIRED", "REFUNDED", "RECONCILIATION_REQUIRED"].includes(job.printStatus);
  const complete = job?.printStatus === "COMPLETED";
  const progress = job ? ({ QUEUED: 1, APPROVED: 2, DOWNLOADING: 2, PRINTING: 2, COMPLETED: 4 }[job.printStatus] ?? 0) : 0;
  const titles: Record<string, string> = { RECONCILIATION_REQUIRED: "The shop is checking this job.", QUEUED: "You’re in the queue.", APPROVED: "Your job is approved.", DOWNLOADING: "On its way to the printer.", PRINTING: "Your pages are in progress.", COMPLETED: "Your job is complete.", FAILED: "This job needs attention.", REJECTED: "This job wasn’t approved.", CANCELLED: "This job was cancelled.", EXPIRED: "This job has expired.", REFUNDED: "This job was refunded." };
  const steps = [{ title: "Request received", detail: "Your document and options are with the shop." }, { title: "Shop review", detail: "The owner checks your request before printing." }, { title: "Printing", detail: job?.printStatus === "APPROVED" ? "Approved and waiting for the printing agent." : job?.printStatus === "DOWNLOADING" ? "Sending your document to the printer." : "The agent reports your job’s printing progress." }, { title: "Ready to collect", detail: "Collect your document from the shop." }];
  return <CustomerFrame printerId={params.printerId}><div className="customer-workspace">{job && <button className="btn btn-ghost" disabled={downloading} onClick={downloadDocument}>{downloading?"Preparing download…":"Download your PDF"}</button>}
    {error && <div className="customer-error"><Notice tone="error">{error}{job && <p>The last received status is shown below.</p>}<button className="text-link" onClick={() => setAttempt((n) => n + 1)} disabled={refreshing}>Refresh status<Icon name="refresh" size={14}/></button></Notice></div>}
    {!job && !error && <section className="panel panel-body" role="status" aria-label="Loading job status"><Skeleton className="skeleton-heading"/><Skeleton className="skeleton-row"/><Skeleton className="skeleton-row"/><span className="sr-only">Loading your print job…</span></section>}
    {job && <><section className="status-hero" aria-live="polite"><div className={`status-orb ${complete ? "success" : stopped ? "danger" : ""}`}><Icon name={complete ? "check" : stopped ? "alert" : job.printStatus === "PRINTING" ? "printer" : "clock"} size={30}/></div><StatusBadge status={job.printStatus}/><h1>{titles[job.printStatus] ?? "Your print job"}</h1><p>{USER_LABELS[job.printStatus] ?? "Follow your job’s recorded status here."}</p><div className="status-reference">JOB #{job.id.slice(-8)} · PRINTER {params.printerId}</div></section>
      {job.printStatus === "REJECTED" && job.rejectionReason && <div className="customer-error"><Notice tone="warning"><strong>A note from the shop</strong><p>{job.rejectionReason}</p></Notice></div>}
      {!stopped && <section className="panel status-timeline"><h2>Your print journey</h2><ol>{steps.map((step, index) => <li key={step.title} className={`timeline-step ${index < progress ? "done" : index === progress ? "current" : ""}`} aria-current={index === progress ? "step" : undefined}><span className="timeline-dot">{index < progress ? <Icon name="check" size={13}/> : index + 1}</span><div><strong>{step.title}</strong><p>{step.detail}</p></div></li>)}</ol></section>}
      <section className="panel receipt"><h2>The details, all together.</h2><dl>{[["Printer", params.printerId], ["Copies", String(job.copies)], ["Colour", job.colorMode === "BW" ? "Black & white" : "Full colour"], ["Paper size", job.paperSize], ["Printing", job.duplex ? "Double-sided" : "Single-sided"], ["Pages selected", job.pageRange], ["Document pages", job.pageCount == null ? "Not recorded" : String(job.pageCount)]].map(([label, value]) => <div className="receipt-line" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}<div className="receipt-line receipt-total"><dt>Recorded quote</dt><dd>{formatPrice(job.price)}</dd></div></dl></section>
      <p className="status-help"><strong>{complete ? "All set? Please collect your document." : stopped ? "Need a hand? Speak to the shop owner." : "You can keep this page open."}</strong><br/>{stopped ? "The shop can help you with the next step." : complete ? "The shop owner can help with any questions." : "Status updates appear here as the job progresses."}</p>
    </>}
  </div></CustomerFrame>;
}
