import { NextResponse } from "next/server";
import { route, checkOrigin } from "@/server/security";
export const runtime = "nodejs";
export const POST = route(async (req) => {
  checkOrigin(req);
  const response = NextResponse.json({ ok: true });
  response.cookies.set("corrida_session", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
});
