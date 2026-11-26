import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured } from "../lib/supabase";
import { getSession, isCuratorRole, onAuthChange } from "../services/authService";
import type { UserSession } from "../types/atlas";

const INITIAL_LOCAL_SESSION: UserSession = {
  mode: "local",
  authenticated: false,
  userId: null,
  email: null,
  role: "local",
};

const INITIAL_SUPABASE_SESSION: UserSession = {
  mode: "supabase",
  authenticated: false,
  userId: null,
  email: null,
  role: "viewer",
};

export function useAuthSession() {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<UserSession>(
    configured ? INITIAL_SUPABASE_SESSION : INITIAL_LOCAL_SESSION,
  );
  const [loading, setLoading] = useState<boolean>(configured);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setSession(INITIAL_LOCAL_SESSION);
      setLoading(false);
      return;
    }
    try {
      const next = await getSession();
      setSession(next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!configured) {
      return;
    }

    let mounted = true;
    void getSession()
      .then((next) => {
        if (!mounted) return;
        setSession(next);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setLoading(false);
      });

    const unsubscribe = onAuthChange((next) => {
      if (!mounted) return;
      setSession(next);
      setLoading(false);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [configured]);

  const canCurate =
    session.mode === "local" || (session.authenticated && isCuratorRole(session.role));

  return {
    session,
    loading,
    isLocalMode: session.mode === "local",
    isSupabaseMode: session.mode === "supabase",
    isCurator: isCuratorRole(session.role),
    canCurate,
    refresh,
  };
}
