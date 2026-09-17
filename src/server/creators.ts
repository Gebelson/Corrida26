import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { z } from "zod";
import type {
  CreatorLevel,
  CreatorProgramSettings,
  CreatorSummary,
  WalletBalances,
} from "../lib/types";
import type { Database, Queryable } from "./db";
import { ApiError } from "./errors";
import { publicAppOrigin } from "./origin";

const monthKey = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);
const cents = (value: unknown) => Number(value || 0);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const normalizeCode = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 18);

export async function ensureCreatorProfile(db: Queryable, userId: string) {
  let user = (await db.query("SELECT * FROM users WHERE id=$1", [userId])).rows[0];
  if (!user) throw new ApiError(404, "Usuário não encontrado.");
  if (!user.referral_code) {
    const base = normalizeCode(String(user.name || "criador")) || "criador";
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = `${base.slice(0, 12)}${randomBytes(3).toString("hex")}`;
      try {
        user = (
          await db.query(
            "UPDATE users SET referral_code=$1 WHERE id=$2 AND referral_code IS NULL RETURNING *",
            [code, userId],
          )
        ).rows[0] || user;
        if (user.referral_code) break;
      } catch (error) {
        if (attempt === 7) throw error;
      }
    }
  }
  await db.query(
    "INSERT INTO creator_profiles(user_id) VALUES($1) ON CONFLICT DO NOTHING",
    [userId],
  );
  return user;
}

