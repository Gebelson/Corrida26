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
type Context = {
  board: Board | null;
  user: SessionUser | null;
  loading: boolean;
  error: string | null;
  authConfigured: boolean;
  refresh: () => Promise<void>;
  openCheckout: (candidateId: string, action: Action, amount?: number) => void;
  openLogin: () => void;
  api: <T>(url: string, options?: RequestInit) => Promise<T>;
  notification: string | null;
  supabase: SupabaseClient | null;
};
const RaceContext = createContext<Context | null>(null);
let authClient: SupabaseClient | null = null;
function getAuth() {
  if (typeof window === "undefined") return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
    [notification, setNotification] = useState<string | null>(null);
  const prior = useRef<string[]>([]),
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
        api,
        notification,
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
