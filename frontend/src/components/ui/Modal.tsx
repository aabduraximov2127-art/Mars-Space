import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

import { Button } from "./Button";
import { Field, Textarea } from "./form";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = panel.current;
    const first = node?.querySelector<HTMLElement>("[data-autofocus]") ?? node?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && node) {
        const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (!items.length) return;
        const [a, z] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          z.focus();
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const widths = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" };
  return createPortal(
    <div className="fixed inset-0 z-60 flex items-end justify-center sm:items-center sm:p-4">
      <div className="animate-fade-in absolute inset-0 bg-ink-900/40" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "animate-fade-in relative flex max-h-[92vh] w-full flex-col rounded-t-xl bg-surface shadow-pop sm:rounded-xl",
          widths[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-ink-900">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-[13px] text-ink-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Yopish"
            className="-mr-1 rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Tasdiqlash",
  tone = "danger",
  loading,
  reason,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
  /** Ask for a mandatory reason (void payment, cancel lesson...). */
  reason?: { label: string; placeholder?: string };
}) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (open) setText("");
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Bekor qilish
          </Button>
          <Button
            variant={tone}
            loading={loading}
            disabled={Boolean(reason) && !text.trim()}
            onClick={() => onConfirm(text.trim())}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && <div className="text-ink-600">{description}</div>}
      {reason && (
        <Field label={reason.label} required className="mt-4">
          {(p) => (
            <Textarea {...p} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={reason.placeholder} data-autofocus />
          )}
        </Field>
      )}
    </Modal>
  );
}
