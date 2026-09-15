export type Action = "add" | "remove";
export interface Candidate {
  id: string;
  name: string;
  shortName: string;
  color: string;
  avatar: string;
  points: number;
  position: number;
  active: boolean;
  gapToLeader: number;
  gapToTop2: number;
  percentage: number;
}
export interface Movement {
  id: string;
  candidateId: string;
  candidateName: string;
  actorName: string;
  action: Action | "adjustment" | "seed";
  points: number;
  createdAt: string;
  transactionId: string | null;
}
export interface RankingEvent {
  id: string;
  kind: string;
  message: string;
  createdAt: string;
}
export interface HistoryPoint {
  timestamp: string;
  scores: Record<string, number>;
}
export interface Settings {
  minAmount: number;
  quickAmounts: number[];
  paymentsEnabled: boolean;
  anonymousEnabled: boolean;
  legalNotice: string;
  heroText: string;
}
export interface Board {
  candidates: Candidate[];
  movements: Movement[];
  events: RankingEvent[];
  settings: Settings;
  updatedAt: string;
  mode: "sandbox" | "production";
}
export interface Transaction {
  id: string;
  candidateId: string;
  action: Action;
  amount: number;
  points: number;
  status: "pending" | "paid" | "failed" | "cancelled" | "refunded" | "expired";
  createdAt: string;
  qrCode?: string;
  qrImage?: string;
  expiresAt?: string;
}
export interface SessionUser {
  id: string;
  name: string;
  email?: string;
  anonymous: boolean;
  admin: boolean;
}
export const number = (value: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
export const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value,
  );
export const LEGAL =
  "Os pontos exibidos são participações simbólicas nesta paródia e o placar inclui movimentações realizadas dentro do jogo. Não representam voto eleitoral, pesquisa oficial, intenção de voto, doação ou vínculo com candidato ou campanha.";
