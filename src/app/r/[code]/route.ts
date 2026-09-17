import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getDB } from "@/server/db";
import { getSettings } from "@/server/game";
import { trackReferralClick } from "@/server/creators";
import { ipKey, route } from "@/server/security";
import { publicAppOrigin } from "@/server/origin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = route(async (req, context) => {
  const db = await getDB();
  const settings = await getSettings(db);
  const origin = publicAppOrigin(req.nextUrl.origin);
  if (!settings.creatorProgram.enabled) return NextResponse.redirect(new URL("/", origin));
  const code = (await context!.params).code;
  const result = await trackReferralClick(db, code, {
    ipHash: ipKey(req),
    userAgentHash: createHash("sha256").update(req.headers.get("user-agent") || "unknown").digest("hex"),
    landingPath: new URL(req.url).pathname,
    attributionDays: settings.creatorProgram.attributionDays,
  });
  const response = NextResponse.redirect(new URL("/?indicado=1", origin));
  response.cookies.set("corrida_referral", result.token, {
    httpOnly: true, sameSite: "lax", secure: origin.startsWith("https:"), path: "/",
    maxAge: settings.creatorProgram.attributionDays * 86400,
  });
  return response;
});
