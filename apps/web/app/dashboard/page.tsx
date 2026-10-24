import { getOwnerFromCookies } from "@/lib/session";
import { ownerScope } from "@/lib/tenantAccess";
import { redirect } from "next/navigation";
import { formatPrice } from "@/lib/pricing";
import Link from "next/link";
import { HEALTH_TTL_MS } from "@/lib/agentHealth";
import { Icon, type IconName } from "../components/Icon";
import { PageHeading, Notice } from "../components/ui";
import { RefreshButton } from "../components/RefreshButton";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function startOf(date: Date, kind: "day" | "week" | "month"): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  if (kind === "day") return d;
  if (kind === "week") {
    const day = d.getDay();
    const diff = (day + 6) % 7; // Monday start
    d.setDate(d.getDate() - diff);
    return d;
  }
  d.setDate(1);
  return d;
}

async function stats() {
  const owner=await getOwnerFromCookies();if(!owner)redirect("/shops");
  const scope=ownerScope(owner);
  const now = new Date();
  const [today, week, month, printersOnline, printersTotal, pendingApproval, printing] = await Promise.all([
    prisma.printJob.aggregate({
      _count: { _all: true },
      _sum: { price: true, pagesPrinted: true },
      where: { ...scope, simulation: false, printStatus: "COMPLETED", completedAt: { gte: startOf(now, "day") } },
    }),
    prisma.printJob.aggregate({
      _count: { _all: true },
      _sum: { price: true, pagesPrinted: true },
      where: { ...scope, simulation: false, printStatus: "COMPLETED", completedAt: { gte: startOf(now, "week") } },
    }),
    prisma.printJob.aggregate({
      _count: { _all: true },
      _sum: { price: true, pagesPrinted: true },
      where: { ...scope, simulation: false, printStatus: "COMPLETED", completedAt: { gte: startOf(now, "month") } },
    }),
    prisma.printer.count({ where: { ...scope, simulationOnly: false, status: "ONLINE", lastHeartbeat: { gte: new Date(Date.now() - HEALTH_TTL_MS), lte: new Date() } } }),
    prisma.printer.count({ where: { ...scope, simulationOnly: false } }),
    prisma.printJob.count({ where: { ...scope, simulation: false, printStatus: "QUEUED" } }),
    prisma.printJob.count({ where: { ...scope, simulation: false, printStatus: { in: ["APPROVED", "DOWNLOADING", "PRINTING"] } } }),
  ]);

  const paid = await prisma.printJob.aggregate({
    _sum: { price: true },
    where: { ...scope, simulation: false, printStatus: "COMPLETED", paymentStatus: "PAID", completedAt: { gte: startOf(now, "day") } },
  });

  return {
    today,
    week,
    month,
    paidToday: paid._sum.price ?? 0,
    printersOnline,
    printersTotal,
    pendingApproval,
    printing,
  };
}

function paiseToRupees(paise: number | null | undefined): string {
  return formatPrice(paise ?? 0);
}

export default async function Dashboard() {
  const s = await stats();

  const cards: { label: string; value: string; caption: string; icon: IconName; featured?: boolean }[] = [
    { label: "Awaiting approval", value: String(s.pendingApproval), caption: "Ready for your review", icon: "jobs", featured: true },
    { label: "In progress", value: String(s.printing), caption: "Approved, sending or printing", icon: "printer" },
    { label: "Completed today", value: String(s.today._count._all ?? 0), caption: "Jobs marked completed", icon: "check" },
    { label: "Recorded sales today", value: paiseToRupees(s.today._sum.price), caption: "Value of completed jobs", icon: "chart" },
  ];
  return <>
    <PageHeading eyebrow="YOUR WORKSPACE, AT A GLANCE" title="A clear view of your day." description="Review the queue, follow your jobs and keep the counter moving."><RefreshButton/></PageHeading>
    <section className="queue-callout"><div><h2>Set up your shop</h2><p>Register a printer, install and pair the Windows app, publish rates, then generate your customer QR in the app.</p><p><Link href="/dashboard/devices">Devices &amp; printers</Link> · <Link href="/dashboard/pricing">Set rates</Link> · <Link href="/#windows-app">Download &amp; installation</Link></p></div></section>
    <div className="metric-grid">{cards.map((c) => <section key={c.label} className={`panel metric ${c.featured ? "metric-featured" : ""}`}><div className="metric-top"><span>{c.label}</span><span className="metric-icon"><Icon name={c.icon} size={17}/></span></div><p className="metric-value">{c.value}</p><p className="metric-caption">{c.caption}</p></section>)}</div>
    <section className="queue-callout"><div><h2>{s.pendingApproval ? `${s.pendingApproval} ${s.pendingApproval === 1 ? "job is" : "jobs are"} waiting for you` : "Your queue is ready when you are"}</h2><p>Check the document and print options before you approve.</p></div><Link className="btn btn-primary" href="/dashboard/jobs?status=QUEUED">Review print jobs<Icon name="arrow" size={16}/></Link></section>
    <div className="overview-bottom"><section className="panel"><div className="panel-head"><div><h2>Today’s activity</h2><p>The numbers behind your counter.</p></div><Icon name="chart" style={{ color: "var(--muted)" }}/></div><div className="panel-body"><div className="summary-row"><span className="muted">Printers reported online</span><strong>{s.printersOnline} of {s.printersTotal}</strong></div><div className="summary-row"><span className="muted">Pages reported printed today</span><strong>{s.today._sum.pagesPrinted ?? 0}</strong></div><div className="summary-row"><span className="muted">Collected sales today</span><strong>{paiseToRupees(s.paidToday)}</strong></div><div className="summary-row"><span className="muted">Recorded sales this month</span><strong>{paiseToRupees(s.month._sum.price)}</strong></div><Link href="/dashboard/reports" className="text-link" style={{ marginTop: 15 }}>Explore reports<Icon name="arrow" size={15}/></Link></div></section>
    <section className="panel"><div className="panel-head"><div><h2>From upload to pickup</h2><p>A simple workflow. You stay in control.</p></div></div><div className="panel-body">{[{ title: "A customer sends a PDF", text: "Their document and print options arrive in your queue." }, { title: "You review and approve", text: "Preview the PDF, check the options, then accept or reject." }, { title: "Follow the job’s progress", text: "The agent reports updates as the job moves through printing." }].map((step, index) => <div className="workflow-item" key={step.title}><span>{index + 1}</span><div><h3>{step.title}</h3><p>{step.text}</p></div></div>)}</div></section></div>
    <Notice>These are recorded job totals. Online status depends on stored printer data, and reported page counts may be incomplete. Payment collection is not integrated.</Notice>
  </>;
}
