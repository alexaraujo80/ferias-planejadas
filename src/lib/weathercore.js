// Previsão do tempo pela Open-Meteo (usado no navegador e na função /api/tempo).
import { geocode } from "./tidecore.js";

export const WEATHER_WINDOW_DAYS = 16; // previsão diária disponível

// Códigos de tempo da OMM (WMO) usados pela Open-Meteo
export function weatherInfo(code) {
  const c = Number(code);
  if (c === 0) return { label: "Céu limpo", icon: "sun" };
  if (c === 1) return { label: "Predomínio de sol", icon: "sun" };
  if (c === 2) return { label: "Parcialmente nublado", icon: "cloudSun" };
  if (c === 3) return { label: "Nublado", icon: "cloud" };
  if (c === 45 || c === 48) return { label: "Neblina", icon: "fog" };
  if (c >= 51 && c <= 57) return { label: "Garoa", icon: "drizzle" };
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return { label: c >= 80 ? "Pancadas de chuva" : "Chuva", icon: "rain" };
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return { label: "Neve", icon: "snow" };
  if (c >= 95) return { label: "Trovoadas", icon: "storm" };
  return { label: "Sem informação", icon: "cloud" };
}

export async function fetchWeatherData(name, { apikey, fetchImpl = fetch } = {}) {
  const host = apikey ? "customer-api.open-meteo.com" : "api.open-meteo.com";
  const key = apikey ? `&apikey=${encodeURIComponent(apikey)}` : "";
  const { q, place } = await geocode(name, { apikey, fetchImpl });
  if (!place) return { found: false, query: q };
  const r = await fetchImpl(`https://${host}/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum&timezone=auto&forecast_days=${WEATHER_WINDOW_DAYS}${key}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.reason || "Não foi possível consultar a previsão do tempo.");
  const dd = j.daily || {}; const days = {};
  (dd.time || []).forEach((t, i) => {
    days[t] = { code: dd.weather_code?.[i], tmax: dd.temperature_2m_max?.[i], tmin: dd.temperature_2m_min?.[i], pop: dd.precipitation_probability_max?.[i], rain: dd.precipitation_sum?.[i] };
  });
  const times = dd.time || [];
  return { found: true, query: q, place: { name: place.name, admin1: place.admin1 || "", country: place.country_code || "" }, days, from: times[0] || null, until: times[times.length - 1] || null };
}
