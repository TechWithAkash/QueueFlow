import type { Metadata } from "next";
import { Suspense } from "react";
import { Tracker } from "@/components/tracker";

export const metadata: Metadata = { title: "Your token", robots: { index: false } };

export default function TrackerPage() {
  return (
    <Suspense>
      <Tracker />
    </Suspense>
  );
}
