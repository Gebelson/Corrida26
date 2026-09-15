import { NextResponse } from "next/server";
import { getDB } from "@/server/db";
import { adminDashboard, adminOperation } from "@/server/game";
import {
  route,
  checkOrigin,
  requireAdmin,
  readJson,
  rateLimit,
} from "@/server/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = route(async (req) => {
  await requireAdmin(req);
  return NextResponse.json(await adminDashboard(await getDB()));
});
export const POST = route(async (req) => {
  checkOrigin(req);
  const user = await requireAdmin(req);
  const db = await getDB();
  await rateLimit(db, "admin:" + user.id, 30);
  await adminOperation(db, user, await readJson(req));
  return NextResponse.json(await adminDashboard(db));
});
