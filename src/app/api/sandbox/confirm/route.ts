import { NextResponse } from "next/server";
import { z } from "zod";
import { getDB, mode } from "@/server/db";
import { getBoard, settle } from "@/server/game";
import {
  route,
  checkOrigin,
  getSession,
  ApiError,
  readJson,
  rateLimit,
} from "@/server/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = route(async (req) => {
  checkOrigin(req);
  if (mode() !== "sandbox") throw new ApiError(404, "Rota indisponível.");
  const db = await getDB();
  const user = await getSession(req);
  if (!user) throw new ApiError(401, "Sessão necessária.");
  await rateLimit(db, "confirm:" + user.id, 40);
  const data = z
    .object({ transactionId: z.string(), outcome: z.enum(["paid", "failed"]) })
    .parse(await readJson(req));
  const row = (
    await db.query(
      "SELECT id FROM transactions WHERE id=$1 AND user_id=$2 AND provider='sandbox'",
      [data.transactionId, user.id],
    )
  ).rows[0];
  if (!row) throw new ApiError(404, "Transação não encontrada.");
  return NextResponse.json({
    transaction: await settle(db, data.transactionId, data.outcome),
    board: await getBoard(db),
  });
});
