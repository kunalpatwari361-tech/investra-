"use client";

import { motion } from "framer-motion";

export function EmptyState() {
  return (
    <div className="flex h-[calc(100vh-13rem)] items-center justify-center px-4 pb-24">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="max-w-xl text-center"
      >
        <h2 className="text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
          Ask anything about markets or finance.
        </h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)] sm:text-base">
          You will get a short, plain-language answer in this chat.
        </p>
      </motion.div>
    </div>
  );
}
