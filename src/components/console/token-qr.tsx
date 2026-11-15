"use client";

import QRCode from "qrcode";
import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { TokenDTO } from "@/lib/types";
import { Button, Dialog, TokenCode } from "../ui";

/** QR code the patient scans to follow their token on their phone. */
export function TokenQrDialog({ token, onClose }: { token: TokenDTO | null; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const url = token && typeof window !== "undefined" ? `${window.location.origin}/t/${token.publicKey}` : "";

  useEffect(() => {
    if (!url) return;
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width: 480, color: { dark: "#17302a", light: "#ffffff" } }).then(
      (s) => alive && setSrc(s),
    );
    return () => {
      alive = false;
      setSrc(null);
    };
  }, [url]);

  return (
    <Dialog
      open={!!token}
      onClose={onClose}
      title="Follow this token on a phone"
      description="The patient scans this to see their place in line and estimated wait. It updates live."
    >
      {token ? (
        <div className="flex flex-col items-center gap-4">
          <TokenCode code={token.code} size="lg" tone="amber" />
          <div className="grid size-60 place-items-center rounded-xl border border-line bg-white p-3">
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={`QR code linking to the tracker for ${token.code}`} className="size-full" />
            ) : null}
          </div>
          <div className="flex w-full items-center gap-2 rounded-lg bg-sunken p-2 pl-3 text-sm">
            <span className="min-w-0 flex-1 truncate text-ink-soft">{url}</span>
            <Button
              size="sm"
              onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Link copied"))}
            >
              <Copy className="size-3.5" /> Copy link
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
