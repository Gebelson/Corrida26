import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  Board,
  Candidate,
  Settings,
  Transaction,
  SessionUser,
  HistoryPoint,
} from "../lib/types";
import {
  defaults,
  demoCandidates,
  getDB,
  mode,
  type Database,
  type Queryable,
} from "./db";
import { ApiError } from "./security";
import {
  createCommissionForPaidTransaction,
  encryptFinancial,
  reverseCommissionForTransaction,
} from "./creators";

const timestamp = (value: unknown) => new Date(value as string).toISOString();
export function getPresentationBoard(now = new Date()): Board {
  const total = demoCandidates.reduce(
    (sum, candidate) => sum + candidate[4],
    0,
  );
  const leader = demoCandidates[0][4];
  const second = demoCandidates[1][4];
  const candidates: Candidate[] = demoCandidates.map(
    ([id, name, shortName, color, points], index) => ({
      id,
      name,
      shortName,
      color,
      avatar: `/runners.webp#${index}`,
      points,
      position: index + 1,
      active: true,
      gapToLeader: Math.max(0, leader - points),
      gapToTop2: index < 2 ? 0 : Math.max(1, second - points + 1),
      percentage: total ? (points / total) * 100 : 0,
    }),
  );
  return {
    candidates,
    movements: [],
    events: [],
    settings: { ...defaults, paymentsEnabled: false },
    updatedAt: now.toISOString(),
    mode: "production",
    readOnly: true,
  };
}

