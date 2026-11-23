import { supabase } from "./supabase";

// Google Maps no roteiro:
// 1) links "Ver rota" / "Como chegar" — gratuitos, sem chave, abrem o Google Maps de quem clica;
// 2) mapa embutido (Maps Embed API) — gratuito e ilimitado, exige VITE_GOOGLE_MAPS_EMBED_KEY (chave restrita ao domínio);
// 3) distâncias (Routes API) — via /api/rotas, com a chave do servidor e cache.
export const EMBED_KEY = import.meta.env.VITE_GOOGLE_MAPS_EMBED_KEY || "";
export const MAX_WAYPOINTS = 9; // limite usado nos links e no mapa embutido

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
// Texto de endereço de uma atividade: local (ou nome da atividade) + cidade (ou destino da viagem)
export function stopQuery(item, trip) {
  const where = clean(item.place) || clean(item.activity);
  const city = clean(item.city) || clean(String(trip.destination || "").split(/\s[–—-]\s/)[0]);
  if (!where) return "";
  return city && !where.toLowerCase().includes(city.toLowerCase()) ? `${where}, ${city}` : where;
}
// Paradas do dia, em ordem de horário; a hospedagem (se informada) abre e fecha o dia.
export function dayStops(items, trip) {
  const acts = items.filter((i) => i.status !== "cancelada").slice().sort((a, b) => (a.time || "99").localeCompare(b.time || "99"))
    .map((i) => ({ id: i.id, label: i.activity, time: i.time || "", q: stopQuery(i, trip) })).filter((x) => x.q);
  const base = clean(trip.lodgingAddress);
  return base ? [{ id: "base-ida", label: "Hospedagem", q: base, base: true }, ...acts, { id: "base-volta", label: "Hospedagem", q: base, base: true }] : acts;
}
const enc = encodeURIComponent;
export function directionsUrl(stops, mode = "driving") {
  if (stops.length < 2) return stops[0] ? placeUrl(stops[0].q) : "";
  const mid = stops.slice(1, -1).slice(0, MAX_WAYPOINTS);
  return `https://www.google.com/maps/dir/?api=1&origin=${enc(stops[0].q)}&destination=${enc(stops[stops.length - 1].q)}${mid.length ? `&waypoints=${mid.map((x) => enc(x.q)).join("%7C")}` : ""}&travelmode=${mode}`;
}
export const placeUrl = (q) => `https://www.google.com/maps/search/?api=1&query=${enc(q)}`;
export const goUrl = (q) => `https://www.google.com/maps/dir/?api=1&destination=${enc(q)}`;
export function embedUrl(stops, mode = "driving") {
  if (!EMBED_KEY || !stops.length) return "";
  if (stops.length === 1) return `https://www.google.com/maps/embed/v1/place?key=${EMBED_KEY}&q=${enc(stops[0].q)}&language=pt-BR`;
  const mid = stops.slice(1, -1).slice(0, MAX_WAYPOINTS);
  return `https://www.google.com/maps/embed/v1/directions?key=${EMBED_KEY}&origin=${enc(stops[0].q)}&destination=${enc(stops[stops.length - 1].q)}${mid.length ? `&waypoints=${mid.map((x) => enc(x.q)).join("|")}` : ""}&mode=${mode}&language=pt-BR&units=metric`;
}

const cache = new Map();
export async function computeDayRoute(stops, mode = "DRIVE") {
  const key = `${mode}|${stops.map((x) => x.q.toLowerCase()).join("|")}`;
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    if (!supabase) throw new Error("As distâncias exigem a versão em nuvem.");
    const { data } = await supabase.auth.getSession();
    const r = await fetch("/api/rotas", { method: "POST", headers: { "Content-Type": "application/json", ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) }, body: JSON.stringify({ stops: stops.map((x) => x.q), mode }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || "Não foi possível calcular as distâncias."); e.code = j.code; throw e; }
    return j;
  })();
  cache.set(key, p); p.catch(() => cache.delete(key));
  return p;
}
export const fmtKm = (m) => (m == null ? "—" : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: m < 10000 ? 1 : 0 })} km`);
export const fmtDur = (s) => { if (s == null) return "—"; const m = Math.round(s / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`; };
