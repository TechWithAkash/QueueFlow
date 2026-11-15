import Link from "next/link";

/** Wordmark: a ticket stub with the numeral 1 punched in. */
export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={"inline-flex items-center gap-2 font-semibold text-ink " + (className ?? "")}>
      <span className="ticket font-wide grid h-7 w-10 place-items-center bg-amber text-sm font-black text-[#2a1d00]">
        A1
      </span>
      <span className="font-wide text-lg tracking-tight">QueueFlow</span>
    </Link>
  );
}
