import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { LEGAL, type Settings } from "../lib/types";

export interface Queryable {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}
export interface Database extends Queryable {
  transaction<T>(fn: (db: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export const mode = (): "sandbox" | "production" =>
  process.env.APP_MODE === "sandbox" ? "sandbox" : "production";
export const defaults: Settings = {
  minAmount: 5,
  quickAmounts: [5, 10, 20],
  paymentsEnabled: false,
  anonymousEnabled: true,
  heroText:
    "Escolha um lado. Cada pagamento confirmado soma apenas os pontos simbólicos correspondentes ao valor escolhido.",
  legalNotice: LEGAL,
};
export const demoCandidates = [
  ["lula", "Lula", "Lula", "#ff344c", 125336],
  ["flavio", "Flávio Bolsonaro", "Flávio", "#13adff", 117200],
  ["renan", "Renan Santos", "Renan", "#29d996", 115950],
  ["augusto", "Augusto Cury", "Augusto", "#bc98ff", 82300],
  ["caiado", "Ronaldo Caiado", "Caiado", "#ffb649", 57420],
  ["zema", "Romeu Zema", "Zema", "#91a5bc", 42180],
] as const;
export async function schemaSQL() {
  return readFile(
    path.join(process.cwd(), "supabase/migrations/001_init.sql"),
    "utf8",
  );
}
export async function initialize(db: Queryable, seed = false) {
  await db.query(
    "INSERT INTO site_settings(id,value) VALUES(1,$1::jsonb) ON CONFLICT DO NOTHING",
    [JSON.stringify({ ...defaults, paymentsEnabled: seed })],
  );
  for (const [
    index,
    [id, name, short, color, points],
  ] of demoCandidates.entries()) {
    const found = await db.query(
      "INSERT INTO candidates(id,name,short_name,color,avatar) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id",
      [id, name, short, color, `/runners.webp#${index}`],
    );
    await db.query(
      "INSERT INTO candidate_scores(candidate_id,points) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [id, seed ? points : 0],
    );
    if (seed && found.rows.length) {
      await db.query(
        "INSERT INTO score_movements(id,candidate_id,action,points,reason) VALUES($1,$2,'seed',$3,'Saldo inicial exclusivo do ambiente de demonstração')",
        [`seed-${id}`, id, points],
      );
    }
  }
  await db.query(
    "INSERT INTO ranking_history(id,scores) SELECT $1,jsonb_object_agg(candidate_id,points) FROM candidate_scores ON CONFLICT DO NOTHING",
    [seed ? "seed" : "initial"],
  );
}
export async function createLocalDatabase(
  location?: string,
): Promise<Database> {
  const pglite = new PGlite(location);
  await pglite.exec(await schemaSQL());
  const database: Database = {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ) => pglite.query<T>(sql, params),
    transaction: (fn) =>
      pglite.transaction((tx) =>
        fn({
          query: async <T extends Record<string, unknown>>(
            sql: string,
            params?: unknown[],
          ) => tx.query<T>(sql, params),
        }),
      ),
    close: () => pglite.close(),
  };
  await database.transaction((tx) => initialize(tx, true));
  return database;
}
async function connect(): Promise<Database> {
  if (mode() === "sandbox") {
    if (process.env.VERCEL)
      throw new Error(
        "Sandbox persistente não pode executar em filesystem efêmero da Vercel.",
      );
    const location =
      process.env.LOCAL_DATABASE_PATH || path.join(process.cwd(), ".local/db");
    if (location !== ":memory:")
      await mkdir(path.dirname(location), { recursive: true });
    return createLocalDatabase(location);
  }
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL obrigatório em produção.");
  const connectionString = new URL(process.env.DATABASE_URL);
  // pg parses sslmode from URLs and may silently override explicit certificate verification.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
    connectionString.searchParams.delete(key);
  const pool = new Pool({
    connectionString: connectionString.toString(),
    max: 5,
    ssl: {
      rejectUnauthorized: true,
      ...(process.env.DATABASE_SSL_CA
        ? { ca: process.env.DATABASE_SSL_CA.replace(/\\n/g, "\n") }
        : {}),
    },
  });
  return {
    query: async (sql, params) => pool.query(sql, params),
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const value = await fn(client);
        await client.query("COMMIT");
        return value;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
const globalDb = globalThis as typeof globalThis & {
  corridaDb?: Promise<Database>;
};
export function getDB() {
  return (globalDb.corridaDb ??= connect().catch((error) => {
    globalDb.corridaDb = undefined;
    throw error;
  }));
}
