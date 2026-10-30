// POST /api/portal — Portal do Cliente do Stripe: trocar cartão, mudar de plano, notas e cancelamento.
import { getStripe, getAdmin, requireUser, appOrigin, json, wrap, HttpError } from "./_lib.js";

export const POST = wrap(async (request) => {
  const admin = getAdmin();
  const user = await requireUser(request, admin);
  const { data: profile } = await admin.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
  if (!profile?.stripe_customer_id) throw new HttpError(400, "Você ainda não tem uma assinatura.");
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({ customer: profile.stripe_customer_id, return_url: `${appOrigin(request)}/?pagina=planos` });
  return json({ url: session.url });
});
