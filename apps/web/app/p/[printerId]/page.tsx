"use client";

import { useMemo, useState } from "react";

const PRICE_PER_PAGE_BW = 2;
const PRICE_PER_PAGE_COLOUR = 5;

export default function PrinterPage({ params }: { params: { printerId: string } }) {
  const [file, setFile] = useState<File | null>(null);
  const [copies, setCopies] = useState(1);
  const [colorMode, setColorMode] = useState<"BW" | "COLOUR">("BW");
  const [paperSize, setPaperSize] = useState<"A4" | "A5" | "LETTER" | "LEGAL">("A4");
  const [duplex, setDuplex] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const estimate = useMemo(() => {
    if (!file) return 0;
    const base = colorMode === "COLOUR" ? PRICE_PER_PAGE_COLOUR : PRICE_PER_PAGE_BW;
    // Estimate uses placeholder page count of 1; server computes the real price.
    const perPage = duplex ? Math.max(0, base - 0.5) : base;
    return Math.round(perPage * copies);
  }, [file, copies, colorMode, duplex]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setError(null);
    if (selected && selected.type !== "application/pdf" && !selected.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are accepted");
      setFile(null);
      return;
    }
    setFile(selected);
  }

  async function handlePrint() {
    if (!file) return;
    setSubmitting(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("printerId", params.printerId);
    form.append("copies", String(copies));
    form.append("colorMode", colorMode);
    form.append("paperSize", paperSize);
    form.append("duplex", String(duplex));
    form.append("pageRange", "all");

    const res = await fetch("/api/jobs", { method: "POST", body: form });
    setSubmitting(false);
    const data = (await res.json().catch(() => ({}))) as {
      jobId?: string;
      customerSessionId?: string;
      error?: string;
    };
    if (!res.ok) {
      setError(data.error ?? "Upload failed");
      return;
    }
    const url = `/p/${params.printerId}/j/${data.jobId}?s=${data.customerSessionId}`;
    window.location.href = url;
  }

  return (
    <main className="max-w-md mx-auto min-h-screen p-6 flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">PrintOS</h1>
        <p className="text-sm text-gray-500">Printer <code>{params.printerId}</code></p>
      </header>

      {!file ? (
        <label className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-gray-400">
          <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleFileChange} />
          <div className="text-gray-600 font-medium">Upload your document</div>
          <div className="text-xs text-gray-400 mt-1">PDF only · max 25 MB</div>
        </label>
      ) : (
        <div className="rounded-xl border border-gray-200 p-4 flex flex-col gap-4">
          <div>
            <div className="text-sm text-gray-500">Document</div>
            <div className="font-medium break-all">{file.name}</div>
            <button className="text-xs text-gray-500 underline mt-1" onClick={() => setFile(null)}>
              Choose a different file
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Copies</span>
            <div className="flex items-center gap-3">
              <button onClick={() => setCopies((c) => Math.max(1, c - 1))} className="w-8 h-8 rounded-full border border-gray-300">−</button>
              <span>{copies}</span>
              <button onClick={() => setCopies((c) => Math.min(50, c + 1))} className="w-8 h-8 rounded-full border border-gray-300">+</button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Colour</span>
            <select value={colorMode} onChange={(e) => setColorMode(e.target.value as never)} className="border rounded px-2 py-1 text-sm">
              <option value="BW">Black &amp; White</option>
              <option value="COLOUR">Colour</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Paper</span>
            <select value={paperSize} onChange={(e) => setPaperSize(e.target.value as never)} className="border rounded px-2 py-1 text-sm">
              <option value="A4">A4</option>
              <option value="A5">A5</option>
              <option value="LETTER">Letter</option>
              <option value="LEGAL">Legal</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Double-sided</span>
            <input type="checkbox" checked={duplex} onChange={(e) => setDuplex(e.target.checked)} />
          </div>

          <div className="flex items-center justify-between font-medium border-t pt-3 text-sm">
            <span>Estimated price</span>
            <span>₹{estimate}</span>
          </div>
          <p className="text-xs text-gray-500">Final price is computed by the server from the real page count.</p>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <button
            onClick={handlePrint}
            disabled={submitting}
            className="bg-black text-white rounded-lg py-3 font-medium disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit for approval"}
          </button>
          <p className="text-xs text-gray-500 text-center">
            Your print job goes to the shop owner for approval before it prints.
          </p>
        </div>
      )}
    </main>
  );
}
