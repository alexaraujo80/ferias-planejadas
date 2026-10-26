import { createClient } from "@supabase/supabase-js";

// Somente a URL do projeto e a chave PÚBLICA (anon/publishable) vão para o frontend.
// A proteção dos dados é feita pelas políticas RLS no banco (supabase/schema.sql).
// Nunca coloque a chave service_role em variáveis VITE_*: elas ficam visíveis no navegador.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const cloudEnabled = Boolean(url && key);
export const supabase = cloudEnabled
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
