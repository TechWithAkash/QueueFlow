"use client";

import { clsx } from "clsx";
import { forwardRef, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "amber";
type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-teal text-white hover:bg-teal-strong dark:text-[#06201b]",
  secondary: "bg-surface text-ink border border-line hover:border-ink-faint",
  ghost: "text-ink-soft hover:text-ink hover:bg-sunken",
  danger: "bg-surface text-red border border-line hover:border-red hover:bg-red-wash",
  amber: "bg-amber text-[#2a1d00] hover:brightness-95",
};
const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-sm gap-1.5 rounded-md",
  md: "h-10 px-4 text-sm gap-2 rounded-lg",
  lg: "h-12 px-5 text-base gap-2 rounded-lg",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, className, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx("inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
    />
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={clsx(
        "h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-faint",
        "focus:border-teal focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-teal/25",
        "aria-[invalid=true]:border-red",
        className,
      )}
      {...props}
    />
  );
});

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-red" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

/** Native <dialog> modal: focus trap, Esc and backdrop close for free. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={clsx(
        "m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl",
        className,
      )}
    >
      {open ? (
        <div className="p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
              {description ? <p className="mt-1 text-sm text-ink-soft">{description}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-m-1 rounded-md p-1 text-ink-faint hover:bg-sunken hover:text-ink"
            >
              <X className="size-5" />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}

/** A token code printed on a ticket stub. */
export function TokenCode({
  code,
  size = "md",
  tone = "paper",
  className,
}: {
  code: string;
  size?: "sm" | "md" | "lg" | "xl";
  tone?: "paper" | "amber" | "teal" | "muted";
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "ticket font-wide tabular inline-flex items-center justify-center font-bold tracking-tight",
        {
          sm: "h-7 min-w-14 px-3 text-sm",
          md: "h-9 min-w-[4.5rem] px-4 text-base",
          lg: "h-14 min-w-28 px-6 text-3xl",
          xl: "h-24 min-w-44 px-8 text-6xl",
        }[size],
        {
          paper: "bg-sunken text-ink",
          amber: "bg-amber text-[#2a1d00]",
          teal: "bg-teal text-white dark:text-[#06201b]",
          muted: "bg-sunken text-ink-faint line-through decoration-2",
        }[tone],
        className,
      )}
    >
      {code}
    </span>
  );
}

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "neutral" | "teal" | "amber" | "red" | "green";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        {
          neutral: "bg-sunken text-ink-soft",
          teal: "bg-teal-wash text-teal-strong",
          amber: "bg-amber-wash text-amber-ink",
          red: "bg-red-wash text-red",
          green: "bg-teal-wash text-green",
        }[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon ? <div className="mb-3 text-ink-faint">{icon}</div> : null}
      <p className="font-medium text-ink">{title}</p>
      {children ? <div className="mt-1 max-w-sm text-sm text-ink-soft">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function LiveDot({ status }: { status: "connecting" | "live" | "offline" }) {
  const label = { connecting: "Connecting", live: "Live", offline: "Offline, retrying" }[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft" title={label}>
      <span
        className={clsx("size-2 rounded-full", {
          "bg-green animate-pulse": status === "live",
          "bg-amber": status === "connecting",
          "bg-red": status === "offline",
        })}
      />
      {label}
    </span>
  );
}
