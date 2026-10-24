"use client";

import { useState } from "react";
import Link from "next/link";
import { Brand, Notice } from "../components/ui";
import { Icon } from "../components/Icon";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Login failed");
      }
      const next = new URLSearchParams(window.location.search).get("next") ?? "/dashboard";
      window.location.href = next;
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to sign in. Check your connection and try again."); }
    finally { setLoading(false); }
  }

  return <div className="login-page">
    <aside className="login-story"><Link href="/" aria-label="PrintOS home"><Brand light/></Link><div className="login-story-content"><p className="eyebrow">LESS FRICTION. MORE FLOW.</p><h2>A calmer counter.<br/>A better print day.</h2><p>A focused workspace for your print shop. From the first upload to the final page, keep everything in view.</p><div className="login-features"><div><Icon name="jobs"/>Your print queue, in one place</div><div><Icon name="eye"/>Review before you approve</div><div><Icon name="chart"/>A clearer view of daily activity</div></div></div><p className="login-story-footer">Thoughtfully made for the everyday print shop.</p></aside>
    <main className="login-form-side" id="main-content"><div className="login-form-wrap"><div className="login-mobile-brand"><Link href="/" aria-label="PrintOS home"><Brand/></Link></div><p className="eyebrow">OWNER WORKSPACE</p><h1>Welcome back.</h1><p>Sign in to keep your print shop moving.</p><form className="login-form" onSubmit={onSubmit}><div><label className="field-label" htmlFor="owner-password">Owner password</label><div className="password-wrap"><input id="owner-password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={loading} aria-invalid={!!error} aria-describedby={error ? "login-error" : undefined}/><button className="password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>{showPassword ? "Hide" : "Show"}</button></div></div>{error && <div id="login-error"><Notice tone="error">{error}</Notice></div>}<button type="submit" className="btn btn-primary" disabled={loading || password.length === 0}>{loading ? <><Icon name="refresh" className="spin" size={16}/>Signing in…</> : <>Sign in<Icon name="arrow" size={16}/></>}</button></form><div className="login-form-footer"><Icon name="shield" size={16}/><span>This workspace is for shop owners. Printing a document? Open the QR link provided by your shop.</span></div></div></main>
  </div>;
}
