"use client";

import { useState } from "react";

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
  agentError: string | null;
  printer: { name: string };
  createdAt: string;
};

export function JobRow({ job }: { job: Job }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState(job.printStatus);

  async function act(action: "approve" | "reject") {
    setBusy(action);
    setErr(null);
    const body = action === "reject" ? { reason: window.prompt("Reason?") ?? "" } : {};
    const res = await fetch(`/api/jobs/${job.id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(null);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(data.error ?? "Action failed");
      return;
    }
    const data = (await res.json()) as { printStatus: string };
    setStatus(data.printStatus);
  }

  return (
    <tr className="hover:bg-gray-50 align-top">
      <td className="px-4 py-3 font-mono text-xs text-gray-500">{job.id.slice(-8)}</td>
      <td className="px-4 py-3">{job.printer.name}</td>
      <td className="px-4 py-3 text-xs">
        {job.copies}× · {job.colorMode} · {job.paperSize} · {job.duplex ? "duplex" : "single"} · pages {job.pageRange}
      </td>
      <td className="px-4 py-3">₹{(job.price / 100).toFixed(2)}</td>
      <td className="px-4 py-3">
        <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">{status}</span>
        {status === "REJECTED" && job.rejectionReason && (
          <div className="text-xs text-gray-500 mt-1">{job.rejectionReason}</div>
        )}
        {status === "FAILED" && job.agentError && (
          <div className="text-xs text-red-600 mt-1">{job.agentError}</div>
        )}
      </td>
      <td className="px-4 py-3 text-gray-500 text-xs">{new Date(job.createdAt).toLocaleString("en-IN")}</td>
      <td className="px-4 py-3">
        {status === "QUEUED" && (
          <div className="flex gap-2">
            <button
              disabled={!!busy}
              onClick={() => act("approve")}
              className="bg-black text-white rounded px-3 py-1 text-xs disabled:opacity-50"
            >
              {busy === "approve" ? "..." : "Accept & Print"}
            </button>
            <button
              disabled={!!busy}
              onClick={() => act("reject")}
              className="border border-gray-300 rounded px-3 py-1 text-xs disabled:opacity-50"
            >
              {busy === "reject" ? "..." : "Reject"}
            </button>
          </div>
        )}
        {err && <div className="text-xs text-red-600 mt-1">{err}</div>}
      </td>
    </tr>
  );
}
