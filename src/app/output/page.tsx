import type { Metadata } from "next";
import OutputView from "@/components/OutputView";

export const metadata: Metadata = { title: "Lichtwerk – Ausgabe" };

export default function OutputPage() {
  return <OutputView />;
}
