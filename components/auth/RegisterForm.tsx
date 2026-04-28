"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getApiErrorMessage, getErrorMessage, logDebugError } from "@/lib/error-utils";

type RegisterFormProps = {
  initialError?: string | null;
};

export default function RegisterForm({ initialError = null }: RegisterFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, "Registration failed"));
      }

      const data = (await response.json()) as { success?: boolean; error?: string };

      if (!data.success) {
        throw new Error(data.error ?? "Unable to create account.");
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (requestError: unknown) {
      logDebugError(requestError, "RegisterForm.handleSubmit");
      setError(getErrorMessage(requestError, "Unable to create your account right now."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 flex w-full max-w-sm flex-col gap-3 rounded-3xl border border-[#e5e7eb] bg-white p-6 shadow-[var(--soft-shadow)]"
    >
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        autoComplete="email"
        className="rounded-xl border border-[#e5e7eb] bg-[#f5f7fa] px-4 py-3 text-[#1a1a1a] outline-none transition focus:border-blue-500 focus:bg-white"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="new-password"
        className="rounded-xl border border-[#e5e7eb] bg-[#f5f7fa] px-4 py-3 text-[#1a1a1a] outline-none transition focus:border-blue-500 focus:bg-white"
      />
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-xl bg-blue-600 p-3 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSubmitting ? "Creating account..." : "Register"}
      </button>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <p className="text-sm text-[#555555]">
        Already have an account?{" "}
        <Link href="/login" className="text-blue-600 hover:text-blue-700">
          Login
        </Link>
      </p>
    </form>
  );
}
