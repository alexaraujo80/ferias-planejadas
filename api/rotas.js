// POST /api/rotas — distância e tempo entre as paradas de um dia do roteiro (Google Routes API).
// Uma chamada por dia (Compute Routes Essentials: até 10 paradas intermediárias), com cache no banco.
// Recurso dos planos pagos (inclui o teste grátis). Chave: GOOGLE_MAPS_SERVER_KEY (somente no servidor).
import crypto from "node:crypto";
import { getAdmin, requireUser, json, wrap, HttpError } from "./_lib.js";

const MAX_STOPS = 12; // origem + destino + 10 intermediárias
const TTL_DAYS = 30;

export const POST = wrap(async (request) => {
  const admin = getAdmin();
  const user = await requireUser(request, admin);
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) throw new HttpError(500, "GOOGLE_MAPS_SERVER_KEY não configurada na Vercel.");
  const body = await request.json().catch(() => ({}));
  const mode = body.mode === "WALK" ? "WALK" : "DRIVE";
  const stops = (Array.isArray(body.stops) ? body.stops : []).map((x) => String(x || "").trim().slice(0, 200)).filter(Boolean);
  if (stops.length < 2) throw new HttpError(400, "São necessárias pelo menos duas paradas com local.");
  if (stops.length > MAX_STOPS) throw new HttpError(400, `Use no máximo ${MAX_STOPS} paradas por dia.`);

  const { data: plan } = await admin.rpc("plan_of", { uid: user.id });
  const { data: lim } = await admin.from("plan_limits").select("can_routes").eq("plan", plan || "free").maybeSingle();
  if (!lim?.can_routes) return json({ error: "As distâncias calculadas fazem parte dos planos Viajante e Família.", code: "LIMITE_ROTAS" }, 403);

  const hash = crypto.createHash("sha256").update(`${mode}|${stops.map((s) => s.toLowerCase()).join("|")}`).digest("hex");
  const { data: hit } = await admin.from("route_cache").select("data, created_at").eq("key", hash).maybeSingle();
  if (hit && Date.now() - new Date(hit.created_at).getTime() < TTL_DAYS * 86400000) return json({ ...hit.data, cached: true });

  const r = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.legs.distanceMeters,routes.legs.duration" },
    body: JSON.stringify({
      origin: { address: stops[0] }, destination: { address: stops[stops.length - 1] },
      intermediates: stops.slice(1, -1).map((address) => ({ address })),
      travelMode: mode, languageCode: "pt-BR", units: "METRIC",
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error("Routes API", r.status, j?.error?.message); throw new HttpError(502, "O Google não conseguiu traçar a rota. Confira os locais das atividades."); }
  const route = j.routes?.[0];
  if (!route) throw new HttpError(422, "Não foi encontrada rota entre esses locais. Confira os endereços.");
  const sec = (d) => (d ? Number(String(d).replace("s", "")) : null);
  const data = { mode, distanceMeters: route.distanceMeters ?? null, durationSeconds: sec(route.duration), legs: (route.legs || []).map((l) => ({ distanceMeters: l.distanceMeters ?? null, durationSeconds: sec(l.duration) })) };
  await admin.from("route_cache").upsert({ key: hash, data, created_at: new Date().toISOString() });
  return json(data);
});
