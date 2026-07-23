"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";

interface Props {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Small reusable confirm modal. The parent owns `open`; both actions clear it,
 * so the auto-close on confirm (which also fires `onCancel`) is harmless as long
 * as `onCancel` only dismisses.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[420px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-2xl">
          <AlertDialog.Title className="text-base font-medium">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-slate-400">
            {description}
          </AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                onClick={onCancel}
                className="rounded border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
              >
                {cancelLabel}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                onClick={onConfirm}
                className={`rounded px-3 py-1.5 text-sm text-white ${
                  destructive
                    ? "bg-red-700 hover:bg-red-600"
                    : "bg-sky-700 hover:bg-sky-600"
                }`}
              >
                {confirmLabel}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
