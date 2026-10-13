import { describe, it, expect, beforeAll } from "vitest";
import { createHmac } from "node:crypto";
import { encodeSession, decodeSession } from "../lib/session";
import { decodeSessionEdge } from "../lib/session-edge";

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

function signB64Url(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function makeToken(payload: object, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signB64Url(body, secret)}`;
}

describe("session-edge", () => {
  const secret = "a".repeat(64);

  it("accepts a token produced by the Node encoder", async () => {
    const token = encodeSession({ role: "owner" });
    const decoded = await decodeSessionEdge(token);
    expect(decoded?.role).toBe("owner");
    expect(decoded?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
  it("rejects a tampered token", async () => {
    const token = encodeSession({ role: "owner" });
    const bad = token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA");
    expect(await decodeSessionEdge(bad)).toBeNull();
  });
  it("rejects garbage and empty tokens", async () => {
    expect(await decodeSessionEdge("not-a-token")).toBeNull();
    expect(await decodeSessionEdge(undefined)).toBeNull();
    expect(await decodeSessionEdge("")).toBeNull();
  });
  it("rejects an expired but otherwise valid token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = makeToken({ role: "owner", iat: now - 7200, exp: now - 60 }, secret);
    expect(await decodeSessionEdge(token)).toBeNull();
  });
  it("rejects a correctly signed token with wrong secret", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = makeToken(
      { role: "owner", iat: now, exp: now + 3600 },
      "b".repeat(64),
    );
    expect(await decodeSessionEdge(token)).toBeNull();
  });
});
