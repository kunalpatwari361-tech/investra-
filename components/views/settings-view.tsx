"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import type { AppUserProfile } from "@/lib/user-store";

export function SettingsView({ user }: { user: AppUserProfile }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [refreshInterval, setRefreshInterval] = useState("5");

  useEffect(() => {
    const saved = window.localStorage.getItem("atlas-refresh-interval");
    if (saved) {
      setRefreshInterval(saved);
    }
  }, []);

  function saveRefreshInterval(value: string) {
    setRefreshInterval(value);
    window.localStorage.setItem("atlas-refresh-interval", value);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted)]">Settings</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">
          Preferences and configuration
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Secrets stay server-side. This page only controls local UI preferences.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-[var(--panel-border)] bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">Account</h3>
          <p className="mt-3 text-sm text-[var(--muted)]">Signed in as</p>
          <p className="mt-1 font-medium">{user.email}</p>
        </section>

        <section className="rounded-3xl border border-[var(--panel-border)] bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">Theme</h3>
          <div className="mt-4 flex gap-2">
            {["light", "dark", "system"].map((theme) => (
              <button
                key={theme}
                type="button"
                onClick={() => setTheme(theme)}
                className={
                  resolvedTheme === theme
                    ? "rounded-full bg-[#2563eb] px-4 py-2 text-sm font-medium text-white"
                    : "rounded-full border border-[var(--panel-border)] px-4 py-2 text-sm font-medium text-[var(--muted)]"
                }
              >
                {theme}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-[var(--panel-border)] bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">Data refresh</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Market and portfolio panels refresh every few seconds.
          </p>
          <select
            value={refreshInterval}
            onChange={(event) => saveRefreshInterval(event.target.value)}
            className="mt-4 w-full rounded-2xl border border-[var(--panel-border)] bg-transparent px-4 py-3 text-sm outline-none"
          >
            <option value="3">3 seconds</option>
            <option value="5">5 seconds</option>
            <option value="10">10 seconds</option>
          </select>
        </section>

        <section className="rounded-3xl border border-[var(--panel-border)] bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">API configuration</h3>
          <div className="mt-4 space-y-2 text-sm text-[var(--muted)]">
            <p>NSE API: server-side only</p>
            <p>Yahoo Finance: fallback and chart data</p>
            <p>MFAPI: mutual fund data</p>
            <p>Broker API: not enabled</p>
          </div>
        </section>
      </div>
    </div>
  );
}
