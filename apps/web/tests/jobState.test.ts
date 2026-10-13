import { describe, it, expect } from "vitest";
import { canTransition, AGENT_ALLOWED_TRANSITIONS } from "../lib/jobState";

describe("job state machine", () => {
  it("QUEUED → APPROVED is allowed", () => {
    expect(canTransition("QUEUED", "APPROVED")).toBe(true);
  });
  it("QUEUED → PRINTING is NOT allowed (must approve first)", () => {
    expect(canTransition("QUEUED", "PRINTING")).toBe(false);
  });
  it("APPROVED → DOWNLOADING is allowed", () => {
    expect(canTransition("APPROVED", "DOWNLOADING")).toBe(true);
  });
  it("REJECTED is terminal", () => {
    expect(canTransition("REJECTED", "APPROVED")).toBe(false);
    expect(canTransition("REJECTED", "PRINTING")).toBe(false);
  });
  it("COMPLETED is terminal", () => {
    expect(canTransition("COMPLETED", "PRINTING")).toBe(false);
  });
  it("Agent cannot set APPROVED/REJECTED/QUEUED", () => {
    expect(AGENT_ALLOWED_TRANSITIONS.has("APPROVED")).toBe(false);
    expect(AGENT_ALLOWED_TRANSITIONS.has("REJECTED")).toBe(false);
    expect(AGENT_ALLOWED_TRANSITIONS.has("QUEUED")).toBe(false);
    expect(AGENT_ALLOWED_TRANSITIONS.has("PRINTING")).toBe(true);
    expect(AGENT_ALLOWED_TRANSITIONS.has("COMPLETED")).toBe(true);
  });
});
