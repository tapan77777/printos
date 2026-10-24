import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

// A production build must never replace a running dev server's manifests/CSS.
export default function nextConfig(phase) {
  return { distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next" };
}
