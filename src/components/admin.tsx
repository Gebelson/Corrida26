"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowRight,
  Check,
  ClipboardList,
  CreditCard,
  Eye,
  EyeOff,
  Flag,
  LoaderCircle,
  Pencil,
  Plus,
  Settings2,
  ShieldCheck,
  Trophy,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useRace } from "@/components/race-provider";
import {
  type Candidate,
  type Settings,
  type Transaction,
  money,
  number,
} from "@/lib/types";
import {
  CandidateAvatar,
  ErrorState,
  LoadingState,
  SecondaryHeading,
  TransactionTable,
} from "./secondary";
import "./secondary.css";
import Link from "next/link";

interface AuditEntry {
  id: string;
  operation: string;
  reason: string;
  actorName?: string;
  createdAt: string;
}
interface AdminData {
  stats: {
    totalTransactions: number;
    movementsToday: number;
    amountToday: number;
    averageTicket: number;
  };
  candidates: Candidate[];
  transactions: Transaction[];
  settings: Settings;
  audit: AuditEntry[];
}
type CandidateDraft = Pick<
  Candidate,
  "name" | "shortName" | "avatar" | "color" | "active"
> & { id?: string };
const blankCandidate: CandidateDraft = {
  name: "",
  shortName: "",
  avatar: "",
  color: "#22c9b3",
  active: true,
};