export async function trackReferralClick(
  db: Database,
  code: string,
  context: { ipHash: string; userAgentHash: string; landingPath: string; attributionDays: number },
) {
  const normalized = normalizeCode(code);
  const creator = (
    await db.query(
      "SELECT id,creator_status FROM users WHERE lower(referral_code)=lower($1)",
      [normalized],
    )
  ).rows[0];
  if (!creator || creator.creator_status !== "active")
    throw new ApiError(404, "Código de criador inválido ou inativo.");
  const token = randomBytes(32).toString("base64url");
  await db.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO referral_clicks(id,creator_user_id,referral_code,tracking_token_hash,ip_hash,user_agent_hash,landing_path,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,now()+($8::text||' days')::interval)`,
      [
        randomUUID(),
        creator.id,
        normalized,
        hash(token),
        context.ipHash,
        context.userAgentHash,
        context.landingPath.slice(0, 500),
        context.attributionDays,
      ],
    );
    await tx.query(
      `INSERT INTO creator_daily_stats(user_id,stat_date,clicks) VALUES($1,(now() AT TIME ZONE 'America/Sao_Paulo')::date,1)
       ON CONFLICT(user_id,stat_date) DO UPDATE SET clicks=creator_daily_stats.clicks+1`,
      [creator.id],
    );
    await advanceChallenges(tx, String(creator.id), "clicks", 1);
  });
  return { token, creatorId: String(creator.id) };
}

export async function claimReferral(db: Database, userId: string, token: string) {
  if (!token || token.length > 100) return false;
  return db.transaction(async (tx) => {
    const user = (
      await tx.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [userId])
    ).rows[0];
    if (!user || user.referred_by_user_id) return false;
    const click = (
      await tx.query(
        `SELECT rc.* FROM referral_clicks rc JOIN users u ON u.id=rc.creator_user_id
         WHERE rc.tracking_token_hash=$1 AND rc.expires_at>now() AND rc.claimed_by_user_id IS NULL AND u.creator_status='active'
         FOR UPDATE`,
        [hash(token)],
      )
    ).rows[0];
    if (!click || click.creator_user_id === userId) return false;
    const settingsRow = (await tx.query("SELECT value FROM site_settings WHERE id=1")).rows[0];
    const days = Number(
      (settingsRow?.value as { creatorProgram?: { commissionDays?: number } })
        ?.creatorProgram?.commissionDays || 30,
    );
    await tx.query(
      `INSERT INTO referrals(id,referrer_user_id,referred_user_id,click_id,commission_expires_at)
       VALUES($1,$2,$3,$4,now()+($5::text||' days')::interval) ON CONFLICT(referred_user_id) DO NOTHING`,
      [randomUUID(), click.creator_user_id, userId, click.id, days],
    );
    const attached = await tx.query(
      "UPDATE users SET referred_by_user_id=$1,referred_at=now() WHERE id=$2 AND referred_by_user_id IS NULL RETURNING id",
      [click.creator_user_id, userId],
    );
    if (!attached.rows.length) return false;
    await tx.query("UPDATE referral_clicks SET claimed_by_user_id=$1 WHERE id=$2", [
      userId,
      click.id,
    ]);
    await tx.query(
      `INSERT INTO creator_daily_stats(user_id,stat_date,signups) VALUES($1,(now() AT TIME ZONE 'America/Sao_Paulo')::date,1)
       ON CONFLICT(user_id,stat_date) DO UPDATE SET signups=creator_daily_stats.signups+1`,
      [click.creator_user_id],
    );
    await advanceChallenges(tx, String(click.creator_user_id), "signups", 1);
    return true;
  });
}

async function insertLedger(
  tx: Queryable,
  entry: {
    userId: string;
    account: string;
    entryType: string;
    amountCents: number;
    sourceType: string;
    sourceId: string;
    groupId: string;
    description: string;
    metadata?: unknown;
  },
) {
  return tx.query(
    `INSERT INTO wallet_ledger(id,user_id,account,entry_type,amount_cents,source_type,source_id,group_id,description,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) ON CONFLICT(user_id,account,entry_type,source_type,source_id) DO NOTHING RETURNING id`,
    [
      randomUUID(),
      entry.userId,
      entry.account,
      entry.entryType,
      entry.amountCents,
      entry.sourceType,
      entry.sourceId,
      entry.groupId,
      entry.description,
      JSON.stringify(entry.metadata || {}),
    ],
  );
}

async function advanceChallenges(tx: Queryable, userId: string, metric: string, delta: number) {
  const challenges=(await tx.query("SELECT * FROM creator_challenges WHERE active=true AND metric=$1 AND starts_at<=now() AND ends_at>=now()",[metric])).rows;
  for(const challenge of challenges){
    const row=(await tx.query(`INSERT INTO creator_challenge_progress(challenge_id,user_id,progress) VALUES($1,$2,$3)
      ON CONFLICT(challenge_id,user_id) DO UPDATE SET progress=creator_challenge_progress.progress+EXCLUDED.progress,updated_at=now() RETURNING *`,[challenge.id,userId,delta])).rows[0];
    if(cents(row.progress)>=cents(challenge.target)&&!row.completed_at){
      const completed=(await tx.query("UPDATE creator_challenge_progress SET completed_at=now(),claimed_at=now() WHERE challenge_id=$1 AND user_id=$2 AND completed_at IS NULL RETURNING challenge_id",[challenge.id,userId])).rows.length;
      if(completed&&cents(challenge.reward_cents)>0) await insertLedger(tx,{userId,account:"internal_credit",entryType:"challenge_bonus",amountCents:cents(challenge.reward_cents),sourceType:"challenge",sourceId:String(challenge.id),groupId:String(challenge.id),description:`Missão concluída: ${challenge.title}`});
      if(completed) await tx.query("INSERT INTO creator_notifications(id,user_id,kind,title,message,source_type,source_id) VALUES($1,$2,'challenge','Missão concluída',$3,'challenge',$4)",[randomUUID(),userId,String(challenge.title),challenge.id]);
    }
  }
}

async function currentLevel(tx: Queryable, monthlyRevenueCents: number) {
  return (
    await tx.query(
      `SELECT * FROM creator_levels WHERE active=true AND min_monthly_revenue_cents<=$1
       AND (max_monthly_revenue_cents IS NULL OR max_monthly_revenue_cents>=$1)
       ORDER BY sort_order DESC LIMIT 1`,
      [monthlyRevenueCents],
    )
  ).rows[0];
}

export async function createCommissionForPaidTransaction(
  tx: Queryable,
  transaction: Record<string, unknown>,
  settings: CreatorProgramSettings,
) {
  if (!settings.enabled || transaction.provider !== "depix" || !transaction.provider_live)
    return null;
  const purchaseType = (
    await tx.query("SELECT commission_eligible FROM purchase_types WHERE id=$1 AND active=true", [
      transaction.purchase_type_id || "score_participation",
    ])
  ).rows[0];
  if (!purchaseType?.commission_eligible) return null;
  const referral = (
    await tx.query(
      `SELECT r.*,u.creator_status FROM referrals r JOIN users u ON u.id=r.referrer_user_id
       WHERE r.referred_user_id=$1 AND r.commission_expires_at>=now()`,
      [transaction.user_id],
    )
  ).rows[0];
  if (!referral || referral.creator_status !== "active") return null;
  await ensureCreatorProfile(tx, String(referral.referrer_user_id));
  const profile = (
    await tx.query("SELECT * FROM creator_profiles WHERE user_id=$1 FOR UPDATE", [
      referral.referrer_user_id,
    ])
  ).rows[0];
  const key = monthKey();
  const previousMonthly = profile.month_key === key ? cents(profile.monthly_revenue_cents) : 0;
  const monthly = previousMonthly + cents(transaction.amount_cents);
  const level = await currentLevel(tx, monthly);
  if (!level) return null;
  const commission = Math.floor((cents(transaction.amount_cents) * cents(level.commission_bps)) / 10000);
  const risk = (
    await tx.query("SELECT COALESCE(max(risk_score),0) risk FROM fraud_flags WHERE transaction_id=$1 AND status IN('open','confirmed')", [transaction.id])
  ).rows[0];
  const initialStatus = cents(risk?.risk) >= 70 ? "blocked" : "pending";
  const id = randomUUID();
  const created = await tx.query(
    `INSERT INTO commissions(id,transaction_id,creator_user_id,referred_user_id,level_id,eligible_amount_cents,commission_bps,amount_cents,status,available_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+($10::text||' days')::interval)
     ON CONFLICT(transaction_id) DO NOTHING RETURNING id`,
    [
      id,
      transaction.id,
      referral.referrer_user_id,
      transaction.user_id,
      level.id,
      transaction.amount_cents,
      level.commission_bps,
      commission,
      initialStatus,
      settings.holdDays,
    ],
  );
  if (!created.rows.length) return null;
  await insertLedger(tx, {
    userId: String(referral.referrer_user_id),
    account: initialStatus,
    entryType: "commission",
    amountCents: commission,
    sourceType: "commission",
    sourceId: id,
    groupId: id,
    description: initialStatus === "blocked" ? "Comissão bloqueada para revisão" : "Comissão direta aguardando liberação",
    metadata: { transactionId: transaction.id, levelId: level.id, bps: level.commission_bps },
  });
  await tx.query(
    `UPDATE creator_profiles SET level_id=$2,month_key=$3,monthly_revenue_cents=$4,
      total_revenue_cents=total_revenue_cents+$5,total_commission_cents=total_commission_cents+$6,updated_at=now()
     WHERE user_id=$1`,
    [
      referral.referrer_user_id,
      level.id,
      key,
      monthly,
      transaction.amount_cents,
      commission,
    ],
  );
  const firstBuyer = !(
    await tx.query(
      "SELECT 1 FROM commissions WHERE creator_user_id=$1 AND referred_user_id=$2 AND id<>$3 LIMIT 1",
      [referral.referrer_user_id, transaction.user_id, id],
    )
  ).rows.length;
  await tx.query(
    `INSERT INTO creator_daily_stats(user_id,stat_date,buyers,revenue_cents,commission_cents)
     VALUES($1,(now() AT TIME ZONE 'America/Sao_Paulo')::date,$2,$3,$4)
     ON CONFLICT(user_id,stat_date) DO UPDATE SET buyers=creator_daily_stats.buyers+EXCLUDED.buyers,
      revenue_cents=creator_daily_stats.revenue_cents+EXCLUDED.revenue_cents,
      commission_cents=creator_daily_stats.commission_cents+EXCLUDED.commission_cents`,
    [referral.referrer_user_id, firstBuyer ? 1 : 0, transaction.amount_cents, commission],
  );
  await advanceChallenges(tx, String(referral.referrer_user_id), "revenue", cents(transaction.amount_cents));
  if (firstBuyer) await advanceChallenges(tx, String(referral.referrer_user_id), "buyers", 1);
  await tx.query(
    "INSERT INTO creator_notifications(id,user_id,kind,title,message,source_type,source_id) VALUES($1,$2,'commission','Nova comissão','Uma compra indicada gerou comissão pendente.','commission',$3)",
    [randomUUID(), referral.referrer_user_id, id],
  );
  if (firstBuyer && settings.customerBonusPercent > 0 && settings.customerBonusMax > 0) {
    const bonus = Math.min(
      Math.floor((cents(transaction.amount_cents) * settings.customerBonusPercent) / 100),
      settings.customerBonusMax * 100,
    );
    if (bonus > 0)
      await insertLedger(tx, {
        userId: String(transaction.user_id),
        account: "internal_credit",
        entryType: "customer_bonus",
        amountCents: bonus,
        sourceType: "first_referred_purchase",
        sourceId: String(transaction.user_id),
        groupId: id,
        description: "Crédito promocional da primeira participação indicada",
      });
  }
  return id;
}

export async function assessTransactionRisk(db: Database, userId: string, transactionId: string, ipHash: string) {
  await db.query("UPDATE transactions SET request_ip_hash=$1 WHERE id=$2 AND user_id=$3", [ipHash, transactionId, userId]);
  const activity = (await db.query(
    `SELECT count(*) total,count(DISTINCT user_id) users FROM transactions WHERE request_ip_hash=$1 AND created_at>now()-interval '1 hour'`, [ipHash]
  )).rows[0];
  const total=cents(activity.total), users=cents(activity.users);
  let score=0, signal="";
  if(users>=4){score=85;signal="shared_ip_many_accounts"} else if(total>=8){score=70;signal="high_payment_velocity"} else if(total>=5){score=45;signal="elevated_payment_velocity"}
  if(score) await db.query(
    `INSERT INTO fraud_flags(id,user_id,transaction_id,signal,risk_score,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
    [randomUUID(),userId,transactionId,signal,score,JSON.stringify({transactionsLastHour:total,usersLastHour:users,ipHash})],
  );
  await db.query("UPDATE transactions SET risk_score=$1 WHERE id=$2",[score,transactionId]);
  return score;
}

