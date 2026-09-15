import { NextResponse } from "next/server";
import { getDB } from "@/server/db";
import { reconcile, ensureCharge } from "@/server/payments";
import { route, getSession, ApiError, rateLimit } from "@/server/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = route(async (req, context) => {
  const db = await getDB();
  const user = await getSession(req);
  if (!user) throw new ApiError(401, "Entre novamente para consultar.");
  await rateLimit(db, "consult:" + user.id, 90);
  const id = (await context!.params).id;
  const row = (
    await db.query("SELECT * FROM transactions WHERE id=$1 AND user_id=$2", [
      id,
      user.id,
    ])
  ).rows[0];
  if (!row) throw new ApiError(404, "Transação não encontrada.");
  return NextResponse.json(
    row.provider_id ? await reconcile(db, row) : await ensureCharge(db, row),
  );
});
