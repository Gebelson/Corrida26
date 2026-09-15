import { NextResponse } from "next/server";
import { getDB } from "@/server/db";
import { publicTransaction } from "@/server/game";
import { route, getSession, ApiError } from "@/server/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = route(async (req) => {
  const user = await getSession(req);
  if (!user) throw new ApiError(401, "Entre para ver suas participações.");
  const db = await getDB();
  return NextResponse.json({
    user,
    transactions: (
      await db.query(
        "SELECT * FROM transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
        [user.id],
      )
    ).rows.map(publicTransaction),
  });
});
