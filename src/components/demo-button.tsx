"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { Button, type ButtonProps } from "./ui";

export function DemoButton({ children = "Try the live demo", ...props }: ButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      {...props}
      loading={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await api("/api/auth/demo", { method: "POST" });
          router.push("/queues");
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
          setLoading(false);
        }
      }}
    >
      {children}
    </Button>
  );
}
