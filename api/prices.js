// GET /api/prices — preços cadastrados no Stripe (alterar o preço no Stripe atualiza a página de planos).
import { getStripe, json, wrap, PLAN_KEYS } from "./_lib.js";

export const GET = wrap(async () => {
  const stripe = getStripe();
  const { data } = await stripe.prices.list({ lookup_keys: Object.keys(PLAN_KEYS), active: true, limit: 10 });
  const prices = {};
  data.forEach((p) => { prices[p.lookup_key] = { amount: p.unit_amount / 100, currency: p.currency, interval: p.recurring?.interval || null }; });
  return json({ prices }, 200, { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" });
});
