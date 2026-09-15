import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { createLocalDatabase, type Database } from "../src/server/db";
import {
  getBoard,
  createTransaction,
  settle,
  adminOperation,
  getHistory,
  adminDashboard,
} from "../src/server/game";
import { validateWebhook, verifyPayment } from "../src/server/payments";
import {
  signSession,
  verifySession,
  checkOrigin,
  rateLimit,
} from "../src/server/security";
import type { SessionUser } from "../src/lib/types";
import { POST as createAPI } from "../src/app/api/transactions/route";
import { GET as transactionAPI } from "../src/app/api/transactions/[id]/route";
import { POST as confirmAPI } from "../src/app/api/sandbox/confirm/route";
import { GET as meAPI } from "../src/app/api/me/route";
import { GET as adminAPI } from "../src/app/api/admin/route";
import { POST as demoAPI } from "../src/app/api/auth/demo/route";

process.env.APP_MODE = "sandbox";
process.env.APP_ORIGIN = "http://localhost:3000";
process.env.SESSION_SECRET =
  "integration-test-secret-with-at-least-32-characters";
let db: Database;
const user: SessionUser = {
  id: "test-user",
  name: "Gabriel",
  email: "test@example.com",
  anonymous: false,
  admin: false,
};
const admin: SessionUser = {
  id: "test-admin",
  name: "Administrador",
  anonymous: false,
  admin: true,
};
const anon: SessionUser = {
  id: "test-anon",
  name: "Anônimo",
  anonymous: true,
  admin: false,
};
before(async () => {
  db = await createLocalDatabase();
  (
    globalThis as typeof globalThis & { corridaDb?: Promise<Database> }
  ).corridaDb = Promise.resolve(db);
  for (const u of [user, admin, anon])
    await db.query(
      "INSERT INTO users(id,name,email,anonymous) VALUES($1,$2,$3,$4)",
      [u.id, u.name, u.email || null, u.anonymous],
    );
  await db.query("INSERT INTO admin_users(user_id) VALUES($1)", [admin.id]);
});
after(async () => {
  await db.close();
});
const create = (
  candidateId: string,
  amount: number,
  action: "add" | "remove" = "add",
  actor = user,
  key = randomUUID(),
) =>
  createTransaction(db, actor, {
    candidateId,
    amount,
    action,
    idempotencyKey: key,
  });
async function add(
  candidateId: string,
  amount: number,
  action: "add" | "remove" = "add",
  actor = user,
) {
  const row = await create(candidateId, amount, action, actor);
  await settle(db, String(row.id), "paid");
  return row;
}