export async function reverseCommissionForTransaction(
  tx: Queryable,
  transactionId: string,
  reason: string,
) {
  const commission = (
    await tx.query("SELECT * FROM commissions WHERE transaction_id=$1 FOR UPDATE", [transactionId])
  ).rows[0];
  if (!commission || ["cancelled", "reversed"].includes(String(commission.status))) return false;
  const account = commission.status === "pending" ? "pending" : commission.status === "blocked" ? "blocked" : "available";
  const groupId = randomUUID();
  await insertLedger(tx, {
    userId: String(commission.creator_user_id),
    account,
    entryType: "refund",
    amountCents: -cents(commission.amount_cents),
    sourceType: "commission_reversal",
    sourceId: String(commission.id),
    groupId,
    description: reason,
  });
  await tx.query(
    "UPDATE commissions SET status=$1,reason=$2,updated_at=now() WHERE id=$3",
    [commission.status === "pending" ? "cancelled" : "reversed", reason, commission.id],
  );
  await tx.query(
    "INSERT INTO creator_notifications(id,user_id,kind,title,message,source_type,source_id) VALUES($1,$2,'refund','Comissão estornada',$3,'commission',$4)",
    [randomUUID(), commission.creator_user_id, reason, commission.id],
  );
  return true;
}

export async function releaseDueCommissions(db: Database) {
  return db.transaction(async (tx) => {
    const due = (
      await tx.query(
        "SELECT * FROM commissions WHERE status='pending' AND available_at<=now() ORDER BY available_at FOR UPDATE",
      )
    ).rows;
    let released = 0;
    for (const commission of due) {
      const groupId = randomUUID();
      await insertLedger(tx, {
        userId: String(commission.creator_user_id), account: "pending", entryType: "release",
        amountCents: -cents(commission.amount_cents), sourceType: "commission_release", sourceId: String(commission.id), groupId,
        description: "Transferência do saldo pendente",
      });
      await insertLedger(tx, {
        userId: String(commission.creator_user_id), account: "available", entryType: "release",
        amountCents: cents(commission.amount_cents), sourceType: "commission_release", sourceId: String(commission.id), groupId,
        description: "Comissão liberada para saque",
      });
      await tx.query("UPDATE commissions SET status='available',updated_at=now() WHERE id=$1", [commission.id]);
      await tx.query(
        "INSERT INTO creator_notifications(id,user_id,kind,title,message,source_type,source_id) VALUES($1,$2,'release','Saldo liberado','Uma comissão já pode ser sacada.','commission',$3)",
        [randomUUID(), commission.creator_user_id, commission.id],
      );
      released++;
    }
    return released;
  });
}

