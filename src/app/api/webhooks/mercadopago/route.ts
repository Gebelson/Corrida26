import { NextResponse } from "next/server";
import { getDB } from "@/server/db";
import { handleWebhook } from "@/server/payments";
import { route } from "@/server/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = route(async (req) =>
  NextResponse.json(await handleWebhook(req, await getDB())),
);
