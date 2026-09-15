import { NextResponse } from "next/server";
import { getDB } from "@/server/db";
import { creatorDashboard, releaseDueCommissions } from "@/server/creators";
import { ApiError, getSession, route } from "@/server/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = route(async (req) => {
  const user = await getSession(req);
  if (!user || user.anonymous) throw new ApiError(401, "Entre para acessar o painel de criador.");
  const db = await getDB();
  await releaseDueCommissions(db);
  return NextResponse.json(await creatorDashboard(db, user.id));
});
