// POST /api/webhook — avisos do Stripe. É a ÚNICA forma de o plano de uma conta mudar.
import { getStripe, getAdmin, json, wrap, HttpError, PLAN_KEYS } from "./_lib.js";

const PAID = ["viajante", "familia"];
const iso = (sec) => (sec ? new Date(sec * 1000).toISOString() : null);

async function syncSubscription(admin, sub, created, userHint) {
  const item = sub.items?.data?.[0];
  const price = item?.price;
  const plan = PLAN_KEYS[price?.lookup_key]?.[0] || sub.metadata?.plan;
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  const userId = sub.metadata?.user_id || userHint;
  const eventAt = iso(created);
  const patch = {
    plan: PAID.includes(plan) ? plan : "free",
    subscription_id: sub.id,
    subscription_status: sub.status,
    billing_interval: price?.recurring?.interval || null,
    current_period_end: iso(sub.current_period_end || item?.current_period_end),
    cancel_at_period_end: Boolean(sub.cancel_at_period_end || sub.cancel_at),
    stripe_customer_id: customer,
    billing_event_at: eventAt,
  };
  let q = admin.from("profiles").update(patch);
  q = userId ? q.eq("id", userId) : q.eq("stripe_customer_id", customer);
  // Eventos podem chegar fora de ordem: só aplica se for mais recente que o último aplicado.
  q = q.or(`billing_event_at.is.null,billing_event_at.lte.${eventAt}`);
  const { error } = await q;
  if (error) throw error;
}

async function grantPixYear(admin, session, created) {
  const userId = session.metadata?.user_id; const plan = session.metadata?.plan;
  if (!userId || !PAID.includes(plan)) return;
  const { data: p } = await admin.from("profiles").select("current_period_end, subscription_status, last_checkout_session").eq("id", userId).single();
  if (p?.last_checkout_session === session.id) return; // já processado
  const start = p?.subscription_status === "pago_unico" && p.current_period_end && new Date(p.current_period_end) > new Date() ? new Date(p.current_period_end) : new Date();
  start.setFullYear(start.getFullYear() + 1);
  const { error } = await admin.from("profiles").update({
    plan, subscription_status: "pago_unico", billing_interval: "year", subscription_id: null,
    current_period_end: start.toISOString(), cancel_at_period_end: true,
    last_checkout_session: session.id, billing_event_at: iso(created),
    stripe_customer_id: typeof session.customer === "string" ? session.customer : session.customer?.id,
  }).eq("id", userId);
  if (error) throw error;
}

export const POST = wrap(async (request) => {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(500, "STRIPE_WEBHOOK_SECRET ausente na Vercel.");
  const raw = await request.text();
  let event;
  try { event = await stripe.webhooks.constructEventAsync(raw, request.headers.get("stripe-signature"), secret); }
  catch (e) { throw new HttpError(400, "Assinatura do webhook inválida."); }

  const admin = getAdmin();
  const obj = event.data.object;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      if (obj.mode === "subscription" && obj.subscription) {
        const sub = await stripe.subscriptions.retrieve(obj.subscription);
        await syncSubscription(admin, sub, event.created, obj.client_reference_id);
      } else if (obj.mode === "payment" && obj.payment_status === "paid" && obj.metadata?.kind === "pix_anual") {
        await grantPixYear(admin, obj, event.created);
      }
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      await syncSubscription(admin, obj, event.created);
      break;
    default:
      break;
  }
  return json({ received: true });
});
