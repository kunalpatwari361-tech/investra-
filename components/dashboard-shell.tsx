"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AppFooter } from "@/components/app-footer";
import { AppHeader } from "@/components/app-header";
import { AssistantView } from "@/components/views/assistant-view";
import { DashboardView } from "@/components/views/dashboard-view";
import { MarketView } from "@/components/views/market-view";
import { PortfolioView } from "@/components/views/portfolio-view";
import { SettingsView } from "@/components/views/settings-view";
import { usePlatformStore } from "@/store/platform-store";
import type { AppUserProfile } from "@/lib/user-store";

export function DashboardShell({ user }: { user: AppUserProfile }) {
  const activeView = usePlatformStore((state) => state.activeView);
  const views = {
    dashboard: <DashboardView />,
    portfolio: <PortfolioView />,
    market: <MarketView />,
    assistant: <AssistantView />,
    settings: <SettingsView user={user} />
  };

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-white text-[var(--foreground)]">
      <div className="relative mx-auto flex min-h-screen w-full max-w-screen-2xl flex-col">
        <AppHeader user={user} />
        <section className="flex-1 px-4 pb-28 pt-4 sm:px-6 lg:px-8">
          <div className="rounded-[32px] border border-[var(--panel-border)] bg-[#f5f7fa] p-4 shadow-[var(--soft-shadow)]">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeView}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ duration: 0.22 }}
              >
                {views[activeView]}
              </motion.div>
            </AnimatePresence>
          </div>
        </section>
        <AppFooter />
      </div>
    </main>
  );
}
