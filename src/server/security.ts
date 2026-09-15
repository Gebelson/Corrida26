import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { SessionUser } from "../lib/types";
import { getDB, mode, type Queryable } from "./db";
import { ApiError } from "./errors";
import { claimReferral } from "./creators";

export { ApiError } from "./errors";
const runtimeSecret = randomBytes(48).toString("hex");
function secret() {
  const value = process.env.SESSION_SECRET;
  if (mode() === "production" && (!value || value.length < 32))
    throw new Error("SESSION_SECRET de no mínimo 32 caracteres obrigatório.");
  return value || runtimeSecret;
}
export function signSession(id: string) {
  const payload = Buffer.from(
    JSON.stringify({ id, exp: Date.now() + 30 * 86400000 }),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("base64url")}`;
}
export function anonymousId(idempotencyKey: string) {
  return `anon-${createHmac("sha256", secret()).update(`anonymous:${idempotencyKey}`).digest("hex")}`;
}
export function verifySession(token: string): string | null {
  try {
    const [payload, signature] = token.split(".");
    const expected = createHmac("sha256", secret()).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
    return parsed.exp > Date.now() && typeof parsed.id === "string"
      ? parsed.id
      : null;
  } catch {
    return null;
  }
}
export const authConfigured = () =>
  Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL) &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
export async function getSession(
  req: NextRequest,
): Promise<SessionUser | null> {
  const db = await getDB();
  const bearer = req.headers.get("authorization");
  let id: string | null = null;
  if (bearer?.startsWith("Bearer ")) {
    if (!authConfigured())
      throw new ApiError(503, "Autenticação não configurada.");
    const client = createClient(
      (process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        process.env.SUPABASE_URL)!,
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await client.auth.getUser(bearer.slice(7));
    if (error || !data.user)
      throw new ApiError(401, "Sessão expirada. Entre novamente.");
    const user = data.user;
    id = user.id;
    await db.query(
      "INSERT INTO users(id,name,email,anonymous) VALUES($1,$2,$3,false) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email",
      [
        id,
        String(
          user.user_metadata?.full_name ||
            user.email?.split("@")[0] ||
            "Participante",
        ).slice(0, 60),
        user.email ?? null,
      ],
    );
  } else {
    const cookie = req.cookies.get("corrida_session")?.value;
    id = cookie ? verifySession(cookie) : null;
  }
  if (!id) return null;
  const trackingToken = req.cookies.get("corrida_referral")?.value;
  if (trackingToken) await claimReferral(db, id, trackingToken);
  const result = await db.query(
    "SELECT u.*,EXISTS(SELECT 1 FROM admin_users a WHERE a.user_id=u.id) AS admin FROM users u WHERE u.id=$1",
    [id],
  );
  const row = result.rows[0];
  return row
    ? {
        id: String(row.id),
        name: String(row.name),
        email: row.email ? String(row.email) : undefined,
        anonymous: Boolean(row.anonymous),
        admin: Boolean(row.admin),
      }
    : null;
}
export async function requireAdmin(req: NextRequest) {
  const user = await getSession(req);
  if (!user || user.anonymous || !user.admin)
    throw new ApiError(403, "Acesso restrito a administradores.");
  return user;
}
export function cookie(response: NextResponse, id: string) {
  response.cookies.set("corrida_session", signSession(id), {
    httpOnly: true,
    secure: process.env.APP_ORIGIN?.startsWith("https:") ?? false,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 86400,
  });
  return response;
}
export function checkOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const allowed = process.env.APP_ORIGIN || new URL(req.url).origin;
  if (mode() === "production" && !process.env.APP_ORIGIN)
    throw new ApiError(503, "Origem de produção não configurada.");
  if (!origin || origin !== allowed)
    throw new ApiError(403, "Origem da requisição não autorizada.");
  const size = Number(req.headers.get("content-length") || 0);
  if (size > 20000) throw new ApiError(413, "Requisição muito grande.");
}
export async function readJson(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 20000) throw new ApiError(413, "Requisição muito grande.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, "JSON inválido.");
  }
}
export async function rateLimit(
  db: Queryable,
  key: string,
  limit = 30,
  seconds = 60,
) {
  const result = await db.query(
    `INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,now()+($2::text||' seconds')::interval) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.count+1 END,expires_at=CASE WHEN rate_limits.expires_at<now() THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END RETURNING count`,
    [key, seconds],
  );
  if (Number(result.rows[0].count) > limit)
    throw new ApiError(429, "Muitas tentativas. Aguarde um minuto.");
}
export function ipKey(req: NextRequest) {
  return createHash("sha256")
    .update(
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local",
    )
    .digest("hex");
}
export function route(
  handler: (
    req: NextRequest,
    ctx?: { params: Promise<Record<string, string>> },
  ) => Promise<NextResponse>,
) {
  return async (
    req: NextRequest,
    ctx?: { params: Promise<Record<string, string>> },
  ) => {
    try {
      const response = await handler(req, ctx);
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch (error) {
      if (error instanceof ApiError)
        return NextResponse.json(
          { error: error.message },
          { status: error.status },
        );
      if (error && typeof error === "object" && "issues" in error)
        return NextResponse.json(
          { error: "Dados inválidos. Revise os campos." },
          { status: 400 },
        );
      console.error(
        "API failure",
        error instanceof Error ? error.message : "unknown",
      );
      return NextResponse.json(
        { error: "Não foi possível concluir. Tente novamente." },
        { status: 500 },
      );
    }
  };
}