test("sandbox seeds an immutable ledger matching all initial scores", async () => {
  const board = await getBoard(db);
  assert.deepEqual(
    board.candidates.slice(0, 3).map((c) => [c.id, c.points]),
    [
      ["lula", 125336],
      ["flavio", 117200],
      ["renan", 115950],
    ],
  );
  assert.equal(board.movements.length, 0);
  const ledger = (
    await db.query("SELECT sum(points) AS total FROM score_movements")
  ).rows[0];
  assert.equal(
    Number(ledger.total),
    board.candidates.reduce((sum, c) => sum + c.points, 0),
  );
});
test("pending and failed payments never alter points; duplicate payment confirmations do so once", async () => {
  const initial = (await getBoard(db)).candidates.find(
    (c) => c.id === "lula",
  )!.points;
  const row = await create("lula", 20);
  assert.equal((await getBoard(db)).candidates[0].points, initial);
  await Promise.all(
    Array.from({ length: 6 }, () => settle(db, String(row.id), "paid")),
  );
  assert.equal((await getBoard(db)).candidates[0].points, initial + 20);
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT count(*) FROM score_movements WHERE transaction_id=$1",
          [row.id],
        )
      ).rows[0].count,
    ),
    1,
  );
  const failed = await create("lula", 10);
  await settle(db, String(failed.id), "failed");
  await settle(db, String(failed.id), "paid");
  assert.equal((await getBoard(db)).candidates[0].points, initial + 20);
});
test("idempotency survives simultaneous create requests and rejects a changed payload", async () => {
  const key = randomUUID();
  const rows = await Promise.all(
    Array.from({ length: 5 }, () => create("renan", 5, "add", user, key)),
  );
  assert.equal(new Set(rows.map((r) => r.id)).size, 1);
  await assert.rejects(
    create("renan", 10, "add", user, key),
    /outra participação/,
  );
});
test("third place enters top two; leader then changes; deterministic ties preserve order", async () => {
  await add("renan", 1300);
  let board = await getBoard(db);
  assert.deepEqual(
    board.candidates.slice(0, 2).map((c) => c.id),
    ["lula", "renan"],
  );
  assert.ok(
    board.events.some((e) => e.message === "Renan Santos entrou no Top 2"),
  );
  await add("renan", 9000);
  board = await getBoard(db);
  assert.equal(board.candidates[0].id, "renan");
  assert.ok(
    board.events.some((e) => e.message === "Renan Santos assumiu a liderança"),
  );
  const difference =
    board.candidates[0].points -
    board.candidates.find((c) => c.id === "lula")!.points;
  await add("lula", difference);
  board = await getBoard(db);
  assert.equal(board.candidates[0].id, "lula");
  assert.equal(board.candidates[0].points, board.candidates[1].points);
  assert.ok(board.events.some((e) => e.kind === "tie"));
});
test("removal applies a negative immutable delta and rankings remain sorted", async () => {
  const initial = (await getBoard(db)).candidates.find(
    (c) => c.id === "lula",
  )!.points;
  const row = await add("lula", 20, "remove", anon);
  const board = await getBoard(db);
  assert.equal(
    board.candidates.find((c) => c.id === "lula")!.points,
    initial - 20,
  );
  assert.equal(board.candidates[0].id, "renan");
  const movement = board.movements.find((m) => m.transactionId === row.id)!;
  assert.equal(movement.points, -20);
  assert.equal(movement.actorName, "Anônimo");
  assert.equal(movement.action, "remove");
  assert.ok(
    board.candidates.every((c, i, a) => i === 0 || a[i - 1].points >= c.points),
  );
});
test("admin reversal is a compensating log; original movement cannot be edited/deleted", async () => {
  const initial = (await getBoard(db)).candidates.find(
    (c) => c.id === "augusto",
  )!.points;
  const row = await add("augusto", 20);
  await assert.rejects(
    db.query("UPDATE score_movements SET points=999 WHERE transaction_id=$1", [
      row.id,
    ]),
    /Append-only/,
  );
  await assert.rejects(
    db.query("DELETE FROM score_movements WHERE transaction_id=$1", [row.id]),
    /Append-only/,
  );
  await adminOperation(db, admin, {
    operation: "transaction.reverse",
    data: { transactionId: row.id },
    reason: "Participação inválida confirmada",
  });
  assert.equal(
    (await getBoard(db)).candidates.find((c) => c.id === "augusto")!.points,
    initial,
  );
  const rows = (
    await db.query("SELECT * FROM score_movements WHERE transaction_id=$1", [
      row.id,
    ])
  ).rows;
  assert.equal(rows.length, 2);
  assert.equal(
    rows.reduce((sum, r) => sum + Number(r.points), 0),
    0,
  );
  await assert.rejects(
    adminOperation(db, admin, {
      operation: "transaction.reverse",
      data: { id: row.id },
      reason: "Tentativa duplicada",
    }),
    /Somente/,
  );
  assert.ok(
    (await adminDashboard(db)).audit.some(
      (r) => r.operation === "transaction.reverse",
    ),
  );
});
test("authorization and setting validation block forged browser changes", async () => {
  await assert.rejects(
    adminOperation(db, user, {
      operation: "settings.save",
      data: {},
      reason: "Tentativa indevida",
    }),
    /Sem permissão/,
  );
  const settings = (await getBoard(db)).settings;
  await adminOperation(db, admin, {
    operation: "settings.save",
    data: { ...settings, paymentsEnabled: false },
    reason: "Pausa para manutenção",
  });
  await assert.rejects(create("lula", 20), /pausadas/);
  await adminOperation(db, admin, {
    operation: "settings.save",
    data: {
      ...settings,
      anonymousEnabled: false,
      minAmount: 10,
      quickAmounts: [10, 20],
    },
    reason: "Atualização dos limites",
  });
  await assert.rejects(create("lula", 20, "add", anon), /Entre/);
  await assert.rejects(create("lula", 5), /mínimo/);
  await adminOperation(db, admin, {
    operation: "settings.save",
    data: settings,
    reason: "Restaurar configuração",
  });
  await assert.rejects(create("lula", 5.5), /expected int/);
  await assert.rejects(create("inexistente", 10), /indisponível/);
});
test("candidate creation starts at zero, hiding is logged, no points accepted in candidate payload", async () => {
  const data = {
    id: "teste",
    name: "Candidato Teste",
    shortName: "Teste",
    color: "#abcdef",
    avatar: "/runners.webp#0",
    active: true,
    points: 9999,
  };
  await adminOperation(db, admin, {
    operation: "candidate.save",
    data,
    reason: "Cadastro para verificação",
  });
  assert.equal(
    (await getBoard(db)).candidates.find((c) => c.id === "teste")!.points,
    0,
  );
  await add("teste", 20, "remove");
  const candidate = (await getBoard(db)).candidates.find(
    (c) => c.id === "teste",
  )!;
  assert.equal(candidate.points, -20);
  assert.equal(candidate.percentage, 0);
  await adminOperation(db, admin, {
    operation: "candidate.save",
    data: { ...data, active: false },
    reason: "Ocultar candidato teste",
  });
  assert.ok(!(await getBoard(db)).candidates.some((c) => c.id === "teste"));
  await assert.rejects(create("teste", 10), /indisponível/);
});

