import { NextResponse } from "next/server";
import { getBoard, getPresentationBoard } from "@/server/game";
import { databaseConfigured } from "@/server/db";
import { route } from "@/server/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = route(async () => {
  if (!databaseConfigured())
    return NextResponse.json(getPresentationBoard());

  try {
    return NextResponse.json(await getBoard());
  } catch (error) {
    console.error("Board database unavailable; serving presentation board.", error);
    return NextResponse.json(getPresentationBoard(), {
      headers: { "x-corrida-data-source": "presentation-fallback" },
    });
  }
});
