import { expect, test } from "@playwright/test";

test("placar, rotas e layout carregam corretamente", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".hero h1")).toContainText("X");
  await expect(page.locator(".score-side strong").first()).toBeVisible();
  await expect(
    page.getByText(/Paródia\. Pontos simbólicos internos/i),
  ).toBeVisible();
  await page.getByRole("link", { name: "Ranking", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "RANKING GLOBAL" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Histórico", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A CORRIDA, PONTO A PONTO." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Regras", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "AS REGRAS DA CORRIDA." }),
  ).toBeVisible();
  await expect(page.getByText("Eleição oficial")).toBeAttached();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("layout mobile usa painéis em uma coluna e não cria rolagem lateral", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".hero h1")).toContainText("X");
  const panels = page.locator(".participate-panel");
  await expect(panels).toHaveCount(2);
  const first = await panels.nth(0).boundingBox(),
    second = await panels.nth(1).boundingBox();
  expect(first && second && second.y > first.y + first.height - 2).toBe(true);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test.describe("fluxos de movimentação", () => {
  test.describe.configure({ mode: "serial" });
  test("falha de pagamento não altera o placar", async ({ page }) => {
    await page.goto("/");
    const before = (
      await page.locator(".score-side.red strong").textContent()
    )?.trim();
    await page
      .locator(".participate-panel.red .amount-options:not(.subtract) button")
      .last()
      .click();
    await page.getByRole("button", { name: "Testar movimentação" }).click();
    await page
      .getByRole("button", { name: "Simular falha no pagamento" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Pagamento não confirmado" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Fechar" }).click();
    await expect(page.locator(".score-side.red strong")).toHaveText(before!);
  });

  test("confirmação atualiza duas abas e promove um novo Top 2", async ({
    context,
    page,
  }) => {
    const other = await context.newPage();
    await Promise.all([page.goto("/"), other.goto("/")]);
    const board = await (await page.request.get("/api/board")).json();
    const target = board.candidates[2];
    const amount = Math.min(
      10000,
      board.candidates[1].points - target.points + 1,
    );
    await page
      .locator(".challenger-card")
      .filter({ hasText: target.name.toUpperCase() })
      .getByRole("button", { name: "APOIAR" })
      .click();
    await page.getByLabel("Valor da participação").fill(String(amount));
    await page.getByRole("button", { name: "Testar movimentação" }).click();
    await page
      .getByRole("button", { name: "Simular pagamento aprovado" })
      .click();
    await expect(page.locator(".payment-success")).toContainText(
      `+${amount.toLocaleString("pt-BR")} PONTOS`,
    );
    await page.getByRole("button", { name: /Voltar para a corrida/ }).click();
    const targetName = new RegExp(target.shortName, "i");
    await expect(page.locator(".hero h1")).toContainText(targetName, {
      timeout: 8_000,
    });
    await expect(other.locator(".hero h1")).toContainText(targetName, {
      timeout: 8_000,
    });
    await expect(page.getByText(/NOVO TOP 2/)).toBeVisible();
    await other.close();
  });

  test("usuário identificado vê o próprio histórico", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.getByLabel("Como podemos chamar você?").fill("Gabriel Teste");
    await page.getByRole("button", { name: "Criar sessão de teste" }).click();
    await page.getByRole("link", { name: "Gabriel" }).click();
    await expect(
      page.getByRole("heading", { name: "MINHA PARTICIPAÇÃO" }),
    ).toBeVisible();
    await expect(page.getByText("Gabriel Teste")).toBeVisible();
  });
});
