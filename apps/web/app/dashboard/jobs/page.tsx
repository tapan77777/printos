import { prisma } from "@/lib/prisma";
import { JobRow } from "./JobRow";

export const dynamic = "force-dynamic";

type Search = { status?: string };

export default async function JobsPage({ searchParams }: { searchParams: Search }) {
  const filter = searchParams.status?.toUpperCase();
  const jobs = await prisma.printJob.findMany({
    where: filter ? { printStatus: filter as never } : undefined,
    orderBy: { createdAt: "desc" },
    include: { printer: { select: { name: true } } },
    take: 200,
  });

  return (
    <main className="max-w-5xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Print Jobs</h1>
        <div className="flex gap-2 text-sm">
          {["", "QUEUED", "APPROVED", "PRINTING", "COMPLETED", "FAILED", "REJECTED"].map((s) => (
            <a
              key={s || "ALL"}
              href={s ? `?status=${s}` : "?"}
              className={`px-2 py-1 rounded border ${filter === s ? "bg-black text-white" : "bg-white"}`}
            >
              {s || "ALL"}
            </a>
          ))}
        </div>
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Job</th>
              <th className="text-left px-4 py-3 font-medium">Printer</th>
              <th className="text-left px-4 py-3 font-medium">Options</th>
              <th className="text-left px-4 py-3 font-medium">Price</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Created</th>
              <th className="text-left px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {jobs.map((j) => (
              <JobRow key={j.id} job={JSON.parse(JSON.stringify(j))} />
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No jobs.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
