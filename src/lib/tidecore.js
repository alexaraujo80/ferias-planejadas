// Marés pela Open-Meteo (usado no navegador e na função /api/mares).
// sea_level_height_msl inclui a maré astronômica; preamares e baixa-mares são os picos e vales da série horária,
// refinados por interpolação parabólica. Valores aproximados: não servem para navegação.
export const MARINHA_URL = "https://www.marinha.mil.br/chm/tabuas-de-mare";
export const TIDE_WINDOW_DAYS = 8; // a API entrega até 8 dias de previsão
const COAST_KM = 40;               // acima disso, a cidade é considerada longe do mar

export const cleanPlace = (s) => String(s || "").split(/\s[–—-]\s|,|\//)[0].trim();

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(lat2 - lat1), dLon = toR(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const pad = (n) => String(n).padStart(2, "0");
// horários vêm no fuso local do destino, sem deslocamento ("2027-02-10T14:00"); a conta é feita como se fosse UTC
const shift = (local, hours) => { const d = new Date(Date.parse(`${local}:00Z`) + Math.round(hours * 60) * 60000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };

export function extremes(times, values) {
  const out = [];
  for (let i = 1; i < values.length - 1; i++) {
    const p = values[i - 1], v = values[i], n = values[i + 1];
    if (p == null || v == null || n == null) continue;
    const high = v > p && v >= n, low = v < p && v <= n;
    if (!high && !low) continue;
    const den = p - 2 * v + n;
    const off = den ? Math.max(-0.5, Math.min(0.5, (p - n) / (2 * den))) : 0;
    const h = v - ((p - n) * off) / 4;
    out.push({ type: high ? "alta" : "baixa", at: shift(times[i], off), h: Math.round(h * 100) / 100 });
  }
  return out;
}

export async function fetchTideData(name, { apikey, fetchImpl = fetch } = {}) {
  const pre = apikey ? "customer-" : "";
  const key = apikey ? `&apikey=${encodeURIComponent(apikey)}` : "";
  const q = cleanPlace(name);
  if (!q) throw new Error("Informe a cidade.");
  const gr = await fetchImpl(`https://${pre}geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=pt&format=json${key}`);
  const g = await gr.json().catch(() => ({}));
  const place = g?.results?.[0];
  if (!place) return { found: false, query: q };
  const mr = await fetchImpl(`https://${pre}marine-api.open-meteo.com/v1/marine?latitude=${place.latitude}&longitude=${place.longitude}&hourly=sea_level_height_msl&timezone=auto&forecast_days=${TIDE_WINDOW_DAYS}&cell_selection=sea${key}`);
  const m = await mr.json().catch(() => ({}));
  if (!mr.ok || m.error) throw new Error(m.reason || "Não foi possível consultar a previsão de marés.");
  const times = m.hourly?.time || [], vals = m.hourly?.sea_level_height_msl || [];
  const distKm = Math.round(haversineKm(place.latitude, place.longitude, m.latitude, m.longitude));
  const coastal = vals.some((v) => v != null) && distKm <= COAST_KM;
  const days = {};
  if (coastal) extremes(times, vals).forEach((e) => { const d = e.at.slice(0, 10); (days[d] = days[d] || []).push({ type: e.type, time: e.at.slice(11, 16), h: e.h }); });
  return {
    found: true, query: q, coastal, distKm, days,
    place: { name: place.name, admin1: place.admin1 || "", country: place.country_code || "" },
    from: times[0]?.slice(0, 10) || null, until: times.length ? times[times.length - 1].slice(0, 10) : null,
  };
}
