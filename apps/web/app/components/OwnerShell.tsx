"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Brand } from "./ui";
import { accountClient } from "@/lib/auth-client";
import { Icon } from "./Icon";

const links = [{href:"/dashboard/pricing",label:"Pricing",icon:"jobs" as const},{href:"/dashboard/devices",label:"Devices & printers",icon:"printer" as const},{ href: "/dashboard/jobs", label: "Print jobs", icon: "jobs" as const }, { href: "/dashboard", label: "Overview", icon: "grid" as const }, { href: "/dashboard/reports", label: "Reports", icon: "chart" as const }];
export function OwnerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const active = links.find((link) => link.href === pathname);
  async function signOut() {
    setSigningOut(true); setError("");
    try {
      const result=await accountClient.signOut();
      if(result.error)throw new Error();
      window.location.href = "/login";
    } catch { setError("Couldn’t sign out. Please try again."); setSigningOut(false); }
  }
  return <div className="owner-app">
    <aside className="owner-sidebar"><Link href="/dashboard/jobs" aria-label="PrintOS workspace"><Brand light/></Link><div className="workspace-tag"><span className="workspace-avatar">P</span><div><strong>Owner workspace</strong><span>PrintOS console</span></div></div><p className="sidebar-label">WORKSPACE</p><Link className="sidebar-link" href="/shops">Switch shop</Link><nav aria-label="Owner navigation">{links.map((link) => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} className={`sidebar-link ${pathname === link.href ? "active" : ""}`}><Icon name={link.icon}/>{link.label}{pathname === link.href && <span className="nav-active-dot"/>}</Link>)}</nav><div className="sidebar-bottom"><div className="sidebar-note"><Icon name="shield"/><p>You’re in control.<span>Every job starts with your approval.</span></p></div><button className="sidebar-link" onClick={signOut} disabled={signingOut}><Icon name="logout"/>{signingOut ? "Signing out…" : "Sign out"}</button>{error && <p role="alert" className="sidebar-error">{error}</p>}<p className="sidebar-version">PrintOS · Owner console</p></div></aside>
    <div className="owner-content"><header className="owner-topbar"><div className="breadcrumbs"><span className="muted">Workspace</span><span aria-hidden="true">/</span><strong>{active?.label ?? "Workspace"}</strong></div><div className="topbar-owner"><span className="owner-avatar">O</span><div><strong>Shop owner</strong><span>Owner access</span></div></div></header><div className="mobile-owner-brand"><Brand/><button className="btn btn-ghost" onClick={signOut} disabled={signingOut}>Sign out</button></div><nav className="mobile-owner-nav" aria-label="Mobile owner navigation">{links.map((link) => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined}><Icon name={link.icon} size={18}/>{link.label}</Link>)}</nav>{error && <p role="alert" className="mobile-signout-error">{error}</p>}<main id="main-content" className="owner-main">{children}</main><footer className="owner-footer"><span>PrintOS / Owner workspace</span><span>Made for the everyday print shop.</span></footer></div>
  </div>;
}
