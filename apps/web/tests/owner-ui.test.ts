import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JobRow } from "../app/dashboard/jobs/JobRow";
import { formatPrice } from "../lib/pricing";
const job = { id: "test-job", printStatus: "QUEUED", copies: 1, colorMode: "BW", paperSize: "A4", duplex: true, pageRange: "all", price: 150, pageCount: 1, rejectionReason: null, agentError: null, printer: { name: "Counter" }, createdAt: "2026-10-23T00:00:00Z" };
afterEach(() => vi.unstubAllGlobals());
function button(view: ReturnType<typeof create>, label: string) {
  return view.root.findAllByType("button").find((item) => item.children.join("") === label)!;
}
describe("owner review", () => {
  it("Cancel never sends a rejection and keeps actions available", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const view = create(createElement(JobRow, { job }));
    await act(async () => { button(view, "Reject").props.onClick(); });
    await act(async () => { button(view, "Cancel").props.onClick(); });
    expect(fetch).not.toHaveBeenCalled(); expect(button(view, "Reject").props.disabled).toBe(false);
    view.unmount();
  });
  it("confirmed blank reason still rejects and renders exact persisted price and preview", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ printStatus: "REJECTED" }) });
    vi.stubGlobal("fetch", fetch);
    const view = create(createElement(JobRow, { job }));
    expect(JSON.stringify(view.toJSON())).toContain(formatPrice(150));
    expect(view.root.findByType("a").props.href).toBe("/api/jobs/test-job/file?preview=1");
    await act(async () => { button(view, "Reject").props.onClick(); });
    await act(async () => { await button(view, "Reject job").props.onClick(); });
    expect(fetch).toHaveBeenCalledWith("/api/jobs/test-job/reject", expect.objectContaining({ body: '{"reason":""}' }));
    view.unmount();
  });
  it("approval requires explicit confirmation and preserves the API payload", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ printStatus: "APPROVED" }) });
    vi.stubGlobal("fetch", fetch);
    const view = create(createElement(JobRow, { job }));
    await act(async () => { button(view, "Accept & Print").props.onClick(); });
    expect(fetch).not.toHaveBeenCalled();
    const confirm = view.root.findAllByType("button").filter((item) => item.children.join("") === "Accept & Print")[1];
    await act(async () => { await confirm.props.onClick(); });
    expect(fetch).toHaveBeenCalledWith("/api/jobs/test-job/approve", expect.objectContaining({ body: "{}" }));
    view.unmount();
  });
  it("failed actions recover without automatically retrying", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("Network unavailable")); vi.stubGlobal("fetch", fetch);
    const view = create(createElement(JobRow, { job }));
    await act(async () => { button(view, "Reject").props.onClick(); });
    await act(async () => { await button(view, "Reject job").props.onClick(); });
    expect(fetch).toHaveBeenCalledOnce(); expect(button(view, "Cancel").props.disabled).toBe(false);
    expect(JSON.stringify(view.toJSON())).toContain("Network unavailable"); view.unmount();
  });
  it("preserves and labels a legacy zero amount rather than reconstructing a price", () => {
    const view = create(createElement(JobRow, { job: { ...job, price: 0, pageCount: null } }));
    const text = JSON.stringify(view.toJSON());
    expect(text).toContain("₹0.00"); expect(text).toContain("Legacy amount");
    view.unmount();
  });

  it("labels a historically simulated job even when its printer is not simulation-only", () => {
    const view = create(createElement(JobRow, { job: { ...job, simulation: true, printer: { name: "Counter", simulationOnly: false } } }));
    expect(JSON.stringify(view.toJSON())).toContain("Simulation"); view.unmount();
  });

});
it('uncertain outcome is recorded only after inspection and confirmation, never by Cancel',async()=>{
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({printStatus:'COMPLETED'})});vi.stubGlobal('fetch',fetch);const view=create(createElement(JobRow,{job:{...job,printStatus:'RECONCILIATION_REQUIRED',attemptId:'159fd0a2-6711-4d09-b4f1-b43aa7e5e52b'},canResolve:true}));
 await act(async()=>{button(view,'Record inspected outcome').props.onClick();});await act(async()=>{button(view,'Cancel').props.onClick();});expect(fetch).not.toHaveBeenCalled();await act(async()=>{button(view,'Record inspected outcome').props.onClick();});await act(async()=>{button(view,'Save inspected outcome').props.onClick();});expect(fetch).not.toHaveBeenCalled();await act(async()=>{view.root.findByProps({'aria-label':'Inspection note'}).props.onChange({target:{value:'Inspected physical output, complete.'}});});await act(async()=>{button(view,'Save inspected outcome').props.onClick();});expect(fetch.mock.calls[0][0]).toBe('/api/jobs/test-job/reconcile');expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({resolution:'COMPLETED',note:'Inspected physical output, complete.'});view.unmount();
});
