import { redirect } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import { getCurrentUserFromCookies } from "@/lib/auth";

const errorMessages: Record<string, string> = {
  "session-expired": "Your session expired. Log in again.",
  unauthorized: "Log in to access the dashboard."
};

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getCurrentUserFromCookies();

  if (user) {
    redirect("/dashboard");
  }

  const params = (await searchParams) ?? {};
  const error = params.error ? errorMessages[params.error] ?? "Unable to login." : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 text-[#1a1a1a]">
      <div className="flex w-full max-w-md flex-col items-center justify-center">
        <h1 className="text-3xl font-bold tracking-[-0.04em]">Login</h1>
        <p className="mt-3 text-center text-sm text-[#555555]">
          Use your account to open the live market dashboard.
        </p>
        <LoginForm initialError={error} />
      </div>
    </main>
  );
}
