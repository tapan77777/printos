import { describe, it, expect, beforeAll } from "vitest";
import { encodeSession, decodeSession } from "../lib/session";

beforeAll(() => {
  process.env.SESSION_SECRET = "a".repeat(64);
});

describe("session", () => {
  it("round-trips a valid session", () => {
    const token = encodeSession({ role: "owner" });
    const decoded = decodeSession(token);
    expect(decoded?.role).toBe("owner");
    expect(decoded?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
  it("rejects a tampered token", () => {
    const token = encodeSession({ role: "owner" });
    const bad = token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA");
    expect(decodeSession(bad)).toBeNull();
  });
  it("rejects garbage", () => {
    expect(decodeSession("not-a-token")).toBeNull();
    expect(decodeSession(undefined)).toBeNull();
  });
});
