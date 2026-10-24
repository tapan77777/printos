import { OwnerShell } from "../components/OwnerShell";
import {getOwnerFromCookies} from "@/lib/session";
import {redirect} from "next/navigation";
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if(!await getOwnerFromCookies())redirect("/shops");
  return <OwnerShell>{children}</OwnerShell>;
}
