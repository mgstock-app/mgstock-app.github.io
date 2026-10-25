"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { accessApi } from "@/features/access/api";
import type { AppUser } from "@/types/access";
interface AuthState {
  user: AppUser | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const sequence = useRef(0);
  const signingOut = useRef(false);
  const identity = useRef<string | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (signingOut.current) return;
    const current = ++sequence.current;
    try {
      const client = createClient();
      const { data, error: authError } = await client.auth.getUser();
      if (authError || !data.user) {
        if (sequence.current === current) setUser(null);
        return;
      }
      const account = await accessApi.me();
      if (sequence.current !== current) return;
      setUser((previous) =>
        JSON.stringify(previous) === JSON.stringify(account)
          ? previous
          : account,
      );
      setError("");
    } catch (cause) {
      if (sequence.current !== current) return;
      setUser(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo comprobar tu acceso.",
      );
    } finally {
      if (sequence.current === current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive) void refresh();
    });
    let client;
    try {
      client = createClient();
    } catch {
      return;
    }
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      const nextIdentity = session?.user.id ?? null;
      if (event === "SIGNED_OUT" || nextIdentity !== identity.current) {
        ++sequence.current;
        identity.current = nextIdentity;
        setUser(null);
        setLoading(true);
      }
      // Avoid calling Supabase from inside its auth lock.
      queueMicrotask(() => {
        if (alive) void refresh();
      });
    });
    const timer = window.setInterval(() => {
      if (alive) void refresh();
    }, 15000);
    const focus = () => {
      if (alive) void refresh();
    };
    window.addEventListener("focus", focus);
    const invalidate = () => {
      sequence.current++;
    };
    return () => {
      alive = false;
      invalidate();
      subscription.unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  useEffect(() => {
    try {
      if (user && sessionStorage.getItem("recibonet_return_to") === "/unirse") {
        sessionStorage.removeItem("recibonet_return_to");
        router.replace("/unirse");
      }
    } catch {
      /* The invitation can be reopened when browser storage is disabled. */
    }
  }, [user, router]);
  async function signOut() {
    if (signingOut.current) return;
    signingOut.current = true;
    ++sequence.current;
    identity.current = null;
    setUser(null);
    setLoading(true);
    setError("");
    try {
      try {
        sessionStorage.removeItem("recibonet_invitation");
        sessionStorage.removeItem("recibonet_return_to");
      } catch {
        // Storage can be disabled; authentication still needs to be closed.
      }
      const { error } = await createClient().auth.signOut();
      if (error) throw error;
      router.replace("/");
      router.refresh();
    } catch {
      setError("No se pudo cerrar la sesión. Volvé a intentar.");
    } finally {
      ++sequence.current;
      signingOut.current = false;
      setLoading(false);
    }
  }
  return (
    <AuthContext.Provider key={user?.user_id ?? "signed-out"} value={{ user, loading, error, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("Falta AuthProvider");
  return value;
}
