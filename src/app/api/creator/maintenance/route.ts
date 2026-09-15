import { NextResponse } from "next/server";
import { getDB } from "@/server/db";
import { releaseDueCommissions } from "@/server/creators";
import { ApiError, route } from "@/server/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = route(async (req) => {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get("authorization") !== `Bearer ${expected}`) throw new ApiError(401, "Não autorizado.");
  return NextResponse.json({ released: await releaseDueCommissions(await getDB()) });
});
