import { prisma } from "@/lib/prisma";

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

async function windowStats(from: Date) {
  const [all, paid, failed, rejected] = await Promise.all([
    prisma.printJob.aggregate({
      _count: { _all: true },
      _sum: { price: true, pagesPrinted: true },
      where: { printStatus: "COMPLETED", completedAt: { gte: from } },
    }),
    prisma.printJob.aggregate({
      _sum: { price: true },
      where: { printStatus: "COMPLETED", paymentStatus: "PAID", completedAt: { gte: from } },
    }),
    prisma.printJob.count({ where: { printStatus: "FAILED", failedAt: { gte: from } } }),
    prisma.printJob.count({ where: { printStatus: "REJECTED", rejectedAt: { gte: from } } }),
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
  return `₹${(paise / 100).toFixed(2)}`;
}

export default async function ReportsPage() {
  const now = new Date();
  const [day, week, month] = await Promise.all([
    windowStats(startOf(now, "day")),
    windowStats(startOf(now, "week")),
    windowStats(startOf(now, "month")),
  ]);

  const rows = [
    { label: "Today", s: day },
    { label: "This week", s: week },
    { label: "This month", s: month },
  ];

  return (
    <main className="max-w-5xl mx-auto p-8">
      <h1 className="text-xl font-semibold mb-6">Reports</h1>
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Window</th>
              <th className="text-left px-4 py-3 font-medium">Completed</th>
              <th className="text-left px-4 py-3 font-medium">Pages</th>
              <th className="text-left px-4 py-3 font-medium">Sales (recorded)</th>
              <th className="text-left px-4 py-3 font-medium">Sales (collected)</th>
              <th className="text-left px-4 py-3 font-medium">Failed</th>
              <th className="text-left px-4 py-3 font-medium">Rejected</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(({ label, s }) => (
              <tr key={label}>
                <td className="px-4 py-3 font-medium">{label}</td>
                <td className="px-4 py-3">{s.completed}</td>
                <td className="px-4 py-3">{s.pages}</td>
                <td className="px-4 py-3">{rupees(s.recorded)}</td>
                <td className="px-4 py-3">{rupees(s.collected)}</td>
                <td className="px-4 py-3">{s.failed}</td>
                <td className="px-4 py-3">{s.rejected}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500 mt-3">
        "Recorded" counts completed jobs' <code>price</code>. "Collected" counts jobs whose
        <code> paymentStatus=PAID</code>. Pending or failed jobs are excluded from revenue.
      </p>
    </main>
  );
}
