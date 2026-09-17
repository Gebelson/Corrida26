import { mode } from "./db";

function normalizedOrigin(value?: string) {
  if (!value?.trim()) return null;
  try {
    const candidate = value.includes("://") ? value : `https://${value}`;
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

function isPublicProductionOrigin(origin: string) {
  const url = new URL(origin);
  return (
    url.protocol === "https:" &&
    !["localhost", "127.0.0.1", "::1"].includes(url.hostname)
  );
}

export function publicAppOrigin(requestOrigin?: string) {
  const configured = normalizedOrigin(process.env.APP_ORIGIN);
  if (
    configured &&
    (mode() !== "production" || isPublicProductionOrigin(configured))
  )
    return configured;

  const vercelProduction = normalizedOrigin(
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  );
  if (vercelProduction) return vercelProduction;

  const requested = normalizedOrigin(requestOrigin);
  if (
    requested &&
    (mode() !== "production" || isPublicProductionOrigin(requested))
  )
    return requested;

  if (mode() === "production")
    throw new Error("Domínio público de produção não configurado.");
  return "http://127.0.0.1:3000";
}
