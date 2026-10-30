// POST /api/checkout — abre o checkout do Stripe para assinar (cartão/boleto) ou pagar 12 meses com Pix.
import { getStripe, getAdmin, requireUser, appOrigin, ensureCustomer, json, wrap, HttpError, PLAN_KEYS } from "./_lib.js";

export const POST = wrap(async (request) => {
  const admin = getAdmin();
  const user = await requireUser(request, admin);
  const stripe = getStripe();
  const { lookupKey, pix } = await request.json().catch(() => ({}));
  if (!PLAN_KEYS[lookupKey]) throw new HttpError(400, "Plano inválido.");
  const [plan, interval] = PLAN_KEYS[lookupKey];
  if (pix && interval !== "year") throw new HttpError(400, "O Pix está disponível apenas no plano anual.");

  const { data: profile, error } = await admin.from("profiles").select("*").eq("id", user.id).single();
  if (error) throw error;
  const base = appOrigin(request);
  const customer = await ensureCustomer(stripe, admin, user, profile);

  // Quem já tem assinatura muda de plano pelo portal (o Stripe calcula a diferença proporcional).
  if (!pix && ["active", "trialing", "past_due"].includes(profile.subscription_status)) {
    const portal = await stripe.billingPortal.sessions.create({ customer, return_url: `${base}/?pagina=planos` });
    return json({ url: portal.url, portal: true });
  }

  const { data: found } = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const price = found[0];
  if (!price) throw new HttpError(500, `Preço "${lookupKey}" não encontrado no Stripe. Confira a lookup key do preço.`);

  const metadata = { user_id: user.id, plan, interval, kind: pix ? "pix_anual" : "assinatura" };
  const common = {
    customer, client_reference_id: user.id, locale: "pt-BR", metadata,
    success_url: `${base}/?checkout=sucesso`, cancel_url: `${base}/?checkout=cancelado`,
  };

  let session;
  if (pix) {
    session = await stripe.checkout.sessions.create({
      ...common, mode: "payment", payment_method_types: ["pix"],
      line_items: [{ quantity: 1, price_data: { currency: price.currency, unit_amount: price.unit_amount, product: typeof price.product === "string" ? price.product : price.product.id } }],
      payment_intent_data: { metadata },
    });
  } else {
    const subscription_data = { metadata: { user_id: user.id, plan } };
    // Assinou durante o teste: a primeira cobrança acontece só quando o teste terminar.
    const trialEnd = profile.trial_ends_at ? Math.floor(new Date(profile.trial_ends_at).getTime() / 1000) : 0;
    if (trialEnd - Date.now() / 1000 > 2 * 86400) subscription_data.trial_end = trialEnd;
    session = await stripe.checkout.sessions.create({
      ...common, mode: "subscription", allow_promotion_codes: true,
      line_items: [{ price: price.id, quantity: 1 }], subscription_data,
    });
  }
  return json({ url: session.url });
});
