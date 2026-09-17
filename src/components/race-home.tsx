"use client";
import Link from "next/link";
import { useEffect, useRef, useState, CSSProperties } from "react";
import {
  motion,
  AnimatePresence,
  animate,
  useReducedMotion,
} from "framer-motion";
import {
  ArrowUpRight,
  ArrowRight,
  Flag,
  Flame,
  Plus,
  Minus,
  Trophy,
  Clock3,
  Zap,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { useRace } from "./race-provider";
import type { ScoreBurst } from "./race-provider";
import {
  RunnerCanvas,
  runnerAvatars,
  runnerTilesets,
  RUNNER_CONFIG,
} from "./runner-canvas";
import { Candidate, number, money } from "@/lib/types";
export function Counter({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      previous.current = value;
      return;
    }
    const controls = animate(previous.current, value, {
      duration: 0.65,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    previous.current = value;
    return () => controls.stop();
  }, [value, reduced]);
  return (
    <span className="tabular" aria-label={number(value)}>
      {number(display)}
    </span>
  );
}
export function Avatar({
  candidate,
  runner = false,
}: {
  candidate: Candidate;
  runner?: boolean;
}) {
  if (runner && runnerTilesets[candidate.id])
    return (
      <RunnerCanvas candidateId={candidate.id} candidateName={candidate.name} />
    );
  const runnerAvatar = runnerAvatars[candidate.id];
  if (runnerAvatar)
    return (
      <span
        role="img"
        aria-label={`Caricatura de ${candidate.name}`}
        className="avatar-sprite"
        style={{
          backgroundImage: `url(${runnerAvatar})`,
          backgroundPosition: "center bottom",
          backgroundSize: "contain",
        }}
      />
    );
  const match = candidate.avatar?.match(/#(\d+)$/);
  const index = match
    ? Number(match[1])
    : ["lula", "flavio", "renan", "augusto", "caiado", "zema"].indexOf(
        candidate.id,
      );
  if (index >= 0 && index < 6)
    return (
      <span
        role="img"
        aria-label={`Caricatura de ${candidate.name}`}
        className={runner ? "runner-sprite" : "avatar-sprite"}
        style={{
          backgroundImage: "url(/runners.webp)",
          backgroundPosition: `${(index % 3) * 50}% ${Math.floor(index / 3) * 100}%`,
        }}
      />
    );
  return (
    <span className="avatar-fallback" style={{ background: candidate.color }}>
      {candidate.avatar && !candidate.avatar.includes("#") ? (
        <img src={candidate.avatar} alt={candidate.name} />
      ) : (
        candidate.shortName.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}

function PointBurst({
  burst,
  compact = false,
}: {
  burst?: ScoreBurst;
  compact?: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence mode="popLayout">
      {burst && (
        <motion.div
          key={burst.id}
          className={`point-pop ${compact ? "compact" : ""} ${burst.delta < 0 ? "loss" : "gain"}`}
          role="status"
          aria-live="polite"
          aria-label={`${burst.delta > 0 ? "Mais" : "Menos"} ${number(Math.abs(burst.delta))} pontos`}
          initial={reduced ? { opacity: 0 } : { opacity: 0, x: -10, y: 10, scale: 0.72 }}
          animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -24, scale: 0.88 }}
          transition={{ duration: reduced ? 0.15 : 0.38, ease: [0.22, 1, 0.36, 1] }}
        >
          <i aria-hidden="true" />
          <strong>
            {burst.delta > 0 ? "+" : "−"}
            {number(Math.abs(burst.delta))}
          </strong>
          <em>PONTOS</em>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function RaceTrack({
  candidate,
  opponent,
  index,
}: {
  candidate: Candidate;
  opponent: Candidate;
  index: number;
}) {
  const { scoreBursts } = useRace();
  const burst = scoreBursts[candidate.id];
  const gap = Math.abs(candidate.points - opponent.points);
  const relative =
    Math.max(0, candidate.points) /
    Math.max(Math.max(0, candidate.points), Math.max(0, opponent.points), 1);
  return (
    <motion.article
      layout
      layoutId={`track-${candidate.id}`}
      transition={{ duration: 0.5 }}
      className={`race-track ${index === 0 ? "red" : "blue"} ${burst && burst.delta < 0 ? "point-loss" : ""}`}
    >
      <div className="track-heading">
        <div>
          <div className="track-name">
            <span className={`position-number ${candidate.tied ? "tied" : ""}`}>
              {candidate.tied ? "EMPATE" : String(candidate.position).padStart(2, "0")}
            </span>
            <h2>{candidate.name}</h2>
            {index === 0 && (
              <span className="leader-badge">
                <Flag size={10} />
                {gap ? "NA FRENTE" : "EMPATE"}
              </span>
            )}
          </div>
          <p>
            {gap
              ? index === 0
                ? `Abriu ${number(gap)} pontos de vantagem.`
                : `Está ${number(gap)} pontos atrás.`
              : "Disputa empatada. O próximo ponto pode mudar tudo."}
          </p>
        </div>
        <div className="track-score">
          <Counter value={candidate.points} />
          <span>PONTOS</span>
        </div>
      </div>
      <div className="track-ground">
        <span className="track-label">
          {index === 0 ? "LIDERANÇA" : "EM DISPUTA"} <Flag size={11} />
        </span>
        <div className="finish-line" />
        <div className="lane-markers" />
      </div>
      <motion.div
        className="runner-wrap"
        animate={{ left: `${20 + relative * 48}%` }}
        transition={{
          duration: 160 / RUNNER_CONFIG.speed,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        <div className="speed-lines" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <Avatar candidate={candidate} runner />
        <PointBurst burst={burst} />
      </motion.div>
    </motion.article>
  );
}
function ParticipatePanel({
  candidate,
  opponent,
  index,
}: {
  candidate: Candidate;
  opponent: Candidate;
  index: number;
}) {
  const { board, openCheckout } = useRace();
  const amounts = board?.settings.quickAmounts || [5, 10, 20];
  return (
    <motion.article
      layout
      className={`participate-panel panel ${index === 0 ? "red" : "blue"}`}
    >
      <div className="panel-title">
        <div>
          <span className="eyebrow">ESCOLHA SEU MOVIMENTO</span>
          <h3>
            APOIAR <span>{candidate.shortName}</span>
          </h3>
        </div>
        <Plus size={23} />
      </div>
      <div className="amount-options">
        {amounts.map((amount) => (
          <button
            key={amount}
            onClick={() => openCheckout(candidate.id, "add", amount)}
          >
            <span>{money(amount)}</span>
            <strong>
              +{number(amount)} <small>pontos</small>
            </strong>
          </button>
        ))}
      </div>
      <div className="remove-heading">
        <span>
          <Minus size={13} /> TIRAR PONTOS DE {opponent.shortName.toUpperCase()}
        </span>
      </div>
      <div className="amount-options subtract">
        {amounts.map((amount) => (
          <button
            key={amount}
            onClick={() => openCheckout(opponent.id, "remove", amount)}
          >
            <span>{money(amount)}</span>
            <strong>
              −{number(amount)} <small>pontos</small>
            </strong>
          </button>
        ))}
      </div>
      <button
        className="other-amount"
        onClick={() => openCheckout(candidate.id, "add")}
      >
        Escolher outro valor <ArrowUpRight size={15} />
      </button>
    </motion.article>
  );
}
function Status({ first, second }: { first: Candidate; second: Candidate }) {
  const gap = first.points - second.points;
  const total = Math.max(0, first.points) + Math.max(0, second.points);
  const percent = total ? (Math.max(0, first.points) / total) * 100 : 50;
  return (
    <section className="dispute-status panel">
      <div className="status-intro">
        <div className="trophy-icon">
          <Trophy size={23} />
        </div>
        <div>
          <span className="eyebrow">STATUS DA DISPUTA</span>
          <h2>
            {gap ? (
              <>
                <span>{first.shortName}</span> ESTÁ NA FRENTE POR {number(gap)}{" "}
                PONTOS
              </>
            ) : (
              "EMPATE NO TOPO. A CORRIDA CONTINUA."
            )}
          </h2>
          <p>
            {second.shortName} precisa de{" "}
            <b>
              {number(gap + 1)} {gap === 0 ? "ponto" : "pontos"}
            </b>{" "}
            para assumir a liderança.
          </p>
        </div>
      </div>
      <div className="share-labels">
        <span>
          {first.shortName.toUpperCase()}{" "}
          <b>{percent.toFixed(1).replace(".", ",")}%</b>
        </span>
        <span>
          <b>{(100 - percent).toFixed(1).replace(".", ",")}%</b>{" "}
          {second.shortName.toUpperCase()}
        </span>
      </div>
      <div
        className="share-bar"
        role="img"
        aria-label={`${first.shortName}: ${percent.toFixed(1)} por cento dos pontos do confronto`}
      >
        <motion.div
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.7 }}
        />
      </div>
      <p className="bar-caption">
        Distribuição dos pontos positivos entre os dois líderes.
      </p>
    </section>
  );
}
function Challenger({ candidate }: { candidate: Candidate }) {
  const { openCheckout, scoreBursts } = useRace();
  return (
    <motion.article
      layout
      layoutId={`challenger-${candidate.id}`}
      className="challenger-card panel"
      style={{ "--candidate-color": candidate.color } as CSSProperties}
    >
      <div className="challenger-top">
        <span className="small-position">
          {candidate.tied ? "EMPATADO" : `${candidate.position}º LUGAR`}
        </span>
        <ArrowUpRight size={16} />
      </div>
      <div className="challenger-identity">
        <div className="challenger-avatar-wrap">
          <Avatar candidate={candidate} />
          <PointBurst burst={scoreBursts[candidate.id]} compact />
        </div>
        <div>
          <h3>{candidate.name}</h3>
          <span>
            <Counter value={candidate.points} /> <small>pontos</small>
          </span>
        </div>
      </div>
      <p className="top2-gap">
        <Flame size={13} />
        <span>
          {candidate.tied ? (
            "Mesma pontuação do Top 2"
          ) : (
            <>
              Faltam <b>{number(candidate.gapToTop2)}</b> para o Top 2
            </>
          )}
        </span>
      </p>
      <button
        className="support-button"
        onClick={() => openCheckout(candidate.id, "add")}
      >
        APOIAR <Plus size={15} />
      </button>
      <button
        className="remove-link"
        onClick={() => openCheckout(candidate.id, "remove")}
      >
        Tirar pontos <Minus size={12} />
      </button>
    </motion.article>
  );
}
export function Home() {
  const { board, error, loading, refresh, notification } = useRace();
  if (!board)
    return (
      <main className="page-wrap">
        <div className="hero">
          <span className="eyebrow">CORRIDA 26</span>
          <h1>PREPARANDO A PISTA</h1>
        </div>
        {error ? (
          <div className="panel connection-error">
            <p>{error}</p>
            <button className="button" onClick={() => void refresh()}>
              <RefreshCw size={16} /> Reconectar
            </button>
          </div>
        ) : (
          <div className="board-skeleton" aria-label="Carregando placar">
            <div />
            <div />
            <div />
          </div>
        )}
      </main>
    );
  const [first, second] = board.candidates;
  const total = board.candidates.reduce((sum, c) => sum + c.points, 0);
  if (!first || !second)
    return (
      <main className="page-wrap">
        <div className="panel empty-state">
          <Flag />
          <h1>A pista está sendo preparada.</h1>
          <p>O confronto começa quando houver dois participantes ativos.</p>
          <Link className="button" href="/ranking">
            Ver ranking
          </Link>
        </div>
      </main>
    );
  return (
    <main className="page-wrap home-page">
      <section className="hero">
        <span className="global-badge">
          <span className="live-dot" /> PLACAR GLOBAL{" "}
          <span className="badge-divider" /> AO VIVO
        </span>
        <AnimatePresence mode="wait">
          <motion.h1
            key={`${first.id}-${second.id}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            {first.shortName}
            <span className="versus">X</span>
            {second.shortName}
          </motion.h1>
        </AnimatePresence>
        <h2>A CORRIDA ELEITORAL</h2>
        <p>
          {board.settings.heroText ||
            "Escolha um lado. Cada pagamento confirmado soma apenas os pontos simbólicos correspondentes ao valor escolhido."}
        </p>
      </section>
      <section className="scoreboard panel" aria-label="Placar do confronto">
        <div className="score-side red">
          <span className="score-name">
            <i />
            {first.shortName}
          </span>
          <strong>
            <Counter value={first.points} />
          </strong>
          <span className="score-unit">PONTOS SIMBÓLICOS</span>
        </div>
        <div className="score-center">
          <span className="eyebrow">
            <Zap size={12} /> DISPUTA EM TEMPO REAL
          </span>
          <b>
            {first.points === second.points
              ? "EMPATE"
              : `${first.shortName} +${number(first.points - second.points)}`}
          </b>
          <span>
            {number(first.points + second.points)} PONTOS NO CONFRONTO
          </span>
        </div>
        <div className="score-side blue">
          <span className="score-name">
            {second.shortName}
            <i />
          </span>
          <strong>
            <Counter value={second.points} />
          </strong>
          <span className="score-unit">PONTOS SIMBÓLICOS</span>
        </div>
      </section>
      <div className="race-section-heading">
        <span>
          <Flag size={13} /> NA PISTA AGORA
        </span>
        <span>OS 2 LÍDERES DA CORRIDA</span>
      </div>
      <section className="race-tracks" aria-label="Pistas dos líderes">
        <AnimatePresence initial={false}>
          {[first, second].map((candidate, index) => (
            <RaceTrack
              key={candidate.id}
              candidate={candidate}
              opponent={index === 0 ? second : first}
              index={index}
            />
          ))}
        </AnimatePresence>
      </section>
      <section
        className="participation-grid"
        aria-label="Participar do confronto"
      >
        <ParticipatePanel candidate={first} opponent={second} index={0} />
        <ParticipatePanel candidate={second} opponent={first} index={1} />
      </section>
      <div className="payment-caption">
        <ShieldCheck size={13} />
        {board.readOnly
          ? "Placar disponível para visualização. Participações serão liberadas após a conexão segura dos serviços."
          : board.mode === "sandbox"
            ? "Experimente o fluxo completo no modo demonstração. Nenhum valor será cobrado."
            : "Pagamento via Pix. O placar muda após a confirmação do pagamento."}
      </div>
      <Status first={first} second={second} />
      <section className="challengers-section">
        <div className="section-header">
          <div>
            <span className="eyebrow">DE OLHO NO PÓDIO</span>
            <h2>A CORRIDA NÃO PARA NO TOP 2.</h2>
            <p>
              Os 2 candidatos com mais pontos aparecem automaticamente no
              destaque principal.
            </p>
          </div>
          <Link href="/ranking">
            Ranking completo <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="challenger-grid">
          <AnimatePresence initial={false}>
            {board.candidates.slice(2).map((candidate) => (
              <Challenger key={candidate.id} candidate={candidate} />
            ))}
          </AnimatePresence>
        </div>
      </section>
      <section className="recent-section panel">
        <div className="section-header">
          <div>
            <span className="eyebrow">
              <Clock3 size={13} /> MOVIMENTAÇÕES RECENTES
            </span>
            <h2>CADA PONTO MUDA O JOGO.</h2>
          </div>
          <Link href="/historico">
            Ver histórico <ArrowUpRight size={15} />
          </Link>
        </div>
        <div className="recent-list" aria-live="polite">
          {board.movements
            .filter((m) => m.action !== "seed")
            .slice(0, 5)
            .map((m) => {
              const c = board.candidates.find((c) => c.id === m.candidateId);
              return (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={m.id}
                  className="recent-movement"
                >
                  <span
                    className="movement-dot"
                    style={{ background: c?.color || "#b0bdd3" }}
                  />
                  <p>
                    <b>{m.actorName || "Anônimo"}</b>{" "}
                    {m.points < 0 ? "retirou" : "adicionou"}{" "}
                    <strong>
                      {m.points > 0 ? "+" : ""}
                      {number(m.points)}
                    </strong>{" "}
                    {m.points < 0 ? "de" : "a"} <b>{m.candidateName}</b>
                  </p>
                  <time>
                    {new Date(m.createdAt).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </motion.div>
              );
            })}
          {!board.movements.some((m) => m.action !== "seed") && (
            <div className="recent-empty">
              <Zap size={18} />
              <p>A pista está aberta. A próxima movimentação pode ser a sua.</p>
            </div>
          )}
        </div>
      </section>
      <div className="closing-line">
        <span>
          <Flag size={13} /> {board.candidates.length} PARTICIPANTES NA PISTA
        </span>
        <span>{number(total)} PONTOS NO PLACAR GLOBAL</span>
      </div>
      <AnimatePresence>
        {notification && (
          <motion.div
            role="status"
            className="leadership-toast"
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {notification}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
