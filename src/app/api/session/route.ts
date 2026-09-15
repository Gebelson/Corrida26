import { NextResponse } from "next/server";
import { getSession, authConfigured, route } from "@/server/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = route(async (req) =>
  NextResponse.json({
    user: await getSession(req),
    authConfigured: authConfigured(),
  }),
);
