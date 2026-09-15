"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  UserRound,
  ArrowUpRight,
  ShieldCheck,
  Radio,
  WifiOff,
} from "lucide-react";
import { useRace } from "./race-provider";
import { LEGAL } from "@/lib/types";
export function Header() {
  const path = usePathname();
  const { user, openLogin, board, error } = useRace();
  return (
    <>
      <header className="site-header">
        <Link href="/" className="brand" aria-label="CORRIDA 26 — início">
          <span className="brand-stripes">
            <i />
            <i />
            <i />
          </span>
          <span>
            CORRIDA<span className="brand-year">26</span>
          </span>
        </Link>
        <nav aria-label="Navegação principal">
          {[
            ["/", "Início"],
            ["/ranking", "Ranking"],
            ["/historico", "Histórico"],
            ["/regras", "Regras"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={path === href ? "active" : ""}
            >
              {label}
            </Link>
          ))}
        </nav>
        {user && !user.anonymous ? (
          <Link className="login-button" href="/conta">
            <UserRound size={17} />
            <span>{user.name?.split(" ")[0] || "Minha conta"}</span>
          </Link>
        ) : (
          <button className="login-button" onClick={openLogin}>
            <UserRound size={17} />
            <span>Entrar</span>
          </button>
        )}
      </header>
      <div className="system-bar">
        <span>
          <span className={`live-dot ${error ? "offline" : ""}`} />
          {error ? "Reconectando ao placar" : "PLACAR COMPARTILHADO"}
        </span>
        <span>
          {board?.mode === "sandbox"
            ? "MODO DEMONSTRAÇÃO · SEM COBRANÇAS"
            : "PONTOS SIMBÓLICOS · PARÓDIA"}
        </span>
        <Link href="/regras">
          Entenda o jogo <ArrowUpRight size={12} />
        </Link>
      </div>
    </>
  );
}
export function Footer() {
  const { board } = useRace();
  return (
    <>
      <footer className="site-footer">
        <div>
          <Image src="/logo.svg" alt="CORRIDA 26" width={155} height={52} />
          <p>A disputa acontece aqui. Os pontos também.</p>
        </div>
        <div>
          <Link href="/regras">
            Regras do jogo <ArrowUpRight size={14} />
          </Link>
          <Link href="/admin">Administração</Link>
          <span>© 2026 CORRIDA 26</span>
        </div>
        <p className="full-legal">{board?.settings.legalNotice || LEGAL}</p>
      </footer>
      <aside className="legal-fixed" aria-label="Aviso permanente">
        <ShieldCheck size={16} />
        <span>
          Paródia. Pontos simbólicos internos. Não são votos, pesquisa, intenção
          de voto ou doação política.
        </span>
        <Link href="/regras">
          Saiba mais <ArrowUpRight size={12} />
        </Link>
      </aside>
    </>
  );
}
