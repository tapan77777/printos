import Link from "next/link";
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
  const now = new Date();
  const [today, week, month, printersOnline, printersTotal, pendingApproval, printing] = await Promise.all([
    prisma.printJob.aggregate({
      _count: { _all: true },
      _sum: { price: true, pagesPrinted: true },
      where: { printStatus: "COMPLETED", completedAt: { gte: startOf(now, "day") } },
    }),
    prisma.printJob.aggregate({
      _count: { _all: true },
      _sum: { price: true, pagesPrinted: true },
      where: { printStatus: "COMPLETED", completedAt: { gte: startOf(now, "week") } },
    }),
    prisma.printJob.aggregate({
      _count: { _all: true },
      _sum: { price: true, pagesPrinted: true },
      where: { printStatus: "COMPLETED", completedAt: { gte: startOf(now, "month") } },
    }),
    prisma.printer.count({ where: { status: "ONLINE" } }),
    prisma.printer.count(),
    prisma.printJob.count({ where: { printStatus: "QUEUED" } }),
    prisma.printJob.count({ where: { printStatus: { in: ["APPROVED", "DOWNLOADING", "PRINTING"] } } }),
  ]);

  const paid = await prisma.printJob.aggregate({
    _sum: { price: true },
    where: { printStatus: "COMPLETED", paymentStatus: "PAID", completedAt: { gte: startOf(now, "day") } },
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
  return `₹${((paise ?? 0) / 100).toFixed(2)}`;
}

export default async function Dashboard() {
  const s = await stats();

  const cards = [
    { label: "Printers Online", value: `${s.printersOnline} / ${s.printersTotal}` },
    { label: "Pending Approval", value: s.pendingApproval.toString() },
    { label: "In Progress", value: s.printing.toString() },
    { label: "Completed Today", value: (s.today._count._all ?? 0).toString() },
    { label: "Pages Today", value: (s.today._sum.pagesPrinted ?? 0).toString() },
    { label: "Sales Today (recorded)", value: paiseToRupees(s.today._sum.price) },
    { label: "Sales Today (collected)", value: paiseToRupees(s.paidToday) },
    { label: "Sales This Month", value: paiseToRupees(s.month._sum.price) },
  ];

  return (
    <main className="max-w-5xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">PrintOS Admin</h1>
        <form action="/api/auth/logout" method="post">
          <button className="text-sm text-gray-600 underline">Sign out</button>
        </form>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="border border-gray-200 rounded-xl p-4">
            <div className="text-sm text-gray-500">{c.label}</div>
            <div className="text-2xl font-semibold mt-1">{c.value}</div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-500 mt-3">
        "Recorded" is the sum of `PrintJob.price` for COMPLETED jobs. "Collected" is COMPLETED + PAID.
        A payment gateway is not integrated yet; in dev mode all jobs are created with
        <code> paymentStatus=NOT_REQUIRED</code>.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/dashboard/jobs" className="border border-gray-200 rounded-xl px-4 py-2 text-sm hover:bg-gray-50">
          View Jobs →
        </Link>
        <Link href="/dashboard/reports" className="border border-gray-200 rounded-xl px-4 py-2 text-sm hover:bg-gray-50">
          Reports →
        </Link>
      </div>
    </main>
  );
}
