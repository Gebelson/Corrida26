import { NextResponse } from "next/server";
import { getHistory } from "@/server/game";
import { getDB } from "@/server/db";
import { route, ApiError } from "@/server/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = route(async (req) => {
  const range = new URL(req.url).searchParams.get("range") || "24H";
  if (!["24H", "7D", "30D", "all"].includes(range))
    throw new ApiError(400, "Período inválido.");
  return NextResponse.json(await getHistory(await getDB(), range));
});
