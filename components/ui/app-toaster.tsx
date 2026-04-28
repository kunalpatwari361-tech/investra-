"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useToastStore } from "@/store/toast-store";

export function AppToaster() {
  const toasts = useToastStore((state) => state.toasts);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div className="w-full max-w-md space-y-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              className="pointer-events-auto rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-4 shadow-[var(--soft-shadow)] backdrop-blur-xl"
            >
              <p className="text-sm font-semibold">{toast.title}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">{toast.description}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
