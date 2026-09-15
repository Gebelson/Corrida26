import { getDB, mode } from "../src/server/db";
async function main() {
  if (mode() !== "sandbox")
    throw new Error("Seed de demonstração bloqueado fora de APP_MODE=sandbox.");
  const db = await getDB();
  console.log(
    "Banco sandbox pronto. Saldos iniciais já registrados no ledger.",
  );
  await db.close();
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
