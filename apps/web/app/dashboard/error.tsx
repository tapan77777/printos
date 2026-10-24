"use client";
import { EmptyState, Notice } from "../components/ui";
export default function WorkspaceError({ reset }: { reset: () => void }) { return <section className="panel"><EmptyState title="We couldn’t load this view" icon="alert">Your workspace data is temporarily unavailable. You can reload this view; no print action will be repeated.</EmptyState><div className="panel-body"><Notice tone="error">Check your connection and try loading the view again.</Notice><button className="btn btn-primary" onClick={reset} style={{ marginTop: 20 }}>Reload view</button></div></section>; }
