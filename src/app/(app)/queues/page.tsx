import type { Metadata } from "next";
import { QueueList } from "@/components/queue-list";

export const metadata: Metadata = { title: "Queues" };

export default function QueuesPage() {
  return <QueueList />;
}
