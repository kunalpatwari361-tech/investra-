"use client";

import { create } from "zustand";

type Toast = {
  id: string;
  title: string;
  description: string;
};

type ToastState = {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
};

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = crypto.randomUUID();
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }]
    }));

    window.setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((entry) => entry.id !== id)
      }));
    }, 2400);
  }
}));
