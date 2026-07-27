"use client";

import type { ReactNode } from "react";
import { toast as sonner } from "sonner";
import { Toaster } from "@/components/ui/sonner";

/** Sonner toast id (string or number). */
type ToastId = string | number;

interface ToastApi {
  /** Persistent "loading…" toast; returns id so it can be dismissed on completion. */
  info(message: string): ToastId;
  success(message: string): void;
  error(message: string): void;
  dismiss(id: ToastId): void;
  /**
   * Run an async task with the standard start/success/failure toasts.
   * On failure shows `Failed to load: {error message}`.
   */
  run<T>(startMessage: string, task: () => Promise<T>): Promise<T>;
}

const api: ToastApi = {
  info: (message) => sonner.loading(message),
  success: (message) => {
    sonner.success(message);
  },
  error: (message) => {
    sonner.error(message);
  },
  dismiss: (id) => sonner.dismiss(id),
  run: async (startMessage, task) => {
    const id = sonner.loading(startMessage);
    try {
      const result = await task();
      sonner.dismiss(id);
      sonner.success("Loading success");
      return result;
    } catch (err) {
      sonner.dismiss(id);
      sonner.error(`Failed to load: ${(err as Error).message}`);
      throw err;
    }
  },
};

/**
 * Renders the Sonner toaster alongside the app. Kept as a provider component so
 * callers (and `app/page.tsx`) don't need to change their composition.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster richColors position="top-center" />
    </>
  );
}

export function useToast(): ToastApi {
  return api;
}
