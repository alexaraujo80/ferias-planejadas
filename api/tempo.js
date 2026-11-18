// GET /api/tempo?local=Maragogi — previsão diária (até 16 dias) da Open-Meteo para o destino.
// Uso comercial exige plano pago da Open-Meteo: cadastre OPEN_METEO_API_KEY na Vercel (a mesma das marés).
import { getAdmin, requireUser, json, wrap, HttpError } from "./_lib.js";
import { fetchWeatherData } from "../src/lib/weathercore.js";

export const GET = wrap(async (request) => {
  await requireUser(request, getAdmin());
  const local = new URL(request.url).searchParams.get("local");
  if (!local) throw new HttpError(400, "Informe a cidade.");
  const data = await fetchWeatherData(local, { apikey: process.env.OPEN_METEO_API_KEY || undefined });
  return json(data, 200, { "Cache-Control": "private, max-age=1800" });
});
