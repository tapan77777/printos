import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../lib/password";

describe("password hashing", () => {
  it("verifies a correct password", () => {
    const hash = hashPassword("hunter2!");
    expect(verifyPassword("hunter2!", hash)).toBe(true);
  });
  it("rejects a wrong password", () => {
    const hash = hashPassword("hunter2!");
    expect(verifyPassword("hunter2?", hash)).toBe(false);
  });
  it("rejects a malformed stored value", () => {
    expect(verifyPassword("x", "not-a-hash")).toBe(false);
  });
});
