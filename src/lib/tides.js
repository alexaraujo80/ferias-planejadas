import { supabase } from "./supabase";
import { fetchTideData } from "./tidecore";

// Na versão publicada, consulta pela função /api/mares (onde fica a chave comercial da Open-Meteo, se houver).
// Sem servidor (uso local), consulta a Open-Meteo direto do navegador.
const cache = new Map();
export function getTides(local) {
  const key = String(local || "").trim().toLowerCase();
  if (!key) return Promise.reject(new Error("Informe a cidade."));
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    if (supabase) {
      try {
        const { data } = await supabase.auth.getSession();
        const r = await fetch(`/api/mares?local=${encodeURIComponent(local)}`, { headers: data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {} });
        if (r.ok) return await r.json();
        if (r.status !== 404) { const j = await r.json().catch(() => ({})); throw new Error(j.error || "Falha ao consultar as marés."); }
      } catch (e) { if (!(e instanceof TypeError)) throw e; }
    }
    return fetchTideData(local);
  })();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}
