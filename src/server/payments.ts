import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { ApiError } from "./errors";
import { mode, type Database } from "./db";
import { publicTransaction, settle } from "./game";
import { completeWithdrawal, decryptFinancial, failWithdrawal } from "./creators";

const API = "https://api.depixapp.com";
export interface DepixCheckout {
  id: string; status: string; amount: number; is_live: boolean | number;
  payment_method?: string; payment_url?: string; expires_at?: string;
  metadata?: Record<string, unknown>;
  pix?: { qr_code?: string; qr_code_base64?: string }; pix_payload?: string;
}

async function gateway<T>(path: string, init?: RequestInit): Promise<T> {
  const token = process.env.DEPIX_API_KEY;
  if (!token) throw new ApiError(503, "Pix ainda não foi configurado.");
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json", ...init?.headers },
      signal: AbortSignal.timeout(15000), cache: "no-store",
    });
  } catch { throw new ApiError(503, "Provedor indisponível. Tente novamente com a mesma operação."); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body?.message === "string" ? body.message : undefined;
    throw new ApiError(response.status >= 500 ? 503 : 422, detail || (response.status >= 500 ? "O provedor está indisponível. Tente novamente." : "O provedor não aceitou a operação. Revise os dados."));
  }
  return body as T;
}
const unwrapCheckout = (value: unknown): DepixCheckout => {
  const body = value as { checkout?: DepixCheckout };
  return body.checkout || (value as DepixCheckout);
};
export function verifyPayment(checkout: DepixCheckout, row: Record<string, unknown>) {
  const expectedId = row.provider_id == null ? checkout.id : String(row.provider_id);
  const metadataId = checkout.metadata?.transaction_id ?? checkout.metadata?.order_id;
  if (String(checkout.id) !== expectedId || Number(checkout.amount) !== Number(row.amount_cents) ||
      (metadataId != null && String(metadataId) !== String(row.id)) ||
      (checkout.payment_method && checkout.payment_method !== "pix") ||
      (mode() === "production" && !Boolean(checkout.is_live)))
    throw new ApiError(409, "A cobrança recebida não corresponde à transação registrada.");
}
export async function ensureCharge(db: Database, row: Record<string, unknown>) {
  if (mode() === "sandbox" || row.status !== "pending" || row.provider_id) return publicTransaction(row);
  if (!process.env.APP_ORIGIN?.startsWith("https://") || !process.env.DEPIX_WEBHOOK_SECRET)
    throw new ApiError(503, "Pix requer origem HTTPS e webhook configurado.");
  if (!row.payer_tax_number_ciphertext) throw new ApiError(422, "Informe o CPF ou CNPJ do pagador.");
  const checkout = unwrapCheckout(await gateway<unknown>("/api/checkouts", {
    method: "POST", headers: { "Idempotency-Key": String(row.id) },
    body: JSON.stringify({ amount: Number(row.amount_cents), payer_tax_number: decryptFinancial(String(row.payer_tax_number_ciphertext)),
      payment_method: "pix", description: "CORRIDA 26 — participação simbólica", expires_in: 1200,
      callback_url: `${process.env.APP_ORIGIN}/api/webhooks/depix`, redirect_url: `${process.env.APP_ORIGIN}/`,
      metadata: { transaction_id: row.id, purchase_type: row.purchase_type_id || "score_participation" } }),
  }));
  verifyPayment(checkout, { ...row, provider_id: checkout.id });
  await db.query(`UPDATE transactions SET provider_id=$1,provider_status=$2,provider_live=$3,provider_payload=$4::jsonb,updated_at=now() WHERE id=$5 AND provider_id IS NULL`,
    [checkout.id, checkout.status, Boolean(checkout.is_live), JSON.stringify(checkout), row.id]);
  const persisted = (await db.query("SELECT * FROM transactions WHERE id=$1", [row.id])).rows[0];
  if (checkout.status === "completed") return settle(db, String(row.id), "paid");
  return publicTransaction(persisted);
}
export async function reconcile(db: Database, row: Record<string, unknown>, receipt?: { key: string; providerId: string }) {
  if (mode() === "sandbox" || !row.provider_id) return publicTransaction(row);
  const checkout = unwrapCheckout(await gateway<unknown>(`/api/checkouts/${encodeURIComponent(String(row.provider_id))}`));
  verifyPayment(checkout, row);
  const providerPayload = {
    ...((row.provider_payload as Record<string, unknown> | null) || {}),
    ...checkout,
  };
  await db.query("UPDATE transactions SET provider_status=$1,provider_live=$2,provider_payload=$3::jsonb,updated_at=now() WHERE id=$4",
    [checkout.status, Boolean(checkout.is_live), JSON.stringify(providerPayload), row.id]);
  if (checkout.status === "completed") return settle(db, String(row.id), "paid", receipt);
  if (checkout.status === "refunded") return settle(db, String(row.id), "refunded", receipt);
  if (["cancelled", "expired"].includes(checkout.status)) return settle(db, String(row.id), checkout.status === "expired" ? "expired" : "failed", receipt);
  return publicTransaction({ ...row, provider_payload: providerPayload });
}
export function validateWebhook(signature: string | null, eventId: string | null, rawBody: string, secret: string, now = Date.now()) {
  if (!signature || !eventId || eventId.length > 200) throw new ApiError(401, "Assinatura ausente ou inválida.");
  const fields = Object.fromEntries(signature.split(",").map((part) => part.trim().split("=")));
  const ts = fields.t, actual = fields.v1;
  if (!/^\d{10}$/.test(ts || "") || !/^[a-f0-9]{64}$/i.test(actual || "")) throw new ApiError(401, "Assinatura inválida.");
  if (Math.abs(now - Number(ts) * 1000) > 5 * 60000) throw new ApiError(401, "Notificação expirada.");
  const expected = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest();
  const supplied = Buffer.from(actual, "hex");
  if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) throw new ApiError(401, "Assinatura inválida.");
  return { key: createHash("sha256").update(eventId).digest("hex"), eventId };
}
function providerObjectId(payload: Record<string, unknown>) {
  const data = payload.data as Record<string, unknown> | undefined, checkout = payload.checkout as Record<string, unknown> | undefined,
    withdrawal = payload.withdrawal as Record<string, unknown> | undefined;
  return String(data?.id || checkout?.id || withdrawal?.id || payload.id || "");
}
export async function handleWebhook(req: NextRequest, db: Database) {
  if (mode() !== "production") throw new ApiError(403, "Webhook real indisponível no sandbox.");
  const secret = process.env.DEPIX_WEBHOOK_SECRET;
  if (!secret) throw new ApiError(503, "Webhook não configurado.");
  const raw = await req.text();
  const receipt = validateWebhook(req.headers.get("x-depix-signature"), req.headers.get("x-depix-event-id"), raw, secret);
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw); } catch { throw new ApiError(400, "JSON inválido."); }
  const providerId = providerObjectId(payload);
  if (!providerId) throw new ApiError(400, "Identificador do evento ausente.");
  const tx = (await db.query("SELECT * FROM transactions WHERE provider_id=$1", [providerId])).rows[0];
  if (tx) { await reconcile(db, tx, { key: receipt.key, providerId }); return { received: true }; }
  const withdrawal = (await db.query("SELECT * FROM withdrawals WHERE provider_id=$1", [providerId])).rows[0];
  if (withdrawal) { await reconcileWithdrawal(db, withdrawal); return { received: true }; }
  throw new ApiError(503, "Operação ainda não registrada. Reenviar notificação.");
}
export async function createWithdrawalQuote(db: Database, row: Record<string, unknown>) {
  if (mode() === "sandbox") {
    const providerId = `sandbox-${row.id}`;
    await db.query("UPDATE withdrawals SET status='processing',provider_id=$2,updated_at=now() WHERE id=$1", [row.id, providerId]);
    return { ...row, status: "processing", provider_id: providerId, requiresFunding: true };
  }
  const result = await gateway<Record<string, unknown>>("/api/withdraw", {
    method: "POST", headers: { "Idempotency-Key": String(row.id) },
    body: JSON.stringify({ pixKey: decryptFinancial(String(row.pix_key_ciphertext)), payoutAmountInCents: Number(row.amount_cents),
      taxNumber: decryptFinancial(String(row.recipient_tax_number_ciphertext)) }),
  });
  const providerId = String(result.id || (result.withdrawal as Record<string, unknown> | undefined)?.id || "");
  if (!providerId) throw new ApiError(502, "O provedor não retornou o identificador do saque.");
  await db.query("UPDATE withdrawals SET status='processing',provider_id=$2,provider_payload=$3::jsonb,updated_at=now() WHERE id=$1",
    [row.id, providerId, JSON.stringify(result)]);
  return { ...row, status: "processing", provider_id: providerId, requiresFunding: true };
}
export async function reconcileWithdrawal(db: Database, row: Record<string, unknown>) {
  if (!row.provider_id || mode() === "sandbox") return row;
  const response = await gateway<Record<string, unknown>>(`/api/withdrawals/${encodeURIComponent(String(row.provider_id))}`);
  const item = (response.withdrawal as Record<string, unknown> | undefined) || response;
  const status = String(item.status || "processing");
  if (["sent", "confirmed", "completed"].includes(status)) await completeWithdrawal(db, String(row.id), String(row.provider_id), item);
  else if (["failed", "cancelled", "expired", "refunded"].includes(status)) await failWithdrawal(db, String(row.id), `DePix: ${status}`);
  else await db.query("UPDATE withdrawals SET provider_payload=$2::jsonb,updated_at=now() WHERE id=$1", [row.id, JSON.stringify(item)]);
  return (await db.query("SELECT * FROM withdrawals WHERE id=$1", [row.id])).rows[0];
}
