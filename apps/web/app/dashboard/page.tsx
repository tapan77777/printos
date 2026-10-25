import { getOwnerFromCookies } from "@/lib/session";
import { dashboardStats } from "@/lib/dashboardStats";
import { setupSettings } from "@/lib/shopSetupState";
import { redirect } from "next/navigation";
import { formatPrice } from "@/lib/pricing";
import Link from "next/link";
import { Icon, type IconName } from "../components/Icon";
import { PageHeading, Notice } from "../components/ui";
import { RefreshButton } from "../components/RefreshButton";

export const dynamic = "force-dynamic";

function paiseToRupees(paise: number | null | undefined): string {
  return formatPrice(paise ?? 0);
}

export default async function Dashboard() {
  const owner=await getOwnerFromCookies();if(!owner?.shopId)redirect("/shops");
  const s = await dashboardStats(owner.shopId);
  const setup=setupSettings(s.metadata);

  const cards: { label: string; value: string; caption: string; icon: IconName; featured?: boolean }[] = [
    { label: "Awaiting approval", value: String(s.pendingApproval), caption: "Ready for your review", icon: "jobs", featured: true },
    { label: "In progress", value: String(s.printing), caption: "Approved, sending or printing", icon: "printer" },
    { label: "Completed today", value: String(s.today._count._all ?? 0), caption: "Jobs marked completed", icon: "check" },
    { label: "Recorded sales today", value: paiseToRupees(s.today._sum.price), caption: "Value of completed jobs", icon: "chart" },
  ];
  return <>
    <PageHeading eyebrow="YOUR WORKSPACE, AT A GLANCE" title="A clear view of your day." description="Review the queue, follow your jobs and keep the counter moving."><RefreshButton/></PageHeading>
    <section className="queue-callout"><div><h2>{setup.orderingEnabled ? "Your shop is accepting orders" : "Finish setting up your shop"}</h2><p>{setup.orderingEnabled ? "You stay in control: review every job before printing." : "Review prices and download your QR poster. Orders stay off until you turn them on."}</p><Link href="/dashboard/setup" className="text-link">{setup.orderingEnabled ? "Shop setup & QR poster" : "Continue shop setup"}</Link></div></section>
    {!s.paired&&<Notice>Connect your printer whenever you’re ready. <Link href="/dashboard/devices">Connect a printer</Link> · <Link href="/#windows-app">Windows app &amp; installation</Link>. Setup and QR downloads do not start printing.</Notice>}
    <div className="metric-grid">{cards.map((c) => <section key={c.label} className={`panel metric ${c.featured ? "metric-featured" : ""}`}><div className="metric-top"><span>{c.label}</span><span className="metric-icon"><Icon name={c.icon} size={17}/></span></div><p className="metric-value">{c.value}</p><p className="metric-caption">{c.caption}</p></section>)}</div>
    <section className="queue-callout"><div><h2>{s.pendingApproval ? `${s.pendingApproval} ${s.pendingApproval === 1 ? "job is" : "jobs are"} waiting for you` : "Your queue is ready when you are"}</h2><p>Check the document and print options before you approve.</p></div><Link className="btn btn-primary" href="/dashboard/jobs?status=QUEUED">Review print jobs<Icon name="arrow" size={16}/></Link></section>
    <div className="overview-bottom"><section className="panel"><div className="panel-head"><div><h2>Today’s activity</h2><p>The numbers behind your counter.</p></div><Icon name="chart" style={{ color: "var(--muted)" }}/></div><div className="panel-body"><div className="summary-row"><span className="muted">Printers reported online</span><strong>{s.printersOnline} of {s.printersTotal}</strong></div><div className="summary-row"><span className="muted">Pages reported printed today</span><strong>{s.today._sum.pagesPrinted ?? 0}</strong></div><div className="summary-row"><span className="muted">Collected sales today</span><strong>{paiseToRupees(s.paidToday)}</strong></div><div className="summary-row"><span className="muted">Recorded sales this month</span><strong>{paiseToRupees(s.month._sum.price)}</strong></div><Link href="/dashboard/reports" className="text-link" style={{ marginTop: 15 }}>Explore reports<Icon name="arrow" size={15}/></Link></div></section>
    <section className="panel"><div className="panel-head"><div><h2>From upload to pickup</h2><p>A simple workflow. You stay in control.</p></div></div><div className="panel-body">{[{ title: "A customer sends a PDF", text: "Their document and print options arrive in your queue." }, { title: "You review and approve", text: "Preview the PDF, check the options, then accept or reject." }, { title: "Follow the job’s progress", text: "The agent reports updates as the job moves through printing." }].map((step, index) => <div className="workflow-item" key={step.title}><span>{index + 1}</span><div><h3>{step.title}</h3><p>{step.text}</p></div></div>)}</div></section></div>
    <Notice>These are recorded job totals. Online status depends on stored printer data, and reported page counts may be incomplete. Payment collection is not integrated.</Notice>
  </>;
}
