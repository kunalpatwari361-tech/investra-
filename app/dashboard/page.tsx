import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { getCurrentUserFromCookies } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUserFromCookies();

  if (!user) {
    redirect("/login?error=unauthorized");
  }

  return <DashboardShell user={user} />;
}
