"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { getApiErrorMessage, getErrorMessage, logDebugError } from "@/lib/error-utils";

type AppAuthPanelProps = {
  initialError?: string | null;
};

export function AppAuthPanel({ initialError }: AppAuthPanelProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError ?? "");
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password
        })
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, "Login failed"));
      }

      const payload = (await response.json()) as { success?: boolean; error?: string };

      if (!payload.success) {
        throw new Error(payload.error ?? "Invalid email or password.");
      }

      startTransition(() => {
        router.replace("/dashboard");
        router.refresh();
      });
    } catch (requestError: unknown) {
      logDebugError(requestError, "AppAuthPanel.handleSubmit");
      setError(getErrorMessage(requestError, "Unable to reach the server."));
    }
  }

  return (
    <section
      suppressHydrationWarning
      className="rounded-[32px] border border-[#e5e7eb] bg-white p-8 shadow-[var(--soft-shadow)]"
    >
      <p className="text-sm uppercase tracking-[0.22em] text-[#555555]">
        Account Login
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
        Access the dashboard
      </h2>
      <p className="mt-3 text-sm leading-6 text-[#555555]">
        Sign in with your account to access the protected dashboard.
      </p>

      {error ? (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <form suppressHydrationWarning onSubmit={handleSubmit} className="mt-8 space-y-4">
        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm font-medium text-[#1a1a1a]">
            <UserRound className="h-4 w-4" />
            Email
          </span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            className="w-full rounded-2xl border border-[#e5e7eb] bg-[#f5f7fa] px-4 py-3 text-sm text-[#1a1a1a] outline-none transition focus:border-blue-500 focus:bg-white"
            placeholder="you@example.com"
            required
          />
        </label>

        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm font-medium text-[#1a1a1a]">
            <LockKeyhole className="h-4 w-4" />
            Password
          </span>
          <input
            suppressHydrationWarning
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            className="w-full rounded-2xl border border-[#e5e7eb] bg-[#f5f7fa] px-4 py-3 text-sm text-[#1a1a1a] outline-none transition focus:border-blue-500 focus:bg-white"
            placeholder="admin"
            required
          />
        </label>

        <button
          suppressHydrationWarning
          type="submit"
          disabled={isPending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(37,99,235,0.24)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending ? "Signing in..." : "Login"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm leading-6 text-emerald-800">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Sessions are stored in an HTTP-only cookie. External market APIs stay on the backend.
        </p>
      </div>

      <p className="mt-6 text-sm text-[#555555]">
        Need an account?{" "}
        <Link href="/register" className="font-medium text-blue-600 hover:text-blue-700">
          Register
        </Link>
      </p>
    </section>
  );
}
