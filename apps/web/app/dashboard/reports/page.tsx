import { getOwnerFromCookies } from "@/lib/session";
import { ownerScope } from "@/lib/tenantAccess";
import { redirect } from "next/navigation";
import { formatPrice } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { PageHeading, Notice } from "../../components/ui";
import { RefreshButton } from "../../components/RefreshButton";
import { Icon } from "../../components/Icon";

export const dynamic = "force-dynamic";

function startOf(d: Date, k: "day" | "week" | "month"): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  if (k === "day") return x;
  if (k === "week") {
    const day = x.getDay();
    const diff = (day + 6) % 7;
    x.setDate(x.getDate() - diff);
    return x;
  }
  x.setDate(1);
  return x;
}

async function windowStats(from: Date, scope:{shopId:string|null}) {
  const [all, paid, failed, rejected] = await Promise.all([
    prisma.printJob.aggregate({
      _count: { _all: true },
      _sum: { price: true, pagesPrinted: true },
      where: { ...scope, simulation: false, printStatus: "COMPLETED", completedAt: { gte: from } },
    }),
    prisma.printJob.aggregate({
      _sum: { price: true },
      where: { ...scope, simulation: false, printStatus: "COMPLETED", paymentStatus: "PAID", completedAt: { gte: from } },
    }),
    prisma.printJob.count({ where: { ...scope, simulation: false, printStatus: "FAILED", failedAt: { gte: from } } }),
    prisma.printJob.count({ where: { ...scope, simulation: false, printStatus: "REJECTED", rejectedAt: { gte: from } } }),
  ]);
  return {
    completed: all._count._all ?? 0,
    pages: all._sum.pagesPrinted ?? 0,
    recorded: all._sum.price ?? 0,
    collected: paid._sum.price ?? 0,
    failed,
    rejected,
  };
}

function rupees(paise: number): string {
  return formatPrice(paise ?? 0);
}

export default async function ReportsPage() {
  const owner=await getOwnerFromCookies();if(!owner)redirect("/shops");
  const scope=ownerScope(owner);
  const now = new Date();
  const [day, week, month] = await Promise.all([
    windowStats(startOf(now, "day"),scope),
    windowStats(startOf(now, "week"),scope),
    windowStats(startOf(now, "month"),scope),
  ]);

  const rows = [
    { label: "Today", s: day },
    { label: "This week", s: week },
    { label: "This month", s: month },
  ];

  return <>
    <PageHeading eyebrow="A LITTLE BUSINESS CLARITY" title="Reports" description="A straightforward look at recorded activity across your print jobs."><RefreshButton/></PageHeading>
    <div className="report-cards">{rows.map(({ label, s }) => <section className="panel report-card" key={label}><h2>{label}</h2><div className="report-amount">{rupees(s.recorded)}</div><p>Recorded value of completed jobs</p><div className="report-card-footer"><span><strong>{s.completed}</strong> completed</span><span><strong>{s.pages}</strong> pages reported</span></div></section>)}</div>
    <section className="panel"><div className="panel-head"><div><h2>Activity breakdown</h2><p>Completed jobs, recorded value and exceptions.</p></div><Icon name="chart" style={{ color: "var(--muted)" }}/></div><div className="table-scroll reports-scroll" tabIndex={0} role="region" aria-label="Report table, scroll horizontally on small screens"><table className="data-table reports-table"><caption className="sr-only">Print activity for today, this week and this month</caption><thead><tr>{["Period", "Completed", "Reported pages", "Recorded sales", "Collected sales", "Failed", "Rejected"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(({ label, s }) => <tr key={label}><td><strong>{label}</strong></td><td>{s.completed}</td><td>{s.pages}</td><td className="job-price">{rupees(s.recorded)}</td><td>{rupees(s.collected)}</td><td>{s.failed}</td><td>{s.rejected}</td></tr>)}</tbody></table></div></section>
    <div className="reports-notes"><section className="panel panel-body"><h3>Recorded vs. collected</h3><p>Recorded sales sum the stored price of completed jobs. Collected sales include only completed jobs marked paid. Payment collection is not integrated, so these values do not represent a cash ledger.</p></section><section className="panel panel-body"><h3>About these numbers</h3><p>Periods follow the server’s timezone. Page totals include only counts reported by the agent and may be incomplete. Use Refresh for the latest recorded data.</p></section></div>
    <div style={{ marginTop: 20 }}><Notice>No payment gateway is connected. These reports summarize job records; they are not payment or accounting statements.</Notice></div>
  </>;
}