export function getPresentationHistory(now = new Date()) {
  const board = getPresentationBoard(now);
  return {
    points: [
      {
        timestamp: now.toISOString(),
        scores: Object.fromEntries(
          board.candidates.map((candidate) => [candidate.id, candidate.points]),
        ),
      },
    ],
    events: [],
  };
}
export async function getSettings(db: Queryable): Promise<Settings> {
  const result = await db.query("SELECT value FROM site_settings WHERE id=1");
  if (!result.rows[0])
    throw new ApiError(503, "Execute as migrações do banco.");
  const value = result.rows[0].value as Partial<Settings>;
  return {
    ...defaults,
    ...value,
    creatorProgram: {
      ...defaults.creatorProgram,
      ...(value.creatorProgram || {}),
    },
  };
}
export async function standings(
  db: Queryable,
  all = false,
): Promise<Candidate[]> {
  const { rows } = await db.query(
    `SELECT c.*,s.points FROM candidates c JOIN candidate_scores s ON s.candidate_id=c.id ${all ? "" : "WHERE c.active=true"} ORDER BY s.points DESC,c.created_at,c.id`,
  );
  const active = rows.filter((r) => r.active);
  const top = Number(active[0]?.points || 0);
  const second = Number(active[1]?.points || 0);
  const total = active.reduce(
    (sum, r) => sum + Math.max(0, Number(r.points)),
    0,
  );
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    shortName: String(r.short_name),
    color: String(r.color),
    avatar: String(r.avatar),
    points: Number(r.points),
    position: r.active ? active.indexOf(r) + 1 : 0,
    active: Boolean(r.active),
    gapToLeader: Math.max(0, top - Number(r.points)),
    gapToTop2:
      active.indexOf(r) < 2 && r.active
        ? 0
        : Math.max(1, second - Number(r.points) + 1),
    percentage: total ? (Math.max(0, Number(r.points)) / total) * 100 : 0,
  }));
}
export async function getBoard(db?: Queryable): Promise<Board> {
  db ??= await getDB();
  const candidates = await standings(db);
  const movements = await db.query(
    `SELECT m.*,c.name AS candidate_name,COALESCE(u.name,'Sistema') AS actor_name FROM score_movements m JOIN candidates c ON c.id=m.candidate_id LEFT JOIN users u ON u.id=m.user_id WHERE m.action<>'seed' ORDER BY m.created_at DESC,m.id DESC LIMIT 6`,
  );
  const events = await db.query(
    "SELECT * FROM ranking_events ORDER BY created_at DESC LIMIT 8",
  );
  return {
    candidates,
    movements: movements.rows.map((r) => ({
      id: String(r.id),
      candidateId: String(r.candidate_id),
      candidateName: String(r.candidate_name),
      actorName: String(r.actor_name),
      action: r.action as "add",
      points: Number(r.points),
      createdAt: timestamp(r.created_at),
      transactionId: r.transaction_id ? String(r.transaction_id) : null,
    })),
    events: events.rows.map((r) => ({
      id: String(r.id),
      kind: String(r.kind),
      message: String(r.message),
      createdAt: timestamp(r.created_at),
    })),
    settings: await getSettings(db),
    updatedAt: new Date().toISOString(),
    mode: mode(),
    readOnly: false,
  };
}
export function publicTransaction(row: Record<string, unknown>): Transaction {
  const payload = row.provider_payload as {
    point_of_interaction?: {
      transaction_data?: { qr_code?: string; qr_code_base64?: string };
    };
    date_of_expiration?: string;
    pix?: { qr_code?: string };
    payment_url?: string;
    expires_at?: string;
  } | null;
  const qr = payload?.point_of_interaction?.transaction_data;
  return {
    id: String(row.id),
    candidateId: String(row.candidate_id),
    action: row.action as "add" | "remove",
    amount: Number(row.amount_cents) / 100,
    points: Number(row.points),
    status: row.status as Transaction["status"],
    createdAt: timestamp(row.created_at),
    ...(payload?.pix?.qr_code
      ? { qrCode: payload.pix.qr_code }
      : qr?.qr_code
        ? { qrCode: qr.qr_code }
        : {}),
    ...(qr?.qr_code_base64
      ? { qrImage: `data:image/png;base64,${qr.qr_code_base64}` }
      : {}),
    ...(payload?.expires_at || payload?.date_of_expiration
      ? { expiresAt: payload.expires_at || payload.date_of_expiration }
      : {}),
    ...(payload?.payment_url ? { paymentUrl: payload.payment_url } : {}),
  };
}
export const transactionSchema = z.object({
  candidateId: z.string().min(1).max(80),
  action: z.enum(["add", "remove"]),
  amount: z.number().int().min(1).max(10000),
  idempotencyKey: z.string().min(16).max(100),
  email: z.email().max(254).optional(),
  taxNumber: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .refine((value) => /^\d{11}$|^\d{14}$/.test(value), "CPF/CNPJ inválido")
    .optional(),
});
export async function createTransaction(
  db: Database,
  user: SessionUser,
  input: unknown,
) {
  const data = transactionSchema.parse(input);
  return db.transaction(async (tx) => {
    await tx.query("SELECT id FROM standings_lock WHERE id=1 FOR UPDATE");
    const existing = (
      await tx.query(
        "SELECT * FROM transactions WHERE user_id=$1 AND idempotency_key=$2",
        [user.id, data.idempotencyKey],
      )
    ).rows[0];
    if (existing) {
      if (
        existing.candidate_id !== data.candidateId ||
        existing.action !== data.action ||
        Number(existing.amount_cents) !== data.amount * 100
      )
        throw new ApiError(
          409,
          "Esta chave já foi usada para outra participação.",
        );
      return existing;
    }
    const settings = await getSettings(tx);
    if (!settings.paymentsEnabled)
      throw new ApiError(403, "Participações temporariamente pausadas.");
    if (user.anonymous && !settings.anonymousEnabled)
      throw new ApiError(401, "Entre para participar.");
    if (data.amount < settings.minAmount)
      throw new ApiError(400, `Valor mínimo de R$ ${settings.minAmount}.`);
    if (
      !(
        await tx.query(
          "SELECT id FROM candidates WHERE id=$1 AND active=true",
          [data.candidateId],
        )
      ).rows.length
    )
      throw new ApiError(404, "Candidato indisponível.");
    if (mode() === "production" && !data.taxNumber)
      throw new ApiError(400, "Informe o CPF ou CNPJ do pagador para gerar o Pix.");
    const row = (
      await tx.query(
        `INSERT INTO transactions(id,user_id,candidate_id,action,amount_cents,points,idempotency_key,provider,payer_email,payer_tax_number_ciphertext) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          randomUUID(),
          user.id,
          data.candidateId,
          data.action,
          data.amount * 100,
          data.amount,
          data.idempotencyKey,
          mode() === "sandbox" ? "sandbox" : "depix",
          data.email || user.email || null,
          data.taxNumber ? encryptFinancial(data.taxNumber) : null,
        ],
      )
    ).rows[0];
    return row;
  });
}
export async function snapshot(tx: Queryable, before: Candidate[]) {
  const after = await standings(tx);
  const scores = Object.fromEntries(
    (await standings(tx, true)).map((c) => [c.id, c.points]),
  );
  await tx.query(
    "INSERT INTO ranking_history(id,scores) VALUES($1,$2::jsonb)",
    [randomUUID(), JSON.stringify(scores)],
  );
  if (after[0] && before[0]?.id !== after[0].id) {
    await tx.query(
      "INSERT INTO ranking_events(id,kind,message) VALUES($1,$2,$3)",
      [randomUUID(), "leadership", `${after[0].name} assumiu a liderança`],
    );
  }
  if (after[1] && before[1]?.id !== after[1].id) {
    const isNew = !before.slice(0, 2).some((c) => c.id === after[1].id);
    await tx.query(
      "INSERT INTO ranking_events(id,kind,message) VALUES($1,$2,$3)",
      [
        randomUUID(),
        "top2",
        `${after[1].name} ${isNew ? "entrou no Top 2" : "assumiu a segunda posição"}`,
      ],
    );
  }
  if (
    after.length > 1 &&
    after[0].points === after[1].points &&
    !(before[0]?.points === before[1]?.points)
  ) {
    await tx.query(
      "INSERT INTO ranking_events(id,kind,message) VALUES($1,$2,$3)",
      [
        randomUUID(),
        "tie",
        `${after[0].name} e ${after[1].name} empataram na liderança`,
      ],
    );
  }
}
export async function settle(
  db: Database,
  id: string,
  outcome: "paid" | "failed" | "expired" | "refunded",
  receipt?: { key: string; providerId: string },
) {
  return db.transaction(async (tx) => {
    await tx.query("SELECT id FROM standings_lock WHERE id=1 FOR UPDATE");
    const row = (
      await tx.query("SELECT * FROM transactions WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!row) throw new ApiError(404, "Transação não encontrada.");
    if (receipt) {
      const added = await tx.query(
        "INSERT INTO webhook_receipts(receipt_key,provider_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING receipt_key",
        [receipt.key, receipt.providerId],
      );
      if (!added.rows.length) return publicTransaction(row);
    }
    if (outcome === "refunded") {
      if (row.status === "paid")
        await reverseInTransaction(
          tx,
          row,
          "provider-refund",
          "Estorno confirmado pelo provedor",
          null,
          "refunded",
        );
    } else if (row.status === "pending") {
      if (outcome === "paid") {
        const before = await standings(tx);
        const points = Number(row.points) * (row.action === "add" ? 1 : -1);
        await tx.query(
          "INSERT INTO score_movements(id,candidate_id,user_id,transaction_id,action,points,amount_cents) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            randomUUID(),
            row.candidate_id,
            row.user_id,
            id,
            row.action,
            points,
            row.amount_cents,
          ],
        );
        await tx.query(
          "UPDATE candidate_scores SET points=points+$1,updated_at=now() WHERE candidate_id=$2",
          [points, row.candidate_id],
        );
        await snapshot(tx, before);
        await createCommissionForPaidTransaction(
          tx,
          row,
          (await getSettings(tx)).creatorProgram,
        );
      }
      await tx.query(
        "UPDATE transactions SET status=$1,updated_at=now() WHERE id=$2",
        [outcome, id],
      );
    }
    return publicTransaction(
      (await tx.query("SELECT * FROM transactions WHERE id=$1", [id])).rows[0],
    );
  });
}
async function reverseInTransaction(
  tx: Queryable,
  row: Record<string, unknown>,
  operation: string,
  reason: string,
  userId: string | null,
  status = "cancelled",
) {
  const original = (
    await tx.query(
      "SELECT * FROM score_movements WHERE transaction_id=$1 AND action IN('add','remove')",
      [row.id],
    )
  ).rows[0];
  if (!original)
    throw new ApiError(409, "Transação não tem movimentação confirmada.");
  if (
    (
      await tx.query("SELECT id FROM score_movements WHERE reversal_of=$1", [
        original.id,
      ])
    ).rows.length
  )
    return;
  const before = await standings(tx);
  await tx.query(
    "INSERT INTO score_movements(id,candidate_id,user_id,transaction_id,action,points,reversal_of,reason) VALUES($1,$2,$3,$4,'adjustment',$5,$6,$7)",
    [
      randomUUID(),
      row.candidate_id,
      userId,
      row.id,
      -Number(original.points),
      original.id,
      reason,
    ],
  );
  await tx.query(
    "UPDATE candidate_scores SET points=points-$1,updated_at=now() WHERE candidate_id=$2",
    [original.points, row.candidate_id],
  );
  await tx.query(
    "UPDATE transactions SET status=$1,updated_at=now() WHERE id=$2",
    [status, row.id],
  );
  if (userId)
    await tx.query(
      "INSERT INTO admin_audit(id,user_id,operation,reason,details) VALUES($1,$2,$3,$4,$5::jsonb)",
      [
        randomUUID(),
        userId,
        operation,
        reason,
        JSON.stringify({
          transactionId: row.id,
          reversedPoints: original.points,
        }),
      ],
    );
  await reverseCommissionForTransaction(tx, String(row.id), reason);
  await snapshot(tx, before);
}
const candidateSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9-]{1,80}$/)
    .optional(),
  name: z.string().trim().min(2).max(80),
  shortName: z.string().trim().min(2).max(30),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  avatar: z
    .string()
    .max(1000)
    .refine(
      (v) =>
        v === "" || /^\/[a-zA-Z0-9/_.#-]+$/.test(v) || /^https:\/\//.test(v),
      "Avatar deve ser local ou HTTPS",
    ),
  active: z.boolean(),
});
const settingsSchema = z
  .object({
    minAmount: z.number().int().min(1).max(10000),
    quickAmounts: z.array(z.number().int().min(1).max(10000)).min(1).max(6),
    paymentsEnabled: z.boolean(),
    anonymousEnabled: z.boolean(),
    legalNotice: z.string().trim().min(80).max(2000),
    heroText: z.string().trim().min(10).max(500),
    creatorProgram: z.object({
      enabled: z.boolean(),
      attributionDays: z.number().int().min(1).max(365),
      commissionDays: z.number().int().min(1).max(365),
      holdDays: z.number().int().min(0).max(90),
      minWithdrawal: z.number().int().min(1).max(100000),
      customerBonusPercent: z.number().min(0).max(100),
      customerBonusMax: z.number().int().min(0).max(10000),
      withdrawalsEnabled: z.boolean(),
      leaderboardEnabled: z.boolean(),
    }),
  })
  .refine(
    (v) => v.quickAmounts.every((amount) => amount >= v.minAmount),
    "Valor rápido abaixo do mínimo",
  );
export async function adminOperation(
  db: Database,
  user: SessionUser,
  input: unknown,
) {
  if (!user.admin || user.anonymous) throw new ApiError(403, "Sem permissão.");
  const { operation, data, reason } = z
    .object({
      operation: z.enum([
        "candidate.save",
        "settings.save",
        "transaction.reverse",
      ]),
      data: z.record(z.string(), z.unknown()),
      reason: z.string().trim().min(5).max(500),
    })
    .parse(input);
  await db.transaction(async (tx) => {
    await tx.query("SELECT id FROM standings_lock WHERE id=1 FOR UPDATE");
    if (operation === "transaction.reverse") {
      const id = z.string().parse(data.transactionId ?? data.id);
      const row = (
        await tx.query("SELECT * FROM transactions WHERE id=$1 FOR UPDATE", [
          id,
        ])
      ).rows[0];
      if (!row) throw new ApiError(404, "Transação não encontrada.");
      if (row.status !== "paid")
        throw new ApiError(409, "Somente transações pagas podem ser anuladas.");
      await reverseInTransaction(tx, row, operation, reason, user.id);
      return;
    }
    let beforeData: unknown;
    let afterData: unknown;
    if (operation === "candidate.save") {
      const value = candidateSchema.parse(data);
      const id =
        value.id ||
        `${
          value.shortName
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 60) || "candidato"
        }-${randomUUID().slice(0, 6)}`;
      const before = await standings(tx);
      beforeData =
        (await tx.query("SELECT * FROM candidates WHERE id=$1", [id]))
          .rows[0] ?? null;
      await tx.query(
        "INSERT INTO candidates(id,name,short_name,color,avatar,active) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,short_name=EXCLUDED.short_name,color=EXCLUDED.color,avatar=EXCLUDED.avatar,active=EXCLUDED.active",
        [
          id,
          value.name,
          value.shortName,
          value.color,
          value.avatar,
          value.active,
        ],
      );
      await tx.query(
        "INSERT INTO candidate_scores(candidate_id) VALUES($1) ON CONFLICT DO NOTHING",
        [id],
      );
      afterData = { ...value, id };
      await snapshot(tx, before);
    } else {
      const value = settingsSchema.parse(data);
      if (
        value.paymentsEnabled &&
        mode() === "production" &&
        (!process.env.DEPIX_API_KEY || !process.env.DEPIX_WEBHOOK_SECRET)
      )
        throw new ApiError(
          400,
          "Configure as credenciais de pagamento antes de ativar.",
        );
      beforeData = await getSettings(tx);
      await tx.query("UPDATE site_settings SET value=$1::jsonb WHERE id=1", [
        JSON.stringify(value),
      ]);
      afterData = value;
    }
    await tx.query(
      "INSERT INTO admin_audit(id,user_id,operation,reason,details) VALUES($1,$2,$3,$4,$5::jsonb)",
      [
        randomUUID(),
        user.id,
        operation,
        reason,
        JSON.stringify({ before: beforeData, after: afterData }),
      ],
    );
  });
}
export async function getHistory(db: Queryable, range: string) {
  const duration: Record<string, number> = { "24H": 1, "7D": 7, "30D": 30 };
  const since = duration[range]
    ? new Date(Date.now() - duration[range] * 86400000).toISOString()
    : "1970-01-01T00:00:00Z";
  // Bucket in SQL to bound payload; the last snapshot in each interval retains actual ledger values.
  const bucket =
    range === "24H"
      ? 300
      : range === "7D"
        ? 1800
        : range === "30D"
          ? 7200
          : 86400;
  const { rows } = await db.query(
    `SELECT DISTINCT ON (floor(extract(epoch FROM created_at)/$2)) scores,created_at FROM ranking_history WHERE created_at>=$1::timestamptz ORDER BY floor(extract(epoch FROM created_at)/$2),created_at DESC`,
    [since, bucket],
  );
  const baseline = (
    await db.query(
      "SELECT scores,created_at FROM ranking_history WHERE created_at<$1::timestamptz ORDER BY created_at DESC LIMIT 1",
      [since],
    )
  ).rows;
  const points: HistoryPoint[] = [...baseline, ...rows].map((r) => ({
    timestamp: timestamp(r.created_at),
    scores: Object.fromEntries(
      Object.entries(r.scores as Record<string, number>).map(([id, score]) => [
        id,
        Number(score),
      ]),
    ),
  }));
  const events = (
    await db.query(
      "SELECT * FROM ranking_events WHERE created_at>=$1::timestamptz ORDER BY created_at DESC LIMIT 100",
      [since],
    )
  ).rows.map((r) => ({
    id: String(r.id),
    kind: String(r.kind),
    message: String(r.message),
    createdAt: timestamp(r.created_at),
  }));
  return { points, events };
}
export async function adminDashboard(db: Queryable) {
  const values = (
    await db.query(
      `SELECT count(*) AS total_transactions,COALESCE(sum(amount_cents) FILTER(WHERE status='paid' AND updated_at>=date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'),0) AS amount_today,COALESCE(avg(amount_cents) FILTER(WHERE status='paid'),0) AS average_ticket FROM transactions`,
    )
  ).rows[0];
  const count = (
    await db.query(
      "SELECT count(*) AS count FROM score_movements WHERE action<>'seed' AND created_at>=date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'",
    )
  ).rows[0];
  return {
    stats: {
      totalTransactions: Number(values.total_transactions),
      movementsToday: Number(count.count),
      amountToday: Number(values.amount_today) / 100,
      averageTicket: Number(values.average_ticket) / 100,
    },
    candidates: await standings(db, true),
    transactions: (
      await db.query(
        "SELECT * FROM transactions ORDER BY created_at DESC LIMIT 100",
      )
    ).rows.map(publicTransaction),
    settings: await getSettings(db),
    audit: (
      await db.query(
        "SELECT a.*,u.name AS actor_name FROM admin_audit a JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 50",
      )
    ).rows.map((r) => ({
      id: String(r.id),
      operation: String(r.operation),
      reason: String(r.reason),
      actorName: String(r.actor_name),
      createdAt: timestamp(r.created_at),
      details: r.details,
    })),
  };
}
