// Local preparation only. No database client, credential generation, or network request.
import { cp, mkdir, symlink, access, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadDevelopmentConfig, developmentRoot, webRoot } from "./development-target.mjs";

try {
  const { config, target } = loadDevelopmentConfig();
  if (!config.SESSION_SECRET || config.SESSION_SECRET.length < 32 || !config.OWNER_PASSWORD_HASH?.startsWith("scrypt$")) throw new Error("Set development-only session/password values in the NEW config file");
  const { parseEnv } = await import("node:util");
  const { readFile } = await import("node:fs/promises");
  const existing = parseEnv(await readFile(path.join(webRoot, ".env"), "utf8"));
  if (config.SESSION_SECRET === existing.SESSION_SECRET || config.OWNER_PASSWORD_HASH === existing.OWNER_PASSWORD_HASH) throw new Error("Development authentication must not reuse existing authentication secrets");
  if ((config.AGENT_CREDENTIALS_JSON ?? "[]") !== "[]" || config.AGENT_TOKEN || config.AGENT_ID || config.AGENT_DEVICE_ID) throw new Error("Agent credentials must remain disabled for development verification");
  const runtime = path.join(developmentRoot, "web");
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  for (const name of ["app", "lib"]) await cp(path.join(webRoot, name), path.join(runtime, name), { recursive: true });
  for (const name of ["package.json", "tsconfig.json", "tailwind.config.ts", "postcss.config.js", "next-env.d.ts", "next.config.mjs", "middleware.ts"]) await cp(path.join(webRoot, name), path.join(runtime, name));
  try { await access(path.join(runtime, "node_modules")); } catch { await symlink(path.join(webRoot, "node_modules"), path.join(runtime, "node_modules"), "dir"); }
  // Only allowlisted NEW development values are copied. No source .env or uploads are copied.
  const env = {
    DATABASE_URL: config.DATABASE_URL,
    SESSION_SECRET: config.SESSION_SECRET,
    OWNER_PASSWORD_HASH: config.OWNER_PASSWORD_HASH,
    AGENT_CREDENTIALS_JSON: "[]", AGENT_TOKEN: "", AGENT_ID: "", AGENT_DEVICE_ID: "",
    PRINTOS_ENVIRONMENT: "development", PRINTOS_DEV_PROJECT_REF: target.projectRef,
  };
  const file = path.join(runtime, ".env");
  await writeFile(file, Object.entries(env).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n", { mode: 0o600 });
  const { chmod } = await import("node:fs/promises"); await chmod(file, 0o600);
  await mkdir(path.join(runtime, "tmp-uploads"), { recursive: true, mode: 0o700 });
  console.log("Development runtime prepared; existing config/documents untouched. No database changes made.");
  console.log("Start through the guarded launcher: node apps/web/scripts/start-development.mjs");
} catch (error) { console.error(error.message); process.exitCode = 1; }
