"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock3,
  Flag,
  History,
  Info,
  Medal,
  ShieldCheck,
  Trophy,
  UserRound,
  Zap,
} from "lucide-react";
import { useRace } from "@/components/race-provider";
import {
  type Candidate,
  type HistoryPoint,
  type RankingEvent,
  type Transaction,
  money,
  number,
} from "@/lib/types";
import "./secondary.css";

const date = (value: string) =>
  new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export function CandidateAvatar({
  candidate,
  className = "",
}: {
  candidate: Pick<Candidate, "avatar" | "name" | "color">;
  className?: string;
}) {
  const cell = /^\/runners\.webp#([0-5])$/.exec(candidate.avatar);
  const index = cell ? Number(cell[1]) : 0;
  const safeImage =
    candidate.avatar && /^(https?:\/\/|\/(?!\/))/.test(candidate.avatar);
  return (
    <span
      role="img"
      aria-label={candidate.name}
      className={`sec-avatar ${className}`}
      style={
        {
          "--avatar-color": candidate.color,
          ...(cell
            ? {
                backgroundImage: "url(/runners.webp)",
                backgroundSize: "300% 200%",
                backgroundPosition: `${(index % 3) * 50}% ${Math.floor(index / 3) * 100}%`,
              }
            : safeImage
              ? {
                  backgroundImage: `url("${candidate.avatar.replace(/["\\\n\r]/g, "")}")`,
                }
              : {}),
        } as CSSProperties & Record<"--avatar-color", string>
      }
    >
      {!safeImage &&
        candidate.name
          .split(" ")
          .map((p) => p[0])
          .slice(0, 2)
          .join("")}
    </span>
  );
}

export function SecondaryHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="sec-heading">
      <div>
        <span className="sec-eyebrow">
          <span />
          {eyebrow}
        </span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </header>
  );
}

