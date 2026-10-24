import path from "node:path";
import { execFile } from "node:child_process";
/** Older renderers can silently ignore unknown flags: reject before authorizing. */
export async function rendererVersion(file: string): Promise<void> {
  if (process.platform !== "win32") throw new Error("WINDOWS_REQUIRED");
  const shell = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(shell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", path.resolve(__dirname, "../../windows/spooler.ps1"), "-Operation", "renderer", "-RendererPath", file],
      { timeout: 15000, maxBuffer: 4096, windowsHide: true, shell: false }, (err, out) => err ? reject(new Error("WINDOWS_VERSION_QUERY_FAILED")) : resolve(out));
  });
  const v = JSON.parse(stdout);
  if (!Number.isInteger(v.major) || !Number.isInteger(v.minor) || v.major < 3 || (v.major === 3 && v.minor < 7)) throw new Error("WINDOWS_RENDERER_VERSION_UNSUPPORTED");
}