test("admin can create a candidate without manually inventing an id or avatar", async () => {
  await adminOperation(db, admin, {
    operation: "candidate.save",
    data: {
      name: "Nova Pessoa",
      shortName: "Nova",
      avatar: "",
      color: "#22c9b3",
      active: true,
    },
    reason: "Novo cadastro público",
  });
  const created = (await getBoard(db)).candidates.find(
    (candidate) => candidate.name === "Nova Pessoa",
  );
  assert.ok(created);
  assert.match(created.id, /^nova-[a-f0-9]{6}$/);
  assert.equal(created.points, 0);
  assert.equal(created.avatar, "");
});
test("history and percentage derive from persisted snapshots; ledger equals scores", async () => {
  const history = await getHistory(db, "24H");
  assert.ok(history.points.length > 0);
  assert.ok(history.events.some((e) => e.kind === "leadership"));
  const board = await getBoard(db);
  assert.ok(
    Math.abs(board.candidates.reduce((sum, c) => sum + c.percentage, 0) - 100) <
      1e-8,
  );
  const mismatch = await db.query(
    "SELECT s.candidate_id FROM candidate_scores s LEFT JOIN score_movements m ON m.candidate_id=s.candidate_id GROUP BY s.candidate_id,s.points HAVING s.points<>COALESCE(sum(m.points),0)",
  );
  assert.equal(mismatch.rows.length, 0);
  assert.ok(board.movements.length <= 6);
});
test("webhook signature rejects forged, altered, and stale events; accepts second and millisecond clocks", () => {
  const secret = "test-secret";
  const requestId = "request-123";
  const now = Date.now();
  for (const ts of [String(Math.floor(now / 1000)), String(now)]) {
    const signature = createHmac("sha256", secret)
      .update(`id:123;request-id:${requestId};ts:${ts};`)
      .digest("hex");
    const header = `ts=${ts},v1=${signature}`;
    assert.equal(
      validateWebhook(header, requestId, "123", secret, now).providerId,
      "123",
    );
    assert.throws(
      () => validateWebhook(header, requestId, "456", secret, now),
      /inválida/,
    );
    assert.throws(
      () => validateWebhook(header, requestId, "123", secret, now + 600000),
      /expirada/,
    );
  }
  assert.throws(
    () => validateWebhook(null, requestId, "123", secret),
    /inválida/,
  );
});
test("payment reconciliation validates amount, currency, method, live mode and binding", () => {
  const payment = {
    id: 123,
    status: "approved",
    transaction_amount: 20,
    currency_id: "BRL",
    external_reference: "abc",
    payment_method_id: "pix",
    live_mode: true,
  };
  const row = { id: "abc", provider_id: "123", amount_cents: 2000 };
  verifyPayment(payment, row);
  for (const change of [
    { transaction_amount: 21 },
    { currency_id: "USD" },
    { external_reference: "wrong" },
    { id: 124 },
    { payment_method_id: "card" },
  ])
    assert.throws(
      () => verifyPayment({ ...payment, ...change }, row),
      /não corresponde/,
    );
  process.env.APP_MODE = "production";
  assert.throws(
    () => verifyPayment({ ...payment, live_mode: false }, row),
    /não corresponde/,
  );
  process.env.APP_MODE = "sandbox";
});
test("webhook replay receipts and concurrent settlement create one movement", async () => {
  const row = await create("zema", 5);
  const receipt = { key: "receipt-one", providerId: "123" };
  await Promise.all(
    Array.from({ length: 5 }, () =>
      settle(db, String(row.id), "paid", receipt),
    ),
  );
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT count(*) FROM score_movements WHERE transaction_id=$1",
          [row.id],
        )
      ).rows[0].count,
    ),
    1,
  );
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT count(*) FROM webhook_receipts WHERE receipt_key=$1",
          [receipt.key],
        )
      ).rows[0].count,
    ),
    1,
  );
  await settle(db, String(row.id), "refunded", {
    key: "receipt-refund",
    providerId: "123",
  });
  await settle(db, String(row.id), "refunded", {
    key: "receipt-refund-2",
    providerId: "123",
  });
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT sum(points) AS total FROM score_movements WHERE transaction_id=$1",
          [row.id],
        )
      ).rows[0].total,
    ),
    0,
  );
});
test("signed session refuses modification and origins block cross-site writes", () => {
  const token = signSession(user.id);
  assert.equal(verifySession(token), user.id);
  assert.equal(verifySession(token + "x"), null);
  assert.equal(verifySession("forged"), null);
  checkOrigin(
    new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    }),
  );
  assert.throws(
    () =>
      checkOrigin(
        new NextRequest("http://localhost:3000/api/transactions", {
          method: "POST",
          headers: { origin: "https://evil.example" },
        }),
      ),
    /não autorizada/,
  );
  assert.throws(
    () =>
      checkOrigin(
        new NextRequest("http://localhost:3000/api/transactions", {
          method: "POST",
        }),
      ),
    /não autorizada/,
  );
});
test("database rate limit is shared and enforced", async () => {
  await rateLimit(db, "test-limit", 2);
  await rateLimit(db, "test-limit", 2);
  await assert.rejects(rateLimit(db, "test-limit", 2), /Muitas/);
});

