import { expect, it } from "vitest";
import { supabaseIdentity, validateDevelopmentTarget } from "../scripts/development-target.mjs";
const oldRef = "aaaaaaaaaaaaaaaaaaaa";
const devRef = "bbbbbbbbbbbbbbbbbbbb";
const protectedUrl = `postgresql://postgres:synthetic@db.${oldRef}.supabase.co:5432/postgres`;
const config = { PRINTOS_ENVIRONMENT: "development", PRINTOS_DEV_PROJECT_REF: devRef, DATABASE_URL: `postgresql://postgres.${devRef}:synthetic@aws-0-example.pooler.supabase.com:5432/postgres?sslmode=require` };
it("allows only the explicitly selected separate Supabase development project", () => {
  expect(validateDevelopmentTarget(config, protectedUrl)).toEqual({ projectRef: devRef, connectionMode: "session" });
});
it("blocks the protected project even when its URL uses a different pooler/password", () => {
  expect(() => validateDevelopmentTarget({ ...config, PRINTOS_DEV_PROJECT_REF: oldRef, DATABASE_URL: config.DATABASE_URL.replace(devRef, oldRef) }, protectedUrl)).toThrow("protected existing");
});
it("does not mistake a shared pooler hostname for project isolation", () => {
  expect(supabaseIdentity(config.DATABASE_URL).ref).toBe(devRef);
});
it("rejects missing/mismatched identity, plaintext transport and transaction pooling", () => {
  for (const overrides of [{ PRINTOS_ENVIRONMENT: "production" }, { PRINTOS_DEV_PROJECT_REF: oldRef }, { DATABASE_URL: config.DATABASE_URL.replace("5432", "6543") }, { DATABASE_URL: config.DATABASE_URL.replace("sslmode=require", "sslmode=disable") }]) {
    expect(() => validateDevelopmentTarget({ ...config, ...overrides }, protectedUrl)).toThrow();
  }
});
it("does not accept arbitrary or look-alike connection hosts", () => {
  expect(() => supabaseIdentity(`postgresql://postgres:synthetic@db.${devRef}.supabase.co.attacker.invalid/postgres`)).toThrow();
});