function mapLevel(row: Record<string, unknown>): CreatorLevel {
  return {
    id: String(row.id), name: String(row.name),
    minMonthlyRevenue: cents(row.min_monthly_revenue_cents) / 100,
    maxMonthlyRevenue: row.max_monthly_revenue_cents == null ? null : cents(row.max_monthly_revenue_cents) / 100,
    commissionPercent: cents(row.commission_bps) / 100,
    color: String(row.color),
  };
}

export async function creatorDashboard(
  db: Database,
  userId: string,
  appOrigin = publicAppOrigin(),
): Promise<Record<string, unknown>> {
  const user = await ensureCreatorProfile(db, userId);
  const settingsRow = (await db.query("SELECT value FROM site_settings WHERE id=1")).rows[0];
  const program = (
    settingsRow?.value as { creatorProgram?: CreatorProgramSettings } | undefined
  )?.creatorProgram;
  const profile = (await db.query("SELECT * FROM creator_profiles WHERE user_id=$1", [userId])).rows[0];
  const levels = (await db.query("SELECT * FROM creator_levels WHERE active=true ORDER BY sort_order")).rows;
  const key = monthKey();
  const monthlyRevenue = profile.month_key === key ? cents(profile.monthly_revenue_cents) : 0;
  const level = (await currentLevel(db, monthlyRevenue)) || levels[0];
  const next = levels.find((row) => cents(row.min_monthly_revenue_cents) > monthlyRevenue) || null;
  const balancesRow = (await db.query("SELECT * FROM wallet_balances WHERE user_id=$1", [userId])).rows[0] || {};
  const stats = (
    await db.query(
      `SELECT COALESCE(sum(clicks),0) clicks,COALESCE(sum(signups),0) signups,COALESCE(sum(buyers),0) buyers,
       COALESCE(sum(revenue_cents),0) revenue_cents,COALESCE(sum(commission_cents),0) commission_cents
       FROM creator_daily_stats WHERE user_id=$1`,
      [userId],
    )
  ).rows[0];
  const balances: WalletBalances = {
    pending: cents(balancesRow.pending_cents) / 100,
    available: cents(balancesRow.available_cents) / 100,
    blocked: cents(balancesRow.blocked_cents) / 100,
    withdrawalPending: cents(balancesRow.withdrawal_pending_cents) / 100,
    internalCredit: cents(balancesRow.internal_credit_cents) / 100,
    paid: cents(balancesRow.paid_cents) / 100,
  };
  const summary: CreatorSummary = {
    code: String(user.referral_code),
    referralUrl: `${appOrigin}/r/${user.referral_code}`,
    level: mapLevel(level), nextLevel: next ? mapLevel(next) : null,
    monthlyRevenue: monthlyRevenue / 100,
    progressPercent: next ? Math.min(100, (monthlyRevenue / cents(next.min_monthly_revenue_cents)) * 100) : 100,
    balances,
    clicks: cents(stats.clicks), signups: cents(stats.signups), buyers: cents(stats.buyers),
    conversionRate: cents(stats.clicks) ? (cents(stats.buyers) / cents(stats.clicks)) * 100 : 0,
    totalRevenue: cents(stats.revenue_cents) / 100,
    totalCommission: cents(stats.commission_cents) / 100,
    withdrawalsSuspended: Boolean(user.withdrawals_suspended),
    kycStatus: String(user.kyc_status) as CreatorSummary["kycStatus"],
  };
  const [commissions, referrals, ledger, withdrawals, notifications, challenges] = await Promise.all([
    db.query(`SELECT c.*,u.name AS customer_name FROM commissions c JOIN users u ON u.id=c.referred_user_id WHERE c.creator_user_id=$1 ORDER BY c.created_at DESC LIMIT 100`, [userId]),
    db.query(`SELECT r.*,u.name,COUNT(c.id) AS purchases,COALESCE(sum(c.eligible_amount_cents),0) AS revenue_cents FROM referrals r JOIN users u ON u.id=r.referred_user_id LEFT JOIN commissions c ON c.referred_user_id=r.referred_user_id AND c.creator_user_id=r.referrer_user_id WHERE r.referrer_user_id=$1 GROUP BY r.id,u.name ORDER BY r.attributed_at DESC LIMIT 100`, [userId]),
    db.query("SELECT * FROM wallet_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100", [userId]),
    db.query("SELECT id,amount_cents,pix_key_type,pix_key_last4,status,failure_reason,requested_at,processed_at FROM withdrawals WHERE user_id=$1 ORDER BY requested_at DESC LIMIT 50", [userId]),
    db.query("SELECT * FROM creator_notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20", [userId]),
    db.query(`SELECT c.*,COALESCE(p.progress,0) progress,p.completed_at,p.claimed_at FROM creator_challenges c LEFT JOIN creator_challenge_progress p ON p.challenge_id=c.id AND p.user_id=$1 WHERE c.active=true AND c.ends_at>=now() ORDER BY c.ends_at`, [userId]),
  ]);
  return { summary, levels: levels.map(mapLevel), program, commissions: commissions.rows, referrals: referrals.rows, ledger: ledger.rows, withdrawals: withdrawals.rows, notifications: notifications.rows, challenges: challenges.rows };
}

