import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const developmentRoot = path.resolve(webRoot, "../../.printos-dev");

export function supabaseIdentity(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error("DATABASE_URL must be a valid connection URI"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Expected a PostgreSQL connection URI");
  let ref;
  const direct = url.hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/);
  if (direct) ref = direct[1];
  else if (/^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(url.hostname)) {
    ref = decodeURIComponent(url.username).match(/\.([a-z0-9]{20})$/)?.[1];
  }
  if (!ref) throw new Error("Expected a recognized Supabase project connection");
  return { ref, port: url.port || "5432", ssl: url.searchParams.get("sslmode"), database: decodeURIComponent(url.pathname.slice(1)) };
}

export function validateDevelopmentTarget(config, protectedUrl) {
  if (config.PRINTOS_ENVIRONMENT !== "development") throw new Error("Explicit development environment marker required");
  const expected = config.PRINTOS_DEV_PROJECT_REF;
  if (!/^[a-z0-9]{20}$/.test(expected ?? "")) throw new Error("Set the new development project reference");
  const target = supabaseIdentity(config.DATABASE_URL);
  const protectedTarget = supabaseIdentity(protectedUrl);
  if (target.ref === protectedTarget.ref) throw new Error("Refusing the protected existing Supabase project");
  if (target.ref !== expected) throw new Error("Connection does not match the approved development project reference");
  if (target.port !== "5432") throw new Error("Use a direct or session-mode connection on port 5432 for this setup");
  if (target.ssl !== "require") throw new Error("Require TLS with sslmode=require");
  if (!target.database) throw new Error("Database name is required");
  return { projectRef: target.ref, connectionMode: new URL(config.DATABASE_URL).hostname.includes("pooler") ? "session" : "direct" };
}

export function loadDevelopmentConfig() {
  let config, protectedConfig;
  try {
    config = parseEnv(readFileSync(path.join(developmentRoot, ".env"), "utf8"));
    // This is a LOCAL configuration read, never a connection to the existing database.
    protectedConfig = parseEnv(readFileSync(path.join(webRoot, ".env"), "utf8"));
  } catch { throw new Error("Create .printos-dev/.env from the development template; existing apps/web/.env must remain intact"); }
  const target = validateDevelopmentTarget(config, protectedConfig.DATABASE_URL);
  if (config.DIRECT_URL || config.SHADOW_DATABASE_URL) throw new Error("Use one verified session/direct URL; extra database targets are not permitted by this launcher");
  return { config, target };
}
