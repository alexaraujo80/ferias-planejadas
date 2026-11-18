import { supabase } from "./supabase";
import { fetchTideData } from "./tidecore";
import { fetchWeatherData } from "./weathercore";

// Na versão publicada, consulta pelas funções /api/mares e /api/tempo (onde fica a chave comercial da Open-Meteo, se houver).
// Sem servidor (uso local), consulta a Open-Meteo direto do navegador.
const cache = new Map();
function cached(kind, local, direct) {
  const key = `${kind}:${String(local || "").trim().toLowerCase()}`;
  if (!String(local || "").trim()) return Promise.reject(new Error("Informe a cidade."));
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    if (supabase) {
      try {
        const { data } = await supabase.auth.getSession();
        const r = await fetch(`/api/${kind}?local=${encodeURIComponent(local)}`, { headers: data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {} });
        if (r.ok) return await r.json();
        if (r.status !== 404) { const j = await r.json().catch(() => ({})); throw new Error(j.error || "Falha na consulta."); }
      } catch (e) { if (!(e instanceof TypeError)) throw e; }
    }
    return direct(local);
  })();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}
export const getTides = (local) => cached("mares", local, fetchTideData);
export const getWeather = (local) => cached("tempo", local, fetchWeatherData);
