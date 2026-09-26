import { request as httpsRequest } from "node:https";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDB } from "@/server/db";
import { decryptFinancial } from "@/server/creators";
import {
  ApiError,
  checkOrigin,
  getSession,
  ipKey,
  rateLimit,
  readJson,
  route,
} from "@/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EfiParticipant = {
  identificador?: unknown;
  nome?: unknown;
  logo?: unknown;
};

type EfiInitiation = {
  identificadorPagamento?: unknown;
  redirectURI?: unknown;
};

type EfiToken = {
  access_token?: unknown;
  expires_in?: unknown;
};

type EfiRequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  token?: string;
  basic?: string;
  idempotencyKey?: string;
};

type ProviderPayload = {
  initiation?: {
    redirectURI?: unknown;
    participantId?: unknown;
  };
  pix?: { qr_code?: unknown };
  pix_payload?: unknown;
  point_of_interaction?: {
    transaction_data?: { qr_code?: unknown };
  };
};

const inputSchema = z.object({
  transactionId: z.string().uuid(),
  participantId: z.string().trim().min(1).max(120),
});

const baseUrl = () =>
  process.env.EFI_OPEN_FINANCE_ENV === "production"
    ? "https://openfinance.api.efipay.com.br"
    : "https://openfinance-h.api.efipay.com.br";

function configured() {
  return Boolean(
    process.env.EFI_OPEN_FINANCE_ENABLED === "true" &&
      process.env.EFI_OPEN_FINANCE_CLIENT_ID?.trim() &&
      process.env.EFI_OPEN_FINANCE_CLIENT_SECRET?.trim() &&
      process.env.EFI_OPEN_FINANCE_P12_BASE64?.trim(),
  );
}

function certificate() {
  const encoded = process.env.EFI_OPEN_FINANCE_P12_BASE64?.replace(/\s/g, "");
  if (!encoded || !process.env.EFI_OPEN_FINANCE_CLIENT_ID || !process.env.EFI_OPEN_FINANCE_CLIENT_SECRET)
    throw new ApiError(503, "Pagamento direto no banco ainda não está configurado.");
  return Buffer.from(encoded, "base64");
}

async function efiRequest<T>(
  path: string,
  options: EfiRequestOptions = {},
): Promise<T> {
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  return new Promise<T>((resolve, reject) => {
    const request = httpsRequest(
      new URL(path, baseUrl()),
      {
        method: options.method || "GET",
        pfx: certificate(),
        passphrase: process.env.EFI_OPEN_FINANCE_P12_PASSPHRASE || undefined,
        rejectUnauthorized: true,
        headers: {
          Accept: "application/json",
          ...(body
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body).toString(),
              }
            : {}),
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
          ...(options.basic ? { Authorization: `Basic ${options.basic}` } : {}),
          ...(options.idempotencyKey
            ? { "x-idempotency-key": options.idempotencyKey }
            : {}),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 1_000_000) {
            request.destroy(new Error("Resposta bancária excedeu o limite."));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          const status = response.statusCode || 500;
          const raw = Buffer.concat(chunks).toString("utf8");
          if (status < 200 || status >= 300) {
            reject(new ApiError(502, "A conexão bancária não respondeu. Use o Pix Copia e Cola."));
            return;
          }
          try {
            resolve((raw ? JSON.parse(raw) : {}) as T);
          } catch {
            reject(new ApiError(502, "Resposta bancária inválida."));
          }
        });
      },
    );
    request.setTimeout(15_000, () =>
      request.destroy(new Error("Tempo limite da conexão bancária.")),
    );
    request.on("error", () =>
      reject(new ApiError(502, "Não foi possível conectar ao banco. Use o Pix Copia e Cola.")),
    );
    if (body) request.write(body);
    request.end();
  });
}

let tokenCache: { value: string; expiresAt: number } | null = null;
let tokenPromise: Promise<string> | null = null;

async function accessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000)
    return tokenCache.value;
  if (tokenPromise) return tokenPromise;
  tokenPromise = (async () => {
    const credentials = Buffer.from(
      `${process.env.EFI_OPEN_FINANCE_CLIENT_ID}:${process.env.EFI_OPEN_FINANCE_CLIENT_SECRET}`,
    ).toString("base64");
    const response = await efiRequest<EfiToken>("/v1/oauth/token", {
      method: "POST",
      basic: credentials,
      body: { grant_type: "client_credentials" },
    });
    if (typeof response.access_token !== "string" || !response.access_token)
      throw new ApiError(502, "A Efí não retornou uma autorização válida.");
    const lifetime = Math.max(120, Number(response.expires_in) || 3600);
    tokenCache = {
      value: response.access_token,
      expiresAt: Date.now() + lifetime * 1000,
    };
    return response.access_token;
  })();
  try {
    return await tokenPromise;
  } finally {
    tokenPromise = null;
  }
}

async function authorizedRequest<T>(
  path: string,
  options: Omit<EfiRequestOptions, "token" | "basic"> = {},
) {
  return efiRequest<T>(path, { ...options, token: await accessToken() });
}

let participantCache:
  | { expiresAt: number; value: Array<{ id: string; name: string; logo?: string }> }
  | undefined;

