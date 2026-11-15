"use client";

import { Moon, Sun } from "lucide-react";

export function ThemeToggle({ className }: { className?: string }) {
  const toggle = () => {
    const dark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("qf-theme", dark ? "dark" : "light");
    } catch {}
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch light or dark theme"
      className={
        "rounded-md p-2 text-ink-soft hover:bg-sunken hover:text-ink " + (className ?? "")
      }
    >
      <Sun className="hidden size-4 dark:block" />
      <Moon className="size-4 dark:hidden" />
    </button>
  );
}
