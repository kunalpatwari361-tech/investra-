"use client";

import {
  BarChart3,
  Bot,
  BriefcaseBusiness,
  LayoutDashboard,
  LogOut,
  Settings2,
  Sparkles
} from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getApiErrorMessage, logDebugError } from "@/lib/error-utils";
import { usePlatformStore, type AppView } from "@/store/platform-store";
import { cn } from "@/lib/utils";
import type { AppUserProfile } from "@/lib/user-store";

const navigation: Array<{ id: AppView; label: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "portfolio", label: "Portfolio", icon: BriefcaseBusiness },
  { id: "market", label: "Market", icon: BarChart3 },
  { id: "assistant", label: "AI Assistant", icon: Bot },
  { id: "settings", label: "Settings", icon: Settings2 }
];

export function AppHeader({ user }: { user: AppUserProfile }) {
  const router = useRouter();
  const activeView = usePlatformStore((state) => state.activeView);
  const setActiveView = usePlatformStore((state) => state.setActiveView);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, "Logout failed"));
      }
    } catch (error: unknown) {
      logDebugError(error, "AppHeader.handleLogout");
    } finally {
      router.replace("/login");
      router.refresh();
      setLoggingOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--panel-border)] bg-white">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setActiveView("dashboard")}
            className="flex min-w-0 items-center gap-3"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#2563eb] text-white shadow-sm">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0 text-left">
              <p className="text-[0.7rem] uppercase tracking-[0.22em] text-[var(--muted)]">
                Fintech AI
              </p>
              <h1 className="truncate text-base font-semibold tracking-[-0.04em]">
                Atlas Wealth
              </h1>
            </div>
          </button>

          <div className="flex items-center justify-end gap-2">
            <div className="hidden max-w-[12rem] truncate rounded-full border border-[var(--panel-border)] bg-[#f5f7fa] px-3 py-2 text-xs text-[var(--muted)] sm:block">
              {user.email}
            </div>

            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--panel-border)] bg-[#f5f7fa] px-4 text-sm font-medium text-[var(--muted)] transition hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{loggingOut ? "Logging out..." : "Logout"}</span>
            </button>
          </div>
        </div>

        <nav className="flex gap-2 overflow-x-auto pb-1">
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
                  activeView === item.id
                    ? "border-transparent bg-[#2563eb] text-white shadow-sm"
                    : "border-[var(--panel-border)] bg-white text-[var(--muted)] hover:text-[var(--foreground)]"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
