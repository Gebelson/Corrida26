import { NextResponse } from "next/server";
import { getDB } from "@/server/db";
import {
  createTransaction,
  getSettings,
  transactionSchema,
} from "@/server/game";
import { ensureCharge } from "@/server/payments";
import {
  route,
  checkOrigin,
  getSession,
  cookie,
  rateLimit,
  readJson,
  ipKey,
  ApiError,
  anonymousId,
} from "@/server/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = route(async (req) => {
  checkOrigin(req);
  const db = await getDB();
  await rateLimit(db, "create-ip:" + ipKey(req), 30);
  const input = transactionSchema.parse(await readJson(req));
  let user = await getSession(req);
  let newId: string | undefined;
  if (!user) {
    if (!(await getSettings(db)).anonymousEnabled)
      throw new ApiError(401, "Entre para participar.");
    newId = anonymousId(input.idempotencyKey);
    user = { id: newId, name: "Anônimo", anonymous: true, admin: false };
    await db.query(
      "INSERT INTO users(id,name,anonymous) VALUES($1,'Anônimo',true) ON CONFLICT DO NOTHING",
      [newId],
    );
  }
  await rateLimit(db, "create-user:" + user.id, 20);
  const row = await createTransaction(db, user, input);
  let response: NextResponse;
  try {
    response = NextResponse.json(await ensureCharge(db, row));
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    // Preserve anonymous ownership even when the remote gateway times out after accepting the charge.
    response = NextResponse.json(
      { error: error.message, transactionId: String(row.id) },
      { status: error.status },
    );
  }
  return newId ? cookie(response, newId) : response;
});
