"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AppView = "dashboard" | "portfolio" | "market" | "assistant" | "settings";

type PlatformState = {
  activeView: AppView;
  setActiveView: (view: AppView) => void;
};

export const usePlatformStore = create<PlatformState>()(
  persist(
    (set) => ({
      activeView: "dashboard",
      setActiveView: (view) => set({ activeView: view })
    }),
    {
      name: "atlas-platform-ui"
    }
  )
);
