import { NextResponse } from "next/server";
import { getBoard, getPresentationBoard } from "@/server/game";
import { databaseConfigured } from "@/server/db";
import { route } from "@/server/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = route(async () =>
  NextResponse.json(
    databaseConfigured() ? await getBoard() : getPresentationBoard(),
  ),
);
