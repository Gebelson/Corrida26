import { NextResponse } from "next/server";
import { getSession, authConfigured, route } from "@/server/security";
import { databaseConfigured } from "@/server/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = route(async (req) =>
  NextResponse.json({
    user: databaseConfigured() ? await getSession(req) : null,
    authConfigured: authConfigured(),
  }),
);
