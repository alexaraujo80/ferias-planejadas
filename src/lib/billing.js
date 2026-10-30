import { supabase } from "./supabase";

// Chama as funções do servidor (pasta /api na Vercel) enviando o token de login.
// A chave secreta do Stripe e a service_role do Supabase ficam só no servidor.
export async function api(path, body) {
  if (!supabase) throw new Error("Planos exigem a versão conectada ao Supabase.");
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`/api/${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
  return json;
}
