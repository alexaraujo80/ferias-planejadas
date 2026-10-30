import { createClient } from "@supabase/supabase-js";

// Somente a URL do projeto e a chave PÚBLICA (anon/publishable) vão para o frontend.
// A proteção dos dados é feita pelas políticas RLS no banco (supabase/schema.sql).
// Aceita tanto as variáveis manuais (VITE_*) quanto as criadas pela integração da Vercel (NEXT_PUBLIC_*).
const env = import.meta.env;
const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const cloudEnabled = Boolean(url && key);
export const supabase = cloudEnabled
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
