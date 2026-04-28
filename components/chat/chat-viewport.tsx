"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageBubble } from "@/components/chat/message-bubble";
import { useChatStore } from "@/store/chat-store";

export function ChatViewport() {
  const messages = useChatStore((state) => state.messages);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = listRef.current;
    if (!viewport) return;
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: "smooth"
    });
  }, [messages]);

  return (
    <div
      ref={listRef}
      className="h-[calc(100vh-13rem)] space-y-5 overflow-y-auto px-1 py-6 pb-24 scroll-smooth sm:px-3"
    >
      <AnimatePresence initial={false}>
        {messages.map((message) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
          >
            <MessageBubble message={message} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
