import { NextResponse } from "next/server";
import { getDB } from "@/server/db";
import { createWithdrawalRequest } from "@/server/creators";
import { createWithdrawalQuote } from "@/server/payments";
import { getSettings } from "@/server/game";
import { ApiError, checkOrigin, getSession, rateLimit, readJson, route } from "@/server/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = route(async (req) => {
  checkOrigin(req);
  const user = await getSession(req);
  if (!user || user.anonymous) throw new ApiError(401, "Entre para solicitar um saque.");
  const db = await getDB();
  await rateLimit(db, `withdrawal:${user.id}`, 5, 3600);
  const settings = await getSettings(db);
  const row = await createWithdrawalRequest(db, user.id, await readJson(req), settings.creatorProgram);
  return NextResponse.json(await createWithdrawalQuote(db, row));
});
