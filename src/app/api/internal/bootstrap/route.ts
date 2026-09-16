import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getDB } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "corrida26.contato@gmail.com";
const PROJECT_REF = "ugykqfayfijkelvgvyjp";

function authorized(req: Request) {
  const expected = process.env.BOOTSTRAP_TOKEN?.trim();
  const supplied = req.headers.get("x-bootstrap-token")?.trim();
  return Boolean(expected && supplied && expected === supplied);
}

async function configureGoogle() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret)
    return { configured: false, status: 0, reason: "missing-oauth-env" };

  const tokens = [
    process.env.SUPABASE_ACCESS_TOKEN,
    process.env.SUPABASE_SECRET_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ].filter((value): value is string => Boolean(value?.trim()));

  let status = 401;
  for (const token of tokens) {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          external_google_enabled: true,
          external_google_client_id: clientId,
          external_google_secret: clientSecret,
        }),
        cache: "no-store",
      },
    );
    status = response.status;
    if (response.ok) return { configured: true, status };
  }
  return { configured: false, status, reason: "management-auth-required" };
}

export async function POST(req: Request) {
  if (!authorized(req))
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const supabaseUrl = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL
  )?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRole)
    return NextResponse.json(
      { error: "Integração administrativa do Supabase ausente." },
      { status: 503 },
    );

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const users = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw users.error;
  let authUser = users.data.users.find(
    (user) => user.email?.toLowerCase() === ADMIN_EMAIL,
  );
  let created = false;
  if (!authUser) {
    const result = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      email_confirm: true,
      password: randomBytes(36).toString("base64url"),
      user_metadata: { name: "Administrador CORRIDA 26" },
    });
    if (result.error) throw result.error;
    authUser = result.data.user;
    created = true;
  }

  const db = await getDB();
  await db.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO users(id,name,email,anonymous)
       VALUES($1,$2,$3,false)
       ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,anonymous=false`,
      [authUser.id, "Administrador CORRIDA 26", ADMIN_EMAIL],
    );
    await tx.query(
      "INSERT INTO admin_users(user_id) VALUES($1) ON CONFLICT DO NOTHING",
      [authUser.id],
    );
  });

  const google = await configureGoogle();
  return NextResponse.json({
    adminReady: true,
    adminCreated: created,
    google,
  });
}
