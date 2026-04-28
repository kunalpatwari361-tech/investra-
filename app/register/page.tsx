import { redirect } from "next/navigation";
import RegisterForm from "@/components/auth/RegisterForm";
import { getCurrentUserFromCookies } from "@/lib/auth";

type RegisterPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const user = await getCurrentUserFromCookies();

  if (user) {
    redirect("/dashboard");
  }

  const params = (await searchParams) ?? {};
  const error = params.error ? "Unable to create your account." : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 text-[#1a1a1a]">
      <div className="flex w-full max-w-md flex-col items-center justify-center">
        <h1 className="text-3xl font-bold tracking-[-0.04em]">Register</h1>
        <p className="mt-3 text-center text-sm text-[#555555]">
          Create an account for live market data and AI tools.
        </p>
        <RegisterForm initialError={error} />
      </div>
    </main>
  );
}
