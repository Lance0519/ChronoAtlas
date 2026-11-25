import { getSupabaseClient, isSupabaseConfigured } from "../lib/supabase";
import type { AppRole, UserSession } from "../types/atlas";

const LOCAL_SESSION: UserSession = {
  mode: "local",
  authenticated: false,
  userId: null,
  email: null,
  role: "local",
};

const ANONYMOUS_SUPABASE_SESSION: UserSession = {
  mode: "supabase",
  authenticated: false,
  userId: null,
  email: null,
  role: "viewer",
};

export function isCuratorRole(role: AppRole): boolean {
  return role === "owner" || role === "curator";
}

async function resolveSupabaseRole(userId: string): Promise<AppRole> {
  const supabase = getSupabaseClient();
  if (!supabase) return "viewer";

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return "viewer";
  if (data.role === "owner" || data.role === "curator" || data.role === "viewer") {
    return data.role;
  }
  return "viewer";
}

export async function getSession(): Promise<UserSession> {
  if (!isSupabaseConfigured()) {
    return LOCAL_SESSION;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return LOCAL_SESSION;
  }

  const { data, error } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (error || !user) {
    return ANONYMOUS_SUPABASE_SESSION;
  }

  const role = await resolveSupabaseRole(user.id);
  return {
    mode: "supabase",
    authenticated: true,
    userId: user.id,
    email: user.email ?? null,
    role,
  };
}

export async function signInWithEmailPassword(
  email: string,
  password: string,
): Promise<UserSession> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase authentication is unavailable in local mode.");
  }

  const normalizedEmail = email.trim();
  if (!normalizedEmail || !password) {
    throw new Error("Email and password are required.");
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error) {
    throw new Error(error.message);
  }
  if (!data.user) {
    throw new Error("Sign-in did not establish an active user session.");
  }

  const role = await resolveSupabaseRole(data.user.id);
  return {
    mode: "supabase",
    authenticated: true,
    userId: data.user.id,
    email: data.user.email ?? null,
    role,
  };
}

export async function signOut(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message);
  }
}

export function onAuthChange(cb: (session: UserSession) => void): () => void {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return () => {};
  }

  let active = true;
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    // Defer role lookup outside Supabase's synchronous auth lock callback.
    queueMicrotask(() => {
      if (!active) return;
      if (!session?.user) {
        cb(ANONYMOUS_SUPABASE_SESSION);
        return;
      }
      void resolveSupabaseRole(session.user.id)
        .then((role) => {
          if (!active) return;
          cb({
            mode: "supabase",
            authenticated: true,
            userId: session.user.id,
            email: session.user.email ?? null,
            role,
          });
        })
        .catch(() => {
          if (!active) return;
          cb({
            mode: "supabase",
            authenticated: true,
            userId: session.user.id,
            email: session.user.email ?? null,
            role: "viewer",
          });
        });
    });
  });

  return () => {
    active = false;
    subscription.unsubscribe();
  };
}
