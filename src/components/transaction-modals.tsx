"use client";
import { useEffect, useState, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  Plus,
  Minus,
  ArrowRight,
  ShieldCheck,
  LoaderCircle,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  UserRound,
  Mail,
  ArrowUpRight,
} from "lucide-react";
import { useRace } from "./race-provider";
import { Action, Transaction, money, number } from "@/lib/types";
type Selection = {
  candidateId: string;
  action: Action;
  amount?: number;
} | null;
export function CheckoutModal({
  selection,
  onClose,
}: {
  selection: Selection;
  onClose: () => void;
}) {
  const { board, user, api, refresh, openLogin } = useRace();
  const [amount, setAmount] = useState("20"),
    [action, setAction] = useState<Action>("add"),
    [candidateId, setCandidateId] = useState(""),
    [email, setEmail] = useState(""),
    [taxNumber, setTaxNumber] = useState(""),
    [transaction, setTransaction] = useState<Transaction | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  const key = useRef("");
  useEffect(() => {
    if (selection) {
      setAmount(
        String(selection.amount ?? board?.settings.quickAmounts[1] ?? 10),
      );
      setAction(selection.action);
      setCandidateId(selection.candidateId);
      setTransaction(null);
      setError("");
      setBusy(false);
      key.current = crypto.randomUUID();
    }
  }, [selection]);
  useEffect(() => {
    if (!transaction || transaction.status !== "pending") return;
    let active = true;
    const timer = setInterval(() => {
      api<Transaction>(`/api/transactions/${transaction.id}`)
        .then((t) => {
          if (active) {
            setTransaction(t);
            if (t.status === "paid") void refresh();
          }
        })
        .catch(() => {});
    }, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [transaction?.id, transaction?.status, api, refresh]);
  const candidate = board?.candidates.find((c) => c.id === candidateId);
  const top = board?.candidates.slice(0, 2) || [];
  const opponent = top.find((c) => c.id !== selection?.candidateId);
  const value = Number(amount.replace(",", "."));
  const valid =
    Number.isInteger(value) &&
    value >= (board?.settings.minAmount || 5) &&
    value <= 10000;
  const canAnonymous = board?.settings.anonymousEnabled;
  async function create() {
    setBusy(true);
    setError("");
    try {
      const result = await api<Transaction>("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          candidateId,
          action,
          amount: value,
          idempotencyKey: key.current,
          email: email || user?.email,
          taxNumber,
        }),
      });
      setTransaction(result);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível gerar o pagamento.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function confirm(outcome: "paid" | "failed") {
    if (!transaction) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ transaction: Transaction }>(
        "/api/sandbox/confirm",
        {
          method: "POST",
          body: JSON.stringify({ transactionId: transaction.id, outcome }),
        },
      );
      setTransaction(result.transaction);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível confirmar.");
    } finally {
      setBusy(false);
    }
  }
  const paid = transaction?.status === "paid";
  const failed =
    transaction &&
    ["failed", "expired", "cancelled", "refunded"].includes(transaction.status);
  return (
    <Dialog.Root
      open={!!selection}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault();
          }}
        >
          <Dialog.Close
            className="dialog-close"
            aria-label="Fechar"
            disabled={busy}
          >
            <X size={21} />
          </Dialog.Close>
          <span className="eyebrow">
            {board?.mode === "sandbox"
              ? "PARTICIPAÇÃO DE DEMONSTRAÇÃO"
              : "PARTICIPE DA CORRIDA"}
          </span>
          <Dialog.Title>
            {paid
              ? "MOVIMENTO CONFIRMADO."
              : transaction
                ? "SEU PRÓXIMO MOVIMENTO."
                : "QUANTO VOCÊ QUER MOVIMENTAR?"}
          </Dialog.Title>
          <Dialog.Description>
            {paid
              ? "O servidor confirmou a movimentação. O placar já está atualizado."
              : "Cada R$ 1 corresponde a 1 ponto simbólico dentro do jogo."}
          </Dialog.Description>
          {!transaction ? (
            <>
              <div className="checkout-target">
                <span
                  className="target-dot"
                  style={{ background: candidate?.color }}
                />
                <span>
                  {action === "add"
                    ? "Adicionar pontos a"
                    : "Retirar pontos de"}{" "}
                  <b>{candidate?.name}</b>
                </span>
              </div>
              {selection?.amount === undefined && (
                <div className="action-choice">
                  <button
                    className={action === "add" ? "selected" : ""}
                    onClick={() => {
                      setAction("add");
                      setCandidateId(selection?.candidateId || "");
                      key.current = crypto.randomUUID();
                    }}
                  >
                    <Plus size={15} /> Adicionar a{" "}
                    {
                      board?.candidates.find(
                        (c) => c.id === selection?.candidateId,
                      )?.shortName
                    }
                  </button>
                  <button
                    className={action === "remove" ? "selected" : ""}
                    onClick={() => {
                      setAction("remove");
                      setCandidateId(
                        selection?.action === "remove"
                          ? selection.candidateId
                          : opponent?.id || selection?.candidateId || "",
                      );
                      key.current = crypto.randomUUID();
                    }}
                  >
                    <Minus size={15} /> Retirar de{" "}
                    {selection?.action === "remove"
                      ? candidate?.shortName
                      : opponent?.shortName || candidate?.shortName}
                  </button>
                </div>
              )}
              <label
                className="amount-input-label"
                htmlFor="participation-amount"
              >
                Valor da participação
              </label>
              <div className="currency-input">
                <span>R$</span>
                <input
                  id="participation-amount"
                  inputMode="numeric"
                  type="number"
                  min={board?.settings.minAmount || 5}
                  max="10000"
                  step="1"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    key.current = crypto.randomUUID();
                  }}
                />
                <span>,00</span>
              </div>
              <p className="field-hint">
                Mínimo de {money(board?.settings.minAmount || 5)}. Valores
                inteiros, até R$ 10.000.
              </p>
              <div className="checkout-summary">
                <span>Seu movimento</span>
                <strong>
                  {action === "add" ? "+" : "−"}
                  {valid ? number(value) : "—"} pontos
                </strong>
              </div>
              {board?.mode === "production" && !user?.email && (
                <label className="form-label">
                  E-mail para o pagamento
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    placeholder="voce@exemplo.com"
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
              )}
              {board?.mode === "production" && (
                <label className="form-label">
                  CPF ou CNPJ do pagador
                  <input
                    inputMode="numeric"
                    autoComplete="off"
                    value={taxNumber}
                    placeholder="Somente números"
                    maxLength={18}
                    onChange={(e) => setTaxNumber(e.target.value.replace(/\D/g, "").slice(0, 14))}
                  />
                  <small>Enviado com criptografia apenas para gerar a cobrança Pix.</small>
                </label>
              )}
              {!canAnonymous && (!user || user.anonymous) ? (
                <button
                  className="button button-primary wide"
                  onClick={openLogin}
                >
                  <UserRound size={17} /> Entre para participar
                </button>
              ) : (
                <button
                  className="button button-primary wide"
                  disabled={
                    !valid ||
                    busy ||
                    !board?.settings.paymentsEnabled ||
                    (board.mode === "production" &&
                      !user?.email &&
                      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
                    (board?.mode === "production" && !/^\d{11}$|^\d{14}$/.test(taxNumber))
                  }
                  onClick={() => void create()}
                >
                  {busy ? <LoaderCircle className="spin" size={18} /> : null}
                  {busy
                    ? "Gerando cobrança…"
                    : board?.mode === "sandbox"
                      ? "Testar movimentação"
                      : "Gerar Pix"}
                  {!busy && <ArrowRight size={18} />}
                </button>
              )}
              {!board?.settings.paymentsEnabled && (
                <p className="inline-notice">
                  {board?.readOnly
                    ? "As participações serão liberadas após a conexão segura do banco e do gateway Pix."
                    : "As participações estão temporariamente pausadas."}
                </p>
              )}
              <p className="modal-legal">
                <ShieldCheck size={14} /> Participação simbólica. Sem vínculo
                com candidato ou campanha.
              </p>
            </>
          ) : paid ? (
            <div className="payment-success">
              <CheckCircle2 size={56} />
              <strong>
                {transaction.action === "add" ? "+" : "−"}
                {number(transaction.points)} PONTOS
              </strong>
              <p>{candidate?.name}</p>
              <button className="button button-primary wide" onClick={onClose}>
                Voltar para a corrida <ArrowRight size={17} />
              </button>
            </div>
          ) : failed ? (
            <div className="payment-failed">
              <AlertCircle size={42} />
              <h3>
                {transaction.status === "failed"
                  ? "Pagamento não confirmado"
                  : "Pagamento encerrado"}
              </h3>
              <p>
                Nenhum novo ponto foi aplicado. Você pode gerar outra cobrança.
              </p>
              <button
                className="button wide"
                onClick={() => {
                  setTransaction(null);
                  key.current = crypto.randomUUID();
                }}
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <>
              <div className="payment-amount">
                <span>Valor a pagar</span>
                <strong>{money(transaction.amount)}</strong>
              </div>
              {board?.mode === "sandbox" ? (
                <div className="sandbox-confirm">
                  <span className="badge">AMBIENTE DE TESTE</span>
                  <p>
                    Nenhum dinheiro é movimentado. Escolha uma resposta do
                    gateway para testar a validação do servidor.
                  </p>
                  <button
                    className="button button-primary wide"
                    disabled={busy}
                    onClick={() => void confirm("paid")}
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <Check size={17} />
                    )}{" "}
                    Simular pagamento aprovado
                  </button>
                  <button
                    className="button wide"
                    disabled={busy}
                    onClick={() => void confirm("failed")}
                  >
                    Simular falha no pagamento
                  </button>
                </div>
              ) : (
                <div className="pix-payment">
                  {transaction.qrImage && (
                    <img
                      width={224}
                      height={224}
                      src={
                        transaction.qrImage.startsWith("data:")
                          ? transaction.qrImage
                          : `data:image/png;base64,${transaction.qrImage}`
                      }
                      alt="QR Code para pagamento Pix"
                    />
                  )}
                  {transaction.qrCode && (
                    <>
                      <label className="form-label">
                        Pix copia e cola
                        <textarea readOnly value={transaction.qrCode} />
                      </label>
                      <button
                        className="button wide"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              transaction.qrCode!,
                            );
                            setCopied(true);
                          } catch {
                            setError("Copie o código no campo acima.");
                          }
                        }}
                      >
                        {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
                        {copied ? "Código copiado" : "Copiar código Pix"}
                      </button>
                    </>
                  )}
                  {transaction.paymentUrl && (
                    <a className="button button-primary wide" href={transaction.paymentUrl} target="_blank" rel="noopener noreferrer">
                      Abrir pagamento Pix <ArrowUpRight size={16} />
                    </a>
                  )}
                  <p className="awaiting-payment">
                    <LoaderCircle className="spin" size={15} /> Aguardando
                    confirmação do pagamento…
                  </p>
                  {transaction.expiresAt && (
                    <p className="field-hint">
                      Válido até{" "}
                      {new Date(transaction.expiresAt).toLocaleString("pt-BR")}
                    </p>
                  )}
                </div>
              )}
              <p className="transaction-reference">
                Transação {transaction.id.slice(0, 8)} · O placar muda somente
                após confirmação.
              </p>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              <AlertCircle size={15} />
              {error}
            </p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function LoginModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { board, api, refresh, authConfigured, supabase } = useRace();
  const [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  useEffect(() => {
    if (open) {
      setError("");
      setSent(false);
    }
  }, [open]);
  async function login(mode: "email" | "google" | "demo") {
    setBusy(true);
    setError("");
    try {
      if (mode === "demo") {
        await api("/api/auth/demo", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim() || "Participante de teste",
            email: email || undefined,
          }),
        });
        await refresh();
        onClose();
      } else if (supabase) {
        if (mode === "google") {
          const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: `${window.location.origin}/conta` },
          });
          if (error) throw error;
        } else {
          const { error } = await supabase.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: `${window.location.origin}/conta` },
          });
          if (error) throw error;
          setSent(true);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content login-modal">
          <Dialog.Close className="dialog-close" aria-label="Fechar login">
            <X size={21} />
          </Dialog.Close>
          <div className="login-icon">
            <UserRound size={24} />
          </div>
          <span className="eyebrow">CORRIDA 26</span>
          <Dialog.Title>ENTRE NA DISPUTA.</Dialog.Title>
          <Dialog.Description>
            Acompanhe suas participações em um só lugar.
          </Dialog.Description>
          {authConfigured ? (
            <>
              <button
                className="button wide google-button"
                disabled={busy}
                onClick={() => void login("google")}
              >
                <b>G</b> Continuar com Google
              </button>
              <div className="login-divider">ou use seu e-mail</div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void login("email");
                }}
              >
                <label className="form-label">
                  E-mail
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@exemplo.com"
                    autoComplete="email"
                  />
                </label>
                <button className="button button-primary wide" disabled={busy}>
                  {busy ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <Mail size={17} />
                  )}{" "}
                  Receber link de acesso
                </button>
              </form>
              {sent && (
                <p className="inline-success" role="status">
                  Confira seu e-mail para acessar com segurança.
                </p>
              )}
            </>
          ) : board?.mode === "sandbox" ? (
            <>
              <p className="inline-notice">
                Sessão de demonstração. Google e e-mail serão habilitados após
                conectar o Supabase.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void login("demo");
                }}
              >
                <label className="form-label">
                  Como podemos chamar você?
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={50}
                    required
                    placeholder="Seu nome"
                    autoComplete="given-name"
                  />
                </label>
                <button className="button button-primary wide" disabled={busy}>
                  {busy ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <UserRound size={17} />
                  )}{" "}
                  Criar sessão de teste
                </button>
              </form>
            </>
          ) : (
            <p className="inline-notice">
              O acesso está temporariamente indisponível. Tente novamente mais
              tarde.
            </p>
          )}
          {board?.settings.anonymousEnabled && (
            <button className="anonymous-link" onClick={onClose}>
              Continuar anonimamente <ArrowRight size={14} />
            </button>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <p className="modal-legal">
            Ao participar, você reconhece o caráter simbólico e paródico da
            plataforma.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
