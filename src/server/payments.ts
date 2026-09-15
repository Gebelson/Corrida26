import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { ApiError } from "./security";
import { mode, type Database } from "./db";
import { publicTransaction, settle } from "./game";

export interface ProviderPayment {
  id: number | string;
  status: string;
  transaction_amount: number;
  currency_id: string;
  external_reference: string;
  payment_method_id: string;
  live_mode: boolean;
  point_of_interaction?: {
    transaction_data?: { qr_code?: string; qr_code_base64?: string };
  };
  date_of_expiration?: string;
}
async function gateway(
  path: string,
  init?: RequestInit,
): Promise<ProviderPayment> {
  if (!process.env.MERCADOPAGO_ACCESS_TOKEN)
    throw new ApiError(503, "Pix ainda não foi configurado.");
  let response: Response;
  try {
    response = await fetch(`https://api.mercadopago.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      503,
      "Provedor indisponível. Tente novamente com a mesma participação.",
    );
  }
  if (!response.ok) {
    throw new ApiError(
      response.status >= 500 ? 503 : 422,
      response.status >= 500
        ? "O provedor está indisponível. Tente novamente."
        : "O provedor não conseguiu gerar o Pix. Revise o e-mail e tente novamente.",
    );
  }
  return response.json();
}
export function verifyPayment(
  payment: ProviderPayment,
  row: Record<string, unknown>,
) {
  if (
    String(payment.id) !== String(row.provider_id) ||
    payment.external_reference !== row.id ||
    Math.round(payment.transaction_amount * 100) !== Number(row.amount_cents) ||
    payment.currency_id !== "BRL" ||
    payment.payment_method_id !== "pix" ||
    (mode() === "production" && !payment.live_mode)
  )
    throw new ApiError(
      409,
      "A cobrança recebida não corresponde à transação registrada.",
    );
}
export async function ensureCharge(db: Database, row: Record<string, unknown>) {
  if (mode() === "sandbox" || row.status !== "pending" || row.provider_id)
    return publicTransaction(row);
  if (
    !process.env.APP_ORIGIN?.startsWith("https://") ||
    !process.env.MERCADOPAGO_WEBHOOK_SECRET
  )
    throw new ApiError(503, "Pix requer origem HTTPS e webhook configurado.");
  // The persisted transaction UUID is also the provider idempotency key. Timeouts may be retried safely.
  const payment = await gateway("/v1/payments", {
    method: "POST",
    headers: { "X-Idempotency-Key": String(row.id) },
    body: JSON.stringify({
      transaction_amount: Number(row.amount_cents) / 100,
      description: "CORRIDA 26 — pontos simbólicos na paródia",
      payment_method_id: "pix",
      payer: { email: row.payer_email },
      external_reference: row.id,
      notification_url: `${process.env.APP_ORIGIN}/api/webhooks/mercadopago?source_news=webhooks`,
      date_of_expiration: new Date(Date.now() + 30 * 60000).toISOString(),
    }),
  });
  verifyPayment(payment, { ...row, provider_id: String(payment.id) });
  await db.query(
    "UPDATE transactions SET provider_id=$1,provider_payload=$2::jsonb,updated_at=now() WHERE id=$3 AND provider_id IS NULL",
    [
      String(payment.id),
      JSON.stringify({
        point_of_interaction: payment.point_of_interaction,
        date_of_expiration: payment.date_of_expiration,
      }),
      row.id,
    ],
  );
  if (payment.status === "approved") return settle(db, String(row.id), "paid");
  return publicTransaction(
    (await db.query("SELECT * FROM transactions WHERE id=$1", [row.id]))
      .rows[0],
  );
}
export async function reconcile(
  db: Database,
  row: Record<string, unknown>,
  receipt?: { key: string; providerId: string },
) {
  if (mode() === "sandbox" || !row.provider_id) return publicTransaction(row);
  const payment = await gateway(
    `/v1/payments/${encodeURIComponent(String(row.provider_id))}`,
  );
  verifyPayment(payment, row);
  if (payment.status === "approved")
    return settle(db, String(row.id), "paid", receipt);
  if (["refunded", "charged_back"].includes(payment.status))
    return settle(db, String(row.id), "refunded", receipt);
  if (["rejected", "cancelled"].includes(payment.status))
    return settle(db, String(row.id), "failed", receipt);
  // Do not infer failure from a local clock: a provider may approve an in-flight Pix after its expiry.
  return publicTransaction(row);
}
export function validateWebhook(
  signature: string | null,
  requestId: string | null,
  providerId: string | null,
  secret: string,
  now = Date.now(),
) {
  if (
    !signature ||
    !requestId ||
    !providerId ||
    !/^\d+$/.test(providerId) ||
    requestId.length > 200
  )
    throw new ApiError(401, "Assinatura ausente ou inválida.");
  const fields = Object.fromEntries(
    signature.split(",").map((part) => part.trim().split("=")),
  );
  const ts = fields.ts;
  const actual = fields.v1;
  if (!/^\d{10,13}$/.test(ts || "") || !/^[a-f0-9]{64}$/i.test(actual || ""))
    throw new ApiError(401, "Assinatura inválida.");
  const time = Number(ts) * (ts.length === 10 ? 1000 : 1);
  if (Math.abs(now - time) > 5 * 60000)
    throw new ApiError(401, "Notificação expirada.");
  const expected = createHmac("sha256", secret)
    .update(`id:${providerId.toLowerCase()};request-id:${requestId};ts:${ts};`)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(actual, "hex")))
    throw new ApiError(401, "Assinatura inválida.");
  return {
    key: createHash("sha256")
      .update(`${requestId}:${ts}:${actual}`)
      .digest("hex"),
    providerId,
  };
}
export async function handleWebhook(req: NextRequest, db: Database) {
  if (mode() !== "production")
    throw new ApiError(403, "Webhook real indisponível no sandbox.");
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) throw new ApiError(503, "Webhook não configurado.");
  const receipt = validateWebhook(
    req.headers.get("x-signature"),
    req.headers.get("x-request-id"),
    new URL(req.url).searchParams.get("data.id"),
    secret,
  );
  const row = (
    await db.query("SELECT * FROM transactions WHERE provider_id=$1", [
      receipt.providerId,
    ])
  ).rows[0];
  // A webhook may arrive before the create request persists the provider response. Retry with 503.
  if (!row)
    throw new ApiError(
      503,
      "Cobrança ainda não registrada. Reenviar notificação.",
    );
  await reconcile(db, row, receipt);
  return { received: true };
}
