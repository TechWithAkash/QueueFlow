"use client";

import { clsx } from "clsx";
import { BarChart3, ListOrdered, LogOut, RotateCcw } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { Session } from "@/lib/auth";
import { api } from "@/lib/client";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { Button, Dialog } from "./ui";

const nav = [
  { href: "/queues", label: "Queues", icon: ListOrdered },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
];

export function AppShell({ session, children }: { session: Session; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  async function reset() {
    setResetting(true);
    try {
      await api("/api/demo/reset", { method: "POST" });
      toast.success("Demo clinic restored");
      setConfirmReset(false);
      router.push("/queues");
      router.refresh();
      window.dispatchEvent(new Event("qf:refresh"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur lg:h-dvh lg:flex-col lg:items-stretch lg:gap-0 lg:border-r lg:border-b-0 lg:px-4 lg:py-6">
        <Logo href="/queues" className="lg:mb-8 lg:px-2" />
        <nav className="ml-auto flex gap-1 lg:ml-0 lg:flex-col" aria-label="Main">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium",
                  active ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-ink-soft hover:text-ink",
                )}
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-1 lg:mt-auto lg:flex-col lg:items-stretch lg:gap-2">
          {session.isDemo ? (
            <div className="hidden rounded-lg bg-amber-wash p-3 text-sm text-amber-ink lg:block">
              <p className="font-medium">You&apos;re in the demo clinic</p>
              <p className="mt-1 text-xs opacity-80">Change anything you like. You can put it back the way it was.</p>
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold underline-offset-2 hover:underline"
              >
                <RotateCcw className="size-3.5" /> Reset demo data
              </button>
            </div>
          ) : null}
          <div className="flex items-center gap-1 lg:gap-2 lg:border-t lg:border-line lg:pt-4">
            <div className="hidden min-w-0 flex-1 lg:block lg:px-2">
              <p className="truncate text-sm font-medium">{session.name}</p>
              <p className="truncate text-xs text-ink-faint">{session.email}</p>
            </div>
            <ThemeToggle />
            <button
              type="button"
              onClick={logout}
              aria-label="Sign out"
              title="Sign out"
              className="rounded-md p-2 text-ink-soft hover:bg-sunken hover:text-ink"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8 lg:py-8">{children}</main>

      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset the demo clinic?"
        description="Queues, tokens and history go back to the original sample data. Anything you added is removed."
      >
        <div className="flex justify-end gap-2">
          <Button onClick={() => setConfirmReset(false)}>Keep my changes</Button>
          <Button variant="primary" loading={resetting} onClick={reset}>
            Reset demo
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