export async function creatorLeaderboard(db: Queryable) {
  const settings = (await db.query("SELECT value FROM site_settings WHERE id=1")).rows[0]?.value as { creatorProgram?: CreatorProgramSettings };
  if (settings?.creatorProgram?.leaderboardEnabled === false) return [];
  const rows = (
    await db.query(
      `SELECT u.name,u.referral_code,p.level_id,l.name level_name,l.color,
       p.monthly_revenue_cents,p.total_revenue_cents,p.total_commission_cents,
       row_number() OVER(ORDER BY p.monthly_revenue_cents DESC,p.total_revenue_cents DESC,u.created_at) position
       FROM creator_profiles p JOIN users u ON u.id=p.user_id JOIN creator_levels l ON l.id=p.level_id
       WHERE p.public_ranking=true AND u.creator_status='active' ORDER BY position LIMIT 100`,
    )
  ).rows;
  return rows.map((row) => ({
    position: cents(row.position), name: String(row.name), code: String(row.referral_code),
    level: String(row.level_name), color: String(row.color),
    monthlyRevenue: cents(row.monthly_revenue_cents) / 100,
    totalRevenue: cents(row.total_revenue_cents) / 100,
  }));
}

function encryptionKey() {
  const secret = process.env.DATA_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new ApiError(503, "Criptografia financeira não configurada.");
  return createHash("sha256").update(secret).digest();
}
export function encryptFinancial(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}
export function decryptFinancial(value: string) {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export const withdrawalSchema = z.object({
  amount: z.number().int().positive().max(100000),
  pixKeyType: z.enum(["cpf", "cnpj", "email", "phone", "random"]),
  pixKey: z.string().trim().min(3).max(150),
  taxNumber: z.string().trim().regex(/^\d{11}$|^\d{14}$/),
  idempotencyKey: z.string().min(16).max(100),
});

export async function createWithdrawalRequest(
  db: Database,
  userId: string,
  input: unknown,
  settings: CreatorProgramSettings,
) {
  const data = withdrawalSchema.parse(input);
  if (!settings.enabled || !settings.withdrawalsEnabled) throw new ApiError(403, "Saques estão pausados.");
  if (data.amount < settings.minWithdrawal) throw new ApiError(400, `O saque mínimo é R$ ${settings.minWithdrawal}.`);
  return db.transaction(async (tx) => {
    const user = (await tx.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [userId])).rows[0];
    if (!user || user.anonymous) throw new ApiError(401, "Entre para solicitar um saque.");
    if (user.creator_status !== "active" || user.withdrawals_suspended) throw new ApiError(403, "Saques suspensos para esta conta.");
    if (user.kyc_status !== "approved") throw new ApiError(403, "Conclua a verificação de identidade antes de sacar.");
    const existing = (await tx.query("SELECT * FROM withdrawals WHERE user_id=$1 AND idempotency_key=$2", [userId, data.idempotencyKey])).rows[0];
    if (existing) {
      if (cents(existing.amount_cents) !== data.amount * 100 || existing.pix_key_last4 !== data.pixKey.slice(-4))
        throw new ApiError(409, "Esta chave de idempotência já foi usada em outro saque.");
      return existing;
    }
    const balance = cents((await tx.query("SELECT available_cents FROM wallet_balances WHERE user_id=$1", [userId])).rows[0]?.available_cents);
    const amountCents = data.amount * 100;
    if (balance < amountCents) throw new ApiError(409, "Saldo disponível insuficiente.");
    const id = randomUUID();
    const row = (
      await tx.query(
        `INSERT INTO withdrawals(id,user_id,amount_cents,pix_key_type,pix_key_ciphertext,pix_key_last4,recipient_tax_number_ciphertext,idempotency_key)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [id,userId,amountCents,data.pixKeyType,encryptFinancial(data.pixKey),data.pixKey.slice(-4),encryptFinancial(data.taxNumber),data.idempotencyKey],
      )
    ).rows[0];
    const groupId = id;
    await insertLedger(tx,{userId,account:"available",entryType:"withdrawal_request",amountCents:-amountCents,sourceType:"withdrawal",sourceId:id,groupId,description:"Reserva para saque Pix"});
    await insertLedger(tx,{userId,account:"withdrawal_pending",entryType:"withdrawal_request",amountCents,sourceType:"withdrawal",sourceId:id,groupId,description:"Saque Pix em processamento"});
    return row;
  });
}

export async function completeWithdrawal(db: Database, id: string, providerId: string, payload: unknown) {
  return db.transaction(async (tx) => {
    const row = (await tx.query("SELECT * FROM withdrawals WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!row || row.status === "paid") return false;
    const amount = cents(row.amount_cents); const groupId = randomUUID();
    await insertLedger(tx,{userId:String(row.user_id),account:"withdrawal_pending",entryType:"withdrawal_complete",amountCents:-amount,sourceType:"withdrawal_complete",sourceId:id,groupId,description:"Saque Pix liquidado"});
    await insertLedger(tx,{userId:String(row.user_id),account:"paid",entryType:"withdrawal_complete",amountCents:amount,sourceType:"withdrawal_complete",sourceId:id,groupId,description:"Valor pago ao criador"});
    await tx.query("UPDATE withdrawals SET status='paid',provider_id=COALESCE(provider_id,$2),provider_payload=$3::jsonb,processed_at=now(),updated_at=now() WHERE id=$1",[id,providerId,JSON.stringify(payload)]);
    return true;
  });
}

export async function failWithdrawal(db: Database, id: string, reason: string) {
  return db.transaction(async (tx) => {
    const row = (await tx.query("SELECT * FROM withdrawals WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!row || !["pending","processing"].includes(String(row.status))) return false;
    const amount = cents(row.amount_cents); const groupId = randomUUID();
    await insertLedger(tx,{userId:String(row.user_id),account:"withdrawal_pending",entryType:"withdrawal_failed",amountCents:-amount,sourceType:"withdrawal_failed",sourceId:id,groupId,description:"Saque Pix não concluído"});
    await insertLedger(tx,{userId:String(row.user_id),account:"available",entryType:"withdrawal_failed",amountCents:amount,sourceType:"withdrawal_failed",sourceId:id,groupId,description:"Saldo devolvido após falha no saque"});
    await tx.query("UPDATE withdrawals SET status='failed',failure_reason=$2,processed_at=now(),updated_at=now() WHERE id=$1",[id,reason.slice(0,500)]);
    return true;
  });
}

export async function creatorAdminDashboard(db: Queryable) {
  const [creators, commissions, withdrawals, fraud, levels, challenges, totals] = await Promise.all([
    db.query(`SELECT u.id,u.name,u.email,u.referral_code,u.creator_status,u.kyc_status,u.withdrawals_suspended,
      p.level_id,p.monthly_revenue_cents,p.total_revenue_cents,p.total_commission_cents,
      COALESCE(w.available_cents,0) available_cents,COALESCE(w.pending_cents,0) pending_cents
      FROM users u LEFT JOIN creator_profiles p ON p.user_id=u.id LEFT JOIN wallet_balances w ON w.user_id=u.id
      WHERE u.referral_code IS NOT NULL ORDER BY p.total_revenue_cents DESC NULLS LAST LIMIT 250`),
    db.query(`SELECT c.*,u.name creator_name,b.name buyer_name FROM commissions c JOIN users u ON u.id=c.creator_user_id JOIN users b ON b.id=c.referred_user_id ORDER BY c.created_at DESC LIMIT 200`),
    db.query(`SELECT w.id,w.user_id,w.amount_cents,w.pix_key_type,w.pix_key_last4,w.status,w.provider_id,w.failure_reason,w.requested_at,u.name FROM withdrawals w JOIN users u ON u.id=w.user_id ORDER BY w.requested_at DESC LIMIT 200`),
    db.query(`SELECT f.*,u.name FROM fraud_flags f LEFT JOIN users u ON u.id=f.user_id ORDER BY f.created_at DESC LIMIT 200`),
    db.query("SELECT * FROM creator_levels ORDER BY sort_order"),
    db.query("SELECT * FROM creator_challenges ORDER BY created_at DESC"),
    db.query(`SELECT COUNT(DISTINCT p.user_id) creators,COUNT(DISTINCT r.referred_user_id) referrals,
      COALESCE(SUM(c.eligible_amount_cents),0) revenue_cents,COALESCE(SUM(c.amount_cents),0) commission_cents
      FROM creator_profiles p LEFT JOIN referrals r ON r.referrer_user_id=p.user_id LEFT JOIN commissions c ON c.creator_user_id=p.user_id`),
  ]);
  return { creators: creators.rows, commissions: commissions.rows, withdrawals: withdrawals.rows, fraud: fraud.rows, levels: levels.rows, challenges: challenges.rows, totals: totals.rows[0] };
}

export async function creatorAdminOperation(db: Database, adminId: string, input: unknown) {
  const command = z.object({
    operation: z.enum(["creator.status","creator.kyc","creator.withdrawals","commission.block","commission.unblock","fraud.review","level.save","challenge.save","wallet.adjust"]),
    data: z.record(z.string(), z.unknown()), reason: z.string().trim().min(5).max(500),
  }).parse(input);
  return db.transaction(async (tx) => {
    let before: unknown = null, after: unknown = null;
    if (command.operation.startsWith("creator.")) {
      const id = z.string().parse(command.data.userId);
      before = (await tx.query("SELECT id,creator_status,kyc_status,withdrawals_suspended FROM users WHERE id=$1 FOR UPDATE",[id])).rows[0];
      if (!before) throw new ApiError(404,"Criador não encontrado.");
      if (command.operation === "creator.status") await tx.query("UPDATE users SET creator_status=$2 WHERE id=$1",[id,z.enum(["active","suspended","blocked"]).parse(command.data.status)]);
      if (command.operation === "creator.kyc") await tx.query("UPDATE users SET kyc_status=$2 WHERE id=$1",[id,z.enum(["not_started","pending","approved","rejected"]).parse(command.data.status)]);
      if (command.operation === "creator.withdrawals") await tx.query("UPDATE users SET withdrawals_suspended=$2 WHERE id=$1",[id,z.boolean().parse(command.data.suspended)]);
      after = (await tx.query("SELECT id,creator_status,kyc_status,withdrawals_suspended FROM users WHERE id=$1",[id])).rows[0];
    } else if (command.operation === "commission.block" || command.operation === "commission.unblock") {
      const id=z.string().parse(command.data.id); const row=(await tx.query("SELECT * FROM commissions WHERE id=$1 FOR UPDATE",[id])).rows[0];
      if(!row) throw new ApiError(404,"Comissão não encontrada."); before=row;
      const block=command.operation==="commission.block"; const from=String(row.status); const to=block?"blocked":(new Date(String(row.available_at)).getTime()<=Date.now()?"available":"pending");
      if(block && !["pending","available"].includes(from)) throw new ApiError(409,"Esta comissão não pode ser bloqueada.");
      if(!block && from!=="blocked") throw new ApiError(409,"A comissão não está bloqueada.");
      const groupId=randomUUID(), amount=cents(row.amount_cents);
      await insertLedger(tx,{userId:String(row.creator_user_id),account:from,entryType:"admin_adjustment",amountCents:-amount,sourceType:"commission_admin",sourceId:groupId,groupId,description:command.reason});
      await insertLedger(tx,{userId:String(row.creator_user_id),account:to,entryType:"admin_adjustment",amountCents:amount,sourceType:"commission_admin",sourceId:groupId,groupId,description:command.reason});
      await tx.query("UPDATE commissions SET status=$2,reason=$3,updated_at=now() WHERE id=$1",[id,to,command.reason]); after={...row,status:to};
    } else if (command.operation === "fraud.review") {
      const id=z.string().parse(command.data.id); before=(await tx.query("SELECT * FROM fraud_flags WHERE id=$1",[id])).rows[0];
      await tx.query("UPDATE fraud_flags SET status=$2,reviewed_at=now(),reviewed_by_user_id=$3 WHERE id=$1",[id,z.enum(["reviewed","dismissed","confirmed"]).parse(command.data.status),adminId]); after=(await tx.query("SELECT * FROM fraud_flags WHERE id=$1",[id])).rows[0];
    } else if (command.operation === "level.save") {
      const v=z.object({id:z.string(),name:z.string().min(2),minCents:z.number().int().nonnegative(),maxCents:z.number().int().nonnegative().nullable(),bps:z.number().int().min(0).max(10000),color:z.string().regex(/^#[0-9a-f]{6}$/i),sort:z.number().int()}).parse(command.data);
      before=(await tx.query("SELECT * FROM creator_levels WHERE id=$1",[v.id])).rows[0];
      await tx.query(`INSERT INTO creator_levels(id,name,min_monthly_revenue_cents,max_monthly_revenue_cents,commission_bps,color,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,min_monthly_revenue_cents=EXCLUDED.min_monthly_revenue_cents,max_monthly_revenue_cents=EXCLUDED.max_monthly_revenue_cents,commission_bps=EXCLUDED.commission_bps,color=EXCLUDED.color,sort_order=EXCLUDED.sort_order,updated_at=now()`,[v.id,v.name,v.minCents,v.maxCents,v.bps,v.color,v.sort]); after=v;
    } else if (command.operation === "challenge.save") {
      const v=z.object({id:z.string().optional(),title:z.string().min(2),description:z.string().min(5),metric:z.enum(["clicks","signups","buyers","revenue"]),target:z.number().int().positive(),rewardCents:z.number().int().nonnegative(),startsAt:z.string(),endsAt:z.string(),active:z.boolean()}).parse(command.data); const id=v.id||randomUUID();
      before=v.id?(await tx.query("SELECT * FROM creator_challenges WHERE id=$1",[id])).rows[0]:null;
      await tx.query(`INSERT INTO creator_challenges(id,title,description,metric,target,reward_cents,starts_at,ends_at,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,metric=EXCLUDED.metric,target=EXCLUDED.target,reward_cents=EXCLUDED.reward_cents,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,active=EXCLUDED.active`,[id,v.title,v.description,v.metric,v.target,v.rewardCents,v.startsAt,v.endsAt,v.active]); after={...v,id};
    } else {
      const v=z.object({userId:z.string(),account:z.enum(["available","blocked","internal_credit"]),amountCents:z.number().int().refine(n=>n!==0)}).parse(command.data);
      const sourceId=randomUUID(); await insertLedger(tx,{userId:v.userId,account:v.account,entryType:"admin_adjustment",amountCents:v.amountCents,sourceType:"admin_adjustment",sourceId,groupId:sourceId,description:command.reason,metadata:{adminId}}); after=v;
    }
    await tx.query("INSERT INTO admin_audit(id,user_id,operation,reason,details) VALUES($1,$2,$3,$4,$5::jsonb)",[randomUUID(),adminId,command.operation,command.reason,JSON.stringify({before,after})]);
    return after;
  });
}