function request(path: string, body?: unknown, cookie?: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      origin: "http://localhost:3000",
      ...(cookie ? { cookie } : {}),
      "content-type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
test("anonymous first-request duplicates get one transaction and a signed httpOnly owner session", async () => {
  const body = {
    candidateId: "flavio",
    action: "add",
    amount: 5,
    idempotencyKey: randomUUID(),
  };
  const responses = await Promise.all([
    createAPI(request("/api/transactions", body)),
    createAPI(request("/api/transactions", body)),
  ]);
  assert.ok(responses.every((r) => r.status === 200));
  const values = await Promise.all(responses.map((r) => r.json()));
  assert.equal(values[0].id, values[1].id);
  const cookie = responses[0].headers.get("set-cookie")!;
  assert.match(cookie, /HttpOnly/i);
  const session = cookie.split(";")[0];
  const wrong = await transactionAPI(
    request(
      `/api/transactions/${values[0].id}`,
      undefined,
      `corrida_session=${signSession(user.id)}`,
    ),
    { params: Promise.resolve({ id: values[0].id }) },
  );
  assert.equal(wrong.status, 404);
  const owner = await transactionAPI(
    request(`/api/transactions/${values[0].id}`, undefined, session),
    { params: Promise.resolve({ id: values[0].id }) },
  );
  assert.equal(owner.status, 200);
  const confirm = await confirmAPI(
    request(
      "/api/sandbox/confirm",
      { transactionId: values[0].id, outcome: "paid" },
      session,
    ),
  );
  assert.equal(confirm.status, 200);
  assert.equal((await confirm.json()).transaction.status, "paid");
  const my = await meAPI(request("/api/me", undefined, session));
  assert.equal(my.status, 200);
  assert.equal((await my.json()).transactions.length, 1);
});
test("authenticated history is private and admin endpoint requires a database permission", async () => {
  const my = await meAPI(
    request("/api/me", undefined, `corrida_session=${signSession(user.id)}`),
  );
  const data = await my.json();
  assert.equal(my.status, 200);
  assert.equal(data.user.name, "Gabriel");
  assert.ok(data.transactions.length > 0);
  assert.equal((await meAPI(request("/api/me"))).status, 401);
  assert.equal(
    (
      await adminAPI(
        request(
          "/api/admin",
          undefined,
          `corrida_session=${signSession(user.id)}`,
        ),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await adminAPI(
        request(
          "/api/admin",
          undefined,
          `corrida_session=${signSession(admin.id)}`,
        ),
      )
    ).status,
    200,
  );
});
test("production refuses both sandbox settlement and demo admin login", async () => {
  process.env.APP_MODE = "production";
  try {
    assert.equal(
      (
        await confirmAPI(
          request("/api/sandbox/confirm", {
            transactionId: randomUUID(),
            outcome: "paid",
          }),
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await demoAPI(
          request("/api/auth/demo", { name: "Hacker", role: "admin" }),
        )
      ).status,
      404,
    );
  } finally {
    process.env.APP_MODE = "sandbox";
  }
});
