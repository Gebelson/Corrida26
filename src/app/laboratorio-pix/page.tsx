import type { Metadata } from "next";
import { PixLab } from "@/components/pix-lab";

export const metadata: Metadata = {
  title: "Laboratório Pix | CORRIDA 26",
  description: "Teste isolado de leitura local e handoff experimental de QR Code Pix.",
  robots: { index: false, follow: false },
};

export default function PixLabPage() {
  return <PixLab />;
}
