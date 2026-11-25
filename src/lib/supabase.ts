/// <reference types="vite/client" />
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { isSafeExternalUrl } from "./validators";

let cachedClient: SupabaseClient<Database> | null | undefined;
let cachedConfigKey = "";

function readSupabaseConfig(): { url: string; key: string } {
  try {
    const rawUrl: unknown = import.meta.env.VITE_SUPABASE_URL;
    const rawKey: unknown =
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

    const url = typeof rawUrl === "string" ? rawUrl.trim() : "";
    const key = typeof rawKey === "string" ? rawKey.trim() : "";
    return { url, key };
  } catch {
    return { url: "", key: "" };
  }
}

export function isSupabaseConfigured(): boolean {
  const { url, key } = readSupabaseConfig();
  return Boolean(url && key && isSafeExternalUrl(url));
}

export function getSupabaseClient(): SupabaseClient<Database> | null {
  const { url, key } = readSupabaseConfig();
  if (!url || !key || !isSafeExternalUrl(url)) {
    return null;
  }

  const configKey = `${url}::${key}`;
  if (cachedClient && cachedConfigKey === configKey) {
    return cachedClient;
  }

  cachedConfigKey = configKey;
  cachedClient = createClient<Database>(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return cachedClient;
}