export function LoadingState() {
  return (
    <div className="sec-skeleton" role="status" aria-label="Carregando dados">
      <span />
      <span />
      <span />
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: string;
  retry?: () => void;
}) {
  return (
    <div className="sec-alert" role="alert">
      <Info size={19} />
      <span>{error}</span>
      {retry && (
        <button className="sec-link" onClick={retry}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}

export function RankingPage() {
  const { board, loading, error, refresh, openCheckout } = useRace();
  const reduced = useReducedMotion();
  const candidates = board?.candidates.filter((c) => c.active) ?? [];
  const total = candidates.reduce((sum, c) => sum + c.points, 0);
  return (
    <main className="sec-page">
      <SecondaryHeading
        eyebrow="CADA PONTO MUDA A CORRIDA"
        title="RANKING GLOBAL"
        description="Uma disputa aberta. Um placar que muda com você."
      >
        <span className="sec-live">
          <span />
          AO VIVO
        </span>
      </SecondaryHeading>
      <div className="sec-overview">
        <div>
          <span>PARTICIPANTES NA PISTA</span>
          <strong>{number(candidates.length)}</strong>
        </div>
        <div>
          <span>PONTOS NA PLATAFORMA</span>
          <strong>{number(total)}</strong>
        </div>
        <p>
          <Flag size={22} />
          Os 2 candidatos com mais pontos aparecem automaticamente no destaque
          principal.
        </p>
      </div>
      {loading && !board ? (
        <LoadingState />
      ) : error && !board ? (
        <ErrorState error={error} retry={refresh} />
      ) : (
        <>
          <div className="sec-podium">
            {candidates.slice(0, 3).map((c, i) => (
              <motion.article
                layout={!reduced}
                key={c.id}
                className={`sec-podium-card sec-place-${i + 1}`}
                style={
                  {
                    "--candidate":
                      i === 0 ? "#ff414f" : i === 1 ? "#16aafa" : c.color,
                  } as CSSProperties
                }
                transition={{ duration: 0.4 }}
              >
                <span className="sec-podium-position">
                  0{i + 1}
                  <small>
                    {i === 0
                      ? "NA FRENTE"
                      : i === 1
                        ? "NO CONFRONTO"
                        : "DE OLHO NO TOP 2"}
                  </small>
                </span>
                <CandidateAvatar candidate={c} />
                <div className="sec-podium-copy">
                  <h2>{c.shortName}</h2>
                  <strong>{number(c.points)}</strong>
                  <span>PONTOS SIMBÓLICOS</span>
                </div>
                <button
                  className="sec-button sec-candidate-button"
                  onClick={() => openCheckout(c.id, "add")}
                >
                  Apoiar <ArrowUpRight size={17} />
                </button>
              </motion.article>
            ))}
          </div>
          <section
            className="sec-panel sec-ranking"
            aria-label="Ranking completo"
          >
            <div className="sec-panel-title">
              <h2>O PLACAR COMPLETO</h2>
              <span>{candidates.length} candidatos</span>
            </div>
            <div className="sec-rank-table-head">
              <span>POSIÇÃO / CANDIDATO</span>
              <span>PONTOS</span>
              <span>PARTICIPAÇÃO</span>
              <span>PARA O LÍDER</span>
              <span>PARA O TOP 2</span>
              <span />
            </div>
            <div>
              {candidates.map((c) => (
                <motion.article
                  layout={!reduced}
                  key={c.id}
                  className="sec-rank-row"
                  transition={{ duration: 0.45, ease: "easeOut" }}
                >
                  <div className="sec-rank-person">
                    <span className={`sec-position pos-${c.position}`}>
                      {c.position <= 3 ? (
                        <Medal size={21} />
                      ) : (
                        <span>{String(c.position).padStart(2, "0")}</span>
                      )}
                      <small>{c.position <= 3 ? `${c.position}º` : ""}</small>
                    </span>
                    <CandidateAvatar candidate={c} />
                    <div>
                      <h3>{c.name}</h3>
                      <span>
                        {c.position <= 2
                          ? "No confronto principal"
                          : `${c.position}º lugar`}
                      </span>
                    </div>
                  </div>
                  <strong className="sec-rank-points">
                    {number(c.points)}
                    <small>PONTOS</small>
                  </strong>
                  <div className="sec-rank-percentage">
                    <b>
                      {c.percentage.toLocaleString("pt-BR", {
                        maximumFractionDigits: 1,
                      })}
                      %
                    </b>
                    <span>
                      <i
                        style={{
                          width: `${Math.max(0, Math.min(100, c.percentage))}%`,
                          backgroundColor: c.color,
                        }}
                      />
                    </span>
                  </div>
                  <span className="sec-gap">
                    <small>PARA O LÍDER</small>
                    {c.position === 1 ? (
                      <span className="sec-success">Líder</span>
                    ) : (
                      `${number(c.gapToLeader)} pts`
                    )}
                  </span>
                  <span className="sec-gap">
                    <small>PARA O TOP 2</small>
                    {c.position <= 2 ? (
                      <span className="sec-success">
                        <Check size={13} /> Top 2
                      </span>
                    ) : (
                      `${number(c.gapToTop2)} pts`
                    )}
                  </span>
                  <button
                    className="sec-button sec-button-small"
                    onClick={() => openCheckout(c.id, "add")}
                  >
                    Apoiar <ArrowUpRight size={15} />
                  </button>
                </motion.article>
              ))}
            </div>
            {!candidates.length && (
              <p className="sec-empty">
                A primeira corrida está sendo preparada. Os candidatos
                aparecerão aqui.
              </p>
            )}
          </section>
          <p className="sec-footnote">
            <Info size={15} />
            Empates são resolvidos pela ordem de cadastro dos candidatos. O
            percentual considera apenas os saldos positivos de pontos internos
            da plataforma.
          </p>
        </>
      )}
    </main>
  );
}

export function HistoryPage() {
  const { board, api } = useRace();
  const [range, setRange] = useState("24H");
  const [data, setData] = useState<{
    points: HistoryPoint[];
    events: RankingEvent[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    setBusy(true);
    api<{ points: HistoryPoint[]; events: RankingEvent[] }>(
      `/api/history?range=${range}`,
    )
      .then((result) => {
        if (active) {
          setData(result);
          setError(null);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [api, range, board?.updatedAt, retry]);
  const candidates = board?.candidates.filter((c) => c.active) ?? [];
  const visible = candidates.filter(
    (c) => selected.length === 0 || selected.includes(c.id),
  );
  const points = data?.points ?? [];
  const maximum = Math.max(
    1,
    ...points.flatMap((p) => visible.map((c) => p.scores[c.id] ?? 0)),
  );
  const x = (index: number) =>
    points.length <= 1 ? 450 : 58 + (index / (points.length - 1)) * 810;
  const y = (value: number) => 280 - (value / maximum) * 238;
  const toggle = (id: string) => {
    setSelected((current) => {
      if (!current.length)
        return candidates.filter((c) => c.id !== id).map((c) => c.id);
      const next = current.includes(id)
        ? current.filter((v) => v !== id)
        : [...current, id];
      return next.length ? next : current;
    });
  };
  return (
    <main className="sec-page">
      <SecondaryHeading
        eyebrow="CADA VIRADA FICA NA HISTÓRIA"
        title="A CORRIDA, PONTO A PONTO."
        description="Acompanhe a evolução da disputa e os momentos que mudaram o placar."
      />
      <section className="sec-panel sec-chart-panel">
        <div className="sec-panel-title">
          <div>
            <span className="sec-eyebrow">EVOLUÇÃO DO PLACAR</span>
            <h2>PONTOS AO LONGO DO TEMPO</h2>
          </div>
          <div className="sec-periods" aria-label="Período do gráfico">
            {[
              ["24H", "24H"],
              ["7D", "7D"],
              ["30D", "30D"],
              ["all", "Tudo"],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={range === value}
                onClick={() => setRange(value)}
                className={range === value ? "active" : ""}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <ErrorState error={error} retry={() => setRetry((v) => v + 1)} />
        )}
        {busy && !data ? (
          <LoadingState />
        ) : points.length ? (
          <div className="sec-chart" aria-busy={busy}>
            <svg
              viewBox="0 0 900 330"
              role="img"
              aria-label={`Evolução dos pontos de ${visible.map((c) => c.shortName).join(", ")}. ${points.length} registros no período.`}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
                <g key={fraction}>
                  <line
                    x1="58"
                    x2="868"
                    y1={y(maximum * fraction)}
                    y2={y(maximum * fraction)}
                    stroke="#ffffff0c"
                    strokeDasharray="4 5"
                  />
                  <text
                    x="45"
                    y={y(maximum * fraction) + 4}
                    textAnchor="end"
                    fill="#8090a5"
                    fontSize="10"
                  >
                    {new Intl.NumberFormat("pt-BR", {
                      notation: "compact",
                    }).format(maximum * fraction)}
                  </text>
                </g>
              ))}
              {visible.map((c) => (
                <g key={c.id}>
                  <path
                    fill="none"
                    stroke={c.color}
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                    d={points
                      .map(
                        (p, i) =>
                          `${i ? "L" : "M"} ${x(i)} ${y(p.scores[c.id] ?? 0)}`,
                      )
                      .join(" ")}
                  />
                  {(points.length <= 18
                    ? points
                    : [points[points.length - 1]]
                  ).map((p, i) => (
                    <circle
                      key={`${p.timestamp}-${i}`}
                      cx={x(points.length <= 18 ? i : points.length - 1)}
                      cy={y(p.scores[c.id] ?? 0)}
                      r={points.length === 1 ? 5 : 3}
                      fill={c.color}
                    >
                      <title>
                        {c.name}: {number(p.scores[c.id] ?? 0)} pontos ·{" "}
                        {date(p.timestamp)}
                      </title>
                    </circle>
                  ))}
                </g>
              ))}
              {[
                0,
                ...(points.length > 2
                  ? [Math.floor((points.length - 1) / 2)]
                  : []),
                ...(points.length > 1 ? [points.length - 1] : []),
              ].map((i) => (
                <text
                  key={i}
                  x={x(i)}
                  y="313"
                  textAnchor="middle"
                  fill="#8090a5"
                  fontSize="10"
                >
                  {date(points[i].timestamp)}
                </text>
              ))}
            </svg>
          </div>
        ) : (
          <div className="sec-empty">
            <History size={32} />
            <h3>A história começa na primeira movimentação.</h3>
            <p>Nenhum registro encontrado neste período.</p>
          </div>
        )}
        <div className="sec-chart-legend">
          {candidates.map((c) => (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              aria-pressed={!selected.length || selected.includes(c.id)}
              style={{ "--candidate": c.color } as CSSProperties}
            >
              <span />
              {c.shortName}
            </button>
          ))}
        </div>
        {points.length === 1 && (
          <p className="sec-footnote">
            Há um registro inicial neste período. As próximas movimentações vão
            desenhar a evolução da corrida.
          </p>
        )}
      </section>
      <section className="sec-panel sec-timeline">
        <div className="sec-panel-title">
          <h2>MOMENTOS DA DISPUTA</h2>
          <Flag size={19} />
        </div>
        {data?.events.length ? (
          data.events.map((event) => (
            <article key={event.id}>
              <span className="sec-event-icon">
                {event.kind.includes("leader") ? (
                  <Trophy size={19} />
                ) : (
                  <Flag size={19} />
                )}
              </span>
              <div>
                <h3>{event.message}</h3>
                <time dateTime={event.createdAt}>{date(event.createdAt)}</time>
              </div>
            </article>
          ))
        ) : (
          <div className="sec-empty compact">
            <p>As mudanças de liderança e do Top 2 aparecerão aqui.</p>
          </div>
        )}
      </section>
    </main>
  );
}

export function RulesPage() {
  const { board } = useRace();
  const exclusions = [
    "Eleição oficial",
    "Voto eleitoral",
    "Pesquisa eleitoral",
    "Intenção de voto",
    "Doação política",
    "Campanha eleitoral",
    "Previsão eleitoral",
  ];
  return (
    <main className="sec-page sec-rules">
      <SecondaryHeading
        eyebrow="JOGO CLARO. DISPUTA ABERTA."
        title="AS REGRAS DA CORRIDA."
        description="Uma paródia. Pontos simbólicos. Nenhum voto eleitoral."
      />
      <section className="sec-panel sec-rules-intro">
        <ShieldCheck size={34} />
        <div>
          <h2>O PLACAR MEDE SÓ O QUE ACONTECE AQUI.</h2>
          <p>
            A CORRIDA 26 é um jogo de entretenimento e paródia. Os nomes e
            personagens fazem parte dessa representação. A plataforma não possui
            vínculo com candidatos, partidos ou campanhas. O ranking mede
            exclusivamente a atividade dentro deste jogo.
          </p>
        </div>
      </section>
      <div className="sec-rule-grid">
        {[
          {
            n: "01",
            title: "Escolha quem movimentar",
            text: "Você pode adicionar pontos a qualquer candidato ou retirar pontos de um candidato. Os dois maiores placares ocupam automaticamente o confronto principal.",
          },
          {
            n: "02",
            title: "Valor e pontos sempre visíveis",
            text: `Cada R$ 1,00 corresponde a 1 ponto simbólico. O valor mínimo atual é ${money(board?.settings.minAmount ?? 5)}. Antes de confirmar, você vê o candidato, a ação e o valor da sua participação.`,
          },
          {
            n: "03",
            title: "Só vale após a confirmação",
            text: "Escolher um valor ou gerar um Pix não altera o placar. A movimentação só é registrada depois que o servidor valida a confirmação do pagamento. Um mesmo pagamento nunca pode contar duas vezes.",
          },
          {
            n: "04",
            title: "Uma corrida em tempo real",
            text: "O ranking e o Top 2 são recalculados a cada movimentação. Em empate, a ordem de cadastro define a posição. Para ultrapassar, é necessário pelo menos 1 ponto a mais. Retiradas podem levar o saldo abaixo de zero. Os percentuais consideram somente os saldos positivos.",
          },
        ].map((item) => (
          <section className="sec-panel sec-rule" key={item.n}>
            <span>{item.n}</span>
            <h2>{item.title}</h2>
            <p>{item.text}</p>
          </section>
        ))}
      </div>
      <section className="sec-panel sec-exclusions">
        <h2>O QUE ESTE PLACAR NÃO REPRESENTA</h2>
        <div>
          {exclusions.map((item) => (
            <span key={item}>
              <span aria-hidden="true">×</span>
              {item}
            </span>
          ))}
        </div>
        <p>
          O pagamento remunera uma participação de entretenimento dentro da
          plataforma. Não é uma doação a qualquer candidato ou campanha e não
          mede apoio eleitoral da população.
        </p>
      </section>
      <section className="sec-panel sec-rule-details">
        <div>
          <History size={23} />
          <h2>Registro e transparência</h2>
          <p>
            Toda movimentação permanece no histórico. Correções administrativas
            e cancelamentos geram registros de auditoria; uma pontuação não pode
            ser alterada silenciosamente.
          </p>
        </div>
        <div>
          <UserRound size={23} />
          <h2>Sua participação</h2>
          <p>
            Você pode explorar todo o placar sem entrar. Quando habilitada, a
            participação anônima também está disponível. Pessoas autenticadas
            podem consultar suas transações na área da conta.
          </p>
        </div>
      </section>
      {board?.mode === "sandbox" && (
        <div className="sec-alert">
          <Info size={20} />
          <span>
            <strong>Ambiente de demonstração.</strong> Aqui os pagamentos são
            simulados, não há cobrança real. As movimentações de teste são
            identificadas na plataforma.
          </span>
        </div>
      )}
      <Link href="/" className="sec-button sec-button-primary">
        Voltar para a corrida <ArrowRight size={18} />
      </Link>
    </main>
  );
}

const statuses: Record<Transaction["status"], string> = {
  paid: "Confirmado",
  pending: "Aguardando Pix",
  failed: "Falhou",
  cancelled: "Cancelado",
  refunded: "Estornado",
  expired: "Expirado",
};
export function TransactionStatus({
  status,
}: {
  status: Transaction["status"];
}) {
  return (
    <span className={`sec-status status-${status}`}>
      {status === "paid" ? (
        <Check size={12} />
      ) : status === "pending" ? (
        <Clock3 size={12} />
      ) : null}
      {statuses[status] ?? status}
    </span>
  );
}

export function TransactionTable({
  transactions,
  candidates,
  onReverse,
}: {
  transactions: Transaction[];
  candidates: Candidate[];
  onReverse?: (transaction: Transaction) => void;
}) {
  return transactions.length ? (
    <div className="sec-table-scroll">
      <table className="sec-transactions">
        <thead>
          <tr>
            <th>MOVIMENTAÇÃO</th>
            <th>DATA</th>
            <th>VALOR</th>
            <th>STATUS</th>
            {onReverse && (
              <th>
                <span className="sec-sr-only">Ações</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id}>
              <td>
                <div className="sec-transaction-name">
                  <span className={`sec-action-icon ${t.action}`}>
                    {t.action === "add" ? (
                      <ArrowUpRight size={17} />
                    ) : (
                      <ArrowDownLeft size={17} />
                    )}
                  </span>
                  <span>
                    <strong>
                      {t.action === "add" ? "+" : "−"}
                      {number(t.points)} ·{" "}
                      {candidates.find((c) => c.id === t.candidateId)
                        ?.shortName ?? t.candidateId}
                    </strong>
                    <small title={t.id}>{t.id.slice(0, 12)}</small>
                  </span>
                </div>
              </td>
              <td>
                <time dateTime={t.createdAt}>{date(t.createdAt)}</time>
              </td>
              <td>{money(t.amount)}</td>
              <td>
                <TransactionStatus status={t.status} />
              </td>
              {onReverse && (
                <td>
                  {t.status === "paid" && (
                    <button
                      className="sec-link danger"
                      onClick={() => onReverse(t)}
                    >
                      Estornar
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="sec-empty">
      <History size={31} />
      <h3>Nenhuma participação por aqui ainda.</h3>
      <p>Suas transações aparecerão aqui, incluindo pagamentos pendentes.</p>
    </div>
  );
}

export function AccountPage() {
  const { user, board, api, openLogin } = useRace();
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!user || user.anonymous) return;
    let active = true;
    api<{ transactions: Transaction[] }>("/api/me")
      .then((r) => {
        if (active) {
          setTransactions(r.transactions);
          setError(null);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [api, user?.id, user?.anonymous, board?.updatedAt, retry]);
  const stats = useMemo(() => {
    const paid = transactions?.filter((t) => t.status === "paid") ?? [];
    return {
      count: paid.length,
      value: paid.reduce((sum, t) => sum + t.amount, 0),
      points: paid.reduce((sum, t) => sum + t.points, 0),
    };
  }, [transactions]);
  return (
    <main className="sec-page">
      <SecondaryHeading
        eyebrow="SUA PRESENÇA NA PISTA"
        title="MINHA PARTICIPAÇÃO"
        description={
          user && !user.anonymous
            ? `Olá, ${user.name}. Cada movimentação sua, em um só lugar.`
            : "Entre para acompanhar seu histórico pessoal de participações."
        }
      />
      {!user || user.anonymous ? (
        <section className="sec-panel sec-account-gate">
          <UserRound size={40} />
          <h2>SEU HISTÓRICO COMEÇA COM VOCÊ.</h2>
          <p>
            Entre com Google ou e-mail para consultar as participações
            associadas à sua conta.
          </p>
          <button className="sec-button sec-button-primary" onClick={openLogin}>
            Entrar na minha conta <ArrowRight size={17} />
          </button>
        </section>
      ) : (
        <>
          <section className="sec-panel" style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,marginBottom:14}}>
            <div><strong>PROGRAMA DE CRIADORES</strong><p style={{margin:"6px 0 0"}}>Crie seu link, acompanhe indicações e comissões diretas.</p></div>
            <Link className="sec-button sec-button-primary" href="/creator">Abrir painel <ArrowRight size={16}/></Link>
          </section>
          <div className="sec-account-stats">
            <div className="sec-panel">
              <Zap />
              <span>PARTICIPAÇÕES CONFIRMADAS</span>
              <strong>{number(stats.count)}</strong>
            </div>
            <div className="sec-panel">
              <Flag />
              <span>PONTOS MOVIMENTADOS</span>
              <strong>{number(stats.points)}</strong>
            </div>
            <div className="sec-panel">
              <Check />
              <span>VALOR CONFIRMADO</span>
              <strong>{money(stats.value)}</strong>
            </div>
          </div>
          <section className="sec-panel">
            <div className="sec-panel-title">
              <h2>MINHAS TRANSAÇÕES</h2>
              <span>Registro da sua conta</span>
            </div>
            {error && (
              <ErrorState error={error} retry={() => setRetry((v) => v + 1)} />
            )}
            {transactions ? (
              <TransactionTable
                transactions={transactions}
                candidates={board?.candidates ?? []}
              />
            ) : (
              !error && <LoadingState />
            )}
          </section>
        </>
      )}
    </main>
  );
}
