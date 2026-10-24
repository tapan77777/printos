"use client";

import { useEffect, useState, useRef } from "react";

import {uploadPrivateDocument} from "@/lib/customerDocumentUpload";
import { formatPrice } from "@/lib/pricing";
import { CustomerFrame, Notice, Skeleton } from "../../components/ui";
import { Icon } from "../../components/Icon";

export default function PrinterPage({ params, cloudStorage=false }: { params: { printerId: string }; cloudStorage?:boolean }) {
  const documentUpload=useRef<{file:File;controller:AbortController;promise:ReturnType<typeof uploadPrivateDocument>}|null>(null);
  const readyDocument=useRef<{documentId:string;documentToken:string}|null>(null);
  useEffect(()=>()=>{documentUpload.current?.controller.abort();},[]);
  function resetDocument(){documentUpload.current?.controller.abort();documentUpload.current=null;readyDocument.current=null;}
  const [file, setFile] = useState<File | null>(null);
  const [copies, setCopies] = useState(1);
  const [colorMode, setColorMode] = useState<"BW" | "COLOUR">("BW");
  const [paperSize, setPaperSize] = useState<"A4" | "A5" | "LETTER" | "LEGAL">("A4");
  const [duplex, setDuplex] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pageRange, setPageRange] = useState("all");
  const [counting, setCounting] = useState(false);
  const [quoteAttempt, setQuoteAttempt] = useState(0);

  const [quoteResult,setQuoteResult]=useState<{quote:any;error:string|null}>({quote:null,error:null});
  useEffect(() => {
    setPageCount(null); setQuoteResult({quote:null,error:null});
    if (!file) { setCounting(false); return; }
    const controller = new AbortController();
    setCounting(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("printerId", params.printerId);
    form.append("copies", String(copies)); form.append("colorMode",colorMode); form.append("paperSize",paperSize); form.append("duplex",String(duplex)); form.append("pageRange",pageRange);
    async function inspect() {
      try {
        let init:RequestInit={method:'POST',body:form,signal:controller.signal};
        if(cloudStorage){
          if(!documentUpload.current || documentUpload.current.file!==file){
            resetDocument();const uploadController=new AbortController();
            const promise=uploadPrivateDocument(file!,params.printerId,uploadController.signal);
            documentUpload.current={file:file!,controller:uploadController,promise};
            promise.catch(()=>{if(documentUpload.current?.promise===promise)documentUpload.current=null;});
          }
          const doc=await documentUpload.current.promise;if(controller.signal.aborted)return;readyDocument.current=doc;
          init={method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','x-printos-document-token':doc.documentToken},body:JSON.stringify({...Object.fromEntries(form.entries()),file:undefined,documentId:doc.documentId})};
        }
        const res = await fetch("/api/quotes", init);
        const data = await res.json();
        if (!res.ok) {if(res.status===410 && cloudStorage)resetDocument();throw new Error(data.error ?? "PDF validation failed");}
        if (!controller.signal.aborted) {setPageCount(data.pageCount);setQuoteResult({quote:data,error:null});}
      } catch (err) {
        if (!controller.signal.aborted) {const message=err instanceof Error ? err.message : "Unable to validate PDF";setError(message);setQuoteResult({quote:null,error:message});}
      } finally {
        if (!controller.signal.aborted) setCounting(false);
      }
    }
    inspect();
    return () => controller.abort();
  }, [file, params.printerId, quoteAttempt, copies, colorMode, paperSize, duplex, pageRange, cloudStorage]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError(null);resetDocument();
    if (selected && selected.type !== "application/pdf" && !selected.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are accepted"); setFile(null); return;
    }
    setPageRange("all"); setFile(selected);
  }
  async function handlePrint() {
    if (!file || !quoteResult.quote || submitting) return;
    setSubmitting(true); setError(null);
    const form = new FormData();
    form.append("file", file); form.append("printerId", params.printerId);
    form.append("copies", String(copies)); form.append("colorMode", colorMode);
    form.append("paperSize", paperSize); form.append("duplex", String(duplex));
    form.append("pageRange", quoteResult.quote.pageRange);
    if(quoteResult.quote.quoteKey)form.append("quoteKey",quoteResult.quote.quoteKey);
    try {
      let init:RequestInit={method:'POST',body:form};
      if(cloudStorage){const doc=readyDocument.current;if(!doc)throw Error('Validate your PDF before submitting');init={method:'POST',headers:{'Content-Type':'application/json','x-printos-document-token':doc.documentToken},body:JSON.stringify({...Object.fromEntries(form.entries()),file:undefined,documentId:doc.documentId})};}
      const res = await fetch("/api/jobs", init);
      const data = await res.json();
      if (!res.ok) {if(res.status===409)setQuoteAttempt(n=>n+1);throw new Error(data.error ?? "Upload failed");}
      window.location.href = `/p/${params.printerId}/j/${data.jobId}?s=${data.customerSessionId}`;
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to submit. Check your connection."); }
    finally { setSubmitting(false); }
  }
  return <CustomerFrame printerId={params.printerId}>
    <div className="customer-intro"><p className="eyebrow">YOUR DOCUMENT. A FEW SIMPLE STEPS.</p><h1>Let’s get it on paper.</h1><p>Upload a PDF, choose how you’d like it printed,<br className="desktop-break"/> and send it to the shop for review.</p><div className="printer-pill"><Icon name="printer" size={15}/><span>Printer</span><strong>{params.printerId}</strong></div></div>
    <div className="customer-steps" aria-label="Your progress"><span className={!file ? "current" : ""}><i>{file ? <Icon name="check" size={11}/> : "1"}</i>Upload</span><b className="step-rule"/><span className={file ? "current" : ""}><i>2</i>Print options</span><b className="step-rule"/><span><i>3</i>Shop review</span></div>
    <div className="customer-workspace">
      {error && <div className="customer-error"><Notice tone="error">{error}</Notice></div>}
      {!file ? <><section className="panel customer-upload"><div className="section-heading"><span className="section-number">01</span><h2>Your document</h2></div><label className="dropzone"><input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={handleFileChange} aria-label="Upload PDF document"/><span className="dropzone-icon"><Icon name="upload" size={27}/></span><strong>Choose your PDF</strong><span>Select a document from your device</span><span className="upload-link">Browse files <span aria-hidden="true">↗</span></span></label><div className="upload-bottom"><Icon name="shield"/><span>PDF format · validated before submission</span></div></section><div className="customer-reassurance"><div><Icon name="file"/><strong>Your choices</strong><p>Colour, copies & more</p></div><div><Icon name="eye"/><strong>Owner reviewed</strong><p>Approval before printing</p></div><div><Icon name="clock"/><strong>Stay in the loop</strong><p>Follow your job’s status</p></div></div></> : <>
      <fieldset disabled={submitting} className="panel" style={{ padding: 0, minWidth: 0 }} aria-label="Document and print options">
        <div className="document-card"><span className="document-icon"><Icon name="file" size={24}/></span><div className="document-details"><strong>{file.name}</strong><p>{(file.size / 1024 / 1024).toFixed(2)} MB · {pageCount === null ? "PDF document" : `${pageCount} document pages`}</p></div><button type="button" className="file-remove" onClick={() => {resetDocument();setFile(null);}} aria-label="Choose a different file"><Icon name="close" size={16}/></button></div>
        <div className="print-options"><div className="options-title"><h2>Make it yours.</h2><span>Print options</span></div>
          <div className="option-row"><div><strong>Copies</strong><p>How many do you need?</p></div><div className="copy-stepper"><button aria-label="Decrease copies" disabled={copies <= 1} onClick={() => setCopies((c) => Math.max(1, c - 1))}>−</button><output aria-live="polite" aria-label="Number of copies">{copies}</output><button aria-label="Increase copies" disabled={copies >= 50} onClick={() => setCopies((c) => Math.min(50, c + 1))}>+</button></div></div>
          <div className="option-field"><span id="colour-label">Colour mode</span><div className="segmented-select" role="group" aria-labelledby="colour-label"><button className="choice" aria-pressed={colorMode === "BW"} onClick={() => setColorMode("BW")}><span className="color-dot"/>Black & white</button><button className="choice" aria-pressed={colorMode === "COLOUR"} onClick={() => setColorMode("COLOUR")}><span className="color-dot rainbow"/>Full colour</button></div></div>
          <div className="options-grid"><label><span>Paper size</span><select aria-label="Paper size" value={paperSize} onChange={(event) => setPaperSize(event.target.value as typeof paperSize)}><option value="A4">A4</option><option value="A5">A5</option><option value="LETTER">Letter</option><option value="LEGAL">Legal</option></select></label><label><span>Pages to print</span><input aria-label="Pages to print" aria-invalid={!!quoteResult.error} aria-describedby="range-help" value={pageRange} onChange={(event) => setPageRange(event.target.value)} maxLength={64} placeholder="all or 1,3-5"/><span className="field-help" id="range-help">All, or a range like 1,3-5</span></label></div>
          <label className="duplex-label"><div><strong>Double-sided printing</strong><p>Print on both sides of the sheet</p></div><input aria-label="Double-sided" type="checkbox" checked={duplex} onChange={(event) => setDuplex(event.target.checked)}/></label>
        </div>
        {counting && <div className="quote-box" role="status"><div className="quote-title"><Icon name="refresh" size={15} className="spin"/>Checking your PDF…</div><Skeleton/><p className="small muted" style={{ marginTop: 10 }}>Reading page count to calculate your quote.</p></div>}
        {!counting && pageCount === null && <div className="quote-box"><p className="small muted">We need to check your PDF before you can submit it.</p><button onClick={() => setQuoteAttempt((n) => n + 1)} className="text-link">Retry PDF validation<Icon name="refresh" size={14}/></button></div>}
        {quoteResult.error && <div className="quote-box"><Notice tone="error">{quoteResult.error}</Notice></div>}
        {quoteResult.quote && <section className="quote-box" aria-label="Price summary" aria-live="polite"><div className="quote-title"><Icon name="jobs" size={15}/>Your print quote</div><div className="quote-line"><span>Selected pages</span><span>{quoteResult.quote.selectedPages} of {pageCount}</span></div><div className="quote-line"><span>Rate per {quoteResult.quote.basis === "SHEET" ? "sheet" : "printed side"}</span><span>{formatPrice(quoteResult.quote.unitPaise ?? quoteResult.quote.perPagePaise)}</span></div>{quoteResult.quote.units !== undefined && <div className="quote-line"><span>Billable {quoteResult.quote.basis === "SHEET" ? "sheets" : "pages"} (all copies)</span><span>{quoteResult.quote.units}</span></div>}<div className="quote-line"><span>Copies</span><span>× {copies}</span></div>{quoteResult.quote.minimumPaise > 0 && <div className="quote-line"><span>Order minimum</span><span>{formatPrice(quoteResult.quote.minimumPaise)}</span></div>}<div className="quote-total"><span>Total quote</span><strong>{formatPrice(quoteResult.quote.price)}</strong></div></section>}
        <p className="pricing-note">Prices are verified by the server for your selected options. Sheet pricing rounds up within each copy; an order minimum may apply.</p>
      </fieldset>
      <div className="customer-action">{quoteResult.quote && <div className="customer-action-summary"><span>Total quote</span><strong>{formatPrice(quoteResult.quote.price)}</strong></div>}<button onClick={handlePrint} disabled={submitting || counting || !quoteResult.quote} className="btn btn-primary">{submitting ? <><Icon name="refresh" size={16} className="spin"/>Submitting…</> : <>Submit for approval<Icon name="arrow" size={16}/></>}</button><p>No printing starts until the shop owner approves.</p></div>
      </>}
    </div>
  </CustomerFrame>;
}
