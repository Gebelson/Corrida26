import { NextResponse } from "next/server";
import { getBoard } from "@/server/game";
import { route } from "@/server/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = route(async () => NextResponse.json(await getBoard()));
