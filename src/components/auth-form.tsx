"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { DemoButton } from "./demo-button";
import { Button, Field, Input } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/queues";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      await api(`/api/auth/${mode}`, { method: "POST", json: Object.fromEntries(form) });
      router.push(safeNext);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  const isLogin = mode === "login";
  return (
    <>
      <h1 className="font-wide text-3xl font-bold tracking-tight">{isLogin ? "Sign in" : "Create your account"}</h1>
      <p className="mt-2 text-ink-soft">
        {isLogin ? "Open your queues and the front-desk console." : "You'll be the manager for your clinic's queues."}
      </p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        {!isLogin ? (
          <Field label="Your name" htmlFor="name">
            <Input id="name" name="name" autoComplete="name" required maxLength={60} />
          </Field>
        ) : null}
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password" htmlFor="password" hint={isLogin ? undefined : "At least 8 characters."}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            required
            minLength={isLogin ? undefined : 8}
          />
        </Field>
        {error ? (
          <p role="alert" className="rounded-lg bg-red-wash px-3 py-2 text-sm text-red">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
          {isLogin ? "Sign in" : "Create account"}
        </Button>
      </form>
      <div className="mt-6 flex items-center gap-3 text-xs text-ink-faint">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <DemoButton size="lg" className="mt-6 w-full">
        Open the demo clinic
      </DemoButton>
      <p className="mt-8 text-sm text-ink-soft">
        {isLogin ? "New here? " : "Already have an account? "}
        <Link href={isLogin ? "/register" : "/login"} className="font-medium text-teal hover:underline">
          {isLogin ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </>
  );
}
