import { NextResponse } from "next/server";
import { getDB } from "@/server/db";
import { creatorLeaderboard } from "@/server/creators";
import { route } from "@/server/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = route(async () => NextResponse.json({ creators: await creatorLeaderboard(await getDB()) }));
