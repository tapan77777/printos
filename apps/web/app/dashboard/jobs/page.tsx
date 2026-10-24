import { getOwnerFromCookies } from "@/lib/session";
import { ownerScope } from "@/lib/tenantAccess";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { JobRow } from "./JobRow";
import { PageHeading, EmptyState, statusLabels } from "../../components/ui";
import { RefreshButton } from "../../components/RefreshButton";
import { Icon } from "../../components/Icon";

export const dynamic = "force-dynamic";

type Search = { status?: string };

export default async function JobsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const owner=await getOwnerFromCookies();if(!owner)redirect("/shops");
  const scope=ownerScope(owner);
  const query=await searchParams;
  const filter = query.status?.toUpperCase();
  const jobs = await prisma.printJob.findMany({
    where: { ...scope, ...(filter ? {printStatus:filter as never} : {}) },
    orderBy: { createdAt: "desc" },
    include: { printer: { select: { name: true, simulationOnly: true } } },
    take: 200,
  });

  return <>
    <PageHeading eyebrow="THE PRINT COUNTER" title="Print jobs" description="Every document, every detail. Review requests and follow their progress."><RefreshButton/></PageHeading>
    <section className="panel" aria-label="Print queue">
      <div className="jobs-toolbar"><nav className="filter-tabs" aria-label="Filter jobs by status">{["", "QUEUED", "APPROVED", "DOWNLOADING", "PRINTING", "COMPLETED", "FAILED", "REJECTED", "RECONCILIATION_REQUIRED"].map((status) => <a key={status || "all"} href={status ? `?status=${status}` : "?"} className="filter-tab" aria-current={(filter ?? "") === status ? "page" : undefined}>{status ? statusLabels[status] : "All jobs"}</a>)}</nav><span className="job-count">{jobs.length} {jobs.length === 1 ? "job" : "jobs"} shown · newest first</span></div>
      {jobs.length === 0 ? <EmptyState title={filter ? "No jobs in this view" : "A fresh start"}>{filter ? "Try another status to see more of your queue." : "When customers submit documents from your printer QR link, their requests will appear here."}</EmptyState> : <div className="table-scroll"><table className="data-table jobs-table"><caption className="sr-only">Print jobs and owner review actions</caption><thead><tr>{["Job", "Printer", "Document", "Price", "Status", "Created", "Actions"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{jobs.map((job) => <JobRow key={job.id} canResolve={owner.role==="owner"} job={JSON.parse(JSON.stringify(job))}/>)}</tbody></table></div>}
    </section>
    <p className="jobs-footnote"><Icon name="clock"/>Showing up to 200 jobs. Use Refresh to see new requests and updated print status. Approving a job makes it available to the printing agent.</p>
  </>;
}
