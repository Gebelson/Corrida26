import { Pool } from "pg";
import { schemaSQL, initialize } from "../src/server/db";
async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error("Defina DATABASE_URL para o PostgreSQL de produção.");
  const connection = new URL(process.env.DATABASE_URL);
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
    connection.searchParams.delete(key);
  const pool = new Pool({
    connectionString: connection.toString(),
    ssl: {
      rejectUnauthorized: true,
      ...(process.env.DATABASE_SSL_CA
        ? { ca: process.env.DATABASE_SSL_CA.replace(/\\n/g, "\n") }
        : {}),
    },
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(await schemaSQL());
    await initialize(client, false);
    await client.query("COMMIT");
    console.log(
      "Migração aplicada. Produção inicia com os candidatos cadastrados, pontuação zerada e pagamentos pausados.",
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
