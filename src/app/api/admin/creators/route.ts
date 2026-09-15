import { NextResponse } from "next/server";
import { getDB } from "@/server/db";
import { creatorAdminDashboard, creatorAdminOperation } from "@/server/creators";
import { checkOrigin, rateLimit, readJson, requireAdmin, route } from "@/server/security";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export const GET=route(async(req)=>{await requireAdmin(req);return NextResponse.json(await creatorAdminDashboard(await getDB()))});
export const POST=route(async(req)=>{checkOrigin(req);const admin=await requireAdmin(req),db=await getDB();await rateLimit(db,`admin-creators:${admin.id}`,40);await creatorAdminOperation(db,admin.id,await readJson(req));return NextResponse.json(await creatorAdminDashboard(db))});
