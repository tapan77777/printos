"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Login failed");
      return;
    }
    const next = new URLSearchParams(window.location.search).get("next") ?? "/dashboard";
    window.location.href = next;
  }

  return (
    <main className="max-w-sm mx-auto min-h-screen p-6 flex flex-col justify-center gap-6">
      <h1 className="text-xl font-semibold">PrintOS Owner Login</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type="password"
          autoFocus
          placeholder="Owner password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2"
        />
        {error && <div className="text-sm text-red-600">{error}</div>}
        <button
          type="submit"
          disabled={loading || password.length === 0}
          className="bg-black text-white rounded-lg py-2 disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
