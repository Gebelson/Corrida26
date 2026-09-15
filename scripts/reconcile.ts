import { getDB, mode } from "../src/server/db";
import { ensureCharge, reconcile } from "../src/server/payments";

// Run from a trusted scheduler/operations console with server environment variables.
// Webhooks are primary. This repairs missed callbacks or timeouts without fabricating payment approval.
async function main() {
  if (mode() !== "production")
    throw new Error("A reconciliação do provedor exige APP_MODE=production.");
  const db = await getDB();
  let failures = 0;
  try {
    const { rows } = await db.query(
      "SELECT * FROM transactions WHERE provider='mercadopago' AND (status='pending' OR (status='paid' AND created_at>now()-interval '30 days')) ORDER BY updated_at ASC LIMIT 100",
    );
    for (const row of rows) {
      try {
        if (row.provider_id) await reconcile(db, row);
        else await ensureCharge(db, row);
      } catch (error) {
        failures++;
        console.error(
          `Falha na transação ${row.id}: ${error instanceof Error ? error.message : "erro desconhecido"}`,
        );
      }
    }
    await db.query("DELETE FROM rate_limits WHERE expires_at<now()");
    console.log(
      `Reconciliação: ${rows.length} cobranças consultadas; ${failures} falhas.`,
    );
  } finally {
    await db.close();
  }
  if (failures) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
