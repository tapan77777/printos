"use client";

import { useEffect, useState } from "react";

type Job = {
  id: string;
  printStatus: string;
  copies: number;
  colorMode: string;
  paperSize: string;
  duplex: boolean;
  pageRange: string;
  price: number;
  rejectionReason: string | null;
  createdAt: string;
};

const USER_LABELS: Record<string, string> = {
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
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("s") ?? "";
    let cancelled = false;
    async function poll() {
      const res = await fetch(`/api/jobs/${params.jobId}/public?s=${encodeURIComponent(s)}`);
      if (cancelled) return;
      if (!res.ok) {
        setError("This status link is not valid.");
        return;
      }
      const data = (await res.json()) as Job;
      setJob(data);
      if (["COMPLETED", "FAILED", "REJECTED", "CANCELLED"].includes(data.printStatus)) return;
      setTimeout(poll, 3000);
    }
    poll();
    return () => {
      cancelled = true;
    };
  }, [params.jobId]);

  if (error) {
    return <main className="max-w-md mx-auto min-h-screen p-6 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">PrintOS</h1>
      <p className="text-red-600">{error}</p>
    </main>;
  }

  if (!job) {
    return <main className="max-w-md mx-auto min-h-screen p-6">Loading...</main>;
  }

  return (
    <main className="max-w-md mx-auto min-h-screen p-6 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Your print job</h1>
      <div className="border border-gray-200 rounded-xl p-4 flex flex-col gap-3 text-sm">
        <div className="flex justify-between"><span className="text-gray-500">Status</span><span className="font-medium">{job.printStatus}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Copies</span><span>{job.copies}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Colour</span><span>{job.colorMode}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Paper</span><span>{job.paperSize}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Double-sided</span><span>{job.duplex ? "Yes" : "No"}</span></div>
        <div className="flex justify-between font-medium border-t pt-3"><span>Price</span><span>₹{(job.price / 100).toFixed(2)}</span></div>
      </div>
      <p className="text-sm text-gray-600">{USER_LABELS[job.printStatus] ?? job.printStatus}</p>
      {job.printStatus === "REJECTED" && job.rejectionReason && (
        <p className="text-sm text-gray-500">Reason: {job.rejectionReason}</p>
      )}
    </main>
  );
}
