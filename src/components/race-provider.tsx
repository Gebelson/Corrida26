"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Action, Board, SessionUser } from "@/lib/types";
import { CheckoutModal, LoginModal } from "./transaction-modals";
type Checkout = { candidateId: string; action: Action; amount?: number };
export type ScoreBurst = { id: number; delta: number };
type Context = {
  board: Board | null;
  user: SessionUser | null;
  loading: boolean;
  error: string | null;
  authConfigured: boolean;
  refresh: () => Promise<void>;
  openCheckout: (candidateId: string, action: Action, amount?: number) => void;
  openLogin: () => void;
  logout: () => Promise<void>;
  api: <T>(url: string, options?: RequestInit) => Promise<T>;
  notification: string | null;
  scoreBursts: Record<string, ScoreBurst | undefined>;
  supabase: SupabaseClient | null;
};
const RaceContext = createContext<Context | null>(null);
let authClient: SupabaseClient | null = null;
function getAuth() {
  if (typeof window === "undefined") return null;
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return (authClient ??= createClient(url, key));
}
export function RaceProvider({ children }: { children: ReactNode }) {
  const [board, setBoard] = useState<Board | null>(null),
    [user, setUser] = useState<SessionUser | null>(null),
    [error, setError] = useState<string | null>(null),
    [authConfigured, setAuthConfigured] = useState(false),
    [checkout, setCheckout] = useState<Checkout | null>(null),
    [login, setLogin] = useState(false),
    [notification, setNotification] = useState<string | null>(null),
    [scoreBursts, setScoreBursts] = useState<
      Record<string, ScoreBurst | undefined>
    >({});
  const prior = useRef<string[]>([]),
    priorScores = useRef<Record<string, number> | null>(null),
    burstSequence = useRef(0),
    burstTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map()),
    mounted = useRef(true);
  const supabase = getAuth();
  const api = useCallback(
    async <T,>(url: string, options: RequestInit = {}): Promise<T> => {
      const client = getAuth();
      const session = client
        ? (await client.auth.getSession()).data.session
        : null;
      const headers = new Headers(options.headers);
      if (options.body) headers.set("Content-Type", "application/json");
      if (session)
        headers.set("Authorization", `Bearer ${session.access_token}`);
      const res = await fetch(url, {
        ...options,
        headers,
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          data.error || "Não foi possível concluir. Tente novamente.",
        );
      return data as T;
    },
    [],
  );
  const refresh = useCallback(async () => {
    try {
      const [next, session] = await Promise.all([
        api<Board>("/api/board"),
        api<{ user: SessionUser | null; authConfigured: boolean }>(
          "/api/session",
        ),
      ]);
      if (!mounted.current) return;
      const ids = next.candidates.slice(0, 2).map((c) => c.id);
      if (prior.current.length === 2 && ids.length === 2) {
        if (prior.current[0] !== ids[0]) setNotification("🔥 NOVA LIDERANÇA");
        else if (prior.current[1] !== ids[1]) setNotification("🔥 NOVO TOP 2");
      }
      prior.current = ids;
      const nextScores = Object.fromEntries(
        next.candidates.map((candidate) => [candidate.id, candidate.points]),
      );
      if (priorScores.current) {
        const bursts: Record<string, ScoreBurst> = {};
        for (const candidate of next.candidates) {
          const previous = priorScores.current[candidate.id];
          if (previous === undefined || previous === candidate.points) continue;
          bursts[candidate.id] = {
            id: ++burstSequence.current,
            delta: candidate.points - previous,
          };
        }
        if (Object.keys(bursts).length) {
          setScoreBursts((current) => ({ ...current, ...bursts }));
          for (const [candidateId, burst] of Object.entries(bursts)) {
            const previousTimer = burstTimers.current.get(candidateId);
            if (previousTimer) clearTimeout(previousTimer);
            burstTimers.current.set(
              candidateId,
              setTimeout(() => {
                setScoreBursts((current) => {
                  if (current[candidateId]?.id !== burst.id) return current;
                  const nextBursts = { ...current };
                  delete nextBursts[candidateId];
                  return nextBursts;
                });
                burstTimers.current.delete(candidateId);
              }, 2400),
            );
          }
        }
      }
      priorScores.current = nextScores;
      setBoard(next);
      setUser(session.user);
      setAuthConfigured(session.authConfigured);
      setError(null);
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error
            ? e.message
            : "Conexão interrompida. Reconectando…",
        );
    }
  }, [api]);
  const logout = useCallback(async () => {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(data?.error || "Não foi possível sair da conta.");
    }
    const client = getAuth();
    if (client) {
      const { error: signOutError } = await client.auth.signOut({
        scope: "local",
      });
      if (signOutError) throw signOutError;
    }
    if (mounted.current) setUser(null);
    await refresh();
  }, [refresh]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 2000);
    const wake = () => void refresh();
    window.addEventListener("focus", wake);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", wake);
      for (const timer of burstTimers.current.values()) clearTimeout(timer);
      burstTimers.current.clear();
    };
  }, [refresh]);
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => void refresh(), 0);
    });
    const channel = supabase
      .channel("global-scoreboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "candidate_scores" },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      data.subscription.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [supabase, refresh]);
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 3600);
    return () => clearTimeout(timer);
  }, [notification]);
  return (
    <RaceContext.Provider
      value={{
        board,
        user,
        error,
        authConfigured,
        loading: !board && !error,
        refresh,
        openCheckout: (candidateId, action, amount) =>
          setCheckout({ candidateId, action, amount }),
        openLogin: () => setLogin(true),
        logout,
        api,
        notification,
        scoreBursts,
        supabase,
      }}
    >
      {children}
      <CheckoutModal selection={checkout} onClose={() => setCheckout(null)} />
      <LoginModal open={login} onClose={() => setLogin(false)} />
    </RaceContext.Provider>
  );
}
export function useRace() {
  const value = useContext(RaceContext);
  if (!value) throw new Error("RaceProvider ausente");
  return value;
}
