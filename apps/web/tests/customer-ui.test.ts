import { createElement, type ReactNode } from "react";

import { act, create } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import PrinterPage from "../app/p/[printerId]/CustomerPrinter";
import JobStatusPage from "../app/p/[printerId]/j/[jobId]/CustomerStatus";
import { createQuote, formatPrice } from "../lib/pricing";

vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children) }));
afterEach(() => vi.unstubAllGlobals());
describe("customer pricing consistency", () => {
  it("uses fresh server quotes for every option change and blocks invalid ranges", async () => {
    const fetch = vi.fn().mockImplementation(async (_url,init)=>{const f=init.body as FormData;try{return {ok:true,json:async()=>createQuote({copies:Number(f.get("copies")),colorMode:String(f.get("colorMode")) as "BW",paperSize:"A4",duplex:f.get("duplex")==="true",pageRange:String(f.get("pageRange"))},8)}}catch{return {ok:false,json:async()=>({error:"Invalid range"})}}});
    vi.stubGlobal("fetch", fetch);
    let view!: ReturnType<typeof create>;
    await act(async () => { view = create(createElement(PrinterPage, { params: { printerId: "SHOP" } })); });
    await act(async () => {
      view.root.findByProps({ type: "file" }).props.onChange({ target: { files: [new File(["dummy"], "test.pdf", { type: "application/pdf" })] } });
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.stringify(view.toJSON())).toContain(formatPrice(1600));
    await act(async () => {
      view.root.findByProps({ placeholder: "all or 1,3-5" }).props.onChange({ target: { value: "1,3-5" } });
      view.root.findByProps({ type: "checkbox" }).props.onChange({ target: { checked: true } });
      view.root.findAllByType("button").find((b) => b.children.includes("+"))!.props.onClick();
    });
    const expected = createQuote({ copies: 2, colorMode: "BW", duplex: true, paperSize: "A4", pageRange: "1,3-5" }, 8);
    expect(JSON.stringify(view.toJSON())).toContain(formatPrice(expected.price));
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => {
      view.root.findByProps({ placeholder: "all or 1,3-5" }).props.onChange({ target: { value: "9" } });
    });
    expect(view.root.findAllByType("button").find((b) => b.props.className === "btn btn-primary")!.props.disabled).toBe(true);
    view.unmount();
  });
  it("status receipt displays the persisted price without repricing legacy jobs", async () => {
    vi.stubGlobal("window", { location: { search: "?s=token" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "job", printStatus: "COMPLETED", copies: 2, colorMode: "BW", paperSize: "A4", duplex: true, pageRange: "1,3-5", pageCount: null, price: 150, rejectionReason: null }) }));
    let view!: ReturnType<typeof create>;
    await act(async () => { view = create(createElement(JobStatusPage, { params: { printerId: "SHOP", jobId: "job" } })); });
    expect(JSON.stringify(view.toJSON())).toContain(formatPrice(150));
    view.unmount();
  });
  it("shows a recoverable status connection error without automatic retries", async () => {
    vi.stubGlobal("window", { location: { search: "?s=token" } });
    const fetch = vi.fn().mockRejectedValue(new Error("Connection interrupted")); vi.stubGlobal("fetch", fetch);
    let view!: ReturnType<typeof create>;
    await act(async () => { view = create(createElement(JobStatusPage, { params: { printerId: "SHOP", jobId: "job" } })); });
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.stringify(view.toJSON())).toContain("Connection interrupted");
    expect(view.root.findAllByType("button").some((button) => button.props.disabled === false)).toBe(true);
    view.unmount();
  });

  it("reconciliation is a stopped journey rather than an inferred successful print", async () => {
    vi.stubGlobal("window", { location: { search: "?s=token" } });
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "job", printStatus: "RECONCILIATION_REQUIRED", copies: 1, colorMode: "BW", paperSize: "A4", duplex: false, pageRange: "all", pageCount: 2, price: 400, rejectionReason: null }) });
    vi.stubGlobal("fetch", fetch);
    let view!: ReturnType<typeof create>;
    await act(async () => { view = create(createElement(JobStatusPage, { params: { printerId: "SHOP", jobId: "job" } })); });
    expect(JSON.stringify(view.toJSON())).toContain("The shop is checking this job.");
    expect(view.root.findAllByProps({ className: "panel status-timeline" })).toHaveLength(0);
    expect(fetch).toHaveBeenCalledOnce(); view.unmount();
  });

});
