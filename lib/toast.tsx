"use client";

import * as Toast from "@radix-ui/react-toast";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type ToastKind = "info" | "success" | "error";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  /** Persistent "loading…" toast; returns id so it can be dismissed on completion. */
  info(message: string): number;
  success(message: string): void;
  error(message: string): void;
  dismiss(id: number): void;
  /**
   * Run an async task with the standard start/success/failure toasts.
   * On failure shows `Failed to load: {error message}`.
   */
  run<T>(startMessage: string, task: () => Promise<T>): Promise<T>;
}

const ToastCtx = createContext<ToastApi | null>(null);

let counter = 0;

const KIND_STYLES: Record<ToastKind, string> = {
  info: "border-slate-600 bg-slate-800 text-slate-100",
  success: "border-emerald-600 bg-emerald-900/80 text-emerald-100",
  error: "border-red-600 bg-red-900/80 text-red-100",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = ++counter;
    setItems((xs) => [...xs, { id, kind, message }]);
    return id;
  }, []);

  const api = useMemo<ToastApi>(() => {
    const info = (m: string) => push("info", m);
    const success = (m: string) => {
      push("success", m);
    };
    const error = (m: string) => {
      push("error", m);
    };
    const run = async <T,>(startMessage: string, task: () => Promise<T>) => {
      const id = push("info", startMessage);
      try {
        const result = await task();
        dismiss(id);
        push("success", "Loading success");
        return result;
      } catch (err) {
        dismiss(id);
        push("error", `Failed to load: ${(err as Error).message}`);
        throw err;
      }
    };
    return { info, success, error, dismiss, run };
  }, [push, dismiss]);

  return (
    <ToastCtx.Provider value={api}>
      <Toast.Provider swipeDirection="right">
        {children}
        {items.map((t) => (
          <Toast.Root
            key={t.id}
            duration={t.kind === "info" ? 1_000_000 : 3500}
            onOpenChange={(open) => {
              if (!open) dismiss(t.id);
            }}
            className={`pointer-events-auto rounded-md border px-4 py-3 text-sm shadow-lg data-[state=closed]:animate-out data-[state=closed]:fade-out ${KIND_STYLES[t.kind]}`}
          >
            <Toast.Description>{t.message}</Toast.Description>
          </Toast.Root>
        ))}
        <Toast.Viewport className="fixed bottom-0 right-0 z-50 flex w-96 max-w-[100vw] flex-col gap-2 p-4 outline-none" />
      </Toast.Provider>
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