async function participants() {
  if (participantCache && participantCache.expiresAt > Date.now())
    return participantCache.value;
  const response = await authorizedRequest<{ participantes?: EfiParticipant[] }>(
    "/v1/participantes?modalidade=pagamentos",
  );
  const value = (Array.isArray(response.participantes) ? response.participantes : [])
    .flatMap((participant) => {
      if (
        typeof participant.identificador !== "string" ||
        typeof participant.nome !== "string" ||
        !participant.identificador.trim() ||
        !participant.nome.trim()
      )
        return [];
      const logo = typeof participant.logo === "string" ? participant.logo : undefined;
      return [
        {
          id: participant.identificador,
          name: participant.nome,
          ...(logo?.startsWith("https://") ? { logo } : {}),
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  participantCache = { value, expiresAt: Date.now() + 15 * 60_000 };
  return value;
}

function safeRedirect(value: unknown) {
  if (typeof value !== "string")
    throw new ApiError(502, "A Efí não retornou o endereço do banco.");
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error("invalid protocol");
    return url.href;
  } catch {
    throw new ApiError(502, "A Efí retornou um endereço bancário inválido.");
  }
}

export const GET = route(async (req) => {
  const db = await getDB();
  const user = await getSession(req);
  if (!user) throw new ApiError(401, "Entre novamente para continuar.");
  await rateLimit(db, "open-finance-list:" + user.id, 30);
  if (!configured())
    return NextResponse.json({ enabled: false, participants: [] });
  return NextResponse.json({ enabled: true, participants: await participants() });
});

export const POST = route(async (req) => {
  checkOrigin(req);
  const db = await getDB();
  const user = await getSession(req);
  if (!user) throw new ApiError(401, "Entre novamente para continuar.");
  await rateLimit(db, "open-finance-user:" + user.id, 10);
  await rateLimit(db, "open-finance-ip:" + ipKey(req), 20);
  if (!configured())
    throw new ApiError(503, "Pagamento direto no banco ainda não está configurado.");

  const input = inputSchema.parse(await readJson(req));
  if (!(await participants()).some((participant) => participant.id === input.participantId))
    throw new ApiError(400, "Instituição bancária indisponível.");
  const row = (
    await db.query(
      "SELECT * FROM transactions WHERE id=$1 AND user_id=$2",
      [input.transactionId, user.id],
    )
  ).rows[0];
  if (!row) throw new ApiError(404, "Transação não encontrada.");
  if (row.status !== "pending")
    throw new ApiError(409, "Esta cobrança não está mais pendente.");
  if (row.provider !== "depix")
    throw new ApiError(409, "Esta cobrança não aceita iniciação bancária.");

  const payload = (row.provider_payload || {}) as ProviderPayload;
  if (payload.initiation?.redirectURI)
    return NextResponse.json({
      redirectURI: safeRedirect(payload.initiation.redirectURI),
      participantId: payload.initiation.participantId,
    });

  const qrCode =
    payload.pix?.qr_code ||
    payload.pix_payload ||
    payload.point_of_interaction?.transaction_data?.qr_code;
  if (typeof qrCode !== "string" || !qrCode.startsWith("000201"))
    throw new ApiError(409, "O Pix ainda está sendo preparado. Tente novamente.");
  if (typeof row.payer_tax_number_ciphertext !== "string")
    throw new ApiError(400, "CPF ou CNPJ do pagador não encontrado.");

  const taxNumber = decryptFinancial(row.payer_tax_number_ciphertext).replace(/\D/g, "");
  if (!/^\d{11}$|^\d{14}$/.test(taxNumber))
    throw new ApiError(400, "CPF ou CNPJ do pagador inválido.");
  const amountCents = Number(row.amount_cents);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0)
    throw new ApiError(409, "Valor da cobrança inválido.");

  const result = await authorizedRequest<EfiInitiation>("/v1/pagamentos/pix", {
    method: "POST",
    idempotencyKey: String(row.id),
    body: {
      pagador: {
        idParticipante: input.participantId,
        ...(taxNumber.length === 11 ? { cpf: taxNumber } : { cnpj: taxNumber }),
      },
      pagamento: {
        valor: (amountCents / 100).toFixed(2),
        infoPagador: "CORRIDA 26 - participacao simbolica",
        idProprio: String(row.id).replace(/-/g, "").slice(0, 35),
        qrCode,
      },
    },
  });
  const redirectURI = safeRedirect(result.redirectURI);
  const initiation = {
    provider: "efi",
    participantId: input.participantId,
    identificadorPagamento:
      typeof result.identificadorPagamento === "string"
        ? result.identificadorPagamento
        : null,
    redirectURI,
    createdAt: new Date().toISOString(),
  };

  const updated = await db.query(
    `UPDATE transactions
     SET provider_payload=jsonb_set(COALESCE(provider_payload, '{}'::jsonb), '{initiation}', $2::jsonb, true)
     WHERE id=$1 AND user_id=$3 AND status='pending'
       AND provider_payload->'initiation' IS NULL
     RETURNING id`,
    [row.id, JSON.stringify(initiation), user.id],
  );
  if (!updated.rows.length) {
    const current = (
      await db.query(
        "SELECT provider_payload FROM transactions WHERE id=$1 AND user_id=$2",
        [row.id, user.id],
      )
    ).rows[0]?.provider_payload as ProviderPayload | undefined;
    if (current?.initiation?.redirectURI)
      return NextResponse.json({
        redirectURI: safeRedirect(current.initiation.redirectURI),
        participantId: current.initiation.participantId,
      });
    throw new ApiError(409, "A cobrança mudou de estado. Tente novamente.");
  }

  return NextResponse.json({
    redirectURI,
    participantId: input.participantId,
  });
});
