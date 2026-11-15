import type { Metadata } from "next";
import { Suspense } from "react";
import { DisplayBoard } from "@/components/display-board";

export const metadata: Metadata = { title: "Display board" };

export default function DisplayPage() {
  return (
    <Suspense>
      <DisplayBoard />
    </Suspense>
  );
}
