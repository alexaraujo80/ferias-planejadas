// Utilidades compartilhadas pelas funções de servidor (arquivos com "_" não viram rotas na Vercel).
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// lookup key do preço no Stripe -> [plano, periodicidade]
export const PLAN_KEYS = {
  viajante_mensal: ["viajante", "month"],
  viajante_anual: ["viajante", "year"],
  familia_mensal: ["familia", "month"],
  familia_anual: ["familia", "year"],
};

export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new HttpError(500, "STRIPE_SECRET_KEY não configurada na Vercel.");
  return new Stripe(key);
}

export function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new HttpError(500, "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente na Vercel.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function requireUser(request, admin) {
  const h = request.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) throw new HttpError(401, "Faça login novamente.");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, "Sessão expirada. Faça login novamente.");
  return data.user;
}

export function appOrigin(request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  return new URL(request.url).origin;
}

export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

export const wrap = (fn) => async (request) => {
  try { return await fn(request); }
  catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: e?.raw?.message || "Erro interno. Tente novamente em instantes." }, 500);
  }
};

export async function ensureCustomer(stripe, admin, user, profile) {
  if (profile?.stripe_customer_id) return profile.stripe_customer_id;
  const c = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } });
  const { error } = await admin.from("profiles").update({ stripe_customer_id: c.id }).eq("id", user.id);
  if (error) throw error;
  return c.id;
}
