// Explicitly pins the new runtime's env; inherited production variables cannot win.
import { spawn } from "node:child_process";
import path from "node:path";
import { loadDevelopmentConfig, developmentRoot, webRoot } from "./development-target.mjs";

try {
  const { config } = loadDevelopmentConfig();
  await import("./prepare-development.mjs");
  if (process.exitCode) throw new Error("Development preparation did not pass");
  const env = { ...process.env, NODE_ENV: "development", DATABASE_URL: config.DATABASE_URL, SESSION_SECRET: config.SESSION_SECRET, OWNER_PASSWORD_HASH: config.OWNER_PASSWORD_HASH, AGENT_CREDENTIALS_JSON: "[]", AGENT_TOKEN: "", AGENT_ID: "", AGENT_DEVICE_ID: "", PRINTOS_ENVIRONMENT: "development", PRINTOS_DEV_PROJECT_REF: config.PRINTOS_DEV_PROJECT_REF };
  delete env.DIRECT_URL; delete env.SHADOW_DATABASE_URL;
  const child = spawn(process.execPath, [path.join(webRoot, "node_modules/next/dist/bin/next"), "dev", "--port", "3001"], { cwd: path.join(developmentRoot, "web"), env, stdio: "inherit" });
  const stop = signal => child.kill(signal);
  const onInt = () => stop("SIGINT"); const onTerm = () => stop("SIGTERM");
  process.on("SIGINT", onInt); process.on("SIGTERM", onTerm);
  child.on("error", () => { console.error("Development server could not start"); process.exitCode = 1; });
  child.on("exit", code => { process.off("SIGINT", onInt); process.off("SIGTERM", onTerm); process.exitCode = code ?? 1; });
} catch (error) { console.error(error.message); process.exitCode = 1; }
