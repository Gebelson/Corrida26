import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/800.css";
import "./globals.css";
import { RaceProvider } from "@/components/race-provider";
import { Header, Footer } from "@/components/chrome";
export const metadata: Metadata = {
  title: {
    default: "CORRIDA 26 — Cada ponto muda o jogo.",
    template: "%s | CORRIDA 26",
  },
  description:
    "Uma paródia em pontos simbólicos. Acompanhe o placar, escolha seu movimento e veja quem assume a liderança. Não é eleição, pesquisa ou doação política.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main-content">
          Pular para o conteúdo
        </a>
        <RaceProvider>
          <Header />
          <div id="main-content">{children}</div>
          <Footer />
        </RaceProvider>
      </body>
    </html>
  );
}
