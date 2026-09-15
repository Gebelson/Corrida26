import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDB, mode } from "@/server/db";
import {
  ApiError,
  checkOrigin,
  cookie,
  ipKey,
  rateLimit,
  readJson,
  route,
} from "@/server/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = route(async (req) => {
  checkOrigin(req);
  if (mode() !== "sandbox") throw new ApiError(404, "Rota indisponível.");
  const db = await getDB();
  await rateLimit(db, "login:" + ipKey(req), 20);
  const data = z
    .object({
      name: z.string().trim().min(2).max(60),
      email: z.email().optional(),
      role: z.enum(["admin", "user"]).optional(),
    })
    .parse(await readJson(req));
  const id = "demo-" + randomUUID();
  await db.transaction(async (tx) => {
    await tx.query(
      "INSERT INTO users(id,name,email,anonymous) VALUES($1,$2,$3,false)",
      [id, data.name, data.email || null],
    );
    if (data.role === "admin")
      await tx.query("INSERT INTO admin_users(user_id) VALUES($1)", [id]);
  });
  return cookie(
    NextResponse.json({
      user: {
        id,
        name: data.name,
        email: data.email,
        anonymous: false,
        admin: data.role === "admin",
      },
    }),
    id,
  );
});