export function AdminPage() {
  const { board, user, api, refresh, openLogin } = useRace();
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("candidates");
  const [draft, setDraft] = useState<CandidateDraft | null>(null);
  const [reverse, setReverse] = useState<Transaction | null>(null);
  const [reason, setReason] = useState("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [quick, setQuick] = useState("");
  const [settingsReason, setSettingsReason] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [hideTarget, setHideTarget] = useState<Candidate | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const result = await api<AdminData>("/api/admin");
      setData(result);
      setSettings((previous) => previous ?? result.settings);
      setQuick(
        (previous) => previous || result.settings.quickAmounts.join(", "),
      );
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível carregar o painel.",
      );
    }
  }, [api]);
  useEffect(() => {
    if (user?.admin) void load();
  }, [user?.admin, load, board?.updatedAt]);
  const mutate = async (
    operation: string,
    payload: object,
    auditReason: string,
  ) => {
    setBusy(true);
    setError(null);
    setModalError(null);
    setNotice("");
    try {
      await api("/api/admin", {
        method: "POST",
        body: JSON.stringify({ operation, data: payload, reason: auditReason }),
      });
      await Promise.all([load(), refresh()]);
      setNotice("Alteração salva e registrada no histórico de auditoria.");
      return true;
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Não foi possível salvar a alteração.";
      setError(message);
      setModalError(message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const demoAdmin = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/demo", {
        method: "POST",
        body: JSON.stringify({ name: "Administrador de teste", role: "admin" }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao entrar.");
    } finally {
      setBusy(false);
    }
  };
  const submitCandidate = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    if (await mutate("candidate.save", draft, reason)) {
      setDraft(null);
      setReason("");
    }
  };
  const submitSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!settings) return;
    const quickAmounts = quick
      .split(/[,;\s]+/)
      .filter(Boolean)
      .map(Number);
    if (
      !quickAmounts.length ||
      quickAmounts.some((v) => !Number.isFinite(v) || v < settings.minAmount)
    ) {
      setError(
        "Informe valores rápidos válidos, separados por vírgula e iguais ou maiores que o mínimo.",
      );
      return;
    }
    if (
      await mutate(
        "settings.save",
        { ...settings, quickAmounts },
        settingsReason,
      )
    ) {
      setSettings({ ...settings, quickAmounts });
      setSettingsReason("");
    }
  };
  const candidateEdit = (candidate?: Candidate) => {
    setDraft(
      candidate
        ? {
            id: candidate.id,
            name: candidate.name,
            shortName: candidate.shortName,
            avatar: candidate.avatar,
            color: candidate.color,
            active: candidate.active,
          }
        : { ...blankCandidate },
    );
    setReason("");
    setModalError(null);
  };
  const filteredTransactions = (data?.transactions ?? []).filter(
    (t) =>
      (status === "all" || t.status === status) &&
      (!search ||
        `${t.id} ${data?.candidates.find((c) => c.id === t.candidateId)?.name ?? ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(search.toLocaleLowerCase("pt-BR"))),
  );
  return (
    <main className="sec-page sec-admin">
      <SecondaryHeading
        eyebrow="CONTROLE DA PLATAFORMA"
        title="DIREÇÃO DE PROVA"
        description="Gerencie a corrida com transparência. Toda alteração deixa um registro."
      >
        <div style={{display:"flex",gap:8,alignItems:"center"}}><Link className="sec-button" href="/admin/creators">Programa de criadores</Link><span className="sec-admin-mark"><ShieldCheck size={17} />ÁREA RESTRITA</span></div>
      </SecondaryHeading>
      {!user?.admin ? (
        <section className="sec-panel sec-account-gate">
          <ShieldCheck size={42} />
          <h2>ACESSO DA EQUIPE</h2>
          <p>
            Este painel exige uma conta autenticada com permissão de
            administrador.
          </p>
          {error && <ErrorState error={error} />}
          <button className="sec-button sec-button-primary" onClick={openLogin}>
            Entrar com uma conta autorizada <ArrowRight size={17} />
          </button>
          {board?.mode === "sandbox" && (
            <div className="sec-demo-admin">
              <p>Ambiente local de teste: nenhuma cobrança real.</p>
              <button
                className="sec-button"
                disabled={busy}
                onClick={demoAdmin}
              >
                {busy ? (
                  <LoaderCircle size={16} className="sec-spin" />
                ) : (
                  <ShieldCheck size={16} />
                )}
                Entrar como administrador de teste
              </button>
            </div>
          )}
        </section>
      ) : (
        <>
          {error && <ErrorState error={error} retry={load} />}
          {notice && (
            <div className="sec-notice" role="status">
              <Check size={17} />
              {notice}
              <button
                aria-label="Fechar confirmação"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!data ? (
            <LoadingState />
          ) : (
            <>
              <div className="sec-admin-stats">
                {[
                  {
                    label: "TOTAL DE TRANSAÇÕES",
                    value: number(data.stats.totalTransactions),
                    icon: CreditCard,
                  },
                  {
                    label: "MOVIMENTAÇÕES HOJE",
                    value: number(data.stats.movementsToday),
                    icon: Flag,
                  },
                  {
                    label: "PROCESSADO HOJE",
                    value: money(data.stats.amountToday),
                    icon: Wallet,
                  },
                  {
                    label: "TICKET MÉDIO",
                    value: money(data.stats.averageTicket),
                    icon: ClipboardList,
                  },
                ].map(({ label, value, icon: Icon }) => (
                  <div className="sec-panel" key={label}>
                    <Icon size={20} />
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <div className="sec-admin-leader">
                <Trophy size={24} />
                <div>
                  <span>QUEM ESTÁ NA FRENTE</span>
                  <strong>
                    {board?.candidates[0]?.name ?? "Aguardando candidatos"}
                  </strong>
                </div>
                <b>
                  {number(board?.candidates[0]?.points ?? 0)} <small>PTS</small>
                </b>
                <span
                  className={`sec-status ${data.settings.paymentsEnabled ? "status-paid" : "status-cancelled"}`}
                >
                  Pagamentos{" "}
                  {data.settings.paymentsEnabled ? "ativos" : "pausados"}
                </span>
              </div>
              <div className="sec-admin-tabs" aria-label="Seções do painel">
                {[
                  { id: "candidates", label: "Candidatos", icon: Users },
                  { id: "transactions", label: "Transações", icon: CreditCard },
                  { id: "settings", label: "Configurações", icon: Settings2 },
                  { id: "audit", label: "Auditoria", icon: ShieldCheck },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    aria-pressed={tab === id}
                    className={tab === id ? "active" : ""}
                    onClick={() => setTab(id)}
                  >
                    <Icon size={17} />
                    {label}
                  </button>
                ))}
              </div>
              {tab === "candidates" && (
                <section className="sec-panel">
                  <div className="sec-panel-title">
                    <div>
                      <h2>CANDIDATOS NA CORRIDA</h2>
                      <p>
                        Cadastre, edite ou oculte participantes. A pontuação vem
                        apenas das movimentações.
                      </p>
                    </div>
                    <button
                      className="sec-button sec-button-primary"
                      onClick={() => candidateEdit()}
                    >
                      <Plus size={17} />
                      Adicionar candidato
                    </button>
                  </div>
                  <div className="sec-admin-candidates">
                    {data.candidates.map((c) => (
                      <article
                        key={c.id}
                        className={!c.active ? "hidden-candidate" : ""}
                      >
                        <span className="sec-admin-position">
                          {c.active && !c.tied
                            ? String(c.position).padStart(2, "0")
                            : "—"}
                        </span>
                        <CandidateAvatar candidate={c} />
                        <div className="sec-admin-candidate-copy">
                          <h3>{c.name}</h3>
                          <span>
                            <i style={{ background: c.color }} />
                            {c.shortName} · {c.active ? "Visível" : "Oculto"}
                          </span>
                        </div>
                        <strong>
                          {number(c.points)}
                          <small>PONTOS</small>
                        </strong>
                        <button
                          className="sec-icon-button"
                          title={`Editar ${c.name}`}
                          aria-label={`Editar ${c.name}`}
                          onClick={() => candidateEdit(c)}
                        >
                          <Pencil size={17} />
                        </button>
                        <button
                          className="sec-icon-button"
                          title={
                            c.active ? `Ocultar ${c.name}` : `Mostrar ${c.name}`
                          }
                          aria-label={
                            c.active ? `Ocultar ${c.name}` : `Mostrar ${c.name}`
                          }
                          onClick={() => {
                            setHideTarget(c);
                            setReason("");
                            setModalError(null);
                          }}
                        >
                          {c.active ? <Eye size={18} /> : <EyeOff size={18} />}
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              )}
              {tab === "transactions" && (
                <section className="sec-panel">
                  <div className="sec-panel-title">
                    <div>
                      <h2>TRANSAÇÕES</h2>
                      <p>
                        Um estorno cria uma movimentação de compensação e
                        preserva o registro original.
                      </p>
                    </div>
                  </div>
                  <div className="sec-transaction-filters">
                    <label>
                      <span>Buscar por candidato ou ID</span>
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Nome do candidato ou ID da transação"
                      />
                    </label>
                    <label>
                      <span>Status</span>
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                      >
                        <option value="all">Todos os status</option>
                        <option value="pending">Aguardando Pix</option>
                        <option value="paid">Confirmados</option>
                        <option value="failed">Falharam</option>
                        <option value="cancelled">Cancelados</option>
                        <option value="refunded">Estornados</option>
                        <option value="expired">Expirados</option>
                      </select>
                    </label>
                  </div>
                  <TransactionTable
                    transactions={filteredTransactions}
                    candidates={data.candidates}
                    onReverse={(t) => {
                      setReverse(t);
                      setReason("");
                      setModalError(null);
                    }}
                  />
                </section>
              )}
              {tab === "settings" && settings && (
                <form
                  className="sec-panel sec-settings"
                  onSubmit={submitSettings}
                >
                  <div className="sec-panel-title">
                    <div>
                      <h2>CONFIGURAÇÕES DA CORRIDA</h2>
                      <p>
                        As alterações são aplicadas à plataforma e entram no
                        registro de auditoria.
                      </p>
                    </div>
                  </div>
                  <div className="sec-settings-body">
                    <fieldset>
                      <legend>Participação e pagamentos</legend>
                      <label className="sec-switch-row">
                        <span>
                          <strong>Receber pagamentos</strong>
                          <small>
                            Permite gerar novas cobranças e movimentar o placar.
                          </small>
                        </span>
                        <input
                          type="checkbox"
                          checked={settings.paymentsEnabled}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              paymentsEnabled: e.target.checked,
                            })
                          }
                        />
                      </label>
                      <label className="sec-switch-row">
                        <span>
                          <strong>Participação anônima</strong>
                          <small>
                            Permite participar sem uma conta autenticada.
                          </small>
                        </span>
                        <input
                          type="checkbox"
                          checked={settings.anonymousEnabled}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              anonymousEnabled: e.target.checked,
                            })
                          }
                        />
                      </label>
                      <div className="sec-form-row">
                        <label>
                          Valor mínimo (R$)
                          <input
                            type="number"
                            min="1"
                            step="1"
                            required
                            value={settings.minAmount}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                minAmount: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          Valores rápidos (R$)
                          <input
                            required
                            value={quick}
                            onChange={(e) => setQuick(e.target.value)}
                            placeholder="5, 10, 20"
                          />
                          <small>Separe os valores por vírgula.</small>
                        </label>
                      </div>
                    </fieldset>
                    <fieldset>
                      <legend>Programa de criadores</legend>
                      <label className="sec-switch-row"><span><strong>Programa ativo</strong><small>Permite gerar links e atribuir novos indicados.</small></span><input type="checkbox" checked={settings.creatorProgram.enabled} onChange={e=>setSettings({...settings,creatorProgram:{...settings.creatorProgram,enabled:e.target.checked}})}/></label>
                      <label className="sec-switch-row"><span><strong>Saques ativos</strong><small>Autoriza novas solicitações para contas aprovadas.</small></span><input type="checkbox" checked={settings.creatorProgram.withdrawalsEnabled} onChange={e=>setSettings({...settings,creatorProgram:{...settings.creatorProgram,withdrawalsEnabled:e.target.checked}})}/></label>
                      <label className="sec-switch-row"><span><strong>Ranking público</strong><small>Exibe criadores participantes.</small></span><input type="checkbox" checked={settings.creatorProgram.leaderboardEnabled} onChange={e=>setSettings({...settings,creatorProgram:{...settings.creatorProgram,leaderboardEnabled:e.target.checked}})}/></label>
                      <div className="sec-form-row">
                        <label>Atribuição (dias)<input type="number" min="1" max="365" value={settings.creatorProgram.attributionDays} onChange={e=>setSettings({...settings,creatorProgram:{...settings.creatorProgram,attributionDays:Number(e.target.value)}})}/></label>
                        <label>Comissão (dias)<input type="number" min="1" max="365" value={settings.creatorProgram.commissionDays} onChange={e=>setSettings({...settings,creatorProgram:{...settings.creatorProgram,commissionDays:Number(e.target.value)}})}/></label>
                        <label>Retenção (dias)<input type="number" min="0" max="90" value={settings.creatorProgram.holdDays} onChange={e=>setSettings({...settings,creatorProgram:{...settings.creatorProgram,holdDays:Number(e.target.value)}})}/></label>
                        <label>Saque mínimo (R$)<input type="number" min="1" value={settings.creatorProgram.minWithdrawal} onChange={e=>setSettings({...settings,creatorProgram:{...settings.creatorProgram,minWithdrawal:Number(e.target.value)}})}/></label>
                        <label>Bônus do indicado (%)<input type="number" min="0" max="100" value={settings.creatorProgram.customerBonusPercent} onChange={e=>setSettings({...settings,creatorProgram:{...settings.creatorProgram,customerBonusPercent:Number(e.target.value)}})}/></label>
                        <label>Limite do bônus (R$)<input type="number" min="0" value={settings.creatorProgram.customerBonusMax} onChange={e=>setSettings({...settings,creatorProgram:{...settings.creatorProgram,customerBonusMax:Number(e.target.value)}})}/></label>
                      </div>
                    </fieldset>
                    <fieldset>
                      <legend>Textos da plataforma</legend>
                      <label>
                        Mensagem principal
                        <textarea
                          rows={3}
                          maxLength={500}
                          required
                          value={settings.heroText}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              heroText: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Aviso permanente de paródia
                        <textarea
                          rows={5}
                          minLength={80}
                          maxLength={2000}
                          required
                          value={settings.legalNotice}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              legalNotice: e.target.value,
                            })
                          }
                        />
                        <small>
                          Explique que os pontos são simbólicos e não
                          representam votos, pesquisa, doação ou vínculo com
                          campanha.
                        </small>
                      </label>
                    </fieldset>
                    <fieldset>
                      <legend>Registro da alteração</legend>
                      <label>
                        Motivo da mudança
                        <input
                          required
                          minLength={8}
                          maxLength={500}
                          value={settingsReason}
                          onChange={(e) => setSettingsReason(e.target.value)}
                          placeholder="Descreva o motivo para o histórico de auditoria"
                        />
                      </label>
                    </fieldset>
                    <button
                      type="submit"
                      className="sec-button sec-button-primary"
                      disabled={busy}
                    >
                      {busy ? (
                        <LoaderCircle size={17} className="sec-spin" />
                      ) : (
                        <Check size={17} />
                      )}
                      Salvar configurações
                    </button>
                  </div>
                </form>
              )}
              {tab === "audit" && (
                <section className="sec-panel">
                  <div className="sec-panel-title">
                    <div>
                      <h2>TRILHA DE AUDITORIA</h2>
                      <p>
                        Histórico permanente de ações administrativas. Nenhum
                        registro pode ser editado por este painel.
                      </p>
                    </div>
                    <ShieldCheck size={23} />
                  </div>
                  {data.audit.length ? (
                    <div className="sec-audit-list">
                      {data.audit.map((entry) => (
                        <article key={entry.id}>
                          <span>
                            <ShieldCheck size={19} />
                          </span>
                          <div>
                            <h3>
                              {(
                                {
                                  "candidate.save": "Candidato atualizado",
                                  "settings.save": "Configurações alteradas",
                                  "transaction.reverse":
                                    "Movimentação estornada",
                                } as Record<string, string>
                              )[entry.operation] ?? entry.operation}
                            </h3>
                            <p>{entry.reason}</p>
                            <small>
                              {entry.actorName ?? "Administrador"} ·{" "}
                              {new Date(entry.createdAt).toLocaleString(
                                "pt-BR",
                              )}
                            </small>
                          </div>
                          <code title={entry.id}>{entry.id.slice(0, 8)}</code>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="sec-empty">
                      <ShieldCheck size={30} />
                      <h3>Nenhuma alteração administrativa.</h3>
                      <p>
                        As próximas ações da equipe ficarão registradas aqui.
                      </p>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}
      <Dialog.Root
        open={!!draft}
        onOpenChange={(open) => {
          if (!open && !busy) setDraft(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="sec-modal-overlay" />
          <Dialog.Content className="sec-modal">
            <Dialog.Title>
              {draft?.id ? "Editar candidato" : "Novo candidato"}
            </Dialog.Title>
            <Dialog.Description>
              Nome, identidade visual e visibilidade na corrida.
            </Dialog.Description>
            <Dialog.Close
              className="sec-modal-close"
              disabled={busy}
              aria-label="Fechar"
            >
              <X size={19} />
            </Dialog.Close>
            {draft && (
              <form onSubmit={submitCandidate}>
                {modalError && <ErrorState error={modalError} />}
                <div className="sec-form-row">
                  <label>
                    Nome completo
                    <input
                      autoFocus
                      required
                      maxLength={80}
                      value={draft.name}
                      onChange={(e) =>
                        setDraft({ ...draft, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Nome no placar
                    <input
                      required
                      maxLength={30}
                      value={draft.shortName}
                      onChange={(e) =>
                        setDraft({ ...draft, shortName: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label>
                  Avatar (URL HTTPS ou caminho local)
                  <input
                    value={draft.avatar}
                    maxLength={1000}
                    placeholder="https://... ou /runners.webp#0"
                    onChange={(e) =>
                      setDraft({ ...draft, avatar: e.target.value })
                    }
                  />
                  <small>Deixe vazio para usar as iniciais do candidato.</small>
                </label>
                <div className="sec-avatar-editor">
                  <CandidateAvatar candidate={draft} />
                  <label>
                    Cor do candidato
                    <input
                      type="color"
                      value={draft.color}
                      onChange={(e) =>
                        setDraft({ ...draft, color: e.target.value })
                      }
                    />
                  </label>
                  <label className="sec-check-label">
                    <input
                      type="checkbox"
                      checked={draft.active}
                      onChange={(e) =>
                        setDraft({ ...draft, active: e.target.checked })
                      }
                    />
                    Visível na corrida
                  </label>
                </div>
                <label>
                  Motivo do registro
                  <input
                    required
                    minLength={8}
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Motivo desta alteração"
                  />
                </label>
                <button
                  className="sec-button sec-button-primary"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? (
                    <LoaderCircle className="sec-spin" size={17} />
                  ) : (
                    <Check size={17} />
                  )}
                  Salvar candidato
                </button>
              </form>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={!!hideTarget}
        onOpenChange={(open) => {
          if (!open && !busy) setHideTarget(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="sec-modal-overlay" />
          <Dialog.Content className="sec-modal">
            <Dialog.Title>
              {hideTarget?.active ? "Ocultar" : "Mostrar"}{" "}
              {hideTarget?.shortName}?
            </Dialog.Title>
            <Dialog.Description>
              {hideTarget?.active
                ? "O candidato sairá da disputa visível. Seu histórico e sua pontuação serão preservados. O confronto principal será recalculado."
                : "O candidato voltará ao ranking e poderá integrar o confronto principal conforme sua pontuação."}
            </Dialog.Description>
            <Dialog.Close
              className="sec-modal-close"
              disabled={busy}
              aria-label="Fechar"
            >
              <X size={19} />
            </Dialog.Close>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!hideTarget) return;
                const { id, name, shortName, avatar, color, active } =
                  hideTarget;
                if (
                  await mutate(
                    "candidate.save",
                    { id, name, shortName, avatar, color, active: !active },
                    reason,
                  )
                )
                  setHideTarget(null);
              }}
            >
              {modalError && <ErrorState error={modalError} />}
              <label>
                Motivo
                <input
                  required
                  minLength={8}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button
                type="submit"
                className="sec-button sec-button-primary"
                disabled={busy}
              >
                {busy && <LoaderCircle size={16} className="sec-spin" />}
                Confirmar alteração
              </button>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={!!reverse}
        onOpenChange={(open) => {
          if (!open && !busy) setReverse(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="sec-modal-overlay" />
          <Dialog.Content className="sec-modal">
            <Dialog.Title>Estornar movimentação?</Dialog.Title>
            <Dialog.Description>
              Esta ação reverte os pontos desta participação com um registro de
              compensação. A transação original permanece no histórico. A
              devolução financeira depende do gateway e deve ser verificada
              separadamente.
            </Dialog.Description>
            <Dialog.Close
              className="sec-modal-close"
              disabled={busy}
              aria-label="Fechar"
            >
              <X size={19} />
            </Dialog.Close>
            {reverse && (
              <div className="sec-reverse-summary">
                <span>
                  {
                    data?.candidates.find((c) => c.id === reverse.candidateId)
                      ?.name
                  }
                  <small>{reverse.id}</small>
                </span>
                <strong>{money(reverse.amount)}</strong>
              </div>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  reverse &&
                  (await mutate(
                    "transaction.reverse",
                    { transactionId: reverse.id },
                    reason,
                  ))
                ) {
                  setReverse(null);
                  setReason("");
                }
              }}
            >
              {modalError && <ErrorState error={modalError} />}
              <label>
                Por que esta movimentação é inválida?
                <textarea
                  required
                  minLength={8}
                  maxLength={500}
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Informe o motivo do estorno para o registro permanente."
                />
              </label>
              <button
                className="sec-button sec-danger-button"
                disabled={busy}
                type="submit"
              >
                {busy && <LoaderCircle size={17} className="sec-spin" />}
                Confirmar estorno de pontos
              </button>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}
