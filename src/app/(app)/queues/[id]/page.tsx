import type { Metadata } from "next";
import { Suspense } from "react";
import { QueueConsole } from "@/components/console/queue-console";

export const metadata: Metadata = { title: "Queue console" };

export default function QueuePage() {
  return (
    <Suspense>
      <QueueConsole />
    </Suspense>
  );
}
