// GET /api/mares?local=Maragogi — marés aproximadas (Open-Meteo) para a cidade da programação.
// Uso comercial da Open-Meteo exige plano pago: cadastre OPEN_METEO_API_KEY na Vercel.
import { getAdmin, requireUser, json, wrap, HttpError } from "./_lib.js";
import { fetchTideData } from "../src/lib/tidecore.js";

export const GET = wrap(async (request) => {
  await requireUser(request, getAdmin());
  const local = new URL(request.url).searchParams.get("local");
  if (!local) throw new HttpError(400, "Informe a cidade.");
  const data = await fetchTideData(local, { apikey: process.env.OPEN_METEO_API_KEY || undefined });
  return json(data, 200, { "Cache-Control": "private, max-age=3600" });
});
