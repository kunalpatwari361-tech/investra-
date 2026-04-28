import { redirect } from "next/navigation";
import { getCurrentUserFromCookies } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUserFromCookies();
  redirect(user ? "/dashboard" : "/login");
}
