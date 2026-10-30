import React, { useState, useEffect, useMemo, useRef } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area } from "recharts";
import {
  LayoutDashboard, Plane, Wallet, FileText, CalendarClock, MapPin, Receipt, BarChart3, Settings, Plus, Trash2, Pencil,
  Copy, Archive, ArchiveRestore, Check, X, Star, AlertTriangle, Search, Download, Printer, Sun, Info, Award, Menu,
  Users, CheckCircle2, Upload, ExternalLink, ChevronLeft, ChevronRight, Database, Eye, Heart,
  Gift, Utensils, Ticket, Umbrella, Landmark, Car, Building2, Paperclip, Calculator, Coins, ArrowRight, Crown, Lock, Ship, Anchor,
} from "lucide-react";
import { api } from "./lib/billing";
import { cloudEnabled, supabase } from "./lib/supabase";
import { createCloudStore, createLocalStore, readBrowserBackup } from "./lib/storage";
import Auth from "./components/Auth";

/* =====================================================================
   FÉRIAS PLANEJADAS — MVP
   Camadas: utilitários → regras de negócio (puras) → componentes → páginas
   Persistência: src/lib/storage.js (Supabase com RLS, ou navegador sem nuvem).
   ===================================================================== */

// ---------- Utilitários ----------
const pad = (n) => String(n).padStart(2, "0");
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100; // arredondamento explícito: 2 casas, meio para cima
const num = (v) => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v));
const sum = (arr, f) => r2(arr.reduce((a, x) => a + (num(f(x)) || 0), 0));
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (n) => BRL.format(r2(n));
const brlPlain = (n) => r2(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fpct = (n) => `${(Math.round((n || 0) * 10) / 10).toLocaleString("pt-BR")}%`;
const pct = (a, b) => (b ? (a / b) * 100 : 0);
const fdate = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dayNum = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
const fromDayNum = (n) => { const d = new Date(n * 86400000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const addDays = (iso, n) => fromDayNum(dayNum(iso) + n);
const diffDays = (a, b) => dayNum(b) - dayNum(a);
const addMonths = (iso, k) => {
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 + k, 1));
  const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(Math.min(d, last))}`;
};
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthLabel = (ym) => { const [y, m] = ym.split("-"); return `${MONTHS[Number(m) - 1]}/${y.slice(2)}`; };
const MONTHS_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// ---------- Domínio ----------
const CATS = ["Passagens aéreas", "Hospedagem", "Pacotes turísticos", "Alimentação", "Transporte local", "Passeios e excursões", "Ingressos", "Seguro-viagem", "Bagagem", "Estacionamento e aeroporto", "Documentação", "Compras e lembranças", "Emergências", "Outras despesas",
  // viagem de carro e cruzeiro (adicionadas ao fim para preservar as cores das categorias existentes)
  "Aluguel de carro", "Combustível", "Pedágios", "Cruzeiro (cabine)", "Taxas portuárias", "Taxa de serviço (gorjetas)", "Pacotes a bordo", "Excursões em terra"];
const CAT_GROUPS = [
  ["Transporte até o destino", ["Passagens aéreas", "Bagagem", "Aluguel de carro", "Combustível", "Pedágios", "Estacionamento e aeroporto"]],
  ["Cruzeiro", ["Cruzeiro (cabine)", "Taxas portuárias", "Taxa de serviço (gorjetas)", "Pacotes a bordo", "Excursões em terra"]],
  ["Hospedagem e pacotes", ["Hospedagem", "Pacotes turísticos"]],
  ["No destino", ["Alimentação", "Transporte local", "Passeios e excursões", "Ingressos", "Compras e lembranças"]],
  ["Proteção e documentos", ["Seguro-viagem", "Documentação", "Emergências"]],
  ["Outros", ["Outras despesas"]],
];
const TRANSPORTS = ["Avião", "Carro próprio", "Carro alugado", "Cruzeiro", "Ônibus", "Trem ou outro"];
const CAT_COLORS = ["#167D9A", "#75D8C3", "#E8A23A", "#21865B", "#5BA7C4", "#F2C48D", "#2E5E73", "#A7E3D6", "#D9534F", "#8FB8C9", "#C98E3B", "#4C9A7E", "#B8D9E4", "#7A8F99", "#3E8FB0", "#F0B35A", "#9C6B2F", "#0F5C73", "#5FC7B2", "#B5473F", "#7FB7A4", "#C7A06A"];
const catColor = (c) => CAT_COLORS[Math.max(0, CATS.indexOf(c)) % CAT_COLORS.length];
const METHODS = ["Pix", "Cartão de crédito", "Cartão de débito", "Dinheiro", "Boleto", "Transferência", "Pontos/milhas", "Outro"];
const TRIP_STATUS = [["planejando", "Planejando"], ["cotando", "Cotando"], ["contratada", "Contratada"], ["preparacao", "Em preparação"], ["andamento", "Em andamento"], ["concluida", "Concluída"]];
const STYLES = ["Econômica", "Confortável", "Luxo", "Aventura", "Personalizada"];
const MEAL = [["", "Não informado"], ["sem", "Sem refeições"], ["cafe", "Café da manhã"], ["meia", "Meia pensão"], ["completa", "Pensão completa"], ["all", "All inclusive"]];
const MEAL_LABEL = Object.fromEntries(MEAL);
const MEAL_SCORE = { sem: 0, cafe: 50, meia: 70, completa: 85, all: 100 };
const TRI = [["", "Não informado"], ["sim", "Sim"], ["nao", "Não"]];
const TRI_LABEL = Object.fromEntries(TRI);
const CANCEL = [["", "Não informado"], ["flexivel", "Flexível"], ["moderada", "Moderada"], ["rigida", "Rígida / sem reembolso"]];
const CANCEL_LABEL = Object.fromEntries(CANCEL);
const CANCEL_SCORE = { flexivel: 100, moderada: 60, rigida: 15 };
const PAY_STATUS = [["previsto", "Previsto"], ["pendente", "Pendente"], ["pago", "Pago"], ["cancelado", "Cancelado"]];
const PAY_LABEL = { previsto: "Previsto", pendente: "Pendente", pago: "Pago", cancelado: "Cancelado", atrasado: "Atrasado" };
const EXP_STATUS = [["paga", "Paga"], ["realizada", "Realizada (paga depois, ex.: fatura)"], ["pendente", "Pendente de pagamento"], ["prevista", "Prevista"], ["reembolsada", "Reembolsada"]];
const EXP_LABEL = { paga: "Paga", realizada: "Realizada", pendente: "Pendente", prevista: "Prevista", reembolsada: "Reembolsada" };
const DEFAULT_WEIGHTS = { price: 35, hotel: 20, flight: 15, services: 15, payment: 10, flex: 5, rating: 0 };
const CRIT = [
  { k: "price", l: "Preço total" }, { k: "hotel", l: "Hospedagem" }, { k: "flight", l: "Passagens aéreas" },
  { k: "services", l: "Serviços incluídos" }, { k: "payment", l: "Condições de pagamento" },
  { k: "flex", l: "Flexibilidade e cancelamento" }, { k: "rating", l: "Avaliação pessoal" },
];
const EMPTY = { trips: [], items: [], quotes: [], bookings: [], payments: [], expenses: [], itinerary: [], programs: [], redemptions: [], docs: [], log: [], activeTripId: null, shared: {} };
// Despesas destas categorias nascem privadas em viagens compartilhadas (podem ser alteradas em cada despesa).
const PRIVATE_CATS = ["Compras e lembranças", "Emergências"];
const PRIVATE_LABEL = "Gastos pessoais (privados)";

const travelers = (t) => (Number(t.adults) || 0) + (Number(t.children) || 0);
const tripDays = (t) => {
  if (!t.startDate || !t.endDate) return null;
  const n = diffDays(t.startDate, t.endDate);
  return n < 0 ? null : { days: n + 1, nights: n };
};
const effStatus = (p) => {
  if (p.status === "pago" || p.status === "cancelado") return p.status;
  if (p.dueDate && p.dueDate < todayISO()) return "atrasado";
  return p.status;
};
let ACTOR = ""; // e-mail de quem está usando, registrado no histórico das viagens compartilhadas
const withLog = (st, tripId, text) => ({ ...st, log: [{ id: uid(), tripId, text, at: new Date().toISOString(), by: ACTOR }, ...(st.log || [])].slice(0, 200) });

// ---------- Fase 2: roteiro tipado, benefícios, divisão de despesas ----------
const ITIN_TYPES = [["restaurante", "Restaurante"], ["passeio", "Passeio"], ["praia", "Praia"], ["atracao", "Atração"], ["deslocamento", "Deslocamento"], ["hospedagem", "Hospedagem"], ["escala", "Escala do cruzeiro"], ["outro", "Outro"]];
const ITIN_LABEL = Object.fromEntries(ITIN_TYPES);
const ITIN_CAT = { restaurante: "Alimentação", passeio: "Passeios e excursões", praia: "Passeios e excursões", atracao: "Ingressos", deslocamento: "Transporte local", hospedagem: "Hospedagem", escala: "Excursões em terra", outro: "Outras despesas" };
const PROG_TYPES = [["clube", "Clube de benefícios"], ["milhas", "Pontos e milhas"], ["cartao", "Cartão ou banco"], ["outro", "Outro"]];
const PROG_LABEL = Object.fromEntries(PROG_TYPES);
const COST_MODELS = [["gratis", "Gratuito"], ["anual", "Anuidade"], ["mensal", "Mensalidade"], ["unico", "Pagamento único"]];
const RULE_KINDS = [["2x1", "Compre 1, leve 2 (paga o de maior valor)"], ["pct", "Desconto percentual"], ["fixed", "Desconto em reais"], ["other", "Outro (informo o valor pago)"]];
const RULE_AREAS = ["Restaurantes", "Hotéis", "Ingressos", "Passeios", "Transporte", "Compras", "Outros"];
const DOC_TYPES = ["Documento de identidade", "Passaporte ou visto", "Voucher de hospedagem", "Bilhete aéreo", "Seguro-viagem", "Ingresso", "Reserva de passeio", "Reserva de restaurante", "Outro"];
const REAL_ST = ["realizada", "paga", "pendente"];
const peopleOf = (t) => { const n = String(t.travelerNames || "").split(",").map((x) => x.trim()).filter(Boolean); return n.length ? n : Array.from({ length: Math.max(1, travelers(t)) }, (_, i) => `Viajante ${i + 1}`); };
const ruleOf = (programs, b) => { const p = b && (programs || []).find((x) => x.id === b.programId); return p ? { p, r: (p.rules || []).find((x) => x.id === b.ruleId) || null } : null; };
// Adesões de um clube (um cartão/conta por titular). Programas antigos viram uma adesão única.
const membershipsOf = (p) => (p?.memberships?.length ? p.memberships : [{ id: "m0", holder: "", fee: p?.fee, startDate: p?.startDate, endDate: p?.endDate }]);
const feeOf = (p) => sum(membershipsOf(p), (m) => m.fee);
const activeMemberships = (p, d) => membershipsOf(p).filter((m) => (!m.startDate || !d || d >= m.startDate) && (!m.endDate || !d || d <= m.endDate));
const itemsOf = (b) => (Array.isArray(b?.items) ? b.items : [b?.a, b?.b]).map(num).filter((x) => x > 0);
// "Compre 1, leve 2" com k adesões: os 2k itens mais caros formam pares adjacentes; em cada par paga-se o mais caro.
// Essa combinação maximiza a economia (soma do item mais barato de cada par).
function pairSavings(items, k) {
  const v = items.slice().sort((x, y) => y - x);
  const pairs = Math.max(0, Math.min(k, Math.floor(v.length / 2)));
  let saved = 0; for (let i = 0; i < pairs; i++) saved += v[2 * i + 1];
  return { pairs, saved: r2(saved), unpaired: v.length - pairs * 2 };
}
function applyRule(rule, b) {
  if (!rule || !b) return null;
  if (rule.kind === "2x1") { const it = itemsOf(b); if (!it.length) return null; const full = r2(it.reduce((x, y) => x + y, 0)); const ps = pairSavings(it, num(b.uses) || 1); return { full, paid: r2(full - ps.saved), ...ps }; }
  const F = num(b.full); if (F == null) return null;
  if (rule.kind === "pct") return { full: F, paid: r2(F * (1 - (num(rule.value) || 0) / 100)) };
  if (rule.kind === "fixed") return { full: F, paid: r2(Math.max(0, F - (num(rule.value) || 0))) };
  return { full: F, paid: null };
}
const inPeriod = (p, d) => activeMemberships(p, d).length > 0;
function programStats(s, p, tripId) {
  const linked = new Set(s.expenses.map((e) => e.itineraryId).filter(Boolean));
  const exps = s.expenses.filter((e) => e.benefit?.programId === p.id && REAL_ST.includes(e.status) && num(e.benefit.full) > 0 && (!tripId || e.tripId === tripId) && inPeriod(p, e.date));
  const its = s.itinerary.filter((i) => i.benefit?.programId === p.id && i.status !== "cancelada" && !linked.has(i.id) && num(i.benefit.full) > 0 && (!tripId || i.tripId === tripId) && inPeriod(p, i.date));
  const realized = sum(exps, (e) => num(e.benefit.full) - num(e.amount));
  const planned = sum(its, (i) => num(i.benefit.full) - (num(i.estimated) || 0));
  const fee = feeOf(p);
  const yearFee = p.costModel === "anual" || p.costModel === "unico" ? fee : p.costModel === "mensal" ? r2(fee * 12) : 0;
  return { uses: exps.reduce((x, e) => x + (num(e.benefit.uses) || 1), 0), plannedUses: its.length, realized, planned, yearFee, net: r2(realized - yearFee), left: Math.max(0, r2(yearFee - realized - planned)) };
}
function splitEqual(total, people) { if (!people.length) return []; const base = Math.floor((total * 100) / people.length) / 100; return people.map((p, i) => ({ person: p, amount: i === people.length - 1 ? r2(total - base * (people.length - 1)) : base })); }
function settlement(exps, people) {
  const paid = {}, share = {}; people.forEach((p) => { paid[p] = 0; share[p] = 0; });
  let unknown = 0;
  exps.filter((e) => REAL_ST.includes(e.status) && !e.private).forEach((e) => {
    const amt = num(e.amount) || 0;
    if (!e.person) { unknown = r2(unknown + amt); return; }
    paid[e.person] = r2((paid[e.person] || 0) + amt);
    const parts = e.shared ? (e.splits?.length ? e.splits : splitEqual(amt, people)) : [{ person: e.person, amount: amt }];
    parts.forEach((x) => (share[x.person] = r2((share[x.person] || 0) + x.amount)));
  });
  const rows = Object.keys({ ...paid, ...share }).map((p) => ({ p, paid: paid[p] || 0, share: share[p] || 0, net: r2((paid[p] || 0) - (share[p] || 0)) }));
  const cred = rows.filter((r) => r.net > 0.009).map((r) => ({ ...r })).sort((a, b) => b.net - a.net);
  const deb = rows.filter((r) => r.net < -0.009).map((r) => ({ ...r, net: -r.net })).sort((a, b) => b.net - a.net);
  const transfers = []; let i = 0, j = 0;
  while (i < deb.length && j < cred.length) { const v = r2(Math.min(deb[i].net, cred[j].net)); if (v > 0) transfers.push({ from: deb[i].p, to: cred[j].p, amount: v }); deb[i].net = r2(deb[i].net - v); cred[j].net = r2(cred[j].net - v); if (deb[i].net <= 0.009) i++; if (cred[j].net <= 0.009) j++; }
  return { rows, transfers, unknown };
}
function consumptionByPerson(exps, people) { const out = {}; exps.filter((e) => REAL_ST.includes(e.status)).forEach((e) => { const amt = num(e.amount) || 0; const parts = e.shared ? (e.splits?.length ? e.splits : splitEqual(amt, people)) : [{ person: e.person || "Não informado", amount: amt }]; parts.forEach((x) => (out[x.person] = r2((out[x.person] || 0) + x.amount))); }); return out; }


// ---------- Regras de negócio ----------
/*  Separação de conceitos (evita dupla contagem):
    PREVISTO   = itens do planejamento (estimativa)
    CONTRATADO = valor contratado dos itens (inclui o item gerado pela proposta selecionada)
    REALIZADO  = despesas lançadas durante/antes da viagem (gastos não contratados)
    PAGO       = parcelas quitadas + despesas com status "paga"
    Cancelados e reembolsados nunca entram nos totais.                          */
function metrics(s, trip) {
  const T = trip.id;
  const items = s.items.filter((i) => i.tripId === T);
  const pays = s.payments.filter((p) => p.tripId === T);
  const exps = s.expenses.filter((e) => e.tripId === T);
  const quotes = s.quotes.filter((q) => q.tripId === T);
  const booking = s.bookings.find((b) => b.tripId === T && b.active) || null;
  const budget = num(trip.budget) || 0;
  const estimated = sum(items, (i) => i.estimated);
  const contracted = sum(items, (i) => i.contracted);
  const realExp = exps.filter((e) => ["realizada", "paga", "pendente"].includes(e.status));
  // Despesas privadas de outros membros: só a soma chega (my_shared_context), nunca os detalhes.
  const pv = s.shared?.[T]?.private_totals || {};
  const pvReal = num(pv.realized) || 0, pvPaid = num(pv.paid) || 0, pvPend = num(pv.pending) || 0;
  const expenseTotal = r2(sum(realExp, (e) => e.amount) + pvReal);
  const committed = r2(contracted + expenseTotal);
  const activePays = pays.filter((p) => p.status !== "cancelado");
  const paidPays = sum(pays.filter((p) => p.status === "pago"), (p) => p.amount);
  const paidExp = r2(sum(exps.filter((e) => e.status === "paga"), (e) => e.amount) + pvPaid);
  const paid = r2(paidPays + paidExp);
  const pendingExp = r2(sum(exps.filter((e) => e.status === "pendente" || e.status === "realizada"), (e) => e.amount) + pvPend);
  const toPay = r2(Math.max(0, contracted - paidPays) + pendingExp);
  const byCat = {};
  CATS.forEach((c) => (byCat[c] = { est: 0, con: 0, exp: 0 }));
  items.forEach((i) => { const c = byCat[i.category] || (byCat[i.category] = { est: 0, con: 0, exp: 0 }); c.est = r2(c.est + (num(i.estimated) || 0)); c.con = r2(c.con + (num(i.contracted) || 0)); });
  realExp.forEach((e) => { const c = byCat[e.category] || (byCat[e.category] = { est: 0, con: 0, exp: 0 }); c.exp = r2(c.exp + (num(e.amount) || 0)); });
  if (pvReal) byCat[PRIVATE_LABEL] = { est: 0, con: 0, exp: pvReal };
  const remainingPlanned = r2(Object.values(byCat).reduce((a, c) => a + Math.max(0, c.est - (c.con + c.exp)), 0));
  const projected = r2(committed + remainingPlanned);
  const paidByItem = {}, schedByItem = {};
  pays.forEach((p) => {
    if (p.status === "pago") paidByItem[p.itemId] = r2((paidByItem[p.itemId] || 0) + p.amount);
    if (p.status !== "cancelado") schedByItem[p.itemId] = r2((schedByItem[p.itemId] || 0) + p.amount);
  });
  const valid = quotes.filter((q) => num(q.total) > 0);
  const bestQuote = valid.length ? valid.reduce((a, b) => (Number(a.total) <= Number(b.total) ? a : b)) : null;
  const bookedQuote = booking ? quotes.find((q) => q.id === booking.quoteId) : null;
  const itin = s.itinerary.filter((i) => i.tripId === T);
  const linkedIt = new Set(exps.map((e) => e.itineraryId).filter(Boolean));
  const savBenefit = sum(realExp.filter((e) => e.benefit && num(e.benefit.full) > 0), (e) => num(e.benefit.full) - num(e.amount));
  const savPlanned = sum(itin.filter((i) => i.status !== "cancelada" && i.benefit && num(i.benefit.full) > 0 && !linkedIt.has(i.id)), (i) => num(i.benefit.full) - (num(i.estimated) || 0));
  const savPoints = sum((s.redemptions || []).filter((r) => r.tripId === T && r.used), (r) => r.cashSaving);
  const savDiscount = bookedQuote ? num(bookedQuote.discount) || 0 : 0;
  return {
    itin, savBenefit, savPlanned, savPoints, savDiscount, pvReal,
    items, pays, activePays, exps, realExp, quotes, booking, bookedQuote, budget, estimated, contracted, expenseTotal,
    committed, paidPays, paid, toPay, balance: r2(budget - committed), projected, remainingPlanned,
    deviation: r2(committed - estimated), execution: pct(paid, committed), byCat, paidByItem, schedByItem, bestQuote,
  };
}

function buildSchedule(total, entry, n, iv, entryDate, firstDate) {
  const out = [];
  const E = r2(entry || 0), N = Math.max(0, parseInt(n) || 0), rest = r2(total - E);
  if (E > 0) out.push({ no: 0, amount: E, date: entryDate });
  if (rest > 0) {
    const k = N || 1;
    const base = iv && Math.abs(r2(iv * k) - rest) <= 1 ? r2(iv) : Math.floor((rest * 100) / k) / 100;
    for (let i = 0; i < k; i++) out.push({ no: i + 1, of: k, amount: i === k - 1 ? r2(rest - base * (k - 1)) : base, date: addMonths(firstDate, i) });
  }
  return out;
}

function missingFields(q) {
  const m = [];
  if (!(num(q.total) > 0)) m.push("valor total");
  if (!q.validUntil) m.push("validade");
  if (!num(q.hotelStars) && !q.meal) m.push("hospedagem");
  if (q.connections === "" || q.connections == null) m.push("conexões");
  if (!q.baggage) m.push("bagagem");
  if (!q.cancel) m.push("cancelamento");
  if (num(q.installments) == null && num(q.entry) == null) m.push("pagamento");
  return m;
}

function scoreQuotes(quotes, trip, W) {
  const tv = travelers(trip) || 1;
  const td = tripDays(trip);
  const ok = quotes.filter((q) => num(q.total) > 0);
  const range = (f) => { const v = ok.map(f).filter((x) => x != null); return v.length ? [Math.min(...v), Math.max(...v)] : null; };
  const norm = (v, r, lower) => { if (v == null || !r) return null; const [lo, hi] = r; if (hi === lo) return 100; return lower ? ((hi - v) / (hi - lo)) * 100 : ((v - lo) / (hi - lo)) * 100; };
  const rTotal = range((q) => num(q.total));
  const rInst = range((q) => num(q.installments));
  const rEntry = range((q) => (num(q.entry) != null ? num(q.entry) / num(q.total) : null));
  const rInt = range((q) => num(q.interest));
  const totalW = CRIT.reduce((a, c) => a + (Number(W[c.k]) || 0), 0);
  return quotes.map((q) => {
    const total = num(q.total);
    const people = num(q.people) || tv;
    const perPerson = total ? total / people : null;
    const perDay = perPerson && td ? perPerson / td.days : null;
    const p = {}, det = {};
    p.price = total ? norm(total, rTotal, true) : null;
    det.price = total ? `${brl(total)} numa faixa de ${brl(rTotal[0])} a ${brl(rTotal[1])} (menor = 100)` : "Valor total não informado";
    const h = [], hd = [];
    if (num(q.hotelStars)) { h.push((num(q.hotelStars) / 5) * 100); hd.push(`${q.hotelStars} estrela(s)`); }
    if (q.meal) { h.push(MEAL_SCORE[q.meal]); hd.push(MEAL_LABEL[q.meal].toLowerCase()); }
    if (num(q.locationRating)) { h.push((num(q.locationRating) / 5) * 100); hd.push(`localização ${q.locationRating}/5`); }
    p.hotel = h.length ? avg(h) : null; det.hotel = h.length ? `Média de: ${hd.join(", ")}` : "Sem categoria, regime ou localização";
    const f = [], fd = [];
    if (q.connections !== "" && q.connections != null) { const c = Number(q.connections); f.push(c === 0 ? 100 : c === 1 ? 60 : 25); fd.push(c === 0 ? "voo direto" : `${c} conexão(ões)`); }
    if (q.baggage === "sim" || q.baggage === "nao") { f.push(q.baggage === "sim" ? 100 : 0); fd.push(q.baggage === "sim" ? "bagagem incluída" : "sem bagagem"); }
    p.flight = f.length ? avg(f) : null; det.flight = f.length ? `Média de: ${fd.join(", ")}` : "Conexões e bagagem não informadas";
    const sv = [["transfers", "traslados"], ["insurance", "seguro"], ["toursInc", "passeios"]].filter(([k]) => q[k] === "sim" || q[k] === "nao");
    p.services = sv.length ? (sv.filter(([k]) => q[k] === "sim").length / sv.length) * 100 : null;
    det.services = sv.length ? `${sv.filter(([k]) => q[k] === "sim").map(([, l]) => l).join(", ") || "nenhum"} incluído(s), de ${sv.length} de 3 itens informados` : "Traslados, seguro e passeios não informados";
    const pp = [], pd = [];
    if (num(q.installments) != null && rInst) { pp.push(norm(num(q.installments), rInst, false)); pd.push(`${q.installments}x`); }
    if (num(q.entry) != null && total) { pp.push(norm(num(q.entry) / total, rEntry, true)); pd.push(`entrada de ${fpct(pct(num(q.entry), total))}`); }
    if (num(q.interest) != null) { pp.push(norm(num(q.interest), rInt, true)); pd.push(`encargos ${brl(q.interest)}`); }
    p.payment = pp.length ? avg(pp) : null; det.payment = pp.length ? `Comparado às demais: ${pd.join(", ")}` : "Condições de pagamento não informadas";
    p.flex = q.cancel ? CANCEL_SCORE[q.cancel] : null; det.flex = q.cancel ? `Política ${CANCEL_LABEL[q.cancel].toLowerCase()}` : "Política de cancelamento não informada";
    p.rating = num(q.rating) ? (num(q.rating) / 5) * 100 : null; det.rating = num(q.rating) ? `Sua nota: ${q.rating}/5` : "Sem avaliação pessoal";
    let ws = 0, acc = 0; const missing = [];
    CRIT.forEach((c) => { const w = Number(W[c.k]) || 0; if (w <= 0) return; if (p[c.k] == null) { missing.push(c.l); return; } ws += w; acc += w * p[c.k]; });
    return { q, p, det, ws, score: ws ? acc / ws : null, coverage: totalW ? (ws / totalW) * 100 : 0, missing, perPerson, perDay, people };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

function prosCons(r, rows) {
  const q = r.q, pros = [], cons = [];
  const vals = rows.filter((x) => num(x.q.total) > 0).map((x) => num(x.q.total));
  if (num(q.total) > 0 && vals.length > 1) {
    if (num(q.total) === Math.min(...vals)) pros.push("Menor preço total");
    if (num(q.total) === Math.max(...vals)) cons.push("Maior preço total");
  }
  if (q.meal === "all") pros.push("All inclusive");
  else if (["cafe", "meia", "completa"].includes(q.meal)) pros.push(`${MEAL_LABEL[q.meal]} incluído(a)`);
  else if (q.meal === "sem") cons.push("Sem refeições");
  if (num(q.hotelStars) >= 4) pros.push(`Hotel ${q.hotelStars} estrelas`);
  else if (num(q.hotelStars) && num(q.hotelStars) <= 2) cons.push(`Hotel ${q.hotelStars} estrela(s)`);
  if (q.connections !== "" && q.connections != null) { if (Number(q.connections) === 0) pros.push("Voo direto"); else if (Number(q.connections) >= 2) cons.push(`${q.connections} conexões`); }
  if (q.baggage === "sim") pros.push("Bagagem incluída"); if (q.baggage === "nao") cons.push("Sem bagagem despachada");
  if (q.transfers === "sim") pros.push("Traslados inclusos"); if (q.transfers === "nao") cons.push("Sem traslados");
  if (q.insurance === "sim") pros.push("Seguro-viagem incluso"); if (q.insurance === "nao") cons.push("Sem seguro-viagem");
  if (q.toursInc === "sim") pros.push("Passeios inclusos");
  if (q.cancel === "flexivel") pros.push("Cancelamento flexível"); if (q.cancel === "rigida") cons.push("Cancelamento rígido");
  if (num(q.interest) > 0) cons.push(`Encargos de ${brl(q.interest)}`);
  if (num(q.installments) >= 10) pros.push(`Parcelamento em ${q.installments}x`);
  if (q.validUntil) { const d = diffDays(todayISO(), q.validUntil); if (d < 0) cons.push("Proposta expirada"); else if (d <= 3) cons.push(`Expira em ${d} dia(s)`); }
  return { pros, cons };
}

function getAlerts(s, trip, m) {
  const A = [], today = todayISO();
  if (m.budget > 0 && m.committed > m.budget) A.push({ t: "red", x: `Orçamento ultrapassado em ${brl(m.committed - m.budget)}.`, go: "planejamento" });
  else if (m.budget > 0 && m.projected > m.budget) A.push({ t: "orange", x: `A projeção (comprometido + previsto restante) supera o orçamento em ${brl(m.projected - m.budget)}.`, go: "planejamento" });
  const late = m.pays.filter((p) => effStatus(p) === "atrasado");
  if (late.length) A.push({ t: "red", x: `${late.length} pagamento(s) em atraso, somando ${brl(sum(late, (p) => p.amount))}.`, go: "pagamentos" });
  const soon = m.pays.filter((p) => !["pago", "cancelado"].includes(p.status) && p.dueDate >= today && diffDays(today, p.dueDate) <= 7);
  if (soon.length) A.push({ t: "orange", x: `${soon.length} parcela(s) vencem nos próximos 7 dias (${brl(sum(soon, (p) => p.amount))}).`, go: "pagamentos" });
  if (!m.booking) m.quotes.forEach((q) => { if (q.validUntil) { const d = diffDays(today, q.validUntil); if (d >= 0 && d <= 3) A.push({ t: "orange", x: `A cotação de ${q.agency} expira ${d === 0 ? "hoje" : `em ${d} dia(s)`}.`, go: "cotacoes" }); } });
  if (trip.startDate && !m.booking) { const u = diffDays(today, trip.startDate); if (u >= 0 && u <= 45) A.push({ t: "orange", x: `Faltam ${u} dias e nenhuma proposta foi selecionada.`, go: "cotacoes" }); }
  const resv = s.itinerary.filter((i) => i.tripId === trip.id && i.needsReservation && i.reservationStatus !== "confirmada" && i.status !== "cancelada");
  if (resv.length) A.push({ t: "orange", x: `${resv.length} atividade(s) do roteiro com reserva ainda não confirmada.`, go: "roteiro" });
  Object.entries(m.byCat).forEach(([c, v]) => { if (v.est > 0 && v.con + v.exp > v.est * 1.1) A.push({ t: "orange", x: `${c} está ${fpct(pct(v.con + v.exp - v.est, v.est))} acima do previsto.`, go: "planejamento" }); });
  const pend = m.exps.filter((e) => e.status === "pendente");
  if (pend.length) A.push({ t: "blue", x: `${pend.length} despesa(s) pendente(s) de pagamento.`, go: "despesas" });
  (s.programs || []).forEach((p) => {
    const uses = s.itinerary.filter((i) => i.tripId === trip.id && i.benefit?.programId === p.id && i.status !== "cancelada");
    if (p.endDate && uses.some((i) => i.date > p.endDate)) A.push({ t: "orange", x: `A vigência de ${p.name} termina em ${fdate(p.endDate)}, antes de atividades em que você planejou usá-lo.`, go: "beneficios" });
    if (p.pointsExpiry && p.pointsExpiry >= today && diffDays(today, p.pointsExpiry) <= 60) A.push({ t: "orange", x: `Os pontos de ${p.name} vencem em ${fdate(p.pointsExpiry)}.`, go: "beneficios" });
  });
  const docs = (s.docs || []).filter((d) => d.tripId === trip.id && d.status !== "ok");
  if (docs.length) A.push({ t: "orange", x: `${docs.length} documento(s) ou reserva(s) ainda não confirmado(s).`, go: "roteiro" });
  return A;
}

function downloadCSV(name, headers, rows) {
  const esc = (v) => { const s = String(v ?? ""); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = "\uFEFF" + [headers, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
const slug = (s) => String(s || "viagem").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function buildDemo() {
  const t0 = todayISO(), start = addDays(t0, 75), end = addDays(start, 7);
  const trip = {
    id: uid(), demo: true, name: "[DEMO] Nordeste em família", destination: "Maceió – AL", cities: "Maceió, Maragogi, São Miguel dos Milagres",
    startDate: start, endDate: end, adults: 2, children: 1, childrenAges: "8", travelerNames: "Adulto 1, Adulto 2, Criança",
    budget: 18000, budgetPerPerson: "", monthlySaving: 1500, goal: "Descanso em família", style: "Confortável",
    lodging: "Pé na areia, com café da manhã", notes: "Dados de demonstração. Remova em Configurações.", status: "cotando",
    weights: { ...DEFAULT_WEIGHTS }, createdAt: new Date().toISOString(),
  };
  const T = trip.id;
  const items = [["Alimentação fora do pacote", "Alimentação", 2400], ["Transporte local e aplicativos", "Transporte local", 700], ["Piscinas naturais", "Passeios e excursões", 900], ["Lembranças", "Compras e lembranças", 800], ["Reserva de emergência", "Emergências", 1000], ["Estacionamento no aeroporto", "Estacionamento e aeroporto", 280]]
    .map(([d, c, v]) => ({ id: uid(), tripId: T, demo: true, description: d, category: c, estimated: v, contracted: "", dueDate: "", method: "", responsible: "", notes: "" }));
  const base = { tripId: T, demo: true, date: t0, people: 3, status: "aberta", favorite: false, nights: 7 };
  const quotes = [
    { ...base, id: uid(), agency: "Maré Alta Viagens (demo)", validUntil: addDays(t0, 3), total: 12900, entry: 2900, installments: 10, installmentValue: 1000, interest: 0, discount: 300, airline: "Companhia A", connections: 1, baggage: "sim", hotel: "Hotel Recife dos Corais", hotelStars: 4, meal: "cafe", locationRating: 4, transfers: "sim", insurance: "nao", toursInc: "nao", cancel: "moderada", rating: 4 },
    { ...base, id: uid(), agency: "Rota do Sol Turismo (demo)", validUntil: addDays(t0, 12), total: 11800, entry: 1800, installments: 5, installmentValue: 2000, interest: 0, airline: "Companhia B", connections: 2, baggage: "nao", hotel: "Pousada Brisa Mar", hotelStars: 3, meal: "cafe", locationRating: 3, transfers: "sim", insurance: "nao", toursInc: "", cancel: "rigida", rating: 3 },
    { ...base, id: uid(), agency: "Coral Experiências (demo)", validUntil: addDays(t0, 20), total: 14600, entry: 1460, installments: 12, installmentValue: 1095, interest: 0, airline: "Companhia A", connections: 0, baggage: "sim", hotel: "Resort Enseada Azul", hotelStars: 5, meal: "all", locationRating: 5, transfers: "sim", insurance: "sim", toursInc: "sim", toursText: "Catamarã em Maragogi", cancel: "flexivel", rating: 5 },
  ];
  const itinerary = [
    { id: uid(), tripId: T, demo: true, date: addDays(start, 1), time: "08:30", city: "Maragogi", activity: "Piscinas naturais de catamarã", place: "Praia de Maragogi", estimated: 450, real: "", needsReservation: true, reservationStatus: "pendente", status: "planejada", link: "", notes: "Conferir tábua de marés" },
    { id: uid(), tripId: T, demo: true, date: addDays(start, 2), time: "16:00", city: "São Miguel dos Milagres", activity: "Pôr do sol na praia do Toque", place: "Praia do Toque", estimated: 0, real: "", needsReservation: false, reservationStatus: "", status: "planejada", link: "", notes: "Atividade gratuita" },
    { id: uid(), tripId: T, demo: true, date: addDays(start, 3), time: "20:00", city: "Maceió", activity: "Jantar na orla de Pajuçara", place: "Pajuçara", estimated: 320, real: "", needsReservation: true, reservationStatus: "pendente", status: "planejada", link: "", notes: "" },
  ];
  return { trip, items, quotes, itinerary };
}

// ---------- Estilos ----------


// ---------- Componentes base ----------
const Fld = ({ label, hint, err, full, children }) => (
  <div className={`fld ${full ? "full" : ""}`}>
    <label><span className="lb">{label}</span>{children}</label>
    {err ? <div className="err">{err}</div> : hint ? <div className="hint">{hint}</div> : null}
  </div>
);
const Inp = ({ value, onChange, type = "text", ...p }) => <input className="inp" type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...p} />;
const Sel = ({ value, onChange, opts, ...p }) => (
  <select className="sel" value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...p}>
    {opts.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>))}
  </select>
);
const CatSel = ({ value, onChange, ...p }) => (
  <select className="sel" value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...p}>
    {value && !CATS.includes(value) && <option value={value}>{value}</option>}
    {CAT_GROUPS.map(([g, cs]) => <optgroup key={g} label={g}>{cs.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>)}
  </select>
);
const Ta = ({ value, onChange, ...p }) => <textarea className="ta" value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...p} />;
const Money = React.forwardRef(function Money({ value, onChange, placeholder = "R$ 0,00", className = "inp", ...p }, ref) {
  const display = value === "" || value == null ? "" : BRL.format(Number(value));
  return <input ref={ref} className={className} inputMode="numeric" value={display} placeholder={placeholder} {...p}
    onChange={(e) => { const d = e.target.value.replace(/\D/g, ""); onChange(d ? Number(d) / 100 : ""); }} />;
});
function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => { const h = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-h"><h2 className="serif">{title}</h2><button className="ib" onClick={onClose} aria-label="Fechar"><X size={18} /></button></div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}
const Prog = ({ value, color = "var(--ocean)" }) => <div className="prog"><div style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} /></div>;
const Empty = ({ icon: I = Info, title, text, children }) => (
  <div className="empty"><div className="ic"><I size={26} /></div><h3 className="serif">{title}</h3><p className="muted" style={{ margin: "0 0 18px" }}>{text}</p><div className="row" style={{ justifyContent: "center" }}>{children}</div></div>
);
const PayBadge = ({ p }) => { const s = effStatus(p); const cls = { pago: "b-green", atrasado: "b-red", pendente: "b-orange", previsto: "b-blue", cancelado: "" }[s]; return <span className={`badge ${cls}`}>{PAY_LABEL[s]}</span>; };
const ChartEmpty = ({ text }) => <div style={{ height: 220, display: "grid", placeItems: "center", textAlign: "center" }} className="muted"><div><BarChart3 size={22} style={{ opacity: 0.5 }} /><div style={{ fontSize: 13, marginTop: 6, maxWidth: 260 }}>{text}</div></div></div>;
const tipStyle = { borderRadius: 10, border: "1px solid #E3EBEE", fontSize: 12.5, fontFamily: "Figtree, sans-serif" };
const Toggle = ({ checked, onChange, label }) => <label className="pill-tog"><input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
const Stars = ({ n }) => (num(n) ? <span style={{ color: "#E8A23A", letterSpacing: 1 }}>{"★".repeat(num(n))}<span style={{ color: "#D8E3E6" }}>{"★".repeat(5 - num(n))}</span></span> : <span className="na">não informado</span>);

// ---------- App ----------
const NAV = [
  { k: "dashboard", l: "Dashboard", i: LayoutDashboard },
  { k: "viagens", l: "Minhas viagens", i: Plane },
  { k: "planejamento", l: "Planejamento", i: Wallet },
  { k: "cotacoes", l: "Cotações e comparativo", i: FileText },
  { k: "pagamentos", l: "Orçamento e pagamentos", i: CalendarClock },
  { k: "roteiro", l: "Roteiro e atividades", i: MapPin },
  { k: "beneficios", l: "Benefícios e fidelidade", i: Gift },
  { k: "despesas", l: "Despesas da viagem", i: Receipt },
  { k: "balanco", l: "Relatórios e balanço", i: BarChart3 },
  { k: "planos", l: "Planos", i: Crown },
  { k: "config", l: "Configurações", i: Settings },
];
const SUBTITLE = {
  dashboard: "Visão consolidada da viagem ativa", viagens: "Crie, duplique e arquive viagens", planejamento: "Previsto, contratado e pago por item",
  cotacoes: "Propostas das agências e ranking de custo-benefício", pagamentos: "Cronograma de parcelas e obrigações", roteiro: "Atividades organizadas dia a dia",
  despesas: "Registro rápido dos gastos", beneficios: "Clubes de desconto, pontos e milhas", balanco: "Planejado versus realizado", planos: "Escolha o plano ideal para as suas viagens", config: "Dados, exportações e demonstração",
};

function AppInner({ store, account, onSignOut, me = "local" }) {
  ACTOR = account || "";
  const [s, setS] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [persist, setPersist] = useState("idle");
  const [page, setPage] = useState("dashboard");
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirm] = useState(null);
  const [menu, setMenu] = useState(false);
  const [newTrip, setNewTrip] = useState(false);
  const first = useRef(true);

  const [migrate, setMigrate] = useState(null);
  const [plan, setPlan] = useState(null);
  const [upgrade, setUpgrade] = useState(null);
  const refreshPlan = async () => { try { const p = await store.plan(); if (p) setPlan(p); return p; } catch (e) { return null; } };
  const [retry, setRetry] = useState(0);
  const sRef = useRef(s); sRef.current = s;
  const persistRef = useRef(persist); persistRef.current = persist;
  useEffect(() => { (async () => {
    const r = await store.load();
    if (r.data) setS({ ...EMPTY, ...r.data });
    setPersist(r.ok ? "saved" : "memory"); setLoaded(true);
    if (!r.ok && store.mode === "cloud") toast("Não foi possível carregar seus dados da nuvem. Verifique a conexão e recarregue a página.", "err");
    refreshPlan();
    if (store.mode === "cloud" && r.ok && !(r.data?.trips?.length || r.data?.programs?.length)) { const b = readBrowserBackup(); if (b && (b.trips?.length || b.programs?.length)) setMigrate(b); }
  })(); }, [store]); // eslint-disable-line
  useEffect(() => {
    if (!loaded) return;
    if (first.current) { first.current = false; return; }
    setPersist("saving");
    const h = setTimeout(async () => {
      const res = await store.save(s);
      if (res && res.denied) {
        const r = await store.load(); if (r.ok && r.data) setS({ ...EMPTY, ...r.data });
        setPersist("saved"); toast("Seu papel nesta viagem compartilhada não permite essa alteração. Os dados foram recarregados.", "err");
        return;
      }
      if (res && res.limit) {
        // O banco recusou por limite do plano: volta ao estado confirmado e explica.
        const r = await store.load(); if (r.ok && r.data) setS({ ...EMPTY, ...r.data });
        setPersist("saved"); const k = LIMIT_CODES[res.limit];
        if (k) setUpgrade({ kind: k }); else toast("Essa alteração não é permitida no seu plano.", "err");
        return;
      }
      setPersist(res === true ? "saved" : "memory");
    }, 450);
    return () => clearTimeout(h);
  }, [s, loaded]);

  useEffect(() => {
    if (persist !== "memory" || store.mode !== "cloud" || !loaded) return;
    const h = setTimeout(async () => { const ok = await store.save(sRef.current); if (ok === true || ok?.limit || ok?.denied) setPersist("saved"); else setRetry((x) => x + 1); }, 8000);
    return () => clearTimeout(h);
  }, [persist, loaded, store, retry]);
  useEffect(() => {
    if (store.mode !== "cloud") return;
    const h = async () => {
      if (document.visibilityState !== "visible" || persistRef.current !== "saved") return;
      refreshPlan();
      const r = await store.load();
      if (r.ok && r.data && persistRef.current === "saved") setS({ ...EMPTY, ...r.data });
    };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, [store]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const ck = q.get("checkout"), pg = q.get("pagina");
    if (!ck && !pg) return;
    window.history.replaceState({}, "", window.location.pathname);
    if (pg === "planos" || ck) setPage("planos");
    if (ck === "cancelado") { setTimeout(() => toast("Contratação não concluída. Nada foi cobrado.", "info"), 300); return; }
    if (ck !== "sucesso") return;
    setTimeout(() => toast("Recebemos sua contratação. Ativando o plano…"), 300);
    let n = 0;
    const t = setInterval(async () => { n++; const p = await refreshPlan(); if ((p && ["active", "trialing", "pago_unico"].includes(p.status)) || n >= 12) clearInterval(t); }, 2500);
    return () => clearInterval(t);
  }, []); // eslint-disable-line

  // Convite pendente (link ?convite=…): aceito assim que os dados carregam.
  useEffect(() => {
    if (!loaded || store.mode !== "cloud") return;
    let tok = null; try { tok = localStorage.getItem("fp-convite"); } catch (e) { /* sem acesso */ }
    if (!tok) return;
    try { localStorage.removeItem("fp-convite"); } catch (e) { /* ignore */ }
    (async () => {
      try {
        const r = await store.call("accept_invite", { p_token: tok });
        const d = await store.load(); if (d.ok) setS({ ...EMPTY, ...d.data, activeTripId: r.trip_id });
        setPage("dashboard"); toast(`Você entrou na viagem “${r.name || "compartilhada"}” como ${ROLE_LABEL[r.role] || "participante"}.`);
      } catch (e) { toast(shareErr(e), "err"); }
    })();
  }, [loaded]); // eslint-disable-line
  // Atualização ao vivo: qualquer alteração de outro membro recarrega a viagem (se não houver edição local pendente).
  useEffect(() => {
    if (!store.subscribe) return;
    let t;
    const off = store.subscribe(() => {
      clearTimeout(t);
      t = setTimeout(async () => {
        if (persistRef.current !== "saved") return;
        const r = await store.load();
        if (r.ok && r.data && persistRef.current === "saved") setS({ ...EMPTY, ...r.data });
      }, 1200);
    });
    return () => { clearTimeout(t); off(); };
  }, [store]);

  const activeTrips = s.trips.filter((t) => !t.archived);
  const trip = s.trips.find((t) => t.id === s.activeTripId) || activeTrips[0] || null;
  const m = useMemo(() => (trip ? metrics(s, trip) : null), [s, trip]);
  const update = (fn) => setS((p) => fn(p));
  const toast = (msg, type = "ok", action) => {
    const id = uid(); setToasts((t) => [...t, { id, msg, type, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6500 : 3400);
  };
  const ask = (o) => setConfirm(o);
  const setActive = (id) => update((st) => ({ ...st, activeTripId: id }));
  const go = (p) => { setPage(p); setMenu(false); try { window.scrollTo(0, 0); } catch (e) { } };
  const shInfo = trip ? s.shared?.[trip.id] : null;
  const tripMine = !trip || !trip._owner || trip._owner === me;
  const role = !trip || tripMine ? "owner" : shInfo?.my_role || "leitor";
  const canPlan = role === "owner" || role === "editor";
  const canAct = role !== "leitor";
  const sharedTrip = !!shInfo && (shInfo.members || []).length > 1;
  const myTraveler = (shInfo?.members || []).find((x) => x.member_id === me)?.traveler_name || "";
  const reload = async () => { const r = await store.load(); if (r.ok && r.data) setS({ ...EMPTY, ...r.data }); };
  const guard = (kind, current = 0) => {
    if (kind === "quotes" && !tripMine) return true; // na viagem de outra pessoa, vale o plano do organizador (o banco confere)
    const info = LIMITS[kind]; const L = plan?.limits; if (!info || !L) return true;
    const ok = info.flag ? !!L[info.flag] : L[info.key] == null || current < L[info.key];
    if (!ok) setUpgrade({ kind }); return ok;
  };
  const ctx = { s, update, trip, m, toast, ask, go, setActive, storeMode: store.mode, account, onSignOut, plan, refreshPlan, guard, me, role, canPlan, canAct, tripMine, sharedTrip, myTraveler, rpc: store, reload };
  const loadDemo = () => {
    if (s.trips.some((t) => t.demo)) { toast("A demonstração já está carregada", "info"); return; }
    const d = buildDemo();
    update((st) => withLog({ ...st, trips: [...st.trips, d.trip], items: [...st.items, ...d.items], quotes: [...st.quotes, ...d.quotes], itinerary: [...st.itinerary, ...d.itinerary], activeTripId: d.trip.id }, d.trip.id, "Viagem de demonstração carregada"));
    toast("Viagem de demonstração carregada"); go("dashboard");
  };

  const needsTrip = !["viagens", "config", "planos"].includes(page);
  let body;
  if (!loaded) body = <div className="empty"><div className="ic"><Sun size={26} /></div><p className="muted">Carregando seus dados…</p></div>;
  else if (needsTrip && !trip) body = (
    <div className="card"><Empty icon={Sun} title="Comece pela sua próxima viagem" text="Cadastre destino, datas, viajantes e orçamento. Depois registre cotações, compare propostas e acompanhe cada pagamento.">
      <button className="btn pri" onClick={() => { setNewTrip(true); go("viagens"); }}><Plus size={16} />Criar viagem</button>
      <button className="btn" onClick={loadDemo}><Database size={16} />Explorar com dados de demonstração</button>
    </Empty></div>
  );
  else {
    const P = { dashboard: Dashboard, viagens: TripsPage, planejamento: Planning, cotacoes: QuotesPage, pagamentos: PaymentsPage, roteiro: ItineraryPage, beneficios: BenefitsPage, despesas: ExpensesPage, balanco: BalancePage, planos: PlansPage, config: ConfigPage }[page];
    body = <P {...ctx} autoNew={newTrip} clearAutoNew={() => setNewTrip(false)} loadDemo={loadDemo} persist={persist} />;
  }
  const navItem = NAV.find((n) => n.k === page);
  const savedLabel = { cloud: "Sincronizado na nuvem", local: "Salvo neste navegador", claude: "Dados salvos" }[store.mode];
  const failLabel = store.mode === "cloud" ? "Falha ao sincronizar, tentando de novo" : "Sem armazenamento: dados só nesta sessão";
  const pdot = { saved: ["#75D8C3", savedLabel], saving: ["#E8A23A", "Salvando…"], memory: ["#D9534F", failLabel], idle: ["#88AEBB", "Conectando…"] }[persist];

  return (
    <div className="fp">
      <div className={`side-bg ${menu ? "open" : ""}`} onClick={() => setMenu(false)} />
      <aside className={`side ${menu ? "open" : ""}`} aria-label="Navegação principal">
        <div className="logo"><div className="logo-mark"><Sun size={20} /></div><div><b>Férias Planejadas</b><small>planejar, comparar, aproveitar</small></div></div>
        {activeTrips.length > 0 && (
          <div className="tripsel"><span>Viagem ativa</span>
            <select value={trip?.id || ""} onChange={(e) => setActive(e.target.value)} aria-label="Selecionar viagem ativa">
              {activeTrips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}
        <nav className="nav">
          {NAV.map((n) => <button key={n.k} className={page === n.k ? "on" : ""} onClick={() => go(n.k)} aria-current={page === n.k ? "page" : undefined}><n.i size={17} />{n.l}</button>)}
        </nav>
        {plan && plan.plan !== "local" && <button className="planchip" onClick={() => go("planos")}><Crown size={14} />{planChip(plan)}</button>}
        <div className="side-foot"><span className="dot" style={{ background: pdot[0] }} />{pdot[1]}</div>
      </aside>
      <main className="main">
        <header className="top">
          <button className="ib show-m" onClick={() => setMenu(true)} aria-label="Abrir menu"><Menu size={20} /></button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="serif">{navItem?.l}</h1>
            <div className="sub hide-m">{SUBTITLE[page]}{trip && needsTrip ? ` — ${trip.name}` : ""}{trip && needsTrip && !tripMine ? `, você é ${ROLE_LABEL[role]}` : ""}</div>
          </div>
          {trip && <GlobalSearch s={s} trip={trip} go={go} />}
        </header>
        <div className="content">
          {migrate && <div className="banner"><Upload size={18} color="#167D9A" /><span style={{ flex: 1 }}>Encontramos {migrate.trips?.length || 0} viagem(ns) salva(s) neste navegador. Quer enviá-las para a sua conta na nuvem?</span><button className="btn sm" onClick={() => setMigrate(null)}>Agora não</button><button className="btn sm pri" onClick={() => { update(() => ({ ...EMPTY, ...migrate })); setMigrate(null); toast("Dados do navegador enviados para a sua conta"); }}>Enviar para a conta</button></div>}
          {loaded && trip && needsTrip && (role === "leitor" || (!canPlan && ["planejamento", "cotacoes", "pagamentos"].includes(page))) && <div className="banner"><Lock size={16} color="#167D9A" /><span style={{ flex: 1 }}>{role === "leitor" ? "Você acompanha esta viagem como Leitor: pode consultar tudo, sem alterar." : "Nesta viagem, quem altera orçamento, cotações e pagamentos é o organizador ou um editor. Você pode lançar despesas e atividades."}</span></div>}
          {body}
        </div>
      </main>
      <nav className="bottomnav" aria-label="Navegação rápida">
        {["dashboard", "cotacoes", "despesas", "pagamentos"].map((k) => { const n = NAV.find((x) => x.k === k); return <button key={k} className={page === k ? "on" : ""} onClick={() => go(k)}><n.i size={20} />{n.l.split(" ")[0]}</button>; })}
        <button onClick={() => setMenu(true)}><Menu size={20} />Mais</button>
      </nav>
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            {t.type === "err" ? <AlertTriangle size={16} color="#F5A7A4" /> : t.type === "info" ? <Info size={16} color="#A7E3D6" /> : <CheckCircle2 size={16} color="#75D8C3" />}
            <span style={{ flex: 1 }}>{t.msg}</span>
            {t.action && <button onClick={() => { t.action.fn(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>{t.action.label}</button>}
          </div>
        ))}
      </div>
      {upgrade && <UpgradeModal kind={upgrade.kind} plan={plan} onClose={() => setUpgrade(null)} go={go} />}
      {confirmState && (
        <Modal title={confirmState.title} onClose={() => setConfirm(null)} footer={<>
          <button className="btn" onClick={() => setConfirm(null)}>Voltar</button>
          <button className={`btn ${confirmState.danger ? "dangerfill" : "pri"}`} onClick={() => { confirmState.onConfirm(); setConfirm(null); }}>{confirmState.cta || "Confirmar"}</button>
        </>}><p style={{ margin: 0 }}>{confirmState.message}</p></Modal>
      )}
    </div>
  );
}

// ---------- Busca global ----------
function GlobalSearch({ s, trip, go }) {
  const [q, setQ] = useState(""); const [open, setOpen] = useState(false);
  const res = useMemo(() => {
    const t = q.trim().toLowerCase(); if (t.length < 2) return [];
    const has = (...xs) => xs.some((x) => String(x ?? "").toLowerCase().includes(t));
    const out = [], T = trip.id;
    s.quotes.filter((x) => x.tripId === T && has(x.agency, x.hotel, x.airline, x.code, x.consultant)).forEach((x) => out.push({ k: "Cotação", l: x.agency, sub: num(x.total) ? brl(x.total) : "", p: "cotacoes", i: FileText }));
    s.items.filter((x) => x.tripId === T && has(x.description, x.category)).forEach((x) => out.push({ k: "Planejamento", l: x.description, sub: x.category, p: "planejamento", i: Wallet }));
    s.payments.filter((x) => x.tripId === T && has(x.description, x.supplier)).forEach((x) => out.push({ k: "Pagamento", l: x.description, sub: `${brl(x.amount)} em ${fdate(x.dueDate)}`, p: "pagamentos", i: CalendarClock }));
    s.expenses.filter((x) => x.tripId === T && has(x.description, x.place, x.category, x.person)).forEach((x) => out.push({ k: "Despesa", l: x.description, sub: brl(x.amount), p: "despesas", i: Receipt }));
    s.itinerary.filter((x) => x.tripId === T && has(x.activity, x.place, x.city)).forEach((x) => out.push({ k: "Roteiro", l: x.activity, sub: fdate(x.date), p: "roteiro", i: MapPin }));
    return out.slice(0, 14);
  }, [q, s, trip]);
  return (
    <div className="searchbox hide-m no-print">
      <Search size={15} />
      <input className="inp" placeholder="Buscar nesta viagem" value={q} aria-label="Busca global" onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && q.trim().length >= 2 && (
        <div className="dropdown">
          {res.length ? res.map((r, i) => <button key={i} onMouseDown={() => { go(r.p); setQ(""); }}><r.i size={15} color="#167D9A" /><span style={{ flex: 1, minWidth: 0 }}><b style={{ fontWeight: 600 }}>{r.l}</b><span className="muted" style={{ display: "block", fontSize: 12 }}>{r.k}{r.sub ? `: ${r.sub}` : ""}</span></span></button>)
            : <div className="muted" style={{ padding: 14, fontSize: 13 }}>Nada encontrado para “{q}”.</div>}
        </div>
      )}
    </div>
  );
}

// ---------- Dashboard ----------
function Dashboard({ s, trip, m, go, sharedTrip }) {
  const today = todayISO(); const d = tripDays(trip); const tv = travelers(trip);
  const until = trip.startDate ? diffDays(today, trip.startDate) : null;
  const alerts = getAlerts(s, trip, m);
  const comm = m.budget ? pct(m.committed, m.budget) : 0;
  const need = Math.max(0, r2(m.projected - m.paid));
  const monthsLeft = until > 0 ? Math.max(1, Math.round(until / 30.4)) : null;
  const monthly = num(trip.monthlySaving);
  let countTitle = "", countBig = "";
  if (until == null) { countBig = "—"; countTitle = "Defina as datas"; }
  else if (until > 0) { countBig = String(until); countTitle = until === 1 ? "dia para embarcar" : "dias para embarcar"; }
  else if (trip.endDate && today <= trip.endDate) { countBig = String(diffDays(trip.startDate, today) + 1); countTitle = `º dia de viagem, de ${d?.days ?? "?"}`; }
  else { countBig = "✓"; countTitle = "Viagem encerrada"; }
  const level = Math.min(100, comm);
  const waveY = 250 - (level / 100) * 150;

  const steps = [
    ["Planejamento", true], ["Pesquisa", m.quotes.length > 0], ["Contratação", !!m.booking],
    ["Pagamentos", m.contracted > 0 && m.paidPays >= m.contracted - 0.01],
    ["Preparação", ["preparacao", "andamento", "concluida"].includes(trip.status) || (until != null && until <= 0)],
    ["Viagem", (trip.endDate && today > trip.endDate) || trip.status === "concluida"], ["Encerramento", trip.status === "concluida"],
  ];
  const cur = steps.findIndex((x) => !x[1]);

  const catData = Object.entries(m.byCat).map(([name, v]) => ({ name, value: r2(Math.max(v.est, v.con + v.exp)) })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  const cmpData = [{ n: "Orçamento", v: m.budget, c: "#173A4A" }, { n: "Previsto", v: m.estimated, c: "#8FB8C9" }, { n: "Contratado", v: m.contracted, c: "#167D9A" }, { n: "Realizado", v: m.committed, c: "#75D8C3" }, { n: "Pago", v: m.paid, c: "#21865B" }];
  const evo = useMemo(() => {
    const map = {};
    m.activePays.forEach((p) => { const k = (p.dueDate || "").slice(0, 7); if (!k) return; map[k] = map[k] || { sch: 0, paid: 0 }; map[k].sch += p.amount; });
    m.pays.filter((p) => p.status === "pago").forEach((p) => { const k = (p.paidDate || p.dueDate || "").slice(0, 7); if (!k) return; map[k] = map[k] || { sch: 0, paid: 0 }; map[k].paid += p.amount; });
    let a = 0, b = 0;
    return Object.keys(map).sort().map((k) => { a += map[k].sch; b += map[k].paid; return { m: monthLabel(k), Programado: r2(a), Pago: r2(b) }; });
  }, [m]);
  const qData = m.quotes.filter((q) => num(q.total) > 0).map((q) => ({ n: q.agency.replace(" (demo)", ""), v: num(q.total), sel: m.booking?.quoteId === q.id }));
  const expCat = Object.entries(m.byCat).filter(([, v]) => v.exp > 0).map(([n, v]) => ({ n, v: v.exp })).sort((a, b) => b.v - a.v);

  return (
    <div className="grid">
      <section className="horizon" aria-label="Resumo da viagem">
        <div className="sunball" />
        <svg className="wave" viewBox="0 0 1200 250" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true" style={{ height: "100%" }}>
          <path d={`M-60 ${waveY} C 140 ${waveY - 16}, 300 ${waveY + 16}, 500 ${waveY} S 860 ${waveY - 16}, 1060 ${waveY} S 1300 ${waveY + 14}, 1300 ${waveY} L1300 260 L-60 260 Z`} fill="#75D8C3" opacity=".35" />
          <path d={`M-60 ${waveY + 14} C 160 ${waveY + 2}, 340 ${waveY + 28}, 560 ${waveY + 14} S 900 ${waveY}, 1100 ${waveY + 14} S 1300 ${waveY + 24}, 1300 ${waveY + 14} L1300 260 L-60 260 Z`} fill="#167D9A" opacity=".22" />
        </svg>
        <div className="info">
          <span className="badge b-sand" style={{ background: "rgba(255,255,255,.7)" }}>{TRIP_STATUS.find((x) => x[0] === trip.status)?.[1]}</span>
          <h2 className="serif" style={{ fontSize: 34, margin: "12px 0 4px", lineHeight: 1.1, color: "#103140" }}>{trip.name}</h2>
          <div style={{ fontSize: 15, color: "#2F5566" }}>{trip.destination}{trip.cities ? `, passando por ${trip.cities}` : ""}</div>
          <div className="row" style={{ marginTop: 16, gap: 18, fontSize: 13.5, color: "#2F5566" }}>
            <span><CalendarClock size={14} style={{ verticalAlign: -2 }} /> {fdate(trip.startDate)} a {fdate(trip.endDate)}{d ? ` (${d.days} dias, ${d.nights} noites)` : ""}</span>
            <span><Users size={14} style={{ verticalAlign: -2 }} /> {tv} viajante(s)</span>
            {sharedTrip && <span><Lock size={13} style={{ verticalAlign: -2 }} /> compartilhada com {s.shared[trip.id].members.length} pessoas</span>}
          </div>
          <div style={{ marginTop: 22, maxWidth: 380 }}>
            <div className="row between" style={{ fontSize: 13, marginBottom: 6 }}><span>Orçamento comprometido</span><b>{m.budget ? fpct(comm) : "sem orçamento"}</b></div>
            <Prog value={comm} color={comm > 100 ? "var(--red)" : comm > 85 ? "var(--orange)" : "var(--ocean)"} />
          </div>
        </div>
        <div className="count">
          <div className="bignum">{countBig}</div>
          <div style={{ fontSize: 15, color: "#2F5566", marginTop: 6 }}>{countTitle}</div>
        </div>
      </section>

      <div className="strip g4" style={{ gridTemplateColumns: undefined }}>
        <div><div className="kl">Orçamento total</div><div className="kv">{brl(m.budget)}</div><div className="kh">{tv ? `${brl(m.budget / tv)} por pessoa` : "—"}</div></div>
        <div><div className="kl">Melhor cotação</div><div className="kv">{m.bestQuote ? brl(m.bestQuote.total) : "—"}</div><div className="kh">{m.bestQuote ? `Menor preço: ${m.bestQuote.agency}` : "Nenhuma cotação"}</div></div>
        <div><div className="kl">Proposta selecionada</div><div className="kv">{m.booking ? brl(m.booking.total) : "—"}</div><div className="kh">{m.bookedQuote ? m.bookedQuote.agency : "Ainda não selecionada"}</div></div>
        <div><div className="kl">Despesas previstas</div><div className="kv">{brl(m.estimated)}</div><div className="kh">Soma das estimativas</div></div>
        <div><div className="kl">Total comprometido</div><div className="kv">{brl(m.committed)}</div><div className="kh">Contratado + despesas realizadas</div></div>
        <div><div className="kl">Total já pago</div><div className="kv" style={{ color: "var(--green)" }}>{brl(m.paid)}</div><div className="kh">{m.committed ? `${fpct(m.execution)} do comprometido` : "—"}</div></div>
        <div><div className="kl">Saldo disponível</div><div className="kv" style={{ color: m.balance < 0 ? "var(--red)" : "var(--ink)" }}>{brl(m.balance)}</div><div className="kh">Orçamento − comprometido</div></div>
        <div><div className="kl">Ainda necessário</div><div className="kv">{brl(need)}</div><div className="kh">{need > 0 && monthsLeft ? `≈ ${brl(need / monthsLeft)}/mês em ${monthsLeft} mês(es)${monthly ? (monthly * monthsLeft >= need ? ", sua reserva cobre" : ", acima da sua reserva mensal") : ""}` : "Projeção − pago"}</div></div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h3><AlertTriangle size={16} color="#E8A23A" />Alertas<small>{alerts.length || "nenhum"}</small></h3>
          {alerts.length ? <div className="grid" style={{ gap: 8 }}>{alerts.slice(0, 7).map((a, i) => (
            <button key={i} className={`alert ${a.t}`} onClick={() => go(a.go)}>
              <AlertTriangle size={15} color={a.t === "red" ? "#D9534F" : a.t === "orange" ? "#E8A23A" : "#167D9A"} /><span style={{ flex: 1 }}>{a.x}</span><ChevronRight size={15} className="muted" />
            </button>))}</div>
            : <p className="muted" style={{ margin: 0 }}>Tudo em ordem. Os alertas aparecem quando há vencimentos, estouros ou pendências.</p>}
        </div>
        <div className="card">
          <h3>Linha do tempo</h3>
          <div className="tl">{steps.map(([l, done], i) => <div key={l} className={`st ${done ? "done" : ""} ${i === cur ? "cur" : ""}`}><i />{l}</div>)}</div>
          <p className="note" style={{ marginTop: 18 }}><Info size={14} />Etapas concluídas são marcadas a partir dos seus registros: cotações, proposta selecionada, parcelas quitadas e status da viagem.</p>
        </div>
      </div>

      <div className="grid g2">
        <div className="card"><h3>Distribuição por categoria<small>maior entre previsto e realizado</small></h3>
          {catData.length ? <div className="row" style={{ alignItems: "center", flexWrap: "nowrap" }}>
            <div style={{ width: "52%", height: 220 }}><ResponsiveContainer><PieChart><Pie data={catData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={88} paddingAngle={2} stroke="none">{catData.map((c) => <Cell key={c.name} fill={catColor(c.name)} />)}</Pie><Tooltip formatter={(v) => brl(v)} contentStyle={tipStyle} /></PieChart></ResponsiveContainer></div>
            <div className="legend" style={{ flex: 1 }}>{catData.slice(0, 8).map((c) => <div key={c.name}><span className="sw" style={{ background: catColor(c.name) }} /><span style={{ flex: 1 }}>{c.name}</span><b>{fpct(pct(c.value, catData.reduce((a, x) => a + x.value, 0)))}</b></div>)}</div>
          </div> : <ChartEmpty text="Cadastre itens no Planejamento para ver a distribuição." />}
        </div>
        <div className="card"><h3>Orçamento, contratado e realizado</h3>
          {m.budget || m.estimated || m.committed ? <div style={{ height: 230 }}><ResponsiveContainer><BarChart data={cmpData} margin={{ left: 0, right: 8 }}><CartesianGrid vertical={false} stroke="#EEF3F4" /><XAxis dataKey="n" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={36} /><Tooltip formatter={(v) => brl(v)} contentStyle={tipStyle} cursor={{ fill: "#F3F8F9" }} /><Bar dataKey="v" name="Valor" radius={[6, 6, 0, 0]}>{cmpData.map((c) => <Cell key={c.n} fill={c.c} />)}</Bar></BarChart></ResponsiveContainer></div> : <ChartEmpty text="Informe o orçamento da viagem para comparar." />}
        </div>
        <div className="card"><h3>Evolução dos pagamentos<small>acumulado</small></h3>
          {evo.length ? <div style={{ height: 230 }}><ResponsiveContainer><AreaChart data={evo}><CartesianGrid vertical={false} stroke="#EEF3F4" /><XAxis dataKey="m" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={36} /><Tooltip formatter={(v) => brl(v)} contentStyle={tipStyle} /><Area type="monotone" dataKey="Programado" stroke="#167D9A" fill="#DDF4FA" strokeWidth={2} /><Area type="monotone" dataKey="Pago" stroke="#21865B" fill="#C9EBDB" strokeWidth={2} /></AreaChart></ResponsiveContainer></div> : <ChartEmpty text="O cronograma aparece quando você seleciona uma proposta ou agenda pagamentos." />}
        </div>
        <div className="card"><h3>Cotações por empresa</h3>
          {qData.length ? <div style={{ height: 230 }}><ResponsiveContainer><BarChart data={qData} layout="vertical" margin={{ left: 10, right: 16 }}><CartesianGrid horizontal={false} stroke="#EEF3F4" /><XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} /><YAxis type="category" dataKey="n" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={130} /><Tooltip formatter={(v) => brl(v)} contentStyle={tipStyle} cursor={{ fill: "#F3F8F9" }} /><Bar dataKey="v" name="Total" radius={[0, 6, 6, 0]}>{qData.map((q, i) => <Cell key={i} fill={q.sel ? "#21865B" : "#167D9A"} />)}</Bar></BarChart></ResponsiveContainer></div> : <ChartEmpty text="Cadastre cotações para comparar valores." />}
        </div>
      </div>
      {expCat.length > 0 && <div className="card"><h3>Gastos realizados por categoria</h3><div style={{ height: 220 }}><ResponsiveContainer><BarChart data={expCat}><CartesianGrid vertical={false} stroke="#EEF3F4" /><XAxis dataKey="n" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={50} /><Tooltip formatter={(v) => brl(v)} contentStyle={tipStyle} /><Bar dataKey="v" name="Gasto" radius={[6, 6, 0, 0]}>{expCat.map((c) => <Cell key={c.n} fill={catColor(c.n)} />)}</Bar></BarChart></ResponsiveContainer></div></div>}
    </div>
  );
}

// ---------- Viagens ----------
function TripForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(() => ({ name: "", destination: "", cities: "", startDate: "", endDate: "", adults: 2, children: 0, childrenAges: "", travelerNames: "", budget: "", budgetPerPerson: "", monthlySaving: "", goal: "", style: "Confortável", lodging: "", notes: "", status: "planejando", ...initial }));
  const [e, setE] = useState({});
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const d = tripDays(f); const tv = travelers(f);
  const submit = () => {
    const x = {};
    if (!f.name.trim()) x.name = "Informe um nome para a viagem.";
    if (!f.destination.trim()) x.destination = "Informe o destino principal.";
    if (f.startDate && f.endDate && f.endDate < f.startDate) x.endDate = "A volta precisa ser no mesmo dia ou depois da ida.";
    if (!(Number(f.adults) >= 1)) x.adults = "Informe pelo menos 1 adulto.";
    if (Number(f.children) > 0 && f.childrenAges && f.childrenAges.split(",").filter((a) => a.trim()).length !== Number(f.children)) x.childrenAges = "A quantidade de idades difere da quantidade de crianças.";
    setE(x); if (!Object.keys(x).length) onSave(f);
  };
  return (
    <Modal wide title={initial?.id ? "Editar viagem" : "Nova viagem"} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn pri" onClick={submit}><Check size={16} />Salvar viagem</button></>}>
      <div className="form form3">
        <div className="sec">Destino e datas</div>
        <Fld label="Nome da viagem" err={e.name} full><Inp value={f.name} onChange={(v) => set("name", v)} placeholder="Ex.: Férias de julho no Nordeste" autoFocus /></Fld>
        <Fld label="Destino principal" err={e.destination}><Inp value={f.destination} onChange={(v) => set("destination", v)} placeholder="Ex.: Maceió – AL" /></Fld>
        <Fld label="Cidades visitadas"><Inp value={f.cities} onChange={(v) => set("cities", v)} placeholder="Separadas por vírgula" /></Fld>
        <Fld label="Status"><Sel value={f.status} onChange={(v) => set("status", v)} opts={TRIP_STATUS} /></Fld>
        <Fld label="Data de saída"><Inp type="date" value={f.startDate} onChange={(v) => set("startDate", v)} /></Fld>
        <Fld label="Data de retorno" err={e.endDate} hint={d ? `${d.days} dias e ${d.nights} noites` : ""}><Inp type="date" value={f.endDate} onChange={(v) => set("endDate", v)} /></Fld>
        <Fld label="Estilo da viagem"><Sel value={f.style} onChange={(v) => set("style", v)} opts={STYLES} /></Fld>
        <Fld label="Como vão viajar" full hint="Marque todos que se aplicam. Libera atalhos de combustível, pedágio e despesas de cruzeiro."><div className="row" style={{ gap: 6 }}>{TRANSPORTS.map((t) => { const on = (f.transport || []).includes(t); return <button type="button" key={t} className={`chip ${on ? "on" : ""}`} aria-pressed={on} onClick={() => set("transport", on ? (f.transport || []).filter((x) => x !== t) : [...(f.transport || []), t])}>{t}</button>; })}</div></Fld>
        <div className="sec">Viajantes</div>
        <Fld label="Adultos" err={e.adults}><Inp type="number" min="1" value={f.adults} onChange={(v) => set("adults", v)} /></Fld>
        <Fld label="Crianças"><Inp type="number" min="0" value={f.children} onChange={(v) => set("children", v)} /></Fld>
        <Fld label="Idades das crianças" err={e.childrenAges} hint={`Total: ${tv} viajante(s)`}><Inp value={f.childrenAges} onChange={(v) => set("childrenAges", v)} placeholder="Ex.: 8, 5" /></Fld>
        <Fld label="Nomes dos viajantes" full hint="Opcional. Usado para indicar quem pagou cada despesa."><Inp value={f.travelerNames} onChange={(v) => set("travelerNames", v)} placeholder="Ex.: Ana, Pedro, Lia" /></Fld>
        <div className="sec">Orçamento</div>
        <Fld label="Orçamento total da família" hint={tv && num(f.budget) ? `${brl(num(f.budget) / tv)} por pessoa` : "Valor máximo disponível"}><Money value={f.budget} onChange={(v) => set("budget", v)} /></Fld>
        <Fld label="Orçamento individual" hint={num(f.budgetPerPerson) && tv ? <button type="button" className="btn ghost sm" style={{ padding: 0, color: "var(--ocean)" }} onClick={() => set("budget", r2(num(f.budgetPerPerson) * tv))}>Usar {brl(num(f.budgetPerPerson) * tv)} como total</button> : "Opcional, por pessoa"}><Money value={f.budgetPerPerson} onChange={(v) => set("budgetPerPerson", v)} /></Fld>
        <Fld label="Reserva mensal pretendida"><Money value={f.monthlySaving} onChange={(v) => set("monthlySaving", v)} /></Fld>
        <div className="sec">Preferências</div>
        <Fld label="Objetivo da viagem"><Inp value={f.goal} onChange={(v) => set("goal", v)} placeholder="Ex.: descanso, aniversário" /></Fld>
        <Fld label="Preferências de hospedagem" full={false}><Inp value={f.lodging} onChange={(v) => set("lodging", v)} placeholder="Ex.: pé na areia, café incluso" /></Fld>
        <Fld label="Observações gerais"><Inp value={f.notes} onChange={(v) => set("notes", v)} /></Fld>
      </div>
    </Modal>
  );
}

function TripsPage({ s, update, toast, ask, setActive, go, trip: active, autoNew, clearAutoNew, loadDemo, guard = () => true, me = "local", storeMode, rpc, reload }) {
  const isMine = (t) => !t._owner || t._owner === me;
  const activeCount = s.trips.filter((t) => !t.archived && !t.demo && isMine(t)).length;
  const [share, setShare] = useState(null);
  const [edit, setEdit] = useState(autoNew ? {} : null);
  const [arch, setArch] = useState(false);
  useEffect(() => { if (autoNew) clearAutoNew(); }, []); // eslint-disable-line
  const trips = s.trips.filter((t) => !!t.archived === arch);
  const save = (f) => {
    if (f.id) { update((st) => withLog({ ...st, trips: st.trips.map((t) => (t.id === f.id ? { ...t, ...f, updatedAt: new Date().toISOString() } : t)) }, f.id, "Viagem editada")); toast("Viagem atualizada"); }
    else { const t = { ...f, id: uid(), weights: { ...DEFAULT_WEIGHTS }, createdAt: new Date().toISOString() }; update((st) => withLog({ ...st, trips: [...st.trips, t], activeTripId: t.id }, t.id, "Viagem criada")); toast("Viagem criada e definida como ativa"); }
    setEdit(null);
  };
  const duplicate = (t) => {
    const nt = { ...t, _owner: undefined, id: uid(), name: `Cópia de ${t.name}`.replace("[DEMO] ", ""), demo: false, archived: false, status: "planejando", createdAt: new Date().toISOString() };
    update((st) => withLog({ ...st, trips: [...st.trips, nt], items: [...st.items, ...st.items.filter((i) => i.tripId === t.id).map((i) => ({ ...i, _by: undefined, id: uid(), tripId: nt.id, demo: false, contracted: "", bookingId: null }))], activeTripId: nt.id }, nt.id, `Viagem duplicada a partir de ${t.name}`));
    toast("Viagem duplicada como modelo (itens previstos copiados, sem cotações e pagamentos)");
  };
  const del = (t) => ask({
    title: "Excluir viagem", danger: true, cta: "Excluir definitivamente",
    message: `“${t.name}” e todos os seus itens, cotações, pagamentos, despesas e roteiro serão excluídos. Essa ação não pode ser desfeita. Se quiser apenas guardar o histórico, prefira arquivar.`,
    onConfirm: () => { update((st) => { const keep = (x) => x.tripId !== t.id; return withLog({ ...st, trips: st.trips.filter((x) => x.id !== t.id), items: st.items.filter(keep), quotes: st.quotes.filter(keep), bookings: st.bookings.filter(keep), payments: st.payments.filter(keep), expenses: st.expenses.filter(keep), itinerary: st.itinerary.filter(keep), redemptions: (st.redemptions || []).filter(keep), docs: (st.docs || []).filter(keep), activeTripId: st.activeTripId === t.id ? null : st.activeTripId }, null, `Viagem excluída: ${t.name}`); }); toast("Viagem excluída"); },
  });
  const archive = (t, v) => { update((st) => withLog({ ...st, trips: st.trips.map((x) => (x.id === t.id ? { ...x, archived: v } : x)), activeTripId: v && st.activeTripId === t.id ? null : st.activeTripId }, t.id, v ? "Viagem arquivada" : "Viagem restaurada")); toast(v ? "Viagem arquivada" : "Viagem restaurada"); };

  return (
    <div className="grid">
      <div className="row between">
        <div className="tabs"><button className={!arch ? "on" : ""} onClick={() => setArch(false)}>Ativas</button><button className={arch ? "on" : ""} onClick={() => setArch(true)}>Arquivadas</button></div>
        <button className="btn pri" onClick={() => guard("trips", activeCount) && setEdit({})}><Plus size={16} />Nova viagem</button>
      </div>
      {trips.length === 0 ? (
        <div className="card"><Empty icon={Plane} title={arch ? "Nenhuma viagem arquivada" : "Nenhuma viagem cadastrada"} text={arch ? "Viagens concluídas podem ser arquivadas para manter o histórico sem poluir a lista." : "Crie sua primeira viagem ou explore o aplicativo com dados de demonstração."}>
          {!arch && <><button className="btn pri" onClick={() => guard("trips", activeCount) && setEdit({})}><Plus size={16} />Criar viagem</button><button className="btn" onClick={loadDemo}><Database size={16} />Carregar demonstração</button></>}
        </Empty></div>
      ) : (
        <div className="grid g3">
          {trips.map((t) => {
            const mm = metrics(s, t); const d = tripDays(t); const c = mm.budget ? pct(mm.committed, mm.budget) : 0; const isA = active?.id === t.id;
            const mine = isMine(t); const sh = s.shared?.[t.id]; const myRole = mine ? "owner" : sh?.my_role || "leitor"; const nMem = (sh?.members || []).length;
            return (
              <div key={t.id} className="card" style={{ borderColor: isA ? "var(--aqua)" : undefined, display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 6 }}>{isA && <span className="badge b-green">Ativa</span>}<span className="badge">{TRIP_STATUS.find((x) => x[0] === t.status)?.[1]}</span>{t.demo && <span className="badge b-sand">Demonstração</span>}{nMem > 1 && <span className="badge b-blue"><Users size={11} />{mine ? `Compartilhada com ${nMem - 1}` : `Você: ${ROLE_LABEL[myRole]}`}</span>}</div>
                    <h3 className="serif" style={{ fontSize: 19, margin: "10px 0 2px", fontWeight: 400 }}>{t.name}</h3>
                    <div className="muted" style={{ fontSize: 13 }}>{t.destination}</div>
                  </div>
                </div>
                <div className="row" style={{ fontSize: 13, gap: 14 }}><span>{fdate(t.startDate)} a {fdate(t.endDate)}</span>{d && <span className="muted">{d.days} dias</span>}<span className="muted">{travelers(t)} pessoa(s)</span></div>
                <div>
                  <div className="row between" style={{ fontSize: 12.5, marginBottom: 5 }}><span className="muted">{brl(mm.committed)} de {brl(mm.budget)}</span><b>{fpct(c)}</b></div>
                  <Prog value={c} color={c > 100 ? "var(--red)" : "var(--ocean)"} />
                </div>
                <div className="row" style={{ marginTop: "auto", gap: 4 }}>
                  {!arch && !isA && <button className="btn sm" onClick={() => { setActive(t.id); toast(`“${t.name}” agora é a viagem ativa`); }}>Tornar ativa</button>}
                  {!arch && isA && <button className="btn sm pri" onClick={() => go("dashboard")}>Abrir dashboard</button>}
                  <span style={{ flex: 1 }} />
                  {storeMode === "cloud" && !t.demo && <button className="ib" title={mine ? "Compartilhar com a família" : "Pessoas da viagem"} aria-label="Compartilhar" onClick={() => setShare(t)}><Users size={15} /></button>}
                  {(mine || myRole === "editor") && <button className="ib" title="Editar" aria-label="Editar" onClick={() => setEdit(t)}><Pencil size={15} /></button>}
                  <button className="ib" title="Duplicar como modelo" aria-label="Duplicar" onClick={() => guard("trips", activeCount) && duplicate(t)}><Copy size={15} /></button>
                  {mine && <button className="ib" title={arch ? "Restaurar" : "Arquivar"} aria-label={arch ? "Restaurar" : "Arquivar"} onClick={() => (!arch || guard("trips", activeCount)) && archive(t, !arch)}>{arch ? <ArchiveRestore size={15} /> : <Archive size={15} />}</button>}
                  {mine && <button className="ib dng" title="Excluir" aria-label="Excluir" onClick={() => del(t)}><Trash2 size={15} /></button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {edit && <TripForm initial={edit} onSave={save} onClose={() => setEdit(null)} />}
      {share && <ShareModal trip={share} s={s} me={me} rpc={rpc} reload={reload} toast={toast} guard={guard} ask={ask} onClose={() => setShare(null)} />}
    </div>
  );
}

// ---------- Planejamento ----------
function ItemForm({ initial, onSave, onClose, locked }) {
  const [f, setF] = useState(() => ({ description: "", category: CATS[3], estimated: "", contracted: "", dueDate: "", method: "", responsible: "", notes: "", ...initial }));
  const [e, setE] = useState({}); const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const submit = () => { const x = {}; if (!f.description.trim()) x.description = "Descreva o item."; if (num(f.estimated) == null && num(f.contracted) == null) x.estimated = "Informe o valor previsto ou o contratado."; setE(x); if (!Object.keys(x).length) onSave(f); };
  return (
    <Modal title={initial?.id ? "Editar item" : "Novo item do planejamento"} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn pri" onClick={submit}><Check size={16} />Salvar item</button></>}>
      <div className="form">
        <Fld label="Descrição" err={e.description} full><Inp value={f.description} onChange={(v) => set("description", v)} autoFocus placeholder="Ex.: Seguro-viagem família" /></Fld>
        <Fld label="Categoria"><CatSel value={f.category} onChange={(v) => set("category", v)} /></Fld>
        <Fld label="Responsável pelo pagamento"><Inp value={f.responsible} onChange={(v) => set("responsible", v)} /></Fld>
        <Fld label="Valor previsto" err={e.estimated} hint="Sua estimativa antes de contratar"><Money value={f.estimated} onChange={(v) => set("estimated", v)} /></Fld>
        <Fld label="Valor contratado" hint={locked ? "Definido pela proposta selecionada" : "Preencha quando fechar a compra"}><Money value={f.contracted} onChange={(v) => set("contracted", v)} disabled={locked} /></Fld>
        <Fld label="Data prevista de pagamento"><Inp type="date" value={f.dueDate} onChange={(v) => set("dueDate", v)} /></Fld>
        <Fld label="Forma de pagamento"><Sel value={f.method} onChange={(v) => set("method", v)} opts={[["", "Não definida"], ...METHODS.map((x) => [x, x])]} /></Fld>
        <Fld label="Observações" full><Ta value={f.notes} onChange={(v) => set("notes", v)} /></Fld>
        <div className="note full"><Info size={14} />O valor pago não é digitado aqui: ele vem das parcelas quitadas em Pagamentos, o que evita contar o mesmo gasto duas vezes.</div>
      </div>
    </Modal>
  );
}

function ScheduleModal({ item, paidSoFar, openCount, onClose, onConfirm }) {
  const [o, setO] = useState({ n: 1, first: item.dueDate || todayISO(), method: item.method || "Pix", already: false });
  const rest = r2((num(item.contracted) || 0) - paidSoFar);
  const sched = o.already ? [{ no: 1, of: 1, amount: rest, date: o.first }] : buildSchedule(rest, 0, o.n, null, o.first, o.first);
  return (
    <Modal title="Agendar pagamentos do item" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn pri" disabled={rest <= 0} onClick={() => onConfirm(sched, o)}><Check size={16} />{o.already ? "Registrar pagamento" : "Gerar parcelas"}</button></>}>
      <p style={{ marginTop: 0 }}><b>{item.description}</b>: contratado {brl(item.contracted)}{paidSoFar > 0 ? `, já pago ${brl(paidSoFar)}` : ""}. Saldo a agendar: <b>{brl(rest)}</b>.</p>
      {openCount > 0 && <div className="alert orange" style={{ marginBottom: 14 }}><AlertTriangle size={15} color="#E8A23A" />Este item já tem {openCount} parcela(s) em aberto. Elas serão canceladas e substituídas, sem duplicar valores.</div>}
      <div className="form">
        <div className="full"><Toggle checked={o.already} onChange={(v) => setO({ ...o, already: v })} label="Já foi pago à vista" /></div>
        {!o.already && <Fld label="Quantidade de parcelas"><Inp type="number" min="1" max="48" value={o.n} onChange={(v) => setO({ ...o, n: v })} /></Fld>}
        <Fld label={o.already ? "Data do pagamento" : "Primeiro vencimento"}><Inp type="date" value={o.first} onChange={(v) => setO({ ...o, first: v })} /></Fld>
        <Fld label="Forma de pagamento"><Sel value={o.method} onChange={(v) => setO({ ...o, method: v })} opts={METHODS} /></Fld>
      </div>
      {rest > 0 && <div className="tblwrap" style={{ marginTop: 16 }}><table className="tbl"><thead><tr><th>Parcela</th><th>Vencimento</th><th className="r">Valor</th></tr></thead><tbody>{sched.map((x) => <tr key={x.no}><td>{x.no}/{x.of}</td><td>{fdate(x.date)}</td><td className="r">{brl(x.amount)}</td></tr>)}</tbody></table></div>}
      <p className="note" style={{ marginTop: 10 }}><Info size={14} />Os centavos de arredondamento ficam na última parcela. Você pode ajustar qualquer valor depois em Pagamentos.</p>
    </Modal>
  );
}

function Planning({ s, trip, m, update, toast, ask, go, canPlan = true }) {
  const [calc, setCalc] = useState(null);
  const [edit, setEdit] = useState(null); const [sch, setSch] = useState(null); const [cat, setCat] = useState("");
  const [sort, setSort] = useState({ k: "category", d: 1 });
  const list = m.items.filter((i) => !cat || i.category === cat).slice().sort((a, b) => {
    const va = sort.k === "category" ? a.category + a.description : num(a[sort.k]) || 0, vb = sort.k === "category" ? b.category + b.description : num(b[sort.k]) || 0;
    return (va > vb ? 1 : va < vb ? -1 : 0) * sort.d;
  });
  const th = (k, l, r) => <th className={`sortable ${r ? "r" : ""}`} onClick={() => setSort((p) => ({ k, d: p.k === k ? -p.d : 1 }))}>{l}{sort.k === k ? (sort.d > 0 ? " ↑" : " ↓") : ""}</th>;
  const save = (f) => {
    if (f.id) update((st) => withLog({ ...st, items: st.items.map((i) => (i.id === f.id ? { ...i, ...f } : i)) }, trip.id, `Item editado: ${f.description}`));
    else update((st) => withLog({ ...st, items: [...st.items, { ...f, id: uid(), tripId: trip.id, createdAt: new Date().toISOString() }] }, trip.id, `Item criado: ${f.description}`));
    toast(f.id ? "Item atualizado" : "Item adicionado ao planejamento"); setEdit(null);
  };
  const del = (i) => {
    if (i.bookingId && m.booking?.itemId === i.id) { toast("Este item pertence à proposta selecionada. Cancele a seleção em Cotações para removê-lo.", "err"); return; }
    const n = s.payments.filter((p) => p.itemId === i.id).length;
    ask({ title: "Excluir item", danger: true, cta: "Excluir item", message: `Excluir “${i.description}”${n ? ` e ${n} pagamento(s) vinculado(s)` : ""}? Os totais serão recalculados.`, onConfirm: () => { update((st) => withLog({ ...st, items: st.items.filter((x) => x.id !== i.id), payments: st.payments.filter((p) => p.itemId !== i.id) }, trip.id, `Item excluído: ${i.description}`)); toast("Item excluído"); } });
  };
  const confirmSchedule = (sched, o) => {
    const it = sch;
    update((st) => {
      const payments = st.payments.map((p) => (p.itemId === it.id && !["pago", "cancelado"].includes(p.status) ? { ...p, status: "cancelado" } : p));
      const add = sched.map((x) => ({ id: uid(), tripId: trip.id, itemId: it.id, bookingId: it.bookingId || null, description: `${it.description}${x.of > 1 ? ` — parcela ${x.no}/${x.of}` : ""}`, category: it.category, supplier: it.responsible || "", amount: x.amount, dueDate: x.date, paidDate: o.already ? x.date : "", method: o.method, status: o.already ? "pago" : "previsto", installmentNo: x.no, installmentTotal: x.of }));
      return withLog({ ...st, payments: [...payments, ...add] }, trip.id, `Pagamentos agendados para ${it.description}`);
    });
    setSch(null); toast(o.already ? "Pagamento registrado" : "Parcelas geradas", "ok", { label: "Ver pagamentos", fn: () => go("pagamentos") });
  };
  const applyCalc = (rows, inputs, field) => {
    let added = 0, changed = 0;
    update((st) => {
      let items = st.items;
      rows.forEach((r) => {
        const notes = `Calculado: ${r.memo}`;
        const ex = items.find((i) => i.tripId === trip.id && i.calcKey === r.key);
        if (ex) { changed++; items = items.map((i) => (i.id === ex.id ? { ...i, description: r.description, category: r.category, estimated: r.value, notes } : i)); }
        else { added++; items = [...items, { id: uid(), tripId: trip.id, calcKey: r.key, description: r.description, category: r.category, estimated: r.value, contracted: "", dueDate: "", method: "", responsible: "", notes, createdAt: new Date().toISOString() }]; }
      });
      return withLog({ ...st, items, trips: st.trips.map((t) => (t.id === trip.id ? { ...t, [field]: inputs } : t)) }, trip.id, `Estimativa de ${field === "carCalc" ? "carro" : "cruzeiro"} lançada: ${brl(sum(rows, (x) => x.value))}`);
    });
    setCalc(null);
    setTimeout(() => toast(`${added ? `${added} item(ns) novo(s)` : ""}${added && changed ? " e " : ""}${changed ? `${changed} atualizado(s)` : ""} no planejamento`), 0);
  };
  const catRows = Object.entries(m.byCat).filter(([, v]) => v.est || v.con || v.exp);
  const exp = () => downloadCSV(`planejamento-${slug(trip.name)}.csv`, ["Descrição", "Categoria", "Previsto", "Contratado", "Pago", "Desvio", "Data prevista", "Forma", "Responsável", "Observações"],
    list.map((i) => [i.description, i.category, brlPlain(i.estimated), brlPlain(i.contracted), brlPlain(m.paidByItem[i.id] || 0), num(i.contracted) != null && num(i.estimated) != null ? brlPlain(i.contracted - i.estimated) : "", fdate(i.dueDate), i.method, i.responsible, i.notes]));

  return (
    <div className={`grid ${canPlan ? "" : "ro"}`}>
      <div className="strip" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
        <div><div className="kl">Orçamento máximo</div><div className="kv">{brl(m.budget)}</div></div>
        <div><div className="kl">Previsto</div><div className="kv">{brl(m.estimated)}</div></div>
        <div><div className="kl">Contratado</div><div className="kv">{brl(m.contracted)}</div></div>
        <div><div className="kl">Pago</div><div className="kv" style={{ color: "var(--green)" }}>{brl(m.paid)}</div><div className="kh">Execução {fpct(m.execution)}</div></div>
        <div><div className="kl" title="Orçamento máximo − total comprometido">Saldo do orçamento <Info size={12} /></div><div className="kv" style={{ color: m.balance < 0 ? "var(--red)" : undefined }}>{brl(m.balance)}</div></div>
        <div><div className="kl" title="Total contratado − parcelas pagas, mais despesas ainda não pagas">Saldo a pagar <Info size={12} /></div><div className="kv">{brl(m.toPay)}</div></div>
        <div><div className="kl" title="Realizado (contratado + despesas) − previsto">Desvio orçamentário <Info size={12} /></div><div className="kv" style={{ color: m.deviation > 0 ? "var(--red)" : "var(--green)" }}>{m.deviation > 0 ? "+" : ""}{brl(m.deviation)}</div></div>
      </div>
      <div className="row between">
        <div className="row"><Sel value={cat} onChange={setCat} opts={[["", "Todas as categorias"], ...CATS.map((c) => [c, c])]} style={{ width: 240 }} aria-label="Filtrar categoria" /></div>
        <div className="row"><button className="btn" onClick={exp} disabled={!list.length}><Download size={15} />Exportar CSV</button><button className="act btn" onClick={() => setCalc("carro")}><Car size={15} />Custos de carro</button><button className="act btn" onClick={() => setCalc("cruzeiro")}><Ship size={15} />Custos de cruzeiro</button><button className="act btn pri" onClick={() => setEdit({})}><Plus size={16} />Novo item</button></div>
      </div>
      {m.items.length === 0 ? <div className="card"><Empty icon={Wallet} title="Monte seu planejamento" text="Adicione as despesas que você espera ter: passagens, hospedagem, alimentação, passeios. Quando uma proposta for selecionada, ela entra aqui automaticamente."><button className="act btn pri" onClick={() => setEdit({})}><Plus size={16} />Adicionar primeiro item</button></Empty></div> : (
        <div className="tblwrap"><table className="tbl">
          <thead><tr>{th("description", "Descrição")}{th("category", "Categoria")}{th("estimated", "Previsto", 1)}{th("contracted", "Contratado", 1)}<th className="r">Pago</th><th className="r">Desvio</th><th>Pagamento</th><th></th></tr></thead>
          <tbody>{list.map((i) => {
            const paid = m.paidByItem[i.id] || 0, con = num(i.contracted), est = num(i.estimated), dev = con != null && est != null ? r2(con - est) : null, sched = m.schedByItem[i.id] || 0;
            const st = !con ? <span className="badge">Sem contratação</span> : paid >= con - 0.01 ? <span className="badge b-green">Quitado</span> : paid > 0 ? <span className="badge b-orange">Parcial</span> : sched > 0 ? <span className="badge b-blue">Agendado</span> : <span className="badge b-orange">Não agendado</span>;
            return (<tr key={i.id}>
              <td><b style={{ fontWeight: 600 }}>{i.description}</b>{i.bookingId && <span className="badge b-green" style={{ marginLeft: 6 }}>Proposta selecionada</span>}{i.programId && <span className="badge b-sand" style={{ marginLeft: 6 }}>Assinatura de programa</span>}{i.dueDate && <div className="muted" style={{ fontSize: 12 }}>Previsto para {fdate(i.dueDate)}</div>}</td>
              <td><span className="dot" style={{ background: catColor(i.category), marginRight: 7 }} />{i.category}</td>
              <td className="r">{est != null ? brl(est) : "—"}</td><td className="r">{con != null ? brl(con) : "—"}</td><td className="r">{brl(paid)}</td>
              <td className="r" style={{ color: dev > 0 ? "var(--red)" : dev < 0 ? "var(--green)" : undefined }}>{dev != null ? `${dev > 0 ? "+" : ""}${brl(dev)}` : "—"}</td>
              <td>{st}</td>
              <td className="r" style={{ whiteSpace: "nowrap" }}>
                {con > 0 && paid < con - 0.01 && <button className="act btn sm" onClick={() => setSch(i)}>Agendar</button>}
                <button className="act ib" aria-label="Editar" onClick={() => setEdit(i)}><Pencil size={15} /></button>
                <button className="act ib dng" aria-label="Excluir" onClick={() => del(i)}><Trash2 size={15} /></button>
              </td></tr>);
          })}</tbody>
          <tfoot><tr><td colSpan={2}>Total {cat ? `em ${cat}` : ""}</td><td className="r">{brl(sum(list, (i) => i.estimated))}</td><td className="r">{brl(sum(list, (i) => i.contracted))}</td><td className="r">{brl(list.reduce((a, i) => a + (m.paidByItem[i.id] || 0), 0))}</td><td colSpan={3}></td></tr></tfoot>
        </table></div>)}
      {catRows.length > 0 && (
        <div className="card"><h3>Previsto e realizado por categoria<small>realizado = contratado + despesas lançadas</small></h3>
          <div className="grid" style={{ gap: 12 }}>{catRows.map(([c, v]) => { const real = r2(v.con + v.exp); const mx = Math.max(v.est, real) || 1; return (
            <div key={c} style={{ display: "grid", gridTemplateColumns: "minmax(120px,190px) 1fr auto", gap: 12, alignItems: "center", fontSize: 13 }}>
              <span>{c}</span>
              <div style={{ display: "grid", gap: 3 }}><Prog value={pct(v.est, mx)} color="#B8D9E4" /><Prog value={pct(real, mx)} color={v.est && real > v.est ? "var(--red)" : "var(--ocean)"} /></div>
              <span style={{ textAlign: "right", minWidth: 150 }}><span className="muted">{brl(v.est)}</span> / <b>{brl(real)}</b></span>
            </div>); })}</div>
          <p className="note" style={{ marginTop: 14 }}><Info size={14} />Barra clara: previsto. Barra escura: realizado. Vermelho indica que o realizado passou do previsto.</p>
        </div>)}
      {edit && <ItemForm initial={edit} locked={!!edit.bookingId} onSave={save} onClose={() => setEdit(null)} />}
      {calc === "carro" && <CarCalc trip={trip} items={m.items} onClose={() => setCalc(null)} onApply={applyCalc} />}
      {calc === "cruzeiro" && <CruiseCalc trip={trip} items={m.items} onClose={() => setCalc(null)} onApply={applyCalc} />}
      {sch && <ScheduleModal item={sch} paidSoFar={m.paidByItem[sch.id] || 0} openCount={s.payments.filter((p) => p.itemId === sch.id && !["pago", "cancelado"].includes(p.status)).length} onClose={() => setSch(null)} onConfirm={confirmSchedule} />}
    </div>
  );
}

// ---------- Calculadoras: viagem de carro e cruzeiro ----------
// Geram itens PREVISTOS no planejamento, com a memória de cálculo nas observações.
// Cada linha tem uma chave (calcKey): recalcular atualiza o item em vez de duplicar.
const FUELS = ["Gasolina", "Etanol", "Diesel", "GNV"];
const fmtN = (n, d = 0) => Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

function CalcPreview({ rows, items }) {
  if (!rows.length) return <p className="muted" style={{ margin: "14px 0 0", fontSize: 13 }}>Preencha os campos para ver a estimativa.</p>;
  return (
    <div className="tblwrap" style={{ marginTop: 16 }}><table className="tbl"><thead><tr><th>Item</th><th>Categoria</th><th>Cálculo</th><th className="r">Previsto</th><th></th></tr></thead>
      <tbody>{rows.map((r) => { const ex = items.find((i) => i.calcKey === r.key); return <tr key={r.key}><td><b style={{ fontWeight: 600 }}>{r.description}</b></td><td>{r.category}</td><td className="muted" style={{ fontSize: 12.5 }}>{r.memo}</td><td className="r"><b>{brl(r.value)}</b></td><td>{ex ? <span className="badge b-orange">Atualiza</span> : <span className="badge b-green">Novo</span>}</td></tr>; })}</tbody>
      <tfoot><tr><td colSpan={3}>Total estimado</td><td className="r">{brl(sum(rows, (r) => r.value))}</td><td /></tr></tfoot>
    </table></div>
  );
}

function CarCalc({ trip, items, onClose, onApply }) {
  const d = tripDays(trip);
  const [f, setF] = useState(() => ({ km: "", localKm: "", vehicles: 1, fuel: "Gasolina", cons: "", price: "", compare: false, fuel2: "Etanol", cons2: "", price2: "", tolls: "", rent: (trip.transport || []).includes("Carro alugado"), rentDays: d?.days || "", rentDaily: "", rentExtras: "", park: false, parkDays: d?.days || "", parkDaily: "", ...(trip.carCalc || {}) }));
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const veh = Math.max(1, num(f.vehicles) || 1);
  const km = (num(f.km) || 0) + (num(f.localKm) || 0);
  const fuelCost = km && num(f.cons) && num(f.price) ? r2((km / num(f.cons)) * num(f.price) * veh) : 0;
  const fuelCost2 = f.compare && km && num(f.cons2) && num(f.price2) ? r2((km / num(f.cons2)) * num(f.price2) * veh) : 0;
  const rows = [];
  if (fuelCost) rows.push({ key: "carro:combustivel", category: "Combustível", value: fuelCost, description: `Combustível (${f.fuel.toLowerCase()}), ${fmtN(km)} km`, memo: `${fmtN(km)} km ÷ ${fmtN(num(f.cons), 1)} km/l × ${brl(num(f.price))}/l${veh > 1 ? ` × ${veh} veículos` : ""} = ${fmtN((km / num(f.cons)) * veh, 1)} litros` });
  if (num(f.tolls)) rows.push({ key: "carro:pedagios", category: "Pedágios", value: r2(num(f.tolls) * veh), description: "Pedágios (ida e volta)", memo: `${brl(num(f.tolls))} por veículo${veh > 1 ? ` × ${veh} veículos` : ""}` });
  if (f.rent && num(f.rentDays) && num(f.rentDaily)) rows.push({ key: "carro:aluguel", category: "Aluguel de carro", value: r2(num(f.rentDays) * num(f.rentDaily) + (num(f.rentExtras) || 0)), description: `Aluguel de carro, ${num(f.rentDays)} diária(s)`, memo: `${num(f.rentDays)} × ${brl(num(f.rentDaily))}${num(f.rentExtras) ? ` + ${brl(num(f.rentExtras))} de proteção e taxas` : ""}` });
  if (f.park && num(f.parkDays) && num(f.parkDaily)) rows.push({ key: "carro:estacionamento", category: "Estacionamento e aeroporto", value: r2(num(f.parkDays) * num(f.parkDaily)), description: `Estacionamento, ${num(f.parkDays)} dia(s)`, memo: `${num(f.parkDays)} × ${brl(num(f.parkDaily))}` });
  const perKm = (c, p) => (num(c) && num(p) ? num(p) / num(c) : null);
  const k1 = perKm(f.cons, f.price), k2 = f.compare ? perKm(f.cons2, f.price2) : null;
  return (
    <Modal wide title="Custos da viagem de carro" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn pri" disabled={!rows.length} onClick={() => onApply(rows, f, "carCalc")}><Check size={16} />Lançar no planejamento</button></>}>
      <div className="form form3">
        <div className="sec">Trajeto e combustível</div>
        <Fld label="Distância de ida e volta (km)" hint="Consulte no app de mapas"><Inp type="number" min="0" value={f.km} onChange={(v) => set("km", v)} placeholder="Ex.: 1200" /></Fld>
        <Fld label="Deslocamentos no destino (km)" hint="Passeios e trajetos locais, se for usar o carro"><Inp type="number" min="0" value={f.localKm} onChange={(v) => set("localKm", v)} /></Fld>
        <Fld label="Quantidade de veículos"><Inp type="number" min="1" value={f.vehicles} onChange={(v) => set("vehicles", v)} /></Fld>
        <Fld label="Combustível"><Sel value={f.fuel} onChange={(v) => set("fuel", v)} opts={FUELS} /></Fld>
        <Fld label="Consumo médio na estrada (km/l)"><Inp type="number" min="0" step="0.1" value={f.cons} onChange={(v) => set("cons", v)} placeholder="Ex.: 12,5" /></Fld>
        <Fld label="Preço por litro"><Money value={f.price} onChange={(v) => set("price", v)} /></Fld>
        <div className="full"><Toggle checked={f.compare} onChange={(v) => set("compare", v)} label="Comparar com outro combustível (ex.: etanol × gasolina)" /></div>
        {f.compare && <>
          <Fld label="Outro combustível"><Sel value={f.fuel2} onChange={(v) => set("fuel2", v)} opts={FUELS} /></Fld>
          <Fld label="Consumo com ele (km/l)"><Inp type="number" min="0" step="0.1" value={f.cons2} onChange={(v) => set("cons2", v)} /></Fld>
          <Fld label="Preço por litro"><Money value={f.price2} onChange={(v) => set("price2", v)} /></Fld>
          {k1 != null && k2 != null && <div className="alert blue full" style={{ background: "#EAF7FB" }}><Info size={15} color="#167D9A" /><span>{f.fuel}: {brl(k1)} por km. {f.fuel2}: {brl(k2)} por km. {Math.abs(k1 - k2) < 0.005 ? "Os dois custam praticamente o mesmo." : `${k1 < k2 ? f.fuel : f.fuel2} sai ${brl(Math.abs(fuelCost - fuelCost2))} mais barato no trajeto todo.`}{k2 < k1 ? " Para lançar essa opção, troque o combustível principal." : ""}</span></div>}
        </>}
        <div className="sec">Pedágios</div>
        <Fld label="Pedágios ida e volta, por veículo" hint="Calculadoras de rota mostram o total"><Money value={f.tolls} onChange={(v) => set("tolls", v)} /></Fld>
        <div className="sec">Aluguel e estacionamento</div>
        <div className="full row"><Toggle checked={f.rent} onChange={(v) => set("rent", v)} label="Vou alugar carro" /><Toggle checked={f.park} onChange={(v) => set("park", v)} label="Vou deixar o carro estacionado (ex.: aeroporto)" /></div>
        {f.rent && <>
          <Fld label="Diárias do aluguel"><Inp type="number" min="1" value={f.rentDays} onChange={(v) => set("rentDays", v)} /></Fld>
          <Fld label="Valor da diária"><Money value={f.rentDaily} onChange={(v) => set("rentDaily", v)} /></Fld>
          <Fld label="Proteção e taxas (total)" hint="Seguro, condutor adicional, taxa de devolução"><Money value={f.rentExtras} onChange={(v) => set("rentExtras", v)} /></Fld>
        </>}
        {f.park && <>
          <Fld label="Dias de estacionamento"><Inp type="number" min="1" value={f.parkDays} onChange={(v) => set("parkDays", v)} /></Fld>
          <Fld label="Valor da diária do estacionamento"><Money value={f.parkDaily} onChange={(v) => set("parkDaily", v)} /></Fld>
        </>}
      </div>
      <CalcPreview rows={rows} items={items} />
      <p className="note" style={{ marginTop: 10 }}><Info size={14} />Use o consumo do seu carro na estrada, não o da cidade. Os valores entram como previstos; registre os gastos reais em Despesas durante a viagem.</p>
    </Modal>
  );
}

function CruiseCalc({ trip, items, onClose, onApply }) {
  const d = tripDays(trip); const tv = travelers(trip) || 1;
  const [f, setF] = useState(() => ({ people: tv, nights: d?.nights || "", cabin: "", cabinMode: "total", portFee: "", serviceFee: "", servicePayers: tv, drinks: "", drinkPeople: "", drinkDays: d?.nights || "", wifi: "", wifiDays: d?.nights || "", excursions: "", toPort: "", ...(trip.cruiseCalc || {}) }));
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const P = num(f.people) || 0, N = num(f.nights) || 0;
  const rows = [];
  if (num(f.cabin)) { const v = f.cabinMode === "pessoa" ? r2(num(f.cabin) * P) : num(f.cabin); rows.push({ key: "cruzeiro:cabine", category: "Cruzeiro (cabine)", value: v, description: `Cruzeiro, ${N} noite(s)`, memo: f.cabinMode === "pessoa" ? `${brl(num(f.cabin))} por pessoa × ${P}` : "Valor total da cabine" }); }
  if (num(f.portFee) && P) rows.push({ key: "cruzeiro:taxas", category: "Taxas portuárias", value: r2(num(f.portFee) * P), description: "Taxas portuárias", memo: `${brl(num(f.portFee))} por pessoa × ${P}` });
  if (num(f.serviceFee) && N && num(f.servicePayers)) rows.push({ key: "cruzeiro:servico", category: "Taxa de serviço (gorjetas)", value: r2(num(f.serviceFee) * N * num(f.servicePayers)), description: "Taxa de serviço (gorjetas)", memo: `${brl(num(f.serviceFee))} por pessoa por noite × ${N} noites × ${num(f.servicePayers)} pessoa(s)` });
  if (num(f.drinks) && num(f.drinkPeople) && num(f.drinkDays)) rows.push({ key: "cruzeiro:bebidas", category: "Pacotes a bordo", value: r2(num(f.drinks) * num(f.drinkPeople) * num(f.drinkDays)), description: "Pacote de bebidas", memo: `${brl(num(f.drinks))} por pessoa por dia × ${num(f.drinkPeople)} pessoa(s) × ${num(f.drinkDays)} dia(s)` });
  if (num(f.wifi) && num(f.wifiDays)) rows.push({ key: "cruzeiro:internet", category: "Pacotes a bordo", value: r2(num(f.wifi) * num(f.wifiDays)), description: "Internet a bordo", memo: `${brl(num(f.wifi))} por dia × ${num(f.wifiDays)} dia(s)` });
  if (num(f.excursions)) rows.push({ key: "cruzeiro:excursoes", category: "Excursões em terra", value: num(f.excursions), description: "Excursões nas escalas", memo: "Estimativa total informada" });
  if (num(f.toPort)) rows.push({ key: "cruzeiro:porto", category: "Transporte local", value: num(f.toPort), description: "Deslocamento até o porto (ida e volta)", memo: "Estimativa total informada" });
  const contracted = items.some((i) => i.bookingId && ["Cruzeiro (cabine)", "Pacotes turísticos"].includes(i.category));
  return (
    <Modal wide title="Custos do cruzeiro" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn pri" disabled={!rows.length} onClick={() => onApply(rows, f, "cruiseCalc")}><Check size={16} />Lançar no planejamento</button></>}>
      <div className="form form3">
        <div className="sec">Cabine</div>
        <Fld label="Pessoas na viagem"><Inp type="number" min="1" value={f.people} onChange={(v) => set("people", v)} /></Fld>
        <Fld label="Noites a bordo"><Inp type="number" min="1" value={f.nights} onChange={(v) => set("nights", v)} /></Fld>
        <Fld label="Valor da cabine" hint={contracted ? "Já existe uma proposta selecionada. Deixe em branco para não contar duas vezes." : "Opcional se o valor veio de uma cotação"}><div className="row" style={{ flexWrap: "nowrap", gap: 6 }}><Money value={f.cabin} onChange={(v) => set("cabin", v)} /><select className="sel" style={{ width: 120 }} value={f.cabinMode} onChange={(e) => set("cabinMode", e.target.value)} aria-label="Valor total ou por pessoa"><option value="total">total</option><option value="pessoa">por pessoa</option></select></div></Fld>
        <div className="sec">Taxas obrigatórias</div>
        <Fld label="Taxas portuárias, por pessoa"><Money value={f.portFee} onChange={(v) => set("portFee", v)} /></Fld>
        <Fld label="Taxa de serviço, por pessoa por noite" hint="Também chamada de gorjeta ou service charge"><Money value={f.serviceFee} onChange={(v) => set("serviceFee", v)} /></Fld>
        <Fld label="Pessoas que pagam a taxa de serviço" hint="Algumas companhias isentam ou reduzem para crianças"><Inp type="number" min="0" value={f.servicePayers} onChange={(v) => set("servicePayers", v)} /></Fld>
        <div className="sec">Pacotes a bordo</div>
        <Fld label="Pacote de bebidas, por pessoa por dia"><Money value={f.drinks} onChange={(v) => set("drinks", v)} /></Fld>
        <Fld label="Pessoas com pacote de bebidas"><Inp type="number" min="0" value={f.drinkPeople} onChange={(v) => set("drinkPeople", v)} /></Fld>
        <Fld label="Dias do pacote de bebidas"><Inp type="number" min="0" value={f.drinkDays} onChange={(v) => set("drinkDays", v)} /></Fld>
        <Fld label="Internet a bordo, por dia"><Money value={f.wifi} onChange={(v) => set("wifi", v)} /></Fld>
        <Fld label="Dias de internet"><Inp type="number" min="0" value={f.wifiDays} onChange={(v) => set("wifiDays", v)} /></Fld>
        <div />
        <div className="sec">Escalas e deslocamento</div>
        <Fld label="Excursões em terra (total)" hint="Passeios nas paradas do roteiro"><Money value={f.excursions} onChange={(v) => set("excursions", v)} /></Fld>
        <Fld label="Ida e volta até o porto (total)" hint="Transfer, combustível ou passagem até o porto"><Money value={f.toPort} onChange={(v) => set("toPort", v)} /></Fld>
      </div>
      <CalcPreview rows={rows} items={items} />
      <p className="note" style={{ marginTop: 10 }}><Info size={14} />Taxas e regras variam por companhia, roteiro e idade dos passageiros. Confira na proposta se taxas portuárias e de serviço já estão incluídas, para não lançar em dobro.</p>
    </Modal>
  );
}

// ---------- Cotações ----------
const QFIELDS_MONEY = [["airfare", "Passagens aéreas"], ["boardingFees", "Taxas de embarque"], ["hotelValue", "Hospedagem"], ["transfersValue", "Traslados"], ["insuranceValue", "Seguro-viagem"], ["carRental", "Aluguel de carro"], ["portFees", "Taxas portuárias"], ["serviceFees", "Taxa de serviço (gorjetas)"], ["otherFees", "Taxas adicionais"]];
function QuoteForm({ initial, trip, onSave, onClose }) {
  const [f, setF] = useState(() => ({ agency: "", consultant: "", phone: "", email: "", site: "", date: todayISO(), validUntil: "", code: "", link: "", serviceNotes: "", total: "", people: travelers(trip) || "", entry: "", installments: "", installmentValue: "", interest: "", discount: "", airline: "", originAirport: "", destAirport: "", flightDates: "", connections: "", flightDuration: "", baggage: "", flightRules: "", hotel: "", hotelStars: "", roomType: "", meal: "", nights: tripDays(trip)?.nights ?? "", locationRating: "", hotelLocation: "", hotelCancel: "", transfers: "", insurance: "", toursInc: "", toursText: "", notIncluded: "", restrictions: "", cancel: "", rating: "", status: "aberta", favorite: false, ...initial }));
  const [tab, setTab] = useState("empresa"); const [e, setE] = useState({});
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const comp = r2(QFIELDS_MONEY.reduce((a, [k]) => a + (num(f[k]) || 0), 0) - (num(f.discount) || 0));
  const schedTotal = num(f.installments) && num(f.installmentValue) ? r2((num(f.entry) || 0) + num(f.installments) * num(f.installmentValue)) : null;
  const submit = () => { const x = {}; if (!f.agency.trim()) x.agency = "Informe a agência ou operadora."; if (!(num(f.total) > 0)) x.total = "Informe o valor final total da proposta."; if (f.validUntil && f.date && f.validUntil < f.date) x.validUntil = "A validade é anterior à data da cotação."; setE(x); if (x.agency) setTab("empresa"); else if (x.total) setTab("valores"); if (!Object.keys(x).length) onSave(f); };
  const TABS = [["empresa", "Empresa"], ["valores", "Valores e pagamento"], ["voo", "Passagens"], ["hotel", "Hospedagem"], ["servicos", "Serviços e avaliação"]];
  return (
    <Modal wide title={initial?.id ? "Editar cotação" : "Nova cotação"} onClose={onClose} footer={<><span className="muted" style={{ marginRight: "auto", fontSize: 12.5, alignSelf: "center" }}>{missingFields(f).length ? `Faltam: ${missingFields(f).join(", ")}` : "Cotação completa"}</span><button className="btn" onClick={onClose}>Cancelar</button><button className="btn pri" onClick={submit}><Check size={16} />Salvar cotação</button></>}>
      <div className="tabs" style={{ marginBottom: 18 }}>{TABS.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === "empresa" && <div className="form form3">
        <Fld label="Agência ou operadora" err={e.agency}><Inp value={f.agency} onChange={(v) => set("agency", v)} autoFocus /></Fld>
        <Fld label="Consultor(a)"><Inp value={f.consultant} onChange={(v) => set("consultant", v)} /></Fld>
        <Fld label="Telefone / WhatsApp"><Inp value={f.phone} onChange={(v) => set("phone", v)} /></Fld>
        <Fld label="E-mail"><Inp type="email" value={f.email} onChange={(v) => set("email", v)} /></Fld>
        <Fld label="Site"><Inp value={f.site} onChange={(v) => set("site", v)} placeholder="https://" /></Fld>
        <Fld label="Código da proposta"><Inp value={f.code} onChange={(v) => set("code", v)} /></Fld>
        <Fld label="Data da cotação"><Inp type="date" value={f.date} onChange={(v) => set("date", v)} /></Fld>
        <Fld label="Válida até" err={e.validUntil}><Inp type="date" value={f.validUntil} onChange={(v) => set("validUntil", v)} /></Fld>
        <Fld label="Link do documento"><Inp value={f.link} onChange={(v) => set("link", v)} placeholder="Link da proposta (Drive, e-mail, PDF)" /></Fld>
        <Fld label="Observações sobre o atendimento" full><Ta value={f.serviceNotes} onChange={(v) => set("serviceNotes", v)} /></Fld>
      </div>}
      {tab === "valores" && <div className="form form3">
        <div className="sec">Valor final</div>
        <Fld label="Valor final total" err={e.total} hint="Com taxas, descontos e encargos"><Money value={f.total} onChange={(v) => set("total", v)} /></Fld>
        <Fld label="Pessoas incluídas" hint={num(f.total) && num(f.people) ? `${brl(num(f.total) / num(f.people))} por pessoa` : `A viagem tem ${travelers(trip)} viajante(s)`}><Inp type="number" min="1" value={f.people} onChange={(v) => set("people", v)} /></Fld>
        <Fld label="Descontos concedidos"><Money value={f.discount} onChange={(v) => set("discount", v)} /></Fld>
        <div className="sec">Condições de pagamento</div>
        <Fld label="Entrada"><Money value={f.entry} onChange={(v) => set("entry", v)} /></Fld>
        <Fld label="Quantidade de parcelas"><Inp type="number" min="0" value={f.installments} onChange={(v) => set("installments", v)} /></Fld>
        <Fld label="Valor de cada parcela" hint={schedTotal != null && num(f.total) && Math.abs(schedTotal - num(f.total)) > 1 ? `Entrada + parcelas = ${brl(schedTotal)}, diferente do total` : "Opcional"}><Money value={f.installmentValue} onChange={(v) => set("installmentValue", v)} /></Fld>
        <Fld label="Juros ou encargos (R$)" hint="Custo total do financiamento"><Money value={f.interest} onChange={(v) => set("interest", v)} /></Fld>
        <div className="sec">Composição (opcional)</div>
        {QFIELDS_MONEY.map(([k, l]) => <Fld key={k} label={l}><Money value={f[k]} onChange={(v) => set(k, v)} /></Fld>)}
        {comp > 0 && <div className="note full"><Info size={14} />Composição menos descontos: {brl(comp)}{num(f.total) ? `, diferença de ${brl(num(f.total) - comp)} em relação ao total informado` : ""}.</div>}
      </div>}
      {tab === "voo" && <div className="form form3">
        <Fld label="Companhia aérea"><Inp value={f.airline} onChange={(v) => set("airline", v)} /></Fld>
        <Fld label="Aeroporto de origem"><Inp value={f.originAirport} onChange={(v) => set("originAirport", v)} /></Fld>
        <Fld label="Aeroporto de destino"><Inp value={f.destAirport} onChange={(v) => set("destAirport", v)} /></Fld>
        <Fld label="Datas e horários"><Inp value={f.flightDates} onChange={(v) => set("flightDates", v)} placeholder="Ex.: ida 10/07 06h10" /></Fld>
        <Fld label="Conexões"><Sel value={f.connections === "" || f.connections == null ? "" : String(f.connections)} onChange={(v) => set("connections", v === "" ? "" : Number(v))} opts={[["", "Não informado"], ["0", "Voo direto"], ["1", "1 conexão"], ["2", "2 conexões"], ["3", "3 ou mais"]]} /></Fld>
        <Fld label="Duração do deslocamento"><Inp value={f.flightDuration} onChange={(v) => set("flightDuration", v)} placeholder="Ex.: 3h40" /></Fld>
        <Fld label="Bagagem despachada incluída"><Sel value={f.baggage} onChange={(v) => set("baggage", v)} opts={TRI} /></Fld>
        <Fld label="Regras de alteração e cancelamento" full><Ta value={f.flightRules} onChange={(v) => set("flightRules", v)} /></Fld>
      </div>}
      {tab === "hotel" && <div className="form form3">
        <Fld label="Hotel ou estabelecimento"><Inp value={f.hotel} onChange={(v) => set("hotel", v)} /></Fld>
        <Fld label="Categoria"><Sel value={String(f.hotelStars ?? "")} onChange={(v) => set("hotelStars", v === "" ? "" : Number(v))} opts={[["", "Não informado"], ["1", "1 estrela"], ["2", "2 estrelas"], ["3", "3 estrelas"], ["4", "4 estrelas"], ["5", "5 estrelas"]]} /></Fld>
        <Fld label="Tipo de quarto"><Inp value={f.roomType} onChange={(v) => set("roomType", v)} /></Fld>
        <Fld label="Regime de alimentação"><Sel value={f.meal} onChange={(v) => set("meal", v)} opts={MEAL} /></Fld>
        <Fld label="Diárias"><Inp type="number" min="0" value={f.nights} onChange={(v) => set("nights", v)} /></Fld>
        <Fld label="Nota da localização" hint="Sua avaliação, de 1 a 5"><Sel value={String(f.locationRating ?? "")} onChange={(v) => set("locationRating", v === "" ? "" : Number(v))} opts={[["", "Não avaliado"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]]} /></Fld>
        <Fld label="Localização e distâncias" full><Inp value={f.hotelLocation} onChange={(v) => set("hotelLocation", v)} placeholder="Ex.: 300 m da praia, 12 km do centro" /></Fld>
        <Fld label="Política de cancelamento do hotel" full><Ta value={f.hotelCancel} onChange={(v) => set("hotelCancel", v)} /></Fld>
      </div>}
      {tab === "servicos" && <div className="form form3">
        <Fld label="Traslados incluídos"><Sel value={f.transfers} onChange={(v) => set("transfers", v)} opts={TRI} /></Fld>
        <Fld label="Seguro-viagem incluído"><Sel value={f.insurance} onChange={(v) => set("insurance", v)} opts={TRI} /></Fld>
        <Fld label="Passeios incluídos"><Sel value={f.toursInc} onChange={(v) => set("toursInc", v)} opts={TRI} /></Fld>
        <Fld label="Quais passeios e ingressos" full><Inp value={f.toursText} onChange={(v) => set("toursText", v)} /></Fld>
        <Fld label="Serviços não incluídos" full><Ta value={f.notIncluded} onChange={(v) => set("notIncluded", v)} /></Fld>
        <Fld label="Restrições e condições da oferta" full><Ta value={f.restrictions} onChange={(v) => set("restrictions", v)} /></Fld>
        <Fld label="Flexibilidade de cancelamento"><Sel value={f.cancel} onChange={(v) => set("cancel", v)} opts={CANCEL} /></Fld>
        <Fld label="Sua avaliação geral"><Sel value={String(f.rating ?? "")} onChange={(v) => set("rating", v === "" ? "" : Number(v))} opts={[["", "Sem avaliação"], ["1", "1 — fraca"], ["2", "2"], ["3", "3 — razoável"], ["4", "4"], ["5", "5 — excelente"]]} /></Fld>
        <div className="fld" style={{ alignSelf: "end" }}><Toggle checked={f.favorite} onChange={(v) => set("favorite", v)} label="Marcar como favorita" /></div>
      </div>}
    </Modal>
  );
}

function QuoteDetail({ q, r, onClose }) {
  const Row = ({ l, v }) => <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: "1px solid #EFF4F5", fontSize: 13.5 }}><span className="muted">{l}</span><span style={{ textAlign: "right" }}>{v === "" || v == null ? <span className="na">não informado</span> : v}</span></div>;
  return (
    <Modal wide title={q.agency} onClose={onClose}>
      <div className="grid g2">
        <div><h3 style={{ margin: "0 0 6px", fontSize: 14 }}>Proposta</h3>
          <Row l="Consultor(a)" v={q.consultant} /><Row l="Contato" v={[q.phone, q.email].filter(Boolean).join(" / ")} /><Row l="Código" v={q.code} /><Row l="Data / validade" v={`${fdate(q.date)} a ${fdate(q.validUntil)}`} />
          <Row l="Documento" v={q.link ? <a href={q.link} target="_blank" rel="noreferrer" style={{ color: "var(--ocean)" }}>Abrir link <ExternalLink size={12} /></a> : ""} />
          <h3 style={{ margin: "16px 0 6px", fontSize: 14 }}>Valores</h3>
          <Row l="Total final" v={num(q.total) ? brl(q.total) : ""} /><Row l="Por pessoa" v={r?.perPerson ? brl(r.perPerson) : ""} /><Row l="Por pessoa por dia" v={r?.perDay ? brl(r.perDay) : ""} />
          <Row l="Entrada" v={num(q.entry) != null ? brl(q.entry) : ""} /><Row l="Parcelamento" v={num(q.installments) ? `${q.installments}x${num(q.installmentValue) ? ` de ${brl(q.installmentValue)}` : ""}` : ""} /><Row l="Encargos" v={num(q.interest) != null ? brl(q.interest) : ""} /><Row l="Descontos" v={num(q.discount) ? brl(q.discount) : ""} />
          {QFIELDS_MONEY.filter(([k]) => num(q[k])).map(([k, l]) => <Row key={k} l={l} v={brl(q[k])} />)}
        </div>
        <div><h3 style={{ margin: "0 0 6px", fontSize: 14 }}>Passagens</h3>
          <Row l="Companhia" v={q.airline} /><Row l="Trecho" v={[q.originAirport, q.destAirport].filter(Boolean).join(" → ")} /><Row l="Datas" v={q.flightDates} /><Row l="Conexões" v={q.connections === "" || q.connections == null ? "" : Number(q.connections) === 0 ? "Voo direto" : q.connections} /><Row l="Bagagem" v={q.baggage ? TRI_LABEL[q.baggage] : ""} />
          <h3 style={{ margin: "16px 0 6px", fontSize: 14 }}>Hospedagem</h3>
          <Row l="Hotel" v={q.hotel} /><Row l="Categoria" v={num(q.hotelStars) ? <Stars n={q.hotelStars} /> : ""} /><Row l="Regime" v={q.meal ? MEAL_LABEL[q.meal] : ""} /><Row l="Quarto" v={q.roomType} /><Row l="Diárias" v={q.nights} /><Row l="Localização" v={q.hotelLocation} />
          <h3 style={{ margin: "16px 0 6px", fontSize: 14 }}>Serviços</h3>
          <Row l="Traslados" v={q.transfers ? TRI_LABEL[q.transfers] : ""} /><Row l="Seguro" v={q.insurance ? TRI_LABEL[q.insurance] : ""} /><Row l="Passeios" v={q.toursInc ? `${TRI_LABEL[q.toursInc]}${q.toursText ? `: ${q.toursText}` : ""}` : ""} /><Row l="Cancelamento" v={q.cancel ? CANCEL_LABEL[q.cancel] : ""} /><Row l="Não incluso" v={q.notIncluded} />
        </div>
      </div>
      {q.serviceNotes && <p className="note" style={{ marginTop: 14 }}><Info size={14} />{q.serviceNotes}</p>}
    </Modal>
  );
}

function SelectQuoteModal({ q, trip, m, onClose, onConfirm }) {
  const prev = m.booking;
  const linkable = m.items.filter((i) => !i.bookingId && !num(i.contracted));
  const [o, setO] = useState({ itemId: "", category: "Pacotes turísticos", contractNo: "", confirmation: "", entryDate: todayISO(), firstDate: addMonths(todayISO(), 1), method: "Cartão de crédito", generate: true, ack: false });
  const total = num(q.total) || 0;
  const sched = buildSchedule(total, num(q.entry) || 0, num(q.installments) || 0, num(q.installmentValue), o.entryDate, o.firstDate);
  const linkedEst = o.itemId ? num(m.items.find((i) => i.id === o.itemId)?.estimated) || 0 : 0;
  const after = r2(m.budget - (m.committed - (prev ? (num(m.items.find((i) => i.id === prev.itemId)?.contracted) || 0) - (m.paidByItem[prev.itemId] || 0) : 0) + total));
  const R = ({ l, v }) => <div className="row between" style={{ fontSize: 13.5, padding: "6px 0", borderBottom: "1px solid #EFF4F5" }}><span className="muted">{l}</span><b style={{ fontWeight: 600, textAlign: "right" }}>{v}</b></div>;
  const included = [q.transfers === "sim" && "traslados", q.insurance === "sim" && "seguro-viagem", q.toursInc === "sim" && (q.toursText || "passeios"), q.baggage === "sim" && "bagagem", q.meal && q.meal !== "sem" && MEAL_LABEL[q.meal].toLowerCase()].filter(Boolean);
  return (
    <Modal wide title="Confirmar proposta selecionada" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Voltar</button><button className="btn pri" disabled={!o.ack} onClick={() => onConfirm(o, sched)}><Award size={16} />Confirmar seleção</button></>}>
      <div className="grid g2">
        <div>
          <R l="Empresa" v={q.agency} /><R l="Valor total contratado" v={brl(total)} /><R l="Entrada" v={num(q.entry) ? brl(q.entry) : "sem entrada"} /><R l="Parcelas" v={num(q.installments) ? `${q.installments}x${num(q.installmentValue) ? ` de ${brl(q.installmentValue)}` : ""}` : "à vista"} />
          <R l="Serviços incluídos" v={included.join(", ") || "não informado"} /><R l="Não incluídos" v={q.notIncluded || "não informado"} /><R l="Validade" v={fdate(q.validUntil)} /><R l="Cancelamento" v={q.cancel ? CANCEL_LABEL[q.cancel] : "não informado"} />
          <R l="Saldo do orçamento após a seleção" v={<span style={{ color: after < 0 ? "var(--red)" : "var(--green)" }}>{brl(after)}</span>} />
          {prev && <div className="alert orange" style={{ marginTop: 12 }}><AlertTriangle size={15} color="#E8A23A" />Já existe uma proposta selecionada ({m.bookedQuote?.agency}). Ela será substituída: parcelas em aberto serão canceladas e as já pagas continuam registradas.</div>}
        </div>
        <div className="form" style={{ alignContent: "start" }}>
          <Fld label="Lançar no planejamento como" full hint={o.itemId ? `Previsto de ${brl(linkedEst)}; desvio será ${brl(total - linkedEst)}` : "Será criado um item novo com o valor contratado"}>
            <Sel value={o.itemId} onChange={(v) => setO({ ...o, itemId: v })} opts={[["", "Novo item"], ...linkable.map((i) => [i.id, `Vincular a: ${i.description} (${brl(i.estimated)})`])]} />
          </Fld>
          {!o.itemId && <Fld label="Categoria do item" full><CatSel value={o.category} onChange={(v) => setO({ ...o, category: v })} /></Fld>}
          <Fld label="Nº do contrato"><Inp value={o.contractNo} onChange={(v) => setO({ ...o, contractNo: v })} /></Fld>
          <Fld label="Dados de confirmação"><Inp value={o.confirmation} onChange={(v) => setO({ ...o, confirmation: v })} placeholder="Localizador, voucher…" /></Fld>
          <div className="full"><Toggle checked={o.generate} onChange={(v) => setO({ ...o, generate: v })} label="Gerar cronograma de pagamentos" /></div>
          {o.generate && <>
            {num(q.entry) > 0 && <Fld label="Data da entrada"><Inp type="date" value={o.entryDate} onChange={(v) => setO({ ...o, entryDate: v })} /></Fld>}
            <Fld label="Primeira parcela"><Inp type="date" value={o.firstDate} onChange={(v) => setO({ ...o, firstDate: v })} /></Fld>
            <Fld label="Forma de pagamento" full><Sel value={o.method} onChange={(v) => setO({ ...o, method: v })} opts={METHODS} /></Fld>
          </>}
        </div>
      </div>
      {o.generate && sched.length > 0 && <div className="tblwrap" style={{ marginTop: 16, maxHeight: 220, overflow: "auto" }}><table className="tbl"><thead><tr><th>Parcela</th><th>Vencimento</th><th className="r">Valor</th></tr></thead><tbody>{sched.map((x) => <tr key={x.no}><td>{x.no === 0 ? "Entrada" : `${x.no}/${x.of}`}</td><td>{fdate(x.date)}</td><td className="r">{brl(x.amount)}</td></tr>)}</tbody><tfoot><tr><td colSpan={2}>Total</td><td className="r">{brl(sum(sched, (x) => x.amount))}</td></tr></tfoot></table></div>}
      <div style={{ marginTop: 16 }}><Toggle checked={o.ack} onChange={(v) => setO({ ...o, ack: v })} label="Entendo que isto registra apenas a minha decisão; nenhuma contratação é feita junto à agência." /></div>
    </Modal>
  );
}

function WeightsPanel({ weights, onChange, locked, onLocked }) {
  const total = CRIT.reduce((a, c) => a + (Number(weights[c.k]) || 0), 0);
  const normalize = () => {
    if (!total) return onChange({ ...DEFAULT_WEIGHTS });
    const w = {}; let acc = 0; CRIT.forEach((c) => { w[c.k] = Math.round(((Number(weights[c.k]) || 0) / total) * 100); acc += w[c.k]; });
    const top = CRIT.reduce((a, c) => (w[c.k] > w[a.k] ? c : a), CRIT[0]); w[top.k] += 100 - acc; onChange(w);
  };
  return (
    <div className="card">
      <h3>Pesos dos critérios<small><span className={`badge ${total === 100 ? "b-green" : "b-orange"}`}>Soma {total}%</span></small></h3>
      <div className="grid" style={{ gap: 12 }}>
        {CRIT.map((c) => (
          <div key={c.k} style={{ display: "grid", gridTemplateColumns: "1fr 64px", gap: 10, alignItems: "center" }}>
            <div><div className="row between" style={{ fontSize: 13, marginBottom: 2 }}><span>{c.l}</span></div><input type="range" disabled={locked} min="0" max="100" step="5" value={weights[c.k] || 0} aria-label={`Peso de ${c.l}`} onChange={(e) => onChange({ ...weights, [c.k]: Number(e.target.value) })} /></div>
            <input className="inp" style={{ padding: "6px 8px", textAlign: "right" }} type="number" disabled={locked} min="0" max="100" value={weights[c.k] || 0} aria-label={`Peso de ${c.l} em %`} onChange={(e) => onChange({ ...weights, [c.k]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
          </div>))}
      </div>
      {locked && <button className="alert orange" style={{ marginTop: 14 }} onClick={onLocked}><Lock size={15} color="#E8A23A" /><span style={{ flex: 1 }}>No plano Gratuito o ranking usa os pesos padrão. Toque para liberar os pesos personalizados.</span></button>}
      {!locked && <div className="row" style={{ marginTop: 14 }}>
        {total !== 100 && <button className="btn sm pri" onClick={normalize}>Ajustar proporcionalmente para 100%</button>}
        <button className="btn sm" onClick={() => onChange({ ...DEFAULT_WEIGHTS })}>Restaurar padrão</button>
      </div>}
    </div>
  );
}

function Compare({ trip, m, ranked, weights, setWeights, onSelect, locked, onLocked }) {
  const [open, setOpen] = useState(null);
  const total = CRIT.reduce((a, c) => a + (Number(weights[c.k]) || 0), 0);
  const rows = ranked.filter((r) => num(r.q.total) > 0);
  if (rows.length < 2) return <div className="card"><Empty icon={Award} title="Cadastre ao menos duas cotações" text="O comparativo normaliza os critérios entre as propostas, então precisa de pelo menos duas com valor total informado." /></div>;
  const by = (f, dir = "min") => { const v = rows.map((r) => ({ r, v: f(r) })).filter((x) => x.v != null); if (!v.length) return null; return v.reduce((a, b) => (dir === "min" ? (b.v < a.v ? b : a) : b.v > a.v ? b : a)); };
  const hl = [
    ["Maior pontuação", rows[0].score != null ? rows[0] : null, (r) => `${Math.round(r.score)} pontos`],
    ["Menor preço total", by((r) => num(r.q.total))?.r, (r) => brl(r.q.total)],
    ["Menor custo por pessoa", by((r) => r.perPerson)?.r, (r) => brl(r.perPerson)],
    ["Menor entrada", by((r) => num(r.q.entry))?.r, (r) => brl(r.q.entry)],
    ["Menor parcela", by((r) => num(r.q.installmentValue))?.r, (r) => brl(r.q.installmentValue)],
    ["Melhor hospedagem", by((r) => r.p.hotel, "max")?.r, (r) => `${Math.round(r.p.hotel)}/100`],
  ];
  const lead = rows[0];
  const matrix = [
    ["Valor total", (r) => num(r.q.total), "min", brl], ["Custo por pessoa", (r) => r.perPerson, "min", brl], ["Por pessoa por dia", (r) => r.perDay, "min", brl],
    ["Entrada", (r) => num(r.q.entry), "min", brl], ["Parcelas", (r) => num(r.q.installments), "max", (v) => `${v}x`], ["Valor da parcela", (r) => num(r.q.installmentValue), "min", brl], ["Juros e encargos", (r) => num(r.q.interest), "min", brl],
    ["Hotel", (r) => r.q.hotel || null, null, (v) => v], ["Categoria", (r) => num(r.q.hotelStars), "max", (v) => <Stars n={v} />], ["Regime", (r) => r.q.meal || null, null, (v) => MEAL_LABEL[v]],
    ["Companhia aérea", (r) => r.q.airline || null, null, (v) => v], ["Conexões", (r) => (r.q.connections === "" || r.q.connections == null ? null : Number(r.q.connections)), "min", (v) => (v === 0 ? "Direto" : v)],
    ["Bagagem", (r) => r.q.baggage || null, "tri", (v) => TRI_LABEL[v]], ["Traslados", (r) => r.q.transfers || null, "tri", (v) => TRI_LABEL[v]], ["Seguro-viagem", (r) => r.q.insurance || null, "tri", (v) => TRI_LABEL[v]], ["Passeios", (r) => r.q.toursInc || null, "tri", (v) => TRI_LABEL[v]],
    ["Cancelamento", (r) => r.q.cancel || null, null, (v) => CANCEL_LABEL[v]], ["Validade", (r) => r.q.validUntil || null, null, (v) => <span style={{ color: v < todayISO() ? "var(--red)" : undefined }}>{fdate(v)}</span>], ["Avaliação pessoal", (r) => num(r.q.rating), "max", (v) => `${v}/5`],
  ];
  const exp = () => downloadCSV(`comparativo-${slug(trip.name)}.csv`, ["Posição", "Empresa", "Pontuação", "Cobertura dos pesos", ...CRIT.map((c) => `Nota ${c.l}`), "Total", "Por pessoa", "Por pessoa/dia", "Entrada", "Parcelas", "Critérios sem dados"],
    rows.map((r, i) => [i + 1, r.q.agency, r.score != null ? Math.round(r.score) : "", fpct(r.coverage), ...CRIT.map((c) => (r.p[c.k] != null ? Math.round(r.p[c.k]) : "sem dados")), brlPlain(r.q.total), r.perPerson ? brlPlain(r.perPerson) : "", r.perDay ? brlPlain(r.perDay) : "", brlPlain(r.q.entry), r.q.installments || "", r.missing.join(", ")]));
  return (
    <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
      <div className="grid" style={{ gridTemplateColumns: "minmax(260px,340px) minmax(0,1fr)", alignItems: "start" }}>
        <div className="grid">
          <WeightsPanel weights={weights} onChange={setWeights} locked={locked} onLocked={onLocked} />
          <div className="card" style={{ background: "#FAFCFC" }}><h3><Info size={15} />Como a pontuação é calculada</h3>
            <p style={{ margin: 0, fontSize: 13, color: "#2F5566" }}>Cada critério recebe uma nota de 0 a 100. Valores em dinheiro e parcelas são normalizados entre a menor e a maior proposta, para não comparar grandezas diferentes. A nota final é a média ponderada pelos seus pesos.</p>
            <p style={{ margin: "10px 0 0", fontSize: 13, color: "#2F5566" }}>Quando um critério não foi informado, ele é excluído daquela proposta e os pesos restantes são redistribuídos. A <b>cobertura</b> mostra quanto do peso total pôde ser avaliado: compare com cautela propostas com cobertura baixa.</p>
          </div>
        </div>
        <div className="grid" style={{ alignContent: "start" }}>
          {total !== 100 ? <div className="card"><Empty icon={AlertTriangle} title="Os pesos precisam somar 100%" text={`A soma atual é ${total}%. Ajuste os controles ou use o ajuste proporcional para ver o ranking.`} /></div> : <>
            <div className="row between"><div className="muted" style={{ fontSize: 13 }}>Ranking segundo os seus critérios. Não é uma recomendação universal.</div><button className="btn sm" onClick={exp}><Download size={14} />Exportar comparativo</button></div>
            {rows.map((r, i) => {
              const pc = prosCons(r, rows); const diff = r2(num(r.q.total) - num(lead.q.total)); const isSel = m.booking?.quoteId === r.q.id;
              return (
                <div key={r.q.id} className={`rank ${i === 0 ? "lead" : ""}`}>
                  <div className="pos">{i + 1}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 8 }}><b style={{ fontSize: 15.5 }}>{r.q.agency}</b>{i === 0 && <span className="badge b-green"><Award size={12} />Maior pontuação</span>}{isSel && <span className="badge b-blue">Selecionada</span>}{r.q.favorite && <Heart size={14} color="#D9534F" fill="#D9534F" />}{r.coverage < 100 && <span className="badge b-orange" title={`Sem dados: ${r.missing.join(", ")}`}>Cobertura {fpct(r.coverage)}</span>}</div>
                    <div className="row" style={{ fontSize: 13, marginTop: 4, gap: 14 }}><span>{brl(r.q.total)}</span>{r.perPerson && <span className="muted">{brl(r.perPerson)} por pessoa</span>}{r.perDay && <span className="muted">{brl(r.perDay)} por pessoa/dia</span>}{i > 0 && <span style={{ color: diff > 0 ? "var(--red)" : "var(--green)" }}>{diff > 0 ? "+" : ""}{brl(diff)} vs. 1º</span>}</div>
                    <div className="row" style={{ marginTop: 8, gap: 5 }}>{pc.pros.slice(0, 5).map((x) => <span key={x} className="badge b-green">{x}</span>)}{pc.cons.slice(0, 4).map((x) => <span key={x} className="badge b-red">{x}</span>)}</div>
                    {open === r.q.id && (
                      <div className="tblwrap" style={{ marginTop: 12 }}><table className="tbl"><thead><tr><th>Critério</th><th className="r">Nota</th><th className="r">Peso</th><th className="r">Contribuição</th><th>Base do cálculo</th></tr></thead>
                        <tbody>{CRIT.filter((c) => weights[c.k] > 0).map((c) => <tr key={c.k}><td>{c.l}</td><td className="r">{r.p[c.k] != null ? Math.round(r.p[c.k]) : <span className="na">sem dados</span>}</td><td className="r">{weights[c.k]}%</td><td className="r">{r.p[c.k] != null ? (Math.round(((weights[c.k] * r.p[c.k]) / r.ws) * 10) / 10).toLocaleString("pt-BR") : "excluído"}</td><td className="muted" style={{ fontSize: 12.5 }}>{r.det[c.k]}</td></tr>)}</tbody>
                        <tfoot><tr><td>Pontuação final</td><td className="r">{r.score != null ? Math.round(r.score) : "—"}</td><td className="r">{fpct(r.coverage)}</td><td colSpan={2} className="muted" style={{ fontWeight: 500 }}>{r.missing.length ? `Pesos redistribuídos por falta de: ${r.missing.join(", ")}` : "Todos os critérios com peso foram avaliados"}</td></tr></tfoot>
                      </table></div>)}
                  </div>
                  <div className="rk-right" style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                    <div><span className="serif" style={{ fontSize: 30, lineHeight: 1 }}>{r.score != null ? Math.round(r.score) : "—"}</span><span className="muted" style={{ fontSize: 12 }}> /100</span></div>
                    <div style={{ width: 120 }}><Prog value={r.score || 0} color={i === 0 ? "var(--green)" : "var(--ocean)"} /></div>
                    <div className="row" style={{ gap: 4 }}><button className="btn sm ghost" onClick={() => setOpen(open === r.q.id ? null : r.q.id)}>{open === r.q.id ? "Ocultar cálculo" : "Ver cálculo"}</button>{!isSel && <button className="btn sm" onClick={() => onSelect(r.q)}>Selecionar</button>}</div>
                  </div>
                </div>);
            })}
          </>}
        </div>
      </div>
      <div className="card"><h3>Destaques</h3><div className="grid g3" style={{ gap: 10 }}>{hl.map(([l, r, f]) => <div key={l} style={{ padding: "10px 12px", background: "#FAFCFC", borderRadius: 10, border: "1px solid #EFF4F5" }}><div className="kl">{l}</div>{r ? <><div style={{ fontWeight: 700, marginTop: 2 }}>{r.q.agency}</div><div className="muted" style={{ fontSize: 12.5 }}>{f(r)}</div></> : <div className="na" style={{ marginTop: 4 }}>dados insuficientes</div>}</div>)}</div></div>
      <div className="tblwrap"><table className="tbl">
        <thead><tr><th>Critério</th>{rows.map((r) => <th key={r.q.id}>{r.q.agency}</th>)}</tr></thead>
        <tbody>{matrix.map(([l, f, mode, fmt]) => { const vals = rows.map(f); const nums = vals.filter((v) => typeof v === "number"); const best = mode === "min" && nums.length > 1 ? Math.min(...nums) : mode === "max" && nums.length > 1 ? Math.max(...nums) : null;
          return <tr key={l}><td className="muted">{l}</td>{vals.map((v, i) => <td key={i} className={best != null && v === best ? "cmpcell-best" : ""} style={mode === "tri" && v ? { color: v === "sim" ? "var(--green)" : "#A9332F", fontWeight: 600 } : undefined}>{v == null || v === "" ? <span className="na">não informado</span> : fmt(v)}</td>)}</tr>; })}</tbody>
      </table></div>
    </div>
  );
}

function QuotesPage({ s, trip, m, update, toast, ask, go, plan, guard = () => true, canPlan = true, tripMine = true }) {
  const [tab, setTab] = useState("lista"); const [edit, setEdit] = useState(null); const [view, setView] = useState(null); const [sel, setSel] = useState(null);
  const [q, setQ] = useState(""); const [flt, setFlt] = useState("todas"); const [sort, setSort] = useState("score");
  const weights = { ...DEFAULT_WEIGHTS, ...(trip.weights || {}) };
  const wsum = CRIT.reduce((a, c) => a + (Number(weights[c.k]) || 0), 0);
  const ranked = useMemo(() => scoreQuotes(m.quotes, trip, weights), [m.quotes, trip, JSON.stringify(weights)]); // eslint-disable-line
  const rmap = Object.fromEntries(ranked.map((r, i) => [r.q.id, { ...r, pos: i + 1 }]));
  const setWeights = (w) => update((st) => ({ ...st, trips: st.trips.map((t) => (t.id === trip.id ? { ...t, weights: w } : t)) }));
  const save = (f) => {
    if (f.id) update((st) => withLog({ ...st, quotes: st.quotes.map((x) => (x.id === f.id ? { ...x, ...f } : x)) }, trip.id, `Cotação editada: ${f.agency}`));
    else update((st) => withLog({ ...st, quotes: [...st.quotes, { ...f, id: uid(), tripId: trip.id, createdAt: new Date().toISOString() }], trips: st.trips.map((t) => (t.id === trip.id && t.status === "planejando" ? { ...t, status: "cotando" } : t)) }, trip.id, `Cotação cadastrada: ${f.agency}`));
    toast(f.id ? "Cotação atualizada" : "Cotação cadastrada"); setEdit(null);
  };
  const del = (x) => { if (m.booking?.quoteId === x.id) { toast("Esta é a proposta selecionada. Cancele a seleção antes de excluí-la.", "err"); return; } ask({ title: "Excluir cotação", danger: true, cta: "Excluir cotação", message: `Excluir a cotação de ${x.agency}? O ranking será recalculado.`, onConfirm: () => { update((st) => withLog({ ...st, quotes: st.quotes.filter((y) => y.id !== x.id) }, trip.id, `Cotação excluída: ${x.agency}`)); toast("Cotação excluída"); } }); };
  const fav = (x) => update((st) => ({ ...st, quotes: st.quotes.map((y) => (y.id === x.id ? { ...y, favorite: !y.favorite } : y)) }));
  const dup = (x) => { update((st) => ({ ...st, quotes: [...st.quotes, { ...x, id: uid(), agency: `${x.agency} (cópia)`, status: "aberta", favorite: false, demo: false }] })); toast("Cotação duplicada"); };
  const confirmSel = (o, sched) => {
    const qq = sel;
    update((st) => {
      const prev = st.bookings.find((b) => b.tripId === trip.id && b.active);
      if (prev && prev.quoteId === qq.id) return st; // idempotente: nunca duplica
      const now = new Date().toISOString(); const total = r2(num(qq.total));
      let items = st.items, payments = st.payments, bookings = st.bookings, quotes = st.quotes;
      if (prev) {
        const paidPrev = sum(payments.filter((p) => p.bookingId === prev.id && p.status === "pago"), (p) => p.amount);
        payments = payments.map((p) => (p.bookingId === prev.id && !["pago", "cancelado"].includes(p.status) ? { ...p, status: "cancelado" } : p));
        items = items.map((i) => (i.id === prev.itemId ? { ...i, contracted: paidPrev || "", bookingId: null, notes: `${i.notes || ""} [proposta substituída em ${fdate(now.slice(0, 10))}]`.trim() } : i));
        bookings = bookings.map((b) => (b.id === prev.id ? { ...b, active: false, endedAt: now } : b));
        quotes = quotes.map((x) => (x.id === prev.quoteId ? { ...x, status: "aberta" } : x));
      }
      const bid = uid(); let itemId = o.itemId;
      if (itemId) items = items.map((i) => (i.id === itemId ? { ...i, contracted: total, bookingId: bid } : i));
      else { itemId = uid(); items = [...items, { id: itemId, tripId: trip.id, description: `Proposta ${qq.agency}`, category: o.category, estimated: "", contracted: total, dueDate: "", method: o.method, responsible: "", notes: "", bookingId: bid, createdAt: now }]; }
      const booking = { id: bid, tripId: trip.id, quoteId: qq.id, itemId, total, entry: num(qq.entry) || 0, installments: num(qq.installments) || 0, contractNo: o.contractNo, confirmation: o.confirmation, active: true, createdAt: now };
      if (o.generate) {
        const exists = payments.some((p) => p.bookingId === bid);
        if (!exists) payments = [...payments, ...sched.map((x) => ({ id: uid(), tripId: trip.id, itemId, bookingId: bid, description: `${qq.agency} — ${x.no === 0 ? "entrada" : `parcela ${x.no}/${x.of}`}`, category: o.itemId ? items.find((i) => i.id === itemId).category : o.category, supplier: qq.agency, amount: x.amount, dueDate: x.date, paidDate: "", method: o.method, status: "previsto", installmentNo: x.no, installmentTotal: x.of || 0 }))];
      }
      quotes = quotes.map((x) => (x.id === qq.id ? { ...x, status: "contratada", favorite: true } : x));
      const trips = st.trips.map((t) => (t.id === trip.id && ["planejando", "cotando"].includes(t.status) ? { ...t, status: "contratada" } : t));
      return withLog({ ...st, items, payments, bookings: [...bookings, booking], quotes, trips }, trip.id, `Proposta selecionada: ${qq.agency} (${brl(total)})`);
    });
    setSel(null); toast(`Proposta de ${qq.agency} registrada como contratada`, "ok", { label: "Ver pagamentos", fn: () => go("pagamentos") });
  };
  const cancelSel = () => ask({ title: "Cancelar proposta selecionada", danger: true, cta: "Cancelar seleção", message: "A proposta volta a ficar em aberto, as parcelas não pagas são canceladas e o item no planejamento fica apenas com o valor já pago.", onConfirm: () => {
    update((st) => { const b = st.bookings.find((x) => x.tripId === trip.id && x.active); if (!b) return st; const paidB = sum(st.payments.filter((p) => p.bookingId === b.id && p.status === "pago"), (p) => p.amount);
      return withLog({ ...st, bookings: st.bookings.map((x) => (x.id === b.id ? { ...x, active: false, endedAt: new Date().toISOString() } : x)), payments: st.payments.map((p) => (p.bookingId === b.id && !["pago", "cancelado"].includes(p.status) ? { ...p, status: "cancelado" } : p)), items: paidB ? st.items.map((i) => (i.id === b.itemId ? { ...i, contracted: paidB, bookingId: null } : i)) : st.items.filter((i) => !(i.id === b.itemId && !num(i.estimated))).map((i) => (i.id === b.itemId ? { ...i, contracted: "", bookingId: null } : i)), quotes: st.quotes.map((x) => (x.id === b.quoteId ? { ...x, status: "aberta" } : x)) }, trip.id, "Seleção de proposta cancelada"); });
    toast("Seleção cancelada"); } });

  let list = ranked.map((r) => r.q).filter((x) => { const t = q.toLowerCase(); return !t || [x.agency, x.hotel, x.airline, x.consultant, x.code].some((v) => String(v || "").toLowerCase().includes(t)); });
  if (flt === "favoritas") list = list.filter((x) => x.favorite);
  if (flt === "validas") list = list.filter((x) => !x.validUntil || x.validUntil >= todayISO());
  if (flt === "expiradas") list = list.filter((x) => x.validUntil && x.validUntil < todayISO());
  if (flt === "incompletas") list = list.filter((x) => missingFields(x).length);
  const sorters = { score: (a, b) => (rmap[a.id].pos - rmap[b.id].pos), total: (a, b) => (num(a.total) || 1e12) - (num(b.total) || 1e12), validade: (a, b) => String(a.validUntil || "9").localeCompare(String(b.validUntil || "9")), empresa: (a, b) => a.agency.localeCompare(b.agency) };
  list = list.slice().sort(sorters[sort]);
  const exp = () => downloadCSV(`cotacoes-${slug(trip.name)}.csv`, ["Empresa", "Consultor", "Contato", "Data", "Validade", "Código", "Total", "Pessoas", "Por pessoa", "Entrada", "Parcelas", "Valor parcela", "Encargos", "Companhia aérea", "Conexões", "Bagagem", "Hotel", "Categoria", "Regime", "Traslados", "Seguro", "Passeios", "Cancelamento", "Pontuação", "Status", "Dados faltantes"],
    list.map((x) => { const r = rmap[x.id]; return [x.agency, x.consultant, [x.phone, x.email].filter(Boolean).join(" / "), fdate(x.date), fdate(x.validUntil), x.code, brlPlain(x.total), x.people, r.perPerson ? brlPlain(r.perPerson) : "", brlPlain(x.entry), x.installments, brlPlain(x.installmentValue), brlPlain(x.interest), x.airline, x.connections, TRI_LABEL[x.baggage || ""], x.hotel, x.hotelStars, MEAL_LABEL[x.meal || ""], TRI_LABEL[x.transfers || ""], TRI_LABEL[x.insurance || ""], TRI_LABEL[x.toursInc || ""], CANCEL_LABEL[x.cancel || ""], wsum === 100 && r.score != null ? Math.round(r.score) : "", x.status === "contratada" ? "Contratada" : "Em aberto", missingFields(x).join(", ")]; }));

  return (
    <div className={`grid ${canPlan ? "" : "ro"}`}>
      <div className="row between">
        <div className="tabs"><button className={tab === "lista" ? "on" : ""} onClick={() => setTab("lista")}>Cotações ({m.quotes.length})</button><button className={tab === "comp" ? "on" : ""} onClick={() => setTab("comp")}>Comparativo</button></div>
        <button className="act btn pri" onClick={() => guard("quotes", m.quotes.length) && setEdit({})}><Plus size={16} />Nova cotação</button>
      </div>
      {m.booking && <div className="alert blue" style={{ background: "#EAF7FB" }}><Award size={16} color="#167D9A" /><span style={{ flex: 1 }}>Proposta selecionada: <b>{m.bookedQuote?.agency}</b>, {brl(m.booking.total)}{m.booking.contractNo ? `, contrato ${m.booking.contractNo}` : ""}. As demais cotações continuam disponíveis para consulta.</span><button className="act btn sm" onClick={cancelSel}>Cancelar seleção</button></div>}
      {tab === "comp" ? <Compare trip={trip} m={m} ranked={ranked} weights={weights} setWeights={setWeights} onSelect={setSel} locked={!canPlan || (tripMine && plan?.limits ? !plan.limits.can_edit_weights : false)} onLocked={() => (canPlan ? guard("weights") : toast("Só o organizador e os editores alteram os pesos desta viagem.", "info"))} /> : m.quotes.length === 0 ? (
        <div className="card"><Empty icon={FileText} title="Nenhuma cotação ainda" text="Registre as propostas de cada agência com valores, parcelas, voo, hotel e serviços. Com duas ou mais, o comparativo de custo-benefício fica disponível."><button className="act btn pri" onClick={() => guard("quotes", m.quotes.length) && setEdit({})}><Plus size={16} />Cadastrar cotação</button></Empty></div>
      ) : (<>
        <div className="row">
          <div className="searchbox" style={{ width: 260 }}><Search size={15} /><input className="inp" placeholder="Buscar empresa, hotel, cia" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar cotações" /></div>
          <Sel value={flt} onChange={setFlt} style={{ width: 170 }} aria-label="Filtro" opts={[["todas", "Todas"], ["favoritas", "Favoritas"], ["validas", "Dentro da validade"], ["expiradas", "Expiradas"], ["incompletas", "Incompletas"]]} />
          <Sel value={sort} onChange={setSort} style={{ width: 190 }} aria-label="Ordenação" opts={[["score", "Ordenar por pontuação"], ["total", "Ordenar por preço"], ["validade", "Ordenar por validade"], ["empresa", "Ordenar por empresa"]]} />
          <span style={{ flex: 1 }} /><button className="btn" onClick={exp}><Download size={15} />Exportar CSV</button>
        </div>
        <div className="tblwrap"><table className="tbl">
          <thead><tr><th>Empresa</th><th className="r">Total</th><th className="r">Por pessoa</th><th className="r">Entrada</th><th>Parcelas</th><th>Validade</th><th className="r">Pontuação</th><th>Situação</th><th></th></tr></thead>
          <tbody>{list.map((x) => { const r = rmap[x.id]; const mf = missingFields(x); const expd = x.validUntil && x.validUntil < todayISO(); const isSel = m.booking?.quoteId === x.id;
            return <tr key={x.id}>
              <td><div className="row" style={{ gap: 6, flexWrap: "nowrap" }}><button className="act ib" style={{ width: 24, height: 24 }} onClick={() => fav(x)} aria-label={x.favorite ? "Remover dos favoritos" : "Favoritar"}><Heart size={14} color={x.favorite ? "#D9534F" : "#9DB3BB"} fill={x.favorite ? "#D9534F" : "none"} /></button><div><b style={{ fontWeight: 600 }}>{x.agency}</b><div className="muted" style={{ fontSize: 12 }}>{[x.hotel, x.airline].filter(Boolean).join(", ") || "sem detalhes de serviços"}</div></div></div></td>
              <td className="r"><b>{num(x.total) ? brl(x.total) : "—"}</b></td><td className="r">{r.perPerson ? brl(r.perPerson) : "—"}</td><td className="r">{num(x.entry) != null ? brl(x.entry) : "—"}</td>
              <td>{num(x.installments) ? `${x.installments}x${num(x.installmentValue) ? ` ${brl(x.installmentValue)}` : ""}` : "—"}</td>
              <td style={{ color: expd ? "var(--red)" : undefined }}>{fdate(x.validUntil)}</td>
              <td className="r">{wsum === 100 && r.score != null ? <span><b>{Math.round(r.score)}</b><span className="muted"> ({r.pos}º)</span></span> : "—"}</td>
              <td>{isSel ? <span className="badge b-green">Contratada</span> : expd ? <span className="badge b-red">Expirada</span> : mf.length ? <span className="badge b-orange" title={`Faltam: ${mf.join(", ")}`}>Incompleta</span> : <span className="badge b-blue">Completa</span>}</td>
              <td className="r" style={{ whiteSpace: "nowrap" }}>
                {!isSel && num(x.total) > 0 && <button className="act btn sm" onClick={() => setSel(x)}>Selecionar</button>}
                <button className="ib" aria-label="Ver detalhes" onClick={() => setView(x)}><Eye size={15} /></button>
                <button className="act ib" aria-label="Editar" onClick={() => setEdit(x)}><Pencil size={15} /></button>
                <button className="act ib" aria-label="Duplicar" onClick={() => guard("quotes", m.quotes.length) && dup(x)}><Copy size={15} /></button>
                <button className="act ib dng" aria-label="Excluir" onClick={() => del(x)}><Trash2 size={15} /></button>
              </td></tr>; })}
            {!list.length && <tr><td colSpan={9} className="muted" style={{ textAlign: "center", padding: 28 }}>Nenhuma cotação com esses filtros.</td></tr>}
          </tbody></table></div>
      </>)}
      {edit && <QuoteForm initial={edit} trip={trip} onSave={save} onClose={() => setEdit(null)} />}
      {view && <QuoteDetail q={view} r={rmap[view.id]} onClose={() => setView(null)} />}
      {sel && <SelectQuoteModal q={sel} trip={trip} m={m} onClose={() => setSel(null)} onConfirm={confirmSel} />}
    </div>
  );
}

// ---------- Pagamentos ----------
function PaymentForm({ initial, items, onSave, onClose }) {
  const [f, setF] = useState(() => ({ description: "", category: CATS[0], supplier: "", amount: "", dueDate: todayISO(), paidDate: "", method: "Pix", status: "previsto", itemId: "", installmentNo: 1, installmentTotal: 1, ...initial }));
  const [e, setE] = useState({}); const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const submit = () => { const x = {}; if (!f.description.trim()) x.description = "Descreva o pagamento."; if (!(num(f.amount) > 0)) x.amount = "Informe um valor maior que zero."; if (!f.dueDate) x.dueDate = "Informe o vencimento."; if (f.status === "pago" && !f.paidDate) x.paidDate = "Informe a data em que foi pago."; setE(x); if (!Object.keys(x).length) onSave({ ...f, paidDate: f.status === "pago" ? f.paidDate : "" }); };
  return (
    <Modal title={initial?.id ? "Editar pagamento" : "Novo pagamento"} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn pri" onClick={submit}><Check size={16} />Salvar pagamento</button></>}>
      <div className="form">
        <Fld label="Descrição" err={e.description} full><Inp value={f.description} onChange={(v) => set("description", v)} autoFocus /></Fld>
        <Fld label="Item do planejamento" full hint="Vincule para que o pago apareça no item. Sem vínculo, o valor não entra no saldo a pagar dos contratos."><Sel value={f.itemId} onChange={(v) => { const it = items.find((i) => i.id === v); setF((p) => ({ ...p, itemId: v, category: it ? it.category : p.category })); }} opts={[["", "Sem vínculo"], ...items.map((i) => [i.id, `${i.description} (${i.category})`])]} /></Fld>
        <Fld label="Categoria"><CatSel value={f.category} onChange={(v) => set("category", v)} /></Fld>
        <Fld label="Fornecedor"><Inp value={f.supplier} onChange={(v) => set("supplier", v)} /></Fld>
        <Fld label="Valor" err={e.amount}><Money value={f.amount} onChange={(v) => set("amount", v)} /></Fld>
        <Fld label="Forma de pagamento"><Sel value={f.method} onChange={(v) => set("method", v)} opts={METHODS} /></Fld>
        <Fld label="Vencimento" err={e.dueDate}><Inp type="date" value={f.dueDate} onChange={(v) => set("dueDate", v)} /></Fld>
        <Fld label="Status"><Sel value={f.status} onChange={(v) => set("status", v)} opts={PAY_STATUS} /></Fld>
        {f.status === "pago" && <Fld label="Data do pagamento" err={e.paidDate}><Inp type="date" value={f.paidDate} onChange={(v) => set("paidDate", v)} /></Fld>}
        <Fld label="Parcela"><div className="row" style={{ flexWrap: "nowrap" }}><Inp type="number" min="0" value={f.installmentNo} onChange={(v) => set("installmentNo", v)} /><span className="muted">de</span><Inp type="number" min="0" value={f.installmentTotal} onChange={(v) => set("installmentTotal", v)} /></div></Fld>
      </div>
    </Modal>
  );
}

function PaymentsPage({ s, trip, m, update, toast, ask, canPlan = true }) {
  const [view, setView] = useState("lista"); const [st, setSt] = useState("abertos"); const [cat, setCat] = useState(""); const [edit, setEdit] = useState(null); const [payNow, setPayNow] = useState(null);
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  let list = m.pays.slice().sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || "") || (a.installmentNo || 0) - (b.installmentNo || 0));
  if (st === "abertos") list = list.filter((p) => !["pago", "cancelado"].includes(p.status));
  else if (st !== "todos") list = list.filter((p) => effStatus(p) === st);
  if (cat) list = list.filter((p) => p.category === cat);
  const save = (f) => {
    if (f.id) update((x) => withLog({ ...x, payments: x.payments.map((p) => (p.id === f.id ? { ...p, ...f, amount: r2(f.amount) } : p)) }, trip.id, `Pagamento editado: ${f.description}`));
    else update((x) => withLog({ ...x, payments: [...x.payments, { ...f, id: uid(), tripId: trip.id, amount: r2(f.amount), bookingId: x.items.find((i) => i.id === f.itemId)?.bookingId || null }] }, trip.id, `Pagamento criado: ${f.description}`));
    toast(f.id ? "Pagamento atualizado" : "Pagamento adicionado"); setEdit(null);
  };
  const markPaid = (p, date, method) => { update((x) => withLog({ ...x, payments: x.payments.map((y) => (y.id === p.id ? { ...y, status: "pago", paidDate: date, method } : y)) }, trip.id, `Pagamento quitado: ${p.description} (${brl(p.amount)})`)); toast("Pagamento marcado como pago"); setPayNow(null); };
  const undo = (p) => update((x) => withLog({ ...x, payments: x.payments.map((y) => (y.id === p.id ? { ...y, status: "previsto", paidDate: "" } : y)) }, trip.id, `Quitação desfeita: ${p.description}`));
  const cancel = (p) => ask({ title: "Cancelar pagamento", cta: "Cancelar pagamento", danger: true, message: `“${p.description}” deixará de compor os totais, mas continuará no histórico.`, onConfirm: () => { update((x) => withLog({ ...x, payments: x.payments.map((y) => (y.id === p.id ? { ...y, status: "cancelado" } : y)) }, trip.id, `Pagamento cancelado: ${p.description}`)); toast("Pagamento cancelado"); } });
  const del = (p) => ask({ title: "Excluir pagamento", danger: true, cta: "Excluir", message: `Excluir “${p.description}” definitivamente?`, onConfirm: () => { update((x) => withLog({ ...x, payments: x.payments.filter((y) => y.id !== p.id) }, trip.id, `Pagamento excluído: ${p.description}`)); toast("Pagamento excluído"); } });
  const late = m.pays.filter((p) => effStatus(p) === "atrasado"); const today = todayISO();
  const next30 = m.pays.filter((p) => !["pago", "cancelado"].includes(p.status) && p.dueDate >= today && diffDays(today, p.dueDate) <= 30);
  const exp = () => downloadCSV(`pagamentos-${slug(trip.name)}.csv`, ["Descrição", "Categoria", "Fornecedor", "Valor", "Vencimento", "Data do pagamento", "Forma", "Status", "Parcela", "Total de parcelas", "Origem"], list.map((p) => [p.description, p.category, p.supplier, brlPlain(p.amount), fdate(p.dueDate), fdate(p.paidDate), p.method, PAY_LABEL[effStatus(p)], p.installmentNo, p.installmentTotal, p.bookingId ? "Proposta selecionada" : p.itemId ? "Item do planejamento" : "Manual"]));
  const monthly = useMemo(() => { const g = {}; m.activePays.forEach((p) => { const k = (p.dueDate || "").slice(0, 7); if (!k) return; g[k] = g[k] || { total: 0, pago: 0, n: 0 }; g[k].total = r2(g[k].total + p.amount); g[k].n++; if (p.status === "pago") g[k].pago = r2(g[k].pago + p.amount); }); return Object.keys(g).sort().map((k) => ({ k, ...g[k], aberto: r2(g[k].total - g[k].pago) })); }, [m]);
  return (
    <div className={`grid ${canPlan ? "" : "ro"}`}>
      <div className="strip" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
        <div><div className="kl">Total contratado</div><div className="kv">{brl(m.contracted)}</div></div>
        <div><div className="kl">Parcelas pagas</div><div className="kv" style={{ color: "var(--green)" }}>{brl(m.paidPays)}</div></div>
        <div><div className="kl">Saldo a pagar</div><div className="kv">{brl(m.toPay)}</div><div className="kh">Contratos + despesas não pagas</div></div>
        <div><div className="kl">Próximos 30 dias</div><div className="kv">{brl(sum(next30, (p) => p.amount))}</div><div className="kh">{next30.length} vencimento(s)</div></div>
        <div><div className="kl">Em atraso</div><div className="kv" style={{ color: late.length ? "var(--red)" : undefined }}>{brl(sum(late, (p) => p.amount))}</div><div className="kh">{late.length} pagamento(s)</div></div>
      </div>
      <div className="row between">
        <div className="tabs"><button className={view === "lista" ? "on" : ""} onClick={() => setView("lista")}>Lista</button><button className={view === "cal" ? "on" : ""} onClick={() => setView("cal")}>Calendário</button><button className={view === "mes" ? "on" : ""} onClick={() => setView("mes")}>Resumo mensal</button></div>
        <div className="row"><button className="btn" onClick={exp} disabled={!list.length}><Download size={15} />Exportar CSV</button><button className="act btn pri" onClick={() => setEdit({})}><Plus size={16} />Novo pagamento</button></div>
      </div>
      {m.pays.length === 0 ? <div className="card"><Empty icon={CalendarClock} title="Nenhum pagamento agendado" text="Os pagamentos são gerados ao selecionar uma proposta ou ao agendar um item contratado no Planejamento. Você também pode lançar um manualmente."><button className="act btn pri" onClick={() => setEdit({})}><Plus size={16} />Lançar pagamento</button></Empty></div> : view === "lista" ? (<>
        <div className="row"><Sel value={st} onChange={setSt} style={{ width: 190 }} aria-label="Status" opts={[["abertos", "Em aberto"], ["todos", "Todos"], ["previsto", "Previstos"], ["pendente", "Pendentes"], ["atrasado", "Atrasados"], ["pago", "Pagos"], ["cancelado", "Cancelados"]]} /><Sel value={cat} onChange={setCat} style={{ width: 230 }} aria-label="Categoria" opts={[["", "Todas as categorias"], ...CATS.map((c) => [c, c])]} /></div>
        <div className="tblwrap"><table className="tbl"><thead><tr><th>Vencimento</th><th>Descrição</th><th>Categoria</th><th>Forma</th><th className="r">Valor</th><th>Status</th><th></th></tr></thead>
          <tbody>{list.map((p) => { const es = effStatus(p); const dd = p.dueDate ? diffDays(today, p.dueDate) : null; return <tr key={p.id} style={{ opacity: p.status === "cancelado" ? 0.55 : 1 }}>
            <td style={{ whiteSpace: "nowrap" }}>{fdate(p.dueDate)}{es !== "pago" && es !== "cancelado" && dd != null && dd >= 0 && dd <= 7 && <div style={{ fontSize: 11.5, color: "#93600E" }}>{dd === 0 ? "vence hoje" : `em ${dd} dia(s)`}</div>}{p.paidDate && <div className="muted" style={{ fontSize: 11.5 }}>pago em {fdate(p.paidDate)}</div>}</td>
            <td><b style={{ fontWeight: 600 }}>{p.description}</b>{p.supplier && <div className="muted" style={{ fontSize: 12 }}>{p.supplier}</div>}</td><td>{p.category}</td><td>{p.method}</td>
            <td className="r"><b>{brl(p.amount)}</b></td><td><PayBadge p={p} /></td>
            <td className="r" style={{ whiteSpace: "nowrap" }}>
              {!["pago", "cancelado"].includes(p.status) && <button className="act btn sm pri" onClick={() => setPayNow(p)}><Check size={13} />Pagar</button>}
              {p.status === "pago" && <button className="act btn sm ghost" onClick={() => undo(p)}>Desfazer</button>}
              <button className="act ib" aria-label="Editar" onClick={() => setEdit(p)}><Pencil size={15} /></button>
              {!["pago", "cancelado"].includes(p.status) && <button className="act ib" title="Cancelar" aria-label="Cancelar pagamento" onClick={() => cancel(p)}><X size={15} /></button>}
              <button className="act ib dng" aria-label="Excluir" onClick={() => del(p)}><Trash2 size={15} /></button>
            </td></tr>; })}
            {!list.length && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 28 }}>Nenhum pagamento com esses filtros.</td></tr>}
          </tbody>{list.length > 0 && <tfoot><tr><td colSpan={4}>Total filtrado (sem cancelados)</td><td className="r">{brl(sum(list.filter((p) => p.status !== "cancelado"), (p) => p.amount))}</td><td colSpan={2}></td></tr></tfoot>}</table></div>
      </>) : view === "cal" ? <PayCalendar pays={m.pays} month={month} setMonth={setMonth} onPick={setEdit} /> : (
        <div className="grid g2">
          <div className="card"><h3>Valor por mês</h3><div style={{ height: 260 }}><ResponsiveContainer><BarChart data={monthly.map((x) => ({ n: monthLabel(x.k), Pago: x.pago, "Em aberto": x.aberto }))}><CartesianGrid vertical={false} stroke="#EEF3F4" /><XAxis dataKey="n" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={50} /><Tooltip formatter={(v) => brl(v)} contentStyle={tipStyle} /><Bar dataKey="Pago" stackId="a" fill="#21865B" /><Bar dataKey="Em aberto" stackId="a" fill="#167D9A" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
          <div className="tblwrap"><table className="tbl"><thead><tr><th>Mês</th><th className="r">Pagamentos</th><th className="r">Total</th><th className="r">Pago</th><th className="r">Em aberto</th></tr></thead><tbody>{monthly.map((x) => <tr key={x.k}><td>{MONTHS_FULL[Number(x.k.slice(5)) - 1]} de {x.k.slice(0, 4)}</td><td className="r">{x.n}</td><td className="r">{brl(x.total)}</td><td className="r" style={{ color: "var(--green)" }}>{brl(x.pago)}</td><td className="r"><b>{brl(x.aberto)}</b></td></tr>)}</tbody></table></div>
        </div>)}
      {edit && <PaymentForm initial={edit} items={m.items} onSave={save} onClose={() => setEdit(null)} />}
      {payNow && <PayNowModal p={payNow} onClose={() => setPayNow(null)} onConfirm={markPaid} />}
    </div>
  );
}
function PayNowModal({ p, onClose, onConfirm }) {
  const [d, setD] = useState(todayISO()); const [mt, setMt] = useState(p.method || "Pix");
  return <Modal title="Registrar pagamento" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn pri" onClick={() => onConfirm(p, d, mt)}><Check size={16} />Marcar como pago</button></>}>
    <p style={{ marginTop: 0 }}><b>{p.description}</b>: {brl(p.amount)}, vencimento em {fdate(p.dueDate)}.</p>
    <div className="form"><Fld label="Data efetiva do pagamento"><Inp type="date" value={d} onChange={setD} /></Fld><Fld label="Forma de pagamento"><Sel value={mt} onChange={setMt} opts={METHODS} /></Fld></div>
  </Modal>;
}
function PayCalendar({ pays, month, setMonth, onPick }) {
  const [y, mo] = month.split("-").map(Number); const first = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay(); const days = new Date(Date.UTC(y, mo, 0)).getUTCDate(); const today = todayISO();
  const cells = []; for (let i = 0; i < first; i++) cells.push(null); for (let d = 1; d <= days; d++) cells.push(`${y}-${pad(mo)}-${pad(d)}`); while (cells.length % 7) cells.push(null);
  const color = { pago: ["#E2F2EA", "#1A6E4A"], atrasado: ["#FBE5E4", "#A9332F"], pendente: ["#FCEFD8", "#93600E"], previsto: ["#DDF4FA", "#0E6077"], cancelado: ["#EDF2F4", "#7A8F99"] };
  const tot = sum(pays.filter((p) => p.status !== "cancelado" && (p.dueDate || "").startsWith(month)), (p) => p.amount);
  return (<div className="grid">
    <div className="row between"><div className="row"><button className="ib" aria-label="Mês anterior" onClick={() => setMonth(addMonths(month + "-01", -1).slice(0, 7))}><ChevronLeft size={18} /></button><b className="serif" style={{ fontSize: 18, minWidth: 170, textAlign: "center" }}>{MONTHS_FULL[mo - 1]} {y}</b><button className="ib" aria-label="Próximo mês" onClick={() => setMonth(addMonths(month + "-01", 1).slice(0, 7))}><ChevronRight size={18} /></button><button className="btn sm" onClick={() => setMonth(todayISO().slice(0, 7))}>Hoje</button></div><span className="muted">Total do mês: <b style={{ color: "var(--ink)" }}>{brl(tot)}</b></span></div>
    <div className="cal">{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => <div key={d} className="h">{d}</div>)}
      {cells.map((c, i) => <div key={i} className={`d ${!c ? "out" : ""} ${c === today ? "today" : ""}`}>{c && <><span className="n">{Number(c.slice(8))}</span>{pays.filter((p) => p.dueDate === c).map((p) => { const [bg, fg] = color[effStatus(p)]; return <button key={p.id} className="ev" style={{ background: bg, color: fg, textDecoration: p.status === "cancelado" ? "line-through" : "none" }} title={`${p.description}: ${brl(p.amount)}`} onClick={() => onPick(p)}>{brl(p.amount)}</button>; })}</>}</div>)}
    </div></div>);
}

// ---------- Roteiro ----------
const ITIN_ICON = { escala: Anchor, restaurante: Utensils, passeio: Ticket, praia: Umbrella, atracao: Landmark, deslocamento: Car, hospedagem: Building2, outro: MapPin };

function BenefitPicker({ programs, value, onChange, onPaid, paid, paidLabel = "valor", date }) {
  const clubs = programs.filter((p) => (p.rules || []).length);
  const v = value || null;
  const ro = ruleOf(programs, v);
  const cardsFor = (p) => Math.max(1, activeMemberships(p, date).length);
  const res = ro?.r ? applyRule(ro.r, v) : null;
  const saved = res ? (res.paid != null ? r2(res.full - res.paid) : num(paid) != null ? r2(res.full - num(paid)) : null) : null;
  const upd = (patch) => {
    let nv = { ...(v || {}), ...patch };
    const rr = ruleOf(programs, nv);
    if (rr?.r?.kind === "2x1") {
      if (!Array.isArray(nv.items)) nv.items = [nv.a ?? "", nv.b ?? ""];
      delete nv.a; delete nv.b;
      const filled = nv.items.filter((x) => num(x) > 0).length;
      const maxUses = Math.max(1, Math.min(cardsFor(rr.p), Math.floor(filled / 2)));
      nv.uses = nv.usesAuto === false ? Math.min(num(nv.uses) || 1, maxUses) : maxUses;
    }
    const out = rr?.r ? applyRule(rr.r, nv) : null;
    if (rr?.r?.kind === "2x1") nv = { ...nv, full: out ? out.full : "" };
    onChange(nv); if (out && out.paid != null) onPaid(out.paid);
  };
  if (!clubs.length) return <div className="note full"><Gift size={14} />Cadastre um clube de benefícios em “Benefícios e fidelidade” para calcular a economia aqui.</div>;
  const opts = [["", "Nenhum benefício"], ...clubs.flatMap((p) => p.rules.map((r) => [`${p.id}|${r.id}`, `${p.name}: ${r.label}`]))];
  const items = v ? (Array.isArray(v.items) ? v.items : [v.a ?? "", v.b ?? ""]) : [];
  const filled = items.filter((x) => num(x) > 0).length;
  const cards = ro ? cardsFor(ro.p) : 1;
  const maxSel = Math.max(1, Math.min(cards, Math.floor(filled / 2)));
  return (
    <div className="benefit">
      <Fld label="Benefício utilizado"><Sel value={v ? `${v.programId}|${v.ruleId}` : ""} onChange={(x) => { if (!x) { onChange(null); return; } const [programId, ruleId] = x.split("|"); upd({ programId, ruleId }); }} opts={opts} /></Fld>
      {ro?.r && (ro.r.kind === "2x1" ? (
        <div style={{ marginTop: 10 }}>
          <div className="kl" style={{ marginBottom: 6 }}>Valor de cada item (prato, diária ou ingresso)</div>
          <div className="items-grid">{items.map((x, i) => (
            <div key={i} className="row" style={{ flexWrap: "nowrap", gap: 4 }}>
              <Money value={x} onChange={(val) => { const it = [...items]; it[i] = val; upd({ items: it }); }} aria-label={`Item ${i + 1}`} />
              {items.length > 2 && <button className="ib dng" aria-label="Remover item" onClick={() => upd({ items: items.filter((_, j) => j !== i) })}><X size={14} /></button>}
            </div>))}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => upd({ items: [...items, ""] })}><Plus size={13} />Adicionar item</button>
            <label className="row" style={{ gap: 6, fontSize: 13 }}>Adesões usadas
              <select className="sel" style={{ width: 70, padding: "5px 8px" }} value={Math.min(num(v.uses) || 1, maxSel)} onChange={(e) => upd({ uses: Number(e.target.value), usesAuto: false })}>{Array.from({ length: maxSel }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select>
            </label>
            <span className="muted" style={{ fontSize: 12 }}>{cards} adesão(ões) válida(s){date ? ` em ${fdate(date)}` : ""}</span>
          </div>
        </div>
      ) : (
        <div className="form" style={{ marginTop: 10 }}>
          <Fld label="Valor sem o benefício" hint={ro.r.kind === "other" ? `Informe no campo de ${paidLabel} quanto foi pago de fato` : ro.r.kind === "pct" ? `Desconto de ${ro.r.value || 0}%` : `Desconto de ${brl(ro.r.value || 0)}`}><Money value={v.full} onChange={(x) => upd({ full: x })} /></Fld>
        </div>
      ))}
      {res && <div className="note" style={{ marginTop: 8, color: "var(--green)" }}><CheckCircle2 size={14} /><span>{res.pairs != null ? `${res.pairs} par(es) com benefício${res.unpaired ? `, ${res.unpaired} item(ns) pago(s) integralmente` : ""}. ` : ""}Sem o benefício: {brl(res.full)}.{res.paid != null ? ` Com ele: ${brl(res.paid)}.` : ""}{saved != null && saved > 0 ? ` Economia de ${brl(saved)}.` : ""}</span></div>}
      {ro?.r?.kind === "2x1" && (num(v.uses) || 1) > 1 && <div className="note" style={{ marginTop: 6 }}><Info size={14} />Confirme no app do clube quantos usos o estabelecimento aceita por mesa.</div>}
      {ro && !ro.r && <div className="note" style={{ marginTop: 8 }}><AlertTriangle size={14} />A regra escolhida não existe mais no programa.</div>}
    </div>
  );
}

function ItinForm({ initial, trip, programs, onSave, onClose }) {
  const [f, setF] = useState(() => ({ type: "passeio", date: trip.startDate || todayISO(), time: "", city: "", activity: "", place: "", link: "", estimated: "", real: "", participants: "", needsReservation: false, reservationStatus: "pendente", status: "planejada", notes: "", benefit: null, ...initial }));
  const [e, setE] = useState({}); const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const out = f.date && trip.startDate && trip.endDate && (f.date < trip.startDate || f.date > trip.endDate);
  const submit = () => { const x = {}; if (!f.activity.trim()) x.activity = "Descreva a atividade."; if (!f.date) x.date = "Informe a data."; setE(x); if (!Object.keys(x).length) onSave({ ...f, benefit: f.benefit?.programId && num(f.benefit.full) > 0 ? f.benefit : null }); };
  return (
    <Modal title={initial?.id ? "Editar atividade" : "Nova atividade"} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn pri" onClick={submit}><Check size={16} />Salvar atividade</button></>}>
      <div className="form">
        <Fld label="Tipo"><Sel value={f.type} onChange={(v) => set("type", v)} opts={ITIN_TYPES} /></Fld>
        <Fld label="Situação"><Sel value={f.status} onChange={(v) => set("status", v)} opts={[["planejada", "Planejada"], ["realizada", "Realizada"], ["cancelada", "Cancelada"]]} /></Fld>
        <Fld label={f.type === "restaurante" ? "Restaurante" : "Atividade ou passeio"} err={e.activity} full><Inp value={f.activity} onChange={(v) => set("activity", v)} autoFocus placeholder={f.type === "restaurante" ? "Ex.: Jantar no Restaurante da Orla" : "Ex.: Passeio de catamarã"} /></Fld>
        <Fld label="Data" err={e.date} hint={out ? "Fora do período da viagem" : ""}><Inp type="date" value={f.date} onChange={(v) => set("date", v)} /></Fld>
        <Fld label="Horário"><Inp type="time" value={f.time} onChange={(v) => set("time", v)} /></Fld>
        <Fld label="Cidade ou região"><Inp value={f.city} onChange={(v) => set("city", v)} /></Fld>
        <Fld label="Local"><Inp value={f.place} onChange={(v) => set("place", v)} /></Fld>
        <Fld label="Endereço ou link do mapa" full><Inp value={f.link} onChange={(v) => set("link", v)} placeholder="https://" /></Fld>
        <BenefitPicker date={f.date} programs={programs} value={f.benefit} onChange={(b) => set("benefit", b)} onPaid={(v) => set("estimated", v)} paid={f.estimated} paidLabel="valor estimado" />
        <Fld label="Valor estimado" hint={f.benefit ? "Já com o benefício aplicado" : ""}><Money value={f.estimated} onChange={(v) => set("estimated", v)} /></Fld>
        <Fld label="Valor realizado" hint="Informativo. Use “Registrar gasto” para entrar nos totais."><Money value={f.real} onChange={(v) => set("real", v)} /></Fld>
        <Fld label="Participantes"><Inp value={f.participants} onChange={(v) => set("participants", v)} /></Fld>
        <div className="fld" style={{ alignSelf: "end" }}><Toggle checked={f.needsReservation} onChange={(v) => set("needsReservation", v)} label="Precisa de reserva" /></div>
        {f.needsReservation && <Fld label="Status da reserva"><Sel value={f.reservationStatus} onChange={(v) => set("reservationStatus", v)} opts={[["pendente", "Pendente"], ["confirmada", "Confirmada"]]} /></Fld>}
        <Fld label="Observações" full><Ta value={f.notes} onChange={(v) => set("notes", v)} /></Fld>
      </div>
    </Modal>
  );
}

function DocForm({ initial, trip, onSave, onClose }) {
  const [f, setF] = useState(() => ({ title: "", type: DOC_TYPES[0], link: "", status: "pendente", dueDate: "", person: "", notes: "", ...initial }));
  const [e, setE] = useState({}); const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const submit = () => { const x = {}; if (!f.title.trim()) x.title = "Dê um nome ao documento ou reserva."; if (f.link && !/^https?:\/\//i.test(f.link)) x.link = "O link precisa começar com http:// ou https://"; setE(x); if (!Object.keys(x).length) onSave(f); };
  return (
    <Modal title={initial?.id ? "Editar documento" : "Novo documento ou reserva"} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn pri" onClick={submit}><Check size={16} />Salvar</button></>}>
      <div className="form">
        <Fld label="Nome" err={e.title} full><Inp value={f.title} onChange={(v) => set("title", v)} autoFocus placeholder="Ex.: Voucher do hotel, RG da Lia" /></Fld>
        <Fld label="Tipo"><Sel value={f.type} onChange={(v) => set("type", v)} opts={DOC_TYPES} /></Fld>
        <Fld label="Situação"><Sel value={f.status} onChange={(v) => set("status", v)} opts={[["pendente", "Pendente"], ["ok", "Confirmado / em mãos"]]} /></Fld>
        <Fld label="De quem"><Sel value={f.person} onChange={(v) => set("person", v)} opts={[["", "Todos / não se aplica"], ...peopleOf(trip).map((p) => [p, p])]} /></Fld>
        <Fld label="Prazo"><Inp type="date" value={f.dueDate} onChange={(v) => set("dueDate", v)} /></Fld>
        <Fld label="Link do arquivo" err={e.link} full hint="Google Drive, e-mail, PDF online"><Inp value={f.link} onChange={(v) => set("link", v)} placeholder="https://" /></Fld>
        <Fld label="Observações" full><Ta value={f.notes} onChange={(v) => set("notes", v)} /></Fld>
      </div>
    </Modal>
  );
}

function DocsPanel({ s, trip, update, toast, ask, canPlan = true }) {
  const [edit, setEdit] = useState(null);
  const docs = (s.docs || []).filter((d) => d.tripId === trip.id).sort((a, b) => (a.status === b.status ? String(a.dueDate || "9").localeCompare(String(b.dueDate || "9")) : a.status === "pendente" ? -1 : 1));
  const save = (f) => { if (f.id) update((x) => ({ ...x, docs: x.docs.map((d) => (d.id === f.id ? { ...d, ...f } : d)) })); else update((x) => withLog({ ...x, docs: [...(x.docs || []), { ...f, id: uid(), tripId: trip.id }] }, trip.id, `Documento cadastrado: ${f.title}`)); toast(f.id ? "Documento atualizado" : "Documento cadastrado"); setEdit(null); };
  const toggle = (d) => update((x) => ({ ...x, docs: x.docs.map((y) => (y.id === d.id ? { ...y, status: y.status === "ok" ? "pendente" : "ok" } : y)) }));
  const del = (d) => ask({ title: "Excluir documento", danger: true, cta: "Excluir", message: `Excluir “${d.title}”? O arquivo no link não é afetado.`, onConfirm: () => { update((x) => ({ ...x, docs: x.docs.filter((y) => y.id !== d.id) })); toast("Documento excluído"); } });
  const pend = docs.filter((d) => d.status !== "ok").length;
  return (
    <div className={`grid ${canPlan ? "" : "ro"}`}>
      <div className="row between"><span className="muted" style={{ fontSize: 13 }}>{docs.length ? `${pend} pendente(s) de ${docs.length}` : "Documentos, vouchers e reservas da viagem"}</span><button className="act btn pri" onClick={() => setEdit({})}><Plus size={16} />Novo documento</button></div>
      {!docs.length ? <div className="card"><Empty icon={Paperclip} title="Nenhum documento cadastrado" text="Registre documentos de identidade, vouchers, bilhetes, seguro e reservas. Pendências aparecem nos alertas do dashboard."><button className="act btn pri" onClick={() => setEdit({})}><Plus size={16} />Cadastrar documento</button></Empty></div> : (
        <div className="tblwrap"><table className="tbl"><thead><tr><th>Documento</th><th>Tipo</th><th>De quem</th><th>Prazo</th><th>Situação</th><th></th></tr></thead>
          <tbody>{docs.map((d) => <tr key={d.id}>
            <td><b style={{ fontWeight: 600 }}>{d.title}</b>{d.notes && <div className="muted" style={{ fontSize: 12 }}>{d.notes}</div>}</td><td>{d.type}</td><td>{d.person || "—"}</td>
            <td style={{ color: d.status !== "ok" && d.dueDate && d.dueDate < todayISO() ? "var(--red)" : undefined }}>{fdate(d.dueDate)}</td>
            <td><button className={`badge ${d.status === "ok" ? "b-green" : "b-orange"}`} style={{ border: 0, cursor: "pointer" }} onClick={() => canPlan && toggle(d)} title="Alternar situação">{d.status === "ok" ? "Confirmado" : "Pendente"}</button></td>
            <td className="r" style={{ whiteSpace: "nowrap" }}>{d.link && <a className="act ib" href={d.link} target="_blank" rel="noreferrer" aria-label="Abrir arquivo"><ExternalLink size={15} /></a>}<button className="act ib" aria-label="Editar" onClick={() => setEdit(d)}><Pencil size={15} /></button><button className="act ib dng" aria-label="Excluir" onClick={() => del(d)}><Trash2 size={15} /></button></td>
          </tr>)}</tbody></table></div>)}
      <p className="note"><Info size={14} />Nesta versão os anexos são links. O envio de arquivos exige armazenamento privado com permissão por usuário, previsto para a versão com Supabase.</p>
      {edit && <DocForm initial={edit} trip={trip} onSave={save} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ItineraryPage({ s, trip, update, toast, ask, canPlan = true, canAct = true, me = "local", sharedTrip, myTraveler }) {
  const itCan = (i) => canPlan || (canAct && (!i._by || i._by === me));
  const programs = s.programs || [];
  const [tab, setTab] = useState("roteiro");
  const [edit, setEdit] = useState(null); const [flt, setFlt] = useState("todas"); const [ft, setFt] = useState(""); const [spend, setSpend] = useState(null);
  let list = s.itinerary.filter((i) => i.tripId === trip.id);
  if (flt !== "todas") list = list.filter((i) => i.status === flt);
  if (ft) list = list.filter((i) => (i.type || "outro") === ft);
  const groups = {}; list.forEach((i) => (groups[i.date] = groups[i.date] || []).push(i));
  const dates = Object.keys(groups).sort();
  const spentIds = new Set(s.expenses.filter((e) => e.itineraryId).map((e) => e.itineraryId));
  const save = (f) => { if (f.id) update((x) => ({ ...x, itinerary: x.itinerary.map((i) => (i.id === f.id ? { ...i, ...f } : i)) })); else update((x) => ({ ...x, itinerary: [...x.itinerary, { ...f, id: uid(), tripId: trip.id }] })); toast(f.id ? "Atividade atualizada" : "Atividade adicionada"); setEdit(null); };
  const del = (i) => ask({ title: "Excluir atividade", danger: true, cta: "Excluir", message: `Excluir “${i.activity}” do roteiro?${spentIds.has(i.id) ? " O gasto já lançado em Despesas continua registrado." : ""}`, onConfirm: () => { update((x) => ({ ...x, itinerary: x.itinerary.filter((y) => y.id !== i.id) })); toast("Atividade excluída"); } });
  const toggle = (i) => update((x) => ({ ...x, itinerary: x.itinerary.map((y) => (y.id === i.id ? { ...y, status: y.status === "realizada" ? "planejada" : "realizada" } : y)) }));
  const saveSpend = (f) => {
    if (s.expenses.some((e) => e.itineraryId === f.itineraryId)) { toast("Esta atividade já tem um gasto lançado", "err"); setSpend(null); return; }
    update((x) => withLog({ ...x, expenses: [{ ...f, id: uid(), tripId: trip.id, createdAt: new Date().toISOString() }, ...x.expenses], itinerary: x.itinerary.map((y) => (y.id === f.itineraryId && itCan(y) ? { ...y, status: "realizada", real: f.amount } : y)) }, trip.id, `Despesa do roteiro: ${f.description} (${brl(f.amount)})`));
    toast("Gasto registrado em Despesas e atividade marcada como realizada"); setSpend(null);
  };
  const all = s.itinerary.filter((i) => i.tripId === trip.id && i.status !== "cancelada");
  const plannedSav = sum(all.filter((i) => i.benefit && !spentIds.has(i.id)), (i) => num(i.benefit.full) - (num(i.estimated) || 0));
  const exp = () => downloadCSV(`roteiro-${slug(trip.name)}.csv`, ["Data", "Horário", "Tipo", "Cidade", "Atividade", "Local", "Link", "Estimado", "Realizado", "Benefício", "Economia prevista", "Participantes", "Reserva", "Situação", "Observações"], list.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map((i) => { const ro = ruleOf(programs, i.benefit); return [fdate(i.date), i.time, ITIN_LABEL[i.type || "outro"], i.city, i.activity, i.place, i.link, brlPlain(i.estimated), brlPlain(i.real), ro ? `${ro.p.name}${ro.r ? `: ${ro.r.label}` : ""}` : "", i.benefit ? brlPlain(num(i.benefit.full) - (num(i.estimated) || 0)) : "", i.participants, i.needsReservation ? (i.reservationStatus === "confirmada" ? "Confirmada" : "Pendente") : "Não precisa", i.status, i.notes]; }));
  return (
    <div className={`grid ${canAct ? "" : "ro"}`}>
      <div className="tabs" style={{ justifySelf: "start" }}><button className={tab === "roteiro" ? "on" : ""} onClick={() => setTab("roteiro")}>Roteiro</button><button className={tab === "docs" ? "on" : ""} onClick={() => setTab("docs")}>Documentos e reservas</button></div>
      {tab === "docs" ? <DocsPanel s={s} trip={trip} update={update} toast={toast} ask={ask} canPlan={canPlan} /> : <>
        <div className="row between">
          <div className="row">
            <Sel value={flt} onChange={setFlt} style={{ width: 150 }} aria-label="Situação" opts={[["todas", "Todas"], ["planejada", "Planejadas"], ["realizada", "Realizadas"], ["cancelada", "Canceladas"]]} />
            <Sel value={ft} onChange={setFt} style={{ width: 170 }} aria-label="Tipo" opts={[["", "Todos os tipos"], ...ITIN_TYPES]} />
            <span className="muted hide-m" style={{ fontSize: 13 }}>Estimado: <b style={{ color: "var(--ink)" }}>{brl(sum(all, (i) => i.estimated))}</b>{plannedSav > 0 && <> , economia prevista com benefícios: <b style={{ color: "var(--green)" }}>{brl(plannedSav)}</b></>}</span>
          </div>
          <div className="row"><button className="btn" onClick={exp} disabled={!list.length}><Download size={15} />Exportar CSV</button><button className="act btn pri" onClick={() => setEdit({})}><Plus size={16} />Nova atividade</button></div>
        </div>
        {!dates.length ? <div className="card"><Empty icon={MapPin} title="Roteiro em branco" text="Inclua restaurantes, praias, passeios e deslocamentos por dia. Se usar um clube como o Prime Gourmet, escolha o benefício na atividade e a economia é calculada."><button className="act btn pri" onClick={() => setEdit({})}><Plus size={16} />Adicionar atividade</button></Empty></div> :
          dates.map((d) => {
            const n = trip.startDate ? diffDays(trip.startDate, d) + 1 : null;
            const wd = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][new Date(dayNum(d) * 86400000).getUTCDay()];
            return (<div key={d} className="card">
              <h3><span className="serif" style={{ fontSize: 18, fontWeight: 400 }}>{n && n >= 1 && (!trip.endDate || d <= trip.endDate) ? `Dia ${n}` : fdate(d)}</span><span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>{fdate(d)}, {wd}</span><small>{brl(sum(groups[d].filter((i) => i.status !== "cancelada"), (i) => i.estimated))} estimados</small></h3>
              <div className="grid" style={{ gap: 0 }}>{groups[d].sort((a, b) => (a.time || "99").localeCompare(b.time || "99")).map((i) => {
                const Ic = ITIN_ICON[i.type || "outro"] || MapPin; const ro = ruleOf(programs, i.benefit); const spent = spentIds.has(i.id);
                const sav = i.benefit ? r2(num(i.benefit.full) - (num(i.estimated) || 0)) : 0;
                return (
                  <div key={i.id} className="itin-row" style={{ opacity: i.status === "cancelada" ? 0.5 : 1 }}>
                    <div className="typeic"><Ic size={16} /></div>
                    <div style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 6 }}><b style={{ color: "var(--ocean)", fontSize: 13 }}>{i.time || "—"}</b><b style={{ fontWeight: 600, textDecoration: i.status === "cancelada" ? "line-through" : "none" }}>{i.activity}</b>{i.status === "realizada" && <span className="badge b-green">Realizada</span>}{i.needsReservation && <span className={`badge ${i.reservationStatus === "confirmada" ? "b-blue" : "b-orange"}`}>Reserva {i.reservationStatus === "confirmada" ? "confirmada" : "pendente"}</span>}{ro && <span className="badge b-sand"><Gift size={11} />{ro.p.name}{sav > 0 ? `, economia ${brl(sav)}` : ""}</span>}</div>
                      <div className="muted" style={{ fontSize: 12.5 }}>{ITIN_LABEL[i.type || "outro"]}{[i.place, i.city].filter(Boolean).length ? `, ${[i.place, i.city].filter(Boolean).join(", ")}` : ""}{num(i.estimated) ? `. Estimado ${brl(i.estimated)}` : num(i.estimated) === 0 ? ". Gratuita" : ""}{num(i.real) ? `, realizado ${brl(i.real)}` : ""}{i.notes ? `. ${i.notes}` : ""}</div>
                    </div>
                    <div className="row" style={{ gap: 2, flexWrap: "nowrap" }}>
                      {i.status !== "cancelada" && (spent ? <span className="badge b-green hide-m">Gasto lançado</span> : <button className="act btn sm" onClick={() => setSpend({ description: i.activity, category: ITIN_CAT[i.type || "outro"], amount: num(i.real) || num(i.estimated) || "", date: i.date, place: [i.place, i.city].filter(Boolean).join(", "), benefit: i.benefit, itineraryId: i.id, status: "paga", method: "Pix", shared: false, person: myTraveler || "" })}><Receipt size={13} />Registrar gasto</button>)}
                      {i.link && <a className="act ib" href={i.link} target="_blank" rel="noreferrer" aria-label="Abrir link"><ExternalLink size={15} /></a>}
                      {i.status !== "cancelada" && itCan(i) && <button className="act ib" title={i.status === "realizada" ? "Marcar como planejada" : "Marcar como realizada"} aria-label="Alternar realizada" onClick={() => toggle(i)}><CheckCircle2 size={16} color={i.status === "realizada" ? "#21865B" : undefined} /></button>}
                      {itCan(i) && <><button className="act ib" aria-label="Editar" onClick={() => setEdit(i)}><Pencil size={15} /></button>
                      <button className="act ib dng" aria-label="Excluir" onClick={() => del(i)}><Trash2 size={15} /></button></>}
                    </div>
                  </div>);
              })}</div>
            </div>);
          })}
      </>}
      {edit && <ItinForm initial={edit} trip={trip} programs={programs} onSave={save} onClose={() => setEdit(null)} />}
      {spend && <ExpenseForm sharedTrip={sharedTrip} initial={spend} trip={trip} programs={programs} title="Registrar gasto da atividade" onSave={saveSpend} onClose={() => setSpend(null)} />}
    </div>
  );
}

// ---------- Despesas ----------
const QUICK = ["Alimentação", "Transporte local", "Passeios e excursões", "Compras e lembranças", "Ingressos", "Outras despesas"];
const quickFor = (t) => { const tr = t.transport || []; const extra = []; if (tr.some((x) => x.startsWith("Carro"))) extra.push("Combustível", "Pedágios"); if (tr.includes("Cruzeiro")) extra.push("Pacotes a bordo", "Excursões em terra"); return [...QUICK.slice(0, 4), ...extra, ...QUICK.slice(4)]; };
const QUICK_L = { "Combustível": "Combustível", "Pedágios": "Pedágio", "Pacotes a bordo": "A bordo", "Excursões em terra": "Excursões", "Alimentação": "Alimentação", "Transporte local": "Transporte", "Passeios e excursões": "Passeios", "Compras e lembranças": "Compras", "Ingressos": "Ingressos", "Outras despesas": "Outros" };

function ExpenseForm({ initial, trip, programs = [], title, onSave, onClose, sharedTrip }) {
  const people = peopleOf(trip);
  const [f, setF] = useState(() => {
    const base = { description: "", category: "Alimentação", amount: "", date: todayISO(), method: "Pix", person: "", place: "", notes: "", status: "paga", shared: false, benefit: null, splitMode: "igual", ...initial };
    base.privateTouched = initial?.private != null;
    if (initial?.private == null) base.private = PRIVATE_CATS.includes(base.category);
    const sp = initial?.splits || [];
    return { ...base, splitPeople: sp.length ? sp.map((x) => x.person) : people, splitValues: Object.fromEntries(sp.map((x) => [x.person, x.amount])) };
  });
  const [e, setE] = useState({}); const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const amt = num(f.amount) || 0;
  const splits = !f.shared || f.private ? [] : f.splitMode === "igual" ? splitEqual(amt, f.splitPeople.filter((p) => people.includes(p) || f.splitPeople.includes(p))) : people.map((p) => ({ person: p, amount: r2(num(f.splitValues[p]) || 0) })).filter((x) => x.amount > 0);
  const splitSum = sum(splits, (x) => x.amount);
  const submit = () => {
    const x = {};
    if (!(amt > 0)) x.amount = "Informe um valor maior que zero.";
    if (!f.date) x.date = "Informe a data.";
    if (f.shared && !f.private && !splits.length) x.split = "Escolha quem participa da divisão.";
    else if (f.shared && !f.private && Math.abs(splitSum - amt) > 0.009) x.split = `A divisão soma ${brl(splitSum)}, mas a despesa é de ${brl(amt)}.`;
    if (f.benefit?.programId && num(f.benefit.full) > 0 && num(f.benefit.full) < amt) x.amount = "O valor pago é maior que o valor sem benefício.";
    setE(x); if (Object.keys(x).length) return;
    const { splitPeople, splitValues, privateTouched, ...rest } = f;
    if (rest.private) rest.shared = false;
    onSave({ ...rest, description: f.description.trim() || f.category, amount: r2(amt), splits, benefit: f.benefit?.programId && num(f.benefit.full) > 0 ? f.benefit : null });
  };
  return (
    <Modal title={title || (initial?.id ? "Detalhes da despesa" : "Nova despesa")} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn pri" onClick={submit}><Check size={16} />Salvar despesa</button></>}>
      <div className="form">
        <Fld label="Descrição" full><Inp value={f.description} onChange={(v) => set("description", v)} /></Fld>
        <BenefitPicker date={f.date} programs={programs} value={f.benefit} onChange={(b) => set("benefit", b)} onPaid={(v) => set("amount", v)} paid={f.amount} paidLabel="valor" />
        <Fld label={f.benefit ? "Valor pago (com benefício)" : "Valor"} err={e.amount}><Money value={f.amount} onChange={(v) => set("amount", v)} /></Fld>
        <Fld label="Data" err={e.date}><Inp type="date" value={f.date} onChange={(v) => set("date", v)} /></Fld>
        <Fld label="Categoria"><CatSel value={f.category} onChange={(v) => setF((p) => ({ ...p, category: v, ...(p.privateTouched ? {} : { private: PRIVATE_CATS.includes(v), shared: PRIVATE_CATS.includes(v) ? false : p.shared }) }))} /></Fld>
        <Fld label="Forma de pagamento"><Sel value={f.method} onChange={(v) => set("method", v)} opts={METHODS} /></Fld>
        <Fld label="Situação" hint="Compra no crédito: marque como Realizada. A fatura não é lançada de novo."><Sel value={f.status} onChange={(v) => set("status", v)} opts={EXP_STATUS} /></Fld>
        <Fld label="Quem pagou"><Sel value={f.person} onChange={(v) => set("person", v)} opts={[["", "Não informado"], ...people.map((p) => [p, p])]} /></Fld>
        <Fld label="Local ou estabelecimento" full><Inp value={f.place} onChange={(v) => set("place", v)} /></Fld>
        {sharedTrip && <div className="full benefit" style={{ background: f.private ? "#FFF9EF" : "#FAFCFC", borderColor: f.private ? "#F1E2C6" : "var(--line)" }}>
          <Toggle checked={!!f.private} onChange={(v) => setF((p) => ({ ...p, private: v, privateTouched: true, shared: v ? false : p.shared }))} label="Despesa privada: só você vê os detalhes" />
          <div className="hint" style={{ marginTop: 4, fontSize: 12, color: "var(--muted)" }}>{f.private ? "Os outros membros veem apenas o valor somado em “Gastos pessoais”, sem descrição, local nem autor. Não entra no acerto de contas." : "Todos os membros da viagem veem esta despesa."}</div>
        </div>}
        {!f.private && <div className="full"><Toggle checked={f.shared} onChange={(v) => set("shared", v)} label="Despesa compartilhada entre os viajantes" /></div>}
        {f.shared && !f.private && (
          <div className="benefit" style={{ background: "#F3F9FB", borderColor: "#D6EAF1" }}>
            <div className="row between" style={{ marginBottom: 10 }}><b style={{ fontSize: 13 }}>Como dividir</b><div className="tabs"><button className={f.splitMode === "igual" ? "on" : ""} onClick={() => set("splitMode", "igual")}>Partes iguais</button><button className={f.splitMode === "valor" ? "on" : ""} onClick={() => set("splitMode", "valor")}>Valores por pessoa</button></div></div>
            <div className="grid" style={{ gap: 8 }}>{people.map((p) => {
              const on = f.splitPeople.includes(p); const part = splits.find((x) => x.person === p);
              return f.splitMode === "igual" ? (
                <div key={p} className="row between" style={{ fontSize: 13.5 }}><Toggle checked={on} onChange={(v) => set("splitPeople", v ? [...f.splitPeople, p] : f.splitPeople.filter((x) => x !== p))} label={p} /><span className="muted">{on && part ? brl(part.amount) : "—"}</span></div>
              ) : (
                <div key={p} style={{ display: "grid", gridTemplateColumns: "1fr 150px", gap: 10, alignItems: "center", fontSize: 13.5 }}><span>{p}</span><Money value={f.splitValues[p] ?? ""} onChange={(v) => set("splitValues", { ...f.splitValues, [p]: v })} /></div>
              );
            })}</div>
            <div className="row between" style={{ marginTop: 10, fontSize: 12.5 }}>
              <span className={e.split ? "" : "muted"} style={{ color: e.split ? "#B33A36" : undefined }}>{e.split || `Divisão: ${brl(splitSum)} de ${brl(amt)}`}</span>
              {f.splitMode === "valor" && amt > 0 && Math.abs(splitSum - amt) > 0.009 && <span style={{ color: "#93600E" }}>{splitSum < amt ? `Faltam ${brl(amt - splitSum)}` : `Excede ${brl(splitSum - amt)}`}</span>}
            </div>
            <p className="note" style={{ marginTop: 8 }}><Info size={14} />O total da despesa entra uma única vez nos consolidados. A divisão serve para o acerto entre viajantes.</p>
          </div>
        )}
        <Fld label="Observação" full><Ta value={f.notes} onChange={(v) => set("notes", v)} /></Fld>
      </div>
    </Modal>
  );
}

function SettlementCard({ exps, people, compact }) {
  const st = settlement(exps, people);
  const anyPayer = st.rows.some((r) => r.paid > 0);
  return (
    <div className="card"><h3><Users size={16} />Acerto entre viajantes<small>{st.transfers.length ? `${st.transfers.length} transferência(s)` : ""}</small></h3>
      {!anyPayer ? <p className="muted" style={{ margin: 0, fontSize: 13 }}>Informe “quem pagou” nas despesas para calcular quanto cada viajante deve aos outros.</p> : <>
        <div className="tblwrap" style={{ marginBottom: 12 }}><table className="tbl"><thead><tr><th>Viajante</th><th className="r">Pagou</th><th className="r">Consumiu</th><th className="r">Saldo</th></tr></thead>
          <tbody>{st.rows.map((r) => <tr key={r.p}><td>{r.p}</td><td className="r">{brl(r.paid)}</td><td className="r">{brl(r.share)}</td><td className="r" style={{ color: r.net > 0.009 ? "var(--green)" : r.net < -0.009 ? "var(--red)" : undefined, fontWeight: 600 }}>{r.net > 0 ? "+" : ""}{brl(r.net)}</td></tr>)}</tbody></table></div>
        {st.transfers.length ? <div className="grid" style={{ gap: 6 }}>{st.transfers.map((t, i) => <div key={i} className="row" style={{ fontSize: 13.5, gap: 8 }}><b>{t.from}</b><ArrowRight size={14} className="muted" /><b>{t.to}</b><span style={{ marginLeft: "auto", fontWeight: 700 }}>{brl(t.amount)}</span></div>)}</div> : <p className="muted" style={{ margin: 0, fontSize: 13 }}>Contas equilibradas: ninguém deve nada.</p>}
        {st.unknown > 0 && !compact && <p className="note" style={{ marginTop: 10 }}><Info size={14} />{brl(st.unknown)} em despesas sem “quem pagou” ficaram fora do acerto.</p>}
      </>}
    </div>
  );
}

function ExpensesPage({ s, trip, m, update, toast, ask, canPlan = true, canAct = true, me = "local", sharedTrip, myTraveler }) {
  const rowCan = (e) => { const mine = !e._by || e._by === me; return canPlan ? !e.private || mine : canAct && mine; };
  const people = peopleOf(trip); const programs = s.programs || [];
  const [qa, setQa] = useState({ cat: "Alimentação", amount: "", desc: "", method: "Pix", person: myTraveler || "" });
  const [edit, setEdit] = useState(null); const [fc, setFc] = useState(""); const [fs, setFs] = useState(""); const [fq, setFq] = useState("");
  const amtRef = useRef(null);
  const add = () => {
    if (!(num(qa.amount) > 0)) { toast("Informe o valor da despesa", "err"); amtRef.current?.focus(); return; }
    const e = { id: uid(), tripId: trip.id, description: qa.desc.trim() || qa.cat, category: qa.cat, amount: r2(qa.amount), date: todayISO(), method: qa.method, person: qa.person, place: "", notes: "", status: qa.method === "Cartão de crédito" ? "realizada" : "paga", shared: false, splits: [], benefit: null, private: PRIVATE_CATS.includes(qa.cat), createdAt: new Date().toISOString() };
    update((x) => withLog({ ...x, expenses: [e, ...x.expenses] }, trip.id, `Despesa: ${e.description} (${brl(e.amount)})`));
    setQa((p) => ({ ...p, amount: "", desc: "" }));
    toast(`${brl(e.amount)} em ${QUICK_L[e.category] || e.category}`, "ok", { label: "Adicionar detalhes", fn: () => setEdit(e) });
  };
  const save = (f) => { if (f.id && s.expenses.some((x) => x.id === f.id)) update((x) => withLog({ ...x, expenses: x.expenses.map((y) => (y.id === f.id ? { ...y, ...f } : y)) }, trip.id, `Despesa editada: ${f.description}`)); else update((x) => withLog({ ...x, expenses: [{ ...f, id: uid(), tripId: trip.id, createdAt: new Date().toISOString() }, ...x.expenses] }, trip.id, `Despesa: ${f.description}`)); toast("Despesa salva"); setEdit(null); };
  const del = (e) => ask({ title: "Excluir despesa", danger: true, cta: "Excluir", message: `Excluir “${e.description}” de ${brl(e.amount)}?`, onConfirm: () => { update((x) => withLog({ ...x, expenses: x.expenses.filter((y) => y.id !== e.id) }, trip.id, `Despesa excluída: ${e.description}`)); toast("Despesa excluída"); } });
  let list = m.exps.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));
  if (fc) list = list.filter((e) => e.category === fc); if (fs) list = list.filter((e) => e.status === fs);
  if (fq) { const t = fq.toLowerCase(); list = list.filter((e) => [e.description, e.place, e.person, e.notes].some((v) => String(v || "").toLowerCase().includes(t))); }
  const today = todayISO(); const todayTotal = sum(m.realExp.filter((e) => e.date === today), (e) => e.amount);
  const sharedTotal = sum(m.realExp.filter((e) => e.shared), (e) => e.amount);
  const exp = () => downloadCSV(`despesas-${slug(trip.name)}.csv`, ["Data", "Descrição", "Categoria", "Valor", "Forma", "Situação", "Quem pagou", "Compartilhada", "Divisão", "Benefício", "Valor sem benefício", "Economia", "Local", "Observação"], list.map((e) => { const ro = ruleOf(programs, e.benefit); return [fdate(e.date), e.description, e.category, brlPlain(e.amount), e.method, EXP_LABEL[e.status], e.person, e.shared ? "Sim" : "Não", (e.splits || []).map((x) => `${x.person}: ${brlPlain(x.amount)}`).join(" | "), ro ? ro.p.name : "", e.benefit ? brlPlain(e.benefit.full) : "", e.benefit ? brlPlain(num(e.benefit.full) - e.amount) : "", e.place, e.notes]; }));
  const stBadge = { paga: "b-green", realizada: "b-blue", pendente: "b-orange", prevista: "", reembolsada: "b-sand" };
  return (
    <div className={`grid ${canAct ? "" : "ro"}`} style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="act qa">
          <div className="row between" style={{ marginBottom: 12 }}><b style={{ fontSize: 15 }}>Lançamento rápido</b><span style={{ fontSize: 12.5, color: "#A7C5CF" }}>Hoje: {brl(todayTotal)}</span></div>
          <div className="row" style={{ gap: 6, marginBottom: 12 }}>{quickFor(trip).map((c) => <button key={c} className={`chip ${qa.cat === c ? "on" : ""}`} onClick={() => setQa({ ...qa, cat: c })}>{QUICK_L[c]}</button>)}</div>
          <Money className="amount" value={qa.amount} onChange={(v) => setQa({ ...qa, amount: v })} ref={amtRef} aria-label="Valor da despesa" onKeyDown={(e) => e.key === "Enter" && add()} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
            <input className="inp" placeholder="Descrição (opcional)" value={qa.desc} onChange={(e) => setQa({ ...qa, desc: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} aria-label="Descrição" />
            <select className="sel" value={qa.person} onChange={(e) => setQa({ ...qa, person: e.target.value })} aria-label="Quem pagou"><option value="">Quem pagou</option>{people.map((p) => <option key={p}>{p}</option>)}</select>
          </div>
          <div className="row" style={{ gap: 6, marginTop: 10 }}>{["Pix", "Cartão de crédito", "Cartão de débito", "Dinheiro"].map((x) => <button key={x} className={`chip ${qa.method === x ? "on" : ""}`} style={{ padding: "6px 11px", fontSize: 12.5 }} onClick={() => setQa({ ...qa, method: x })}>{x.replace("Cartão de ", "")}</button>)}</div>
          <button className="btn pri" style={{ width: "100%", justifyContent: "center", marginTop: 14, padding: "12px", fontSize: 14.5, background: "#75D8C3", borderColor: "#75D8C3", color: "#103140" }} onClick={add}><Plus size={17} />Registrar despesa</button>
          <div style={{ fontSize: 12, color: "#A7C5CF", marginTop: 10 }}>Usou um clube de desconto ou vai dividir a conta? Use “Despesa detalhada”.</div>
        </div>
        <div className="strip" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div><div className="kl">Total realizado</div><div className="kv">{brl(m.expenseTotal)}</div><div className="kh">{m.realExp.length} lançamento(s)</div></div>
          <div><div className="kl">Pago</div><div className="kv" style={{ color: "var(--green)" }}>{brl(sum(m.exps.filter((e) => e.status === "paga"), (e) => e.amount))}</div></div>
          <div><div className="kl">A pagar (fatura e pendentes)</div><div className="kv">{brl(sum(m.exps.filter((e) => ["realizada", "pendente"].includes(e.status)), (e) => e.amount))}</div></div>
          <div><div className="kl">Reembolsado</div><div className="kv">{brl(sum(m.exps.filter((e) => e.status === "reembolsada"), (e) => e.amount))}</div><div className="kh">Fora dos totais</div></div>
          <div><div className="kl">Compartilhadas</div><div className="kv">{brl(sharedTotal)}</div><div className="kh">Contadas uma única vez</div></div>
          {m.pvReal > 0 && <div style={{ gridColumn: "1/-1" }}><div className="kl"><Lock size={13} />Gastos pessoais de outros membros</div><div className="kv" style={{ fontSize: 17 }}>{brl(m.pvReal)}</div><div className="kh">Só o total entra no orçamento; os detalhes são privados de quem lançou</div></div>}
          <div><div className="kl"><Gift size={13} />Economia com benefícios</div><div className="kv" style={{ color: "var(--green)" }}>{brl(m.savBenefit)}</div><div className="kh">Valor sem benefício − pago</div></div>
        </div>
      </div>
      {m.realExp.some((e) => e.person) && <SettlementCard exps={m.exps} people={people} />}
      <div className="row">
        <div className="searchbox" style={{ width: 240 }}><Search size={15} /><input className="inp" placeholder="Buscar despesa" value={fq} onChange={(e) => setFq(e.target.value)} aria-label="Buscar despesa" /></div>
        <Sel value={fc} onChange={setFc} style={{ width: 210 }} aria-label="Categoria" opts={[["", "Todas as categorias"], ...CATS.map((c) => [c, c])]} />
        <Sel value={fs} onChange={setFs} style={{ width: 170 }} aria-label="Situação" opts={[["", "Todas as situações"], ...EXP_STATUS.map(([k]) => [k, EXP_LABEL[k]])]} />
        <span style={{ flex: 1 }} /><button className="act btn" onClick={() => setEdit({})}><Plus size={15} />Despesa detalhada</button><button className="btn" onClick={exp} disabled={!list.length}><Download size={15} />Exportar CSV</button>
      </div>
      {!m.exps.length ? <div className="card"><Empty icon={Receipt} title="Nenhuma despesa registrada" text="Use o lançamento rápido acima durante a viagem: categoria, valor e pronto. Os detalhes podem ser completados depois." /></div> : (
        <div className="tblwrap"><table className="tbl"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Forma</th><th className="r">Valor</th><th>Situação</th><th></th></tr></thead>
          <tbody>{list.map((e) => { const ro = ruleOf(programs, e.benefit); const sv = e.benefit ? r2(num(e.benefit.full) - e.amount) : 0; return <tr key={e.id} style={{ opacity: e.status === "reembolsada" ? 0.6 : 1 }}>
            <td>{fdate(e.date)}</td>
            <td><b style={{ fontWeight: 600 }}>{e.description}</b>{e.private && sharedTrip && <span className="badge b-sand" style={{ marginLeft: 6 }} title="Só você vê os detalhes"><Lock size={11} />Privada</span>}{e.shared && <span className="badge" style={{ marginLeft: 6 }} title={(e.splits || []).map((x) => `${x.person}: ${brl(x.amount)}`).join(", ")}><Users size={11} />Dividida{e.splits?.length ? ` por ${e.splits.length}` : ""}</span>}{e.benefit && <span className="badge b-sand" style={{ marginLeft: 6 }}><Gift size={11} />{ro ? ro.p.name : "Benefício"}{sv > 0 ? `, −${brl(sv)}` : ""}</span>}<div className="muted" style={{ fontSize: 12 }}>{[e.place, e.person && `pago por ${e.person}`].filter(Boolean).join(", ")}</div></td>
            <td><span className="dot" style={{ background: catColor(e.category), marginRight: 7 }} />{e.category}</td><td>{e.method}</td><td className="r"><b>{brl(e.amount)}</b></td>
            <td><span className={`badge ${stBadge[e.status]}`}>{EXP_LABEL[e.status]}</span></td>
            <td className="r" style={{ whiteSpace: "nowrap" }}>{rowCan(e) ? <><button className="ib" aria-label="Editar" onClick={() => setEdit(e)}><Pencil size={15} /></button><button className="ib dng" aria-label="Excluir" onClick={() => del(e)}><Trash2 size={15} /></button></> : <span className="muted" title="Lançada por outro membro" style={{ fontSize: 12 }}>outro membro</span>}</td>
          </tr>; })}{!list.length && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 26 }}>Nenhuma despesa com esses filtros.</td></tr>}</tbody>
        </table></div>)}
      {edit && <ExpenseForm sharedTrip={sharedTrip} initial={edit} trip={trip} programs={programs} onSave={save} onClose={() => setEdit(null)} />}
    </div>
  );
}

// ---------- Benefícios e fidelidade ----------
const PROGRAM_TEMPLATES = {
  prime: {
    name: "Prime Gourmet", type: "clube", partner: "Clube de benefícios 2x1", costModel: "anual", fee: "", memberships: [{ holder: "", fee: "", startDate: "", endDate: "" }],
    cities: "", link: "", conditions: "Confirme no app, antes de ir, se o estabelecimento participa e em quais dias e horários o benefício vale.",
    notes: "Modelo criado pelo app. Ajuste o valor pago e as regras conforme o seu plano.",
    rules: [
      { label: "2x1 em restaurantes (paga o prato de maior valor)", kind: "2x1", value: "", area: "Restaurantes" },
      { label: "2x1 em hotéis", kind: "2x1", value: "", area: "Hotéis" },
      { label: "2x1 em ingressos e atrações", kind: "2x1", value: "", area: "Ingressos" },
    ],
  },
  role: {
    name: "Clube do Rolê", type: "clube", partner: "App de ofertas em locais", costModel: "gratis", fee: 0,
    cities: "", link: "", conditions: "Ofertas variam por estabelecimento. Confirme a oferta no app antes de usar.",
    notes: "Modelo criado pelo app com as ofertas que você descreveu. Ajuste conforme o que aparecer no app.",
    rules: [
      { label: "Prato para dois com 50% de desconto", kind: "pct", value: 50, area: "Restaurantes" },
      { label: "Compre 1, leve 2", kind: "2x1", value: "", area: "Outros" },
    ],
  },
};

function ProgramForm({ initial, onSave, onClose, maxMemberships = null, onLimit }) {
  const [f, setF] = useState(() => ({ name: "", type: "clube", partner: "", costModel: "gratis", fee: "", startDate: "", endDate: "", cities: "", link: "", conditions: "", notes: "", pointsBalance: "", pointsUpdated: "", pointsExpiry: "", refPerThousand: "", refPremise: "", ...initial, rules: (initial?.rules || []).map((r) => ({ id: r.id || uid(), ...r })), memberships: initial?.id || initial?.memberships?.length ? membershipsOf(initial || {}).map((x) => ({ holder: "", fee: "", startDate: "", endDate: "", ...x, id: x.id && x.id !== "m0" ? x.id : uid() })) : [{ id: uid(), holder: "", fee: initial?.fee ?? "", startDate: "", endDate: "" }] }));
  const setMem = (id, patch) => set("memberships", f.memberships.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const addMem = () => { if (maxMemberships != null && f.memberships.length >= maxMemberships) { onLimit?.(); return; } set("memberships", [...f.memberships, { id: uid(), holder: "", fee: f.memberships[0]?.fee ?? "", startDate: f.memberships[0]?.startDate || "", endDate: f.memberships[0]?.endDate || "" }]); };
  const [e, setE] = useState({}); const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setRule = (id, patch) => set("rules", f.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const isPts = f.type === "milhas" || f.type === "cartao";
  const submit = () => {
    const x = {};
    if (!f.name.trim()) x.name = "Informe o nome do programa.";
    if (!f.memberships.length) x.mem = "Cadastre pelo menos uma adesão.";
    else if (f.costModel !== "gratis" && f.memberships.some((m) => !(num(m.fee) > 0))) x.mem = "Informe o valor de cada adesão (ou marque o custo como gratuito).";
    else if (f.memberships.some((m) => m.startDate && m.endDate && m.endDate < m.startDate)) x.mem = "Há uma adesão com fim de vigência anterior ao início.";
    if (f.rules.some((r) => !r.label.trim())) x.rules = "Dê um nome a cada benefício.";
    if (f.rules.some((r) => r.kind === "pct" && !(num(r.value) > 0 && num(r.value) <= 100))) x.rules = "O desconto percentual precisa estar entre 1% e 100%.";
    if (num(f.refPerThousand) != null && !f.refPremise.trim()) x.refPremise = "Explique de onde vem esse valor (ex.: preço médio de compra de milhas).";
    if (Object.keys(x).length) { setE(x); return; }
    const mem = f.memberships.map((m) => ({ ...m, holder: String(m.holder || "").trim(), fee: f.costModel === "gratis" ? 0 : r2(m.fee) }));
    const starts = mem.map((m) => m.startDate).filter(Boolean).sort(), ends = mem.map((m) => m.endDate).filter(Boolean).sort();
    setE({}); onSave({ ...f, memberships: mem, fee: sum(mem, (m) => m.fee), startDate: mem.every((m) => m.startDate) ? starts[0] : "", endDate: mem.every((m) => m.endDate) ? ends[ends.length - 1] : "" });
  };
  return (
    <Modal wide title={initial?.id ? "Editar programa" : "Novo programa de benefícios"} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn pri" onClick={submit}><Check size={16} />Salvar programa</button></>}>
      <div className="form form3">
        <div className="sec">Programa</div>
        <Fld label="Nome" err={e.name}><Inp value={f.name} onChange={(v) => set("name", v)} autoFocus placeholder="Ex.: Prime Gourmet, Smiles" /></Fld>
        <Fld label="Tipo"><Sel value={f.type} onChange={(v) => set("type", v)} opts={PROG_TYPES} /></Fld>
        <Fld label="Parceiro ou emissor"><Inp value={f.partner} onChange={(v) => set("partner", v)} placeholder="Companhia aérea, banco, clube" /></Fld>
        <Fld label="Custo"><Sel value={f.costModel} onChange={(v) => set("costModel", v)} opts={COST_MODELS} /></Fld>
        <Fld label="Cidades atendidas" hint="Separadas por vírgula. Usado para avisar se o destino consta."><Inp value={f.cities} onChange={(v) => set("cities", v)} /></Fld>
        <Fld label="Site ou app"><Inp value={f.link} onChange={(v) => set("link", v)} placeholder="https://" /></Fld>
        <div className="sec">Adesões {e.mem && <span style={{ color: "#B33A36", fontWeight: 500, marginLeft: 8 }}>{e.mem}</span>}</div>
        <div className="full grid" style={{ gap: 8 }}>
          <div className="memrow memhead hide-m"><span>Titular</span><span>{f.costModel === "gratis" ? "" : f.costModel === "mensal" ? "Valor mensal" : f.costModel === "anual" ? "Anuidade" : "Valor pago"}</span><span>Início</span><span>Fim</span><span /></div>
          {f.memberships.map((m, i) => (
            <div key={m.id} className="memrow">
              <input className="inp" placeholder={`Titular ${i + 1} (ex.: Alex)`} value={m.holder || ""} onChange={(ev) => setMem(m.id, { holder: ev.target.value })} aria-label="Titular da adesão" />
              {f.costModel === "gratis" ? <span className="muted" style={{ fontSize: 12.5, alignSelf: "center" }}>Gratuita</span> : <Money value={m.fee} onChange={(v) => setMem(m.id, { fee: v })} aria-label="Valor da adesão" />}
              <input className="inp" type="date" value={m.startDate || ""} onChange={(ev) => setMem(m.id, { startDate: ev.target.value })} aria-label="Início da vigência" />
              <input className="inp" type="date" value={m.endDate || ""} onChange={(ev) => setMem(m.id, { endDate: ev.target.value })} aria-label="Fim da vigência" />
              <button className="ib dng" aria-label="Remover adesão" disabled={f.memberships.length === 1} onClick={() => set("memberships", f.memberships.filter((x) => x.id !== m.id))}><Trash2 size={15} /></button>
            </div>))}
          <div className="row"><button className="btn sm" onClick={addMem}>{maxMemberships != null && f.memberships.length >= maxMemberships ? <Lock size={13} /> : <Plus size={14} />}Adicionar adesão</button>
            <span className="muted" style={{ fontSize: 12.5 }}>{f.memberships.length > 1 ? `${f.memberships.length} adesões${f.costModel !== "gratis" ? `, total ${brl(sum(f.memberships, (m) => m.fee))}` : ""}. ` : ""}Em clubes “compre 1, leve 2”, cada adesão cobre um par de pessoas na mesma conta.{f.name.toLowerCase().includes("prime") ? " Você comentou uma média de R$ 150 a R$ 200 por ano." : ""}</span></div>
        </div>
        <div className="sec">Benefícios {e.rules && <span style={{ color: "#B33A36", fontWeight: 500, marginLeft: 8 }}>{e.rules}</span>}</div>
        <div className="full grid" style={{ gap: 8 }}>
          {f.rules.map((r) => (
            <div key={r.id} className="rulerow">
              <input className="inp" placeholder="Ex.: 2x1 em restaurantes" value={r.label} onChange={(ev) => setRule(r.id, { label: ev.target.value })} aria-label="Nome do benefício" />
              <select className="sel" value={r.kind} onChange={(ev) => setRule(r.id, { kind: ev.target.value })} aria-label="Tipo de benefício">{RULE_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              {r.kind === "pct" || r.kind === "fixed" ? (r.kind === "pct" ? <input className="inp" type="number" min="1" max="100" placeholder="%" value={r.value ?? ""} onChange={(ev) => setRule(r.id, { value: ev.target.value })} aria-label="Percentual" /> : <Money value={r.value} onChange={(v) => setRule(r.id, { value: v })} aria-label="Desconto em reais" />) : <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>—</span>}
              <select className="sel" value={r.area || "Outros"} onChange={(ev) => setRule(r.id, { area: ev.target.value })} aria-label="Onde vale">{RULE_AREAS.map((a) => <option key={a}>{a}</option>)}</select>
              <button className="ib dng" aria-label="Remover benefício" onClick={() => set("rules", f.rules.filter((x) => x.id !== r.id))}><Trash2 size={15} /></button>
            </div>
          ))}
          <div><button className="btn sm" onClick={() => set("rules", [...f.rules, { id: uid(), label: "", kind: "2x1", value: "", area: "Restaurantes" }])}><Plus size={14} />Adicionar benefício</button></div>
        </div>
        {isPts || f.pointsBalance !== "" ? <>
          <div className="sec">Pontos e milhas</div>
          <Fld label="Saldo de pontos"><Inp type="number" min="0" value={f.pointsBalance} onChange={(v) => set("pointsBalance", v)} /></Fld>
          <Fld label="Saldo atualizado em"><Inp type="date" value={f.pointsUpdated} onChange={(v) => set("pointsUpdated", v)} /></Fld>
          <Fld label="Pontos vencem em"><Inp type="date" value={f.pointsExpiry} onChange={(v) => set("pointsExpiry", v)} /></Fld>
          <Fld label="Valor de referência por 1.000 pontos" hint="Opcional. Sem ele, pontos não recebem valor em reais."><Money value={f.refPerThousand} onChange={(v) => set("refPerThousand", v)} /></Fld>
          <Fld label="Premissa do valor de referência" err={e.refPremise} full={false}><Inp value={f.refPremise} onChange={(v) => set("refPremise", v)} placeholder="Ex.: preço pago na última compra de milhas" /></Fld>
        </> : <div className="full"><button className="btn sm ghost" onClick={() => set("pointsBalance", 0)}><Coins size={14} />Este programa também tem saldo de pontos</button></div>}
        <div className="sec">Condições</div>
        <Fld label="Condições e restrições" full><Ta value={f.conditions} onChange={(v) => set("conditions", v)} /></Fld>
        <Fld label="Observações" full><Ta value={f.notes} onChange={(v) => set("notes", v)} /></Fld>
        <div className="note full"><Info size={14} />Não informe senhas nem números de cartão. O app guarda apenas as regras e o saldo que você digitar.</div>
      </div>
    </Modal>
  );
}

function AllocModal({ p, trip, existing, onClose, onConfirm }) {
  const d = tripDays(trip); const fee = feeOf(p);
  const full = p.costModel === "mensal" ? r2(fee * 12) : fee;
  const prop = p.costModel === "mensal" ? r2(fee * Math.max(1, Math.ceil((d?.days || 1) / 30))) : d ? r2((fee * d.days) / 365) : null;
  const [mode, setMode] = useState(prop != null ? "prop" : "full"); const [manual, setManual] = useState("");
  const value = mode === "full" ? full : mode === "prop" ? prop : num(manual);
  const label = mode === "full" ? "valor integral" : mode === "prop" ? (p.costModel === "mensal" ? "meses da viagem" : `${d?.days} dias de 365`) : "valor definido";
  return (
    <Modal title={`Lançar custo de ${p.name} nesta viagem`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn pri" disabled={!(value > 0)} onClick={() => onConfirm(value, label)}><Check size={16} />{existing ? "Atualizar item" : "Lançar no planejamento"}</button></>}>
      <p style={{ marginTop: 0 }}>A assinatura vale para o ano inteiro, então você decide quanto dela pesa nesta viagem.</p>
      <div className="grid" style={{ gap: 8 }}>
        <label className="pill-tog"><input type="radio" checked={mode === "full"} onChange={() => setMode("full")} />Valor integral: <b>{brl(full)}</b></label>
        {prop != null && <label className="pill-tog"><input type="radio" checked={mode === "prop"} onChange={() => setMode("prop")} />Proporcional ({label}): <b>{brl(prop)}</b></label>}
        <label className="pill-tog"><input type="radio" checked={mode === "manual"} onChange={() => setMode("manual")} />Outro valor</label>
        {mode === "manual" && <div style={{ maxWidth: 220 }}><Money value={manual} onChange={setManual} /></div>}
      </div>
      {existing && <div className="alert orange" style={{ marginTop: 14 }}><Info size={15} color="#E8A23A" />Já existe um item desta assinatura no planejamento ({brl(existing.contracted)}). Ele será atualizado, sem duplicar.</div>}
      <p className="note" style={{ marginTop: 12 }}><Info size={14} />O item entra em “Outras despesas” como contratado. Se a assinatura já foi paga, use “Agendar” no Planejamento e marque “Já foi pago à vista”.</p>
    </Modal>
  );
}

const coversDest = (p, t) => {
  if (!p.cities?.trim()) return null;
  const n = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const list = n(p.cities);
  const targets = [t.destination, ...String(t.cities || "").split(",")].map((x) => n(String(x || "").split(/[–-]/)[0])).filter((x) => x.length > 2);
  return targets.some((x) => list.includes(x));
};

function ProgramCard({ s, p, trip, onEdit, onDel, onAlloc }) {
  const all = programStats(s, p); const here = trip ? programStats(s, p, trip.id) : null;
  const allocItem = trip ? s.items.find((i) => i.tripId === trip.id && i.programId === p.id) : null;
  const cov = trip ? coversDest(p, trip) : null;
  const avgUse = all.uses ? all.realized / all.uses : null;
  const usesLeft = avgUse && all.left > 0 ? Math.ceil(all.left / avgUse) : null;
  const paidModel = p.costModel !== "gratis";
  const mems = membershipsOf(p);
  const expired = mems.every((x) => x.endDate && x.endDate < todayISO());
  return (
    <div className="card prog-card">
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}><span className="badge b-sand">{PROG_LABEL[p.type]}</span><span className={`badge ${paidModel ? "" : "b-green"}`}>{paidModel ? `${brl(feeOf(p))}${p.costModel === "mensal" ? "/mês" : p.costModel === "anual" ? "/ano" : ""}` : "Gratuito"}</span>{mems.length > 1 && <span className="badge b-blue">{mems.length} adesões</span>}{expired && <span className="badge b-red">Vigência encerrada</span>}</div>
          <h3 className="serif" style={{ fontSize: 20, fontWeight: 400, margin: "10px 0 2px" }}>{p.name}</h3>
          <div className="muted" style={{ fontSize: 12.5 }}>{p.partner}{mems.length > 1 ? `${p.partner ? ". " : ""}Titulares: ${mems.map((x, i) => x.holder || `adesão ${i + 1}`).join(", ")}` : p.startDate || p.endDate ? `${p.partner ? ". " : ""}Vigência ${fdate(p.startDate)} a ${fdate(p.endDate)}` : ""}</div>
        </div>
        <div className="row" style={{ gap: 2, flexWrap: "nowrap" }}>
          {p.link && <a className="ib" href={p.link} target="_blank" rel="noreferrer" aria-label="Abrir site"><ExternalLink size={15} /></a>}
          <button className="ib" aria-label="Editar" onClick={onEdit}><Pencil size={15} /></button>
          <button className="ib dng" aria-label="Excluir" onClick={onDel}><Trash2 size={15} /></button>
        </div>
      </div>
      {(p.rules || []).length > 0 && <div className="row" style={{ gap: 5, marginTop: 12 }}>{p.rules.map((r) => <span key={r.id} className="badge b-blue">{r.label}</span>)}</div>}
      {p.pointsBalance !== "" && p.pointsBalance != null && <div className="row" style={{ marginTop: 10, fontSize: 13, gap: 14 }}><span><Coins size={13} style={{ verticalAlign: -2 }} /> {Number(p.pointsBalance).toLocaleString("pt-BR")} pontos</span>{p.pointsUpdated && <span className="muted">em {fdate(p.pointsUpdated)}</span>}{p.pointsExpiry && <span style={{ color: diffDays(todayISO(), p.pointsExpiry) <= 60 ? "#93600E" : undefined }}>vencem em {fdate(p.pointsExpiry)}</span>}</div>}
      <div className="minis">
        <div><span>Economia realizada</span><b style={{ color: "var(--green)" }}>{brl(all.realized)}</b><small>{all.uses} uso(s)</small></div>
        <div><span>Economia prevista</span><b>{brl(all.planned)}</b><small>{all.plannedUses} no roteiro</small></div>
        <div><span>{paidModel ? "Resultado líquido" : "Custo"}</span><b style={{ color: paidModel ? (all.net >= 0 ? "var(--green)" : "var(--red)") : undefined }}>{paidModel ? `${all.net >= 0 ? "+" : ""}${brl(all.net)}` : "R$ 0,00"}</b><small>{paidModel ? `custo anual ${brl(all.yearFee)}` : "sem custo"}</small></div>
      </div>
      {paidModel && all.yearFee > 0 && <div style={{ marginTop: 12 }}>
        <div className="row between" style={{ fontSize: 12.5, marginBottom: 5 }}><span className="muted">{all.realized >= all.yearFee ? "A assinatura já se pagou" : `Faltam ${brl(all.yearFee - all.realized)} para compensar`}{usesLeft ? `, cerca de ${usesLeft} uso(s) na média atual` : ""}</span><b>{fpct(Math.min(100, pct(all.realized, all.yearFee)))}</b></div>
        <div className="prog" style={{ position: "relative" }}><div style={{ width: `${Math.min(100, pct(all.realized, all.yearFee))}%`, background: "var(--green)" }} /><div style={{ position: "absolute", left: `${Math.min(100, pct(all.realized, all.yearFee))}%`, top: 0, height: "100%", width: `${Math.max(0, Math.min(100 - pct(all.realized, all.yearFee), pct(all.planned, all.yearFee)))}%`, background: "#A7E3D6" }} /></div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Verde: realizada. Claro: prevista no roteiro.</div>
      </div>}
      {trip && <div className="prog-trip">
        <div className="row between" style={{ fontSize: 13 }}><span>Em <b>{trip.name}</b>: {brl(here.realized)} realizada, {brl(here.planned)} prevista</span>
          {paidModel && <button className="btn sm" onClick={onAlloc}>{allocItem ? `Custo lançado: ${brl(allocItem.contracted)}` : "Lançar custo na viagem"}</button>}</div>
        {cov != null && <div className="note" style={{ marginTop: 6, color: cov ? "var(--green)" : "#93600E" }}>{cov ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}{cov ? "O destino consta nas cidades informadas." : "O destino não consta nas cidades informadas. Confirme no app."}</div>}
      </div>}
      {p.conditions && <p className="note" style={{ marginTop: 10 }}><Info size={14} />{p.conditions}</p>}
    </div>
  );
}

function RedemptionSim({ programs, trip, onSave }) {
  const [f, setF] = useState({ description: "", programId: "", cash: "", points: "", fees: "", mixPoints: "", mixCash: "", mixFees: "" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const prog = programs.find((p) => p.id === f.programId);
  const ref = num(prog?.refPerThousand); const bal = prog && prog.pointsBalance !== "" ? num(prog.pointsBalance) : null;
  const cash = num(f.cash), pts = num(f.points), fees = num(f.fees) || 0, mp = num(f.mixPoints), mc = num(f.mixCash), mf = num(f.mixFees) || 0;
  const opts = [];
  if (cash != null) opts.push({ k: "dinheiro", l: "Só dinheiro", outlay: cash, pts: 0 });
  if (pts) opts.push({ k: "pontos", l: "Só pontos", outlay: fees, pts });
  if (mp && mc != null) opts.push({ k: "misto", l: "Pontos + dinheiro", outlay: r2(mc + mf), pts: mp });
  const rows = opts.map((o) => ({ ...o, saving: cash != null ? r2(cash - o.outlay) : null, vpm: o.pts && cash != null ? r2(((cash - o.outlay) / o.pts) * 1000) : null, eff: ref != null ? r2(o.outlay + (o.pts / 1000) * ref) : null, short: bal != null && o.pts > bal }));
  const best = ref != null && rows.length > 1 ? rows.reduce((a, b) => (b.eff < a.eff ? b : a)) : null;
  const canSave = f.description.trim() && cash != null && rows.length > 1;
  return (
    <div className="card"><h3><Calculator size={16} />Dinheiro, pontos ou os dois?</h3>
      <div className="form form3">
        <Fld label="O que você vai comprar" full={false}><Inp value={f.description} onChange={(v) => set("description", v)} placeholder="Ex.: passagens ida e volta" /></Fld>
        <Fld label="Programa"><Sel value={f.programId} onChange={(v) => set("programId", v)} opts={[["", "Nenhum / outro"], ...programs.map((p) => [p.id, p.name])]} /></Fld>
        <Fld label="Preço em dinheiro"><Money value={f.cash} onChange={(v) => set("cash", v)} /></Fld>
        <Fld label="Pontos no resgate" hint={bal != null ? `Saldo: ${bal.toLocaleString("pt-BR")} pontos` : ""}><Inp type="number" min="0" value={f.points} onChange={(v) => set("points", v)} /></Fld>
        <Fld label="Taxas do resgate"><Money value={f.fees} onChange={(v) => set("fees", v)} /></Fld>
        <div />
        <Fld label="Misto: pontos"><Inp type="number" min="0" value={f.mixPoints} onChange={(v) => set("mixPoints", v)} /></Fld>
        <Fld label="Misto: dinheiro"><Money value={f.mixCash} onChange={(v) => set("mixCash", v)} /></Fld>
        <Fld label="Misto: taxas"><Money value={f.mixFees} onChange={(v) => set("mixFees", v)} /></Fld>
      </div>
      {rows.length > 0 && <div className="tblwrap" style={{ marginTop: 16 }}><table className="tbl"><thead><tr><th>Alternativa</th><th className="r">Desembolso</th><th className="r">Pontos</th><th className="r">Economia de caixa</th><th className="r">Valor obtido por 1.000 pts</th><th className="r">Custo efetivo</th><th></th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.k} style={best?.k === r.k ? { background: "#F1FAF6" } : undefined}><td><b style={{ fontWeight: 600 }}>{r.l}</b>{best?.k === r.k && <span className="badge b-green" style={{ marginLeft: 6 }}>Menor custo efetivo</span>}{r.short && <span className="badge b-red" style={{ marginLeft: 6 }}>Saldo insuficiente</span>}</td><td className="r">{brl(r.outlay)}</td><td className="r">{r.pts ? r.pts.toLocaleString("pt-BR") : "—"}</td><td className="r" style={{ color: r.saving > 0 ? "var(--green)" : undefined }}>{r.saving != null ? brl(r.saving) : "—"}</td><td className="r">{r.vpm != null ? brl(r.vpm) : "—"}</td><td className="r">{r.eff != null ? brl(r.eff) : <span className="na">sem premissa</span>}</td>
          <td className="r">{canSave && r.k !== "dinheiro" && <button className="btn sm" onClick={() => { onSave({ description: f.description.trim(), programId: f.programId, programName: prog?.name || "", cash, choice: r.k, choiceLabel: r.l, outlay: r.outlay, pointsUsed: r.pts, cashSaving: r.saving, vpm: r.vpm }); setF({ description: "", programId: f.programId, cash: "", points: "", fees: "", mixPoints: "", mixCash: "", mixFees: "" }); }}>Salvar opção</button>}</td></tr>)}</tbody></table></div>}
      <p className="note" style={{ marginTop: 12 }}><Info size={14} />{ref != null ? `Premissa do custo efetivo: 1.000 pontos de ${prog.name} valem ${brl(ref)} (${prog.refPremise}).` : "Sem valor de referência para os pontos, o custo efetivo não é calculado: pontos não recebem valor em reais automaticamente. Cadastre uma premissa no programa para comparar."} “Valor obtido por 1.000 pts” = (preço em dinheiro − desembolso) ÷ pontos × 1.000.</p>
    </div>
  );
}

function BenefitsPage({ s, trip, m, update, toast, ask, plan, guard = () => true }) {
  const programs = s.programs || [];
  const [tab, setTab] = useState("programas"); const [edit, setEdit] = useState(null); const [alloc, setAlloc] = useState(null);
  const save = (f) => {
    const rules = (f.rules || []).map((r) => ({ ...r, id: r.id || uid(), label: r.label.trim() }));
    if (f.id) update((x) => withLog({ ...x, programs: x.programs.map((p) => (p.id === f.id ? { ...p, ...f, rules } : p)) }, null, `Programa editado: ${f.name}`));
    else update((x) => withLog({ ...x, programs: [...(x.programs || []), { ...f, rules, id: uid(), createdAt: new Date().toISOString() }] }, null, `Programa cadastrado: ${f.name}`));
    toast(f.id ? "Programa atualizado" : "Programa cadastrado"); setEdit(null);
  };
  const del = (p) => ask({ title: "Excluir programa", danger: true, cta: "Excluir programa", message: `Excluir ${p.name}? Despesas e atividades que usaram o benefício mantêm o valor e a economia registrados, mas deixam de exibir o nome do programa.`, onConfirm: () => { update((x) => withLog({ ...x, programs: x.programs.filter((y) => y.id !== p.id) }, null, `Programa excluído: ${p.name}`)); toast("Programa excluído"); } });
  const doAlloc = (value, label) => {
    const p = alloc;
    update((x) => {
      const ex = x.items.find((i) => i.tripId === trip.id && i.programId === p.id);
      const desc = `Assinatura ${p.name} (${label})`;
      const items = ex ? x.items.map((i) => (i.id === ex.id ? { ...i, description: desc, estimated: value, contracted: value } : i)) : [...x.items, { id: uid(), tripId: trip.id, programId: p.id, description: desc, category: "Outras despesas", estimated: value, contracted: value, dueDate: p.startDate || "", method: "", responsible: "", notes: "Custo de programa de benefícios alocado à viagem", createdAt: new Date().toISOString() }];
      return withLog({ ...x, items }, trip.id, `Custo de ${p.name} lançado na viagem: ${brl(value)}`);
    });
    toast("Custo lançado no planejamento"); setAlloc(null);
  };
  const reds = (s.redemptions || []).filter((r) => trip && r.tripId === trip.id);
  const saveRed = (r) => { update((x) => withLog({ ...x, redemptions: [...(x.redemptions || []), { ...r, id: uid(), tripId: trip.id, used: false, createdAt: new Date().toISOString() }] }, trip.id, `Simulação de resgate salva: ${r.description}`)); toast("Opção salva. Marque como utilizada quando fizer o resgate."); };
  const toggleRed = (r) => update((x) => withLog({ ...x, redemptions: x.redemptions.map((y) => (y.id === r.id ? { ...y, used: !y.used } : y)) }, trip.id, `${r.used ? "Resgate desmarcado" : "Resgate utilizado"}: ${r.description}`));
  const delRed = (r) => ask({ title: "Excluir simulação", danger: true, cta: "Excluir", message: `Excluir a simulação “${r.description}”?`, onConfirm: () => update((x) => ({ ...x, redemptions: x.redemptions.filter((y) => y.id !== r.id) })) });
  const hasTpl = (k) => programs.some((p) => p.name.toLowerCase() === PROGRAM_TEMPLATES[k].name.toLowerCase());
  const tot = programs.reduce((a, p) => { const st = programStats(s, p); return { realized: a.realized + st.realized, planned: a.planned + st.planned, fee: a.fee + st.yearFee }; }, { realized: 0, planned: 0, fee: 0 });
  const ptsPrograms = programs.filter((p) => p.pointsBalance !== "" && p.pointsBalance != null);
  const usedByProg = {}; (s.redemptions || []).filter((r) => r.used).forEach((r) => (usedByProg[r.programId] = (usedByProg[r.programId] || 0) + (r.pointsUsed || 0)));
  return (
    <div className="grid">
      <div className="row between">
        <div className="tabs"><button className={tab === "programas" ? "on" : ""} onClick={() => setTab("programas")}>Clubes e programas ({programs.length})</button><button className={tab === "pontos" ? "on" : ""} onClick={() => setTab("pontos")}>Pontos e milhas</button></div>
        <div className="row">
          {!hasTpl("prime") && <button className="btn" onClick={() => guard("programs", programs.length) && setEdit({ ...PROGRAM_TEMPLATES.prime })}><Gift size={15} />Prime Gourmet</button>}
          {!hasTpl("role") && <button className="btn" onClick={() => guard("programs", programs.length) && setEdit({ ...PROGRAM_TEMPLATES.role })}><Gift size={15} />Clube do Rolê</button>}
          <button className="btn pri" onClick={() => guard("programs", programs.length) && setEdit({})}><Plus size={16} />Novo programa</button>
        </div>
      </div>
      {tab === "programas" ? (programs.length === 0 ? (
        <div className="card"><Empty icon={Gift} title="Seus clubes de desconto e programas de pontos" text="Cadastre clubes como o Prime Gourmet e o Clube do Rolê, escolha o benefício ao planejar um restaurante ou passeio, e acompanhe quanto cada programa já economizou e se a anuidade se pagou.">
          <button className="btn pri" onClick={() => guard("programs", programs.length) && setEdit({ ...PROGRAM_TEMPLATES.prime })}><Gift size={16} />Começar pelo Prime Gourmet</button>
          <button className="btn" onClick={() => guard("programs", programs.length) && setEdit({ ...PROGRAM_TEMPLATES.role })}>Começar pelo Clube do Rolê</button>
        </Empty></div>
      ) : <>
        <div className="strip" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
          <div><div className="kl">Economia realizada</div><div className="kv" style={{ color: "var(--green)" }}>{brl(tot.realized)}</div><div className="kh">Todas as viagens, dentro da vigência</div></div>
          <div><div className="kl">Economia prevista</div><div className="kv">{brl(tot.planned)}</div><div className="kh">Atividades ainda sem gasto lançado</div></div>
          <div><div className="kl">Custo anual dos programas</div><div className="kv">{brl(tot.fee)}</div></div>
          <div><div className="kl">Resultado líquido</div><div className="kv" style={{ color: tot.realized - tot.fee >= 0 ? "var(--green)" : "var(--red)" }}>{brl(tot.realized - tot.fee)}</div><div className="kh">Realizada − custo anual</div></div>
        </div>
        <div className="grid g2" style={{ alignItems: "start" }}>{programs.map((p) => <ProgramCard key={p.id} s={s} p={p} trip={trip} onEdit={() => setEdit(p)} onDel={() => del(p)} onAlloc={() => setAlloc(p)} />)}</div>
        <p className="note"><Info size={14} />A economia é sempre “valor sem benefício − valor pago”, informada por você em cada atividade ou despesa. Para usar um benefício, edite uma atividade no Roteiro ou uma despesa detalhada e escolha o programa.</p>
      </>) : (<>
        {ptsPrograms.length > 0 && <div className="tblwrap"><table className="tbl"><thead><tr><th>Programa</th><th className="r">Saldo informado</th><th className="r">Reservado em resgates</th><th>Atualizado em</th><th>Vencimento</th></tr></thead>
          <tbody>{ptsPrograms.map((p) => { const used = usedByProg[p.id] || 0; const bal = num(p.pointsBalance) || 0; return <tr key={p.id}><td><b style={{ fontWeight: 600 }}>{p.name}</b><div className="muted" style={{ fontSize: 12 }}>{p.partner}</div></td><td className="r">{bal.toLocaleString("pt-BR")}</td><td className="r" style={{ color: used > bal ? "var(--red)" : undefined }}>{used ? used.toLocaleString("pt-BR") : "—"}</td><td>{fdate(p.pointsUpdated)}</td><td style={{ color: p.pointsExpiry && diffDays(todayISO(), p.pointsExpiry) <= 60 ? "#93600E" : undefined }}>{fdate(p.pointsExpiry)}</td></tr>; })}</tbody></table></div>}
        {!trip ? <div className="card"><Empty icon={Coins} title="Selecione uma viagem" text="As simulações de resgate ficam vinculadas a uma viagem." /></div> : <>
          <RedemptionSim programs={programs} trip={trip} onSave={saveRed} />
          <div className="card"><h3>Resgates de {trip.name}<small>economia de caixa usada: {brl(m.savPoints)}</small></h3>
            {!reds.length ? <p className="muted" style={{ margin: 0, fontSize: 13 }}>Simule acima e salve a opção que pretende usar. Só os resgates marcados como utilizados entram no balanço.</p> :
              <div className="tblwrap"><table className="tbl"><thead><tr><th>Compra</th><th>Opção</th><th className="r">Desembolso</th><th className="r">Pontos</th><th className="r">Economia de caixa</th><th>Situação</th><th></th></tr></thead>
                <tbody>{reds.map((r) => <tr key={r.id}><td><b style={{ fontWeight: 600 }}>{r.description}</b><div className="muted" style={{ fontSize: 12 }}>{r.programName || "—"}, preço em dinheiro {brl(r.cash)}</div></td><td>{r.choiceLabel}</td><td className="r">{brl(r.outlay)}</td><td className="r">{r.pointsUsed ? r.pointsUsed.toLocaleString("pt-BR") : "—"}</td><td className="r" style={{ color: "var(--green)" }}>{brl(r.cashSaving)}</td>
                  <td><button className={`badge ${r.used ? "b-green" : ""}`} style={{ border: 0, cursor: "pointer" }} onClick={() => toggleRed(r)}>{r.used ? "Utilizado" : "Planejado"}</button></td><td className="r"><button className="ib dng" aria-label="Excluir" onClick={() => delRed(r)}><Trash2 size={15} /></button></td></tr>)}</tbody></table></div>}
            <p className="note" style={{ marginTop: 10 }}><Info size={14} />Economia de caixa = preço em dinheiro − o que você desembolsa no resgate. Ela não atribui valor aos pontos gastos. O saldo do programa não é abatido automaticamente: atualize-o no programa após o resgate.</p>
          </div>
        </>}
      </>)}
      {edit && <ProgramForm initial={edit} onSave={save} onClose={() => setEdit(null)} maxMemberships={plan?.limits?.max_memberships_per_program ?? null} onLimit={() => guard("memberships", 1e9)} />}
      {alloc && <AllocModal p={alloc} trip={trip} existing={s.items.find((i) => i.tripId === trip.id && i.programId === alloc.id)} onClose={() => setAlloc(null)} onConfirm={doAlloc} />}
    </div>
  );
}

// ---------- Balanço ----------
function BalancePage({ s, trip, m }) {
  const tv = travelers(trip) || 1; const d = tripDays(trip); const people = peopleOf(trip); const programs = s.programs || [];
  const weights = { ...DEFAULT_WEIGHTS, ...(trip.weights || {}) };
  const ranked = scoreQuotes(m.quotes, trip, weights).filter((r) => num(r.q.total) > 0);
  const total = m.committed;
  const catRows = Object.entries(m.byCat).map(([c, v]) => ({ c, est: v.est, real: r2(v.con + v.exp), exp: v.exp })).filter((r) => r.est || r.real);
  const byPerson = consumptionByPerson(m.exps, people);
  const byMethod = {}; m.pays.filter((p) => p.status === "pago").forEach((p) => (byMethod[p.method || "Não informado"] = r2((byMethod[p.method || "Não informado"] || 0) + p.amount))); m.realExp.forEach((e) => (byMethod[e.method || "Não informado"] = r2((byMethod[e.method || "Não informado"] || 0) + e.amount)));
  const unexpected = catRows.filter((r) => !r.est && r.real > 0);
  const unused = m.items.filter((i) => num(i.estimated) > 0 && !num(i.contracted) && !(m.byCat[i.category]?.exp > 0));
  const savTotal = r2(m.savBenefit + m.savPoints + m.savDiscount);
  const progRows = programs.map((p) => ({ p, st: programStats(s, p, trip.id), alloc: s.items.find((i) => i.tripId === trip.id && i.programId === p.id) })).filter((x) => x.st.uses || x.st.plannedUses || x.alloc);
  const comments = [];
  catRows.forEach((r) => { if (r.est > 0 && r.real > 0) { const dv = pct(r.real - r.est, r.est); if (Math.abs(dv) >= 5) comments.push(`O gasto com ${r.c.toLowerCase()} ficou ${fpct(Math.abs(dv))} ${dv > 0 ? "acima" : "abaixo"} do previsto.`); } });
  if (total > 0) { const top = catRows.slice().sort((a, b) => b.real - a.real)[0]; if (top && top.real > 0) comments.push(`${top.c} representou ${fpct(pct(top.real, total))} do custo total da viagem.`); }
  if (m.budget > 0 && total > 0) comments.push(`O custo final por pessoa (${brl(total / tv)}) ficou ${total <= m.budget ? "dentro" : "acima"} do orçamento por pessoa (${brl(m.budget / tv)}).`);
  if (m.booking && ranked.length >= 2) { const other = ranked.find((r) => r.q.id !== m.booking.quoteId); if (other) { const diff = r2(num(other.q.total) - m.booking.total); comments.push(`A proposta selecionada custou ${brl(Math.abs(diff))} ${diff >= 0 ? "a menos" : "a mais"} que a melhor alternativa no ranking (${other.q.agency}), segundo os critérios configurados.`); } }
  if (unexpected.length) comments.push(`Houve ${brl(sum(unexpected, (r) => r.real))} em categorias sem previsão: ${unexpected.map((r) => r.c.toLowerCase()).join(", ")}.`);
  progRows.forEach(({ p, st, alloc }) => { if (st.realized > 0) comments.push(`${p.name} gerou ${brl(st.realized)} de economia em ${st.uses} uso(s) nesta viagem${alloc ? `, contra ${brl(alloc.contracted)} de custo alocado` : ""}.`); });
  if (savTotal > 0 && total > 0) comments.push(`Benefícios, pontos e descontos evitaram ${brl(savTotal)} em gastos, o equivalente a ${fpct(pct(savTotal, total + savTotal))} do que a viagem custaria sem eles.`);
  const exp = () => downloadCSV(`balanco-${slug(trip.name)}.csv`, ["Indicador", "Valor"], [
    ["Viagem", trip.name], ["Período", `${fdate(trip.startDate)} a ${fdate(trip.endDate)}`], ["Viajantes", tv], ["Orçamento inicial", brlPlain(m.budget)], ["Total previsto", brlPlain(m.estimated)], ["Valor contratado", brlPlain(m.contracted)],
    ["Total efetivamente gasto", brlPlain(total)], ["Total pago", brlPlain(m.paid)], ["Obrigações pendentes", brlPlain(m.toPay)], ["Economia (+) ou estouro (−)", brlPlain(m.budget - total)], ["Custo por pessoa", brlPlain(total / tv)], ["Custo diário por pessoa", d ? brlPlain(total / tv / d.days) : ""],
    ["Economia com clubes de benefícios", brlPlain(m.savBenefit)], ["Economia de caixa com pontos e milhas", brlPlain(m.savPoints)], ["Descontos na proposta selecionada", brlPlain(m.savDiscount)], [],
    ["Categoria", "Previsto;Realizado;Desvio"], ...catRows.map((r) => [r.c, `${brlPlain(r.est)};${brlPlain(r.real)};${brlPlain(r.real - r.est)}`]), [],
    ["Consumo por viajante", ""], ...Object.entries(byPerson).map(([k, v]) => [k, brlPlain(v)]), [], ["Análises", ""], ...comments.map((c) => [c, ""]),
  ]);
  const Bars = ({ data }) => { const e = Object.entries(data).sort((a, b) => b[1] - a[1]); const mx = Math.max(...e.map((x) => x[1]), 1); return e.length ? <div className="grid" style={{ gap: 9 }}>{e.map(([k, v]) => <div key={k}><div className="row between" style={{ fontSize: 13, marginBottom: 3 }}><span>{k}</span><b>{brl(v)}</b></div><Prog value={pct(v, mx)} /></div>)}</div> : <p className="muted" style={{ margin: 0, fontSize: 13 }}>Sem dados suficientes.</p>; };
  return (
    <div className="grid">
      <div className="row between no-print"><span className="muted" style={{ fontSize: 13 }}>Análises geradas apenas a partir dos dados registrados.</span><div className="row"><button className="btn" onClick={exp}><Download size={15} />Exportar CSV</button><button className="btn" onClick={() => window.print()}><Printer size={15} />Imprimir resumo</button></div></div>
      <div className="card" style={{ padding: "22px 24px" }}>
        <div className="row between" style={{ alignItems: "flex-end" }}>
          <div><h2 className="serif" style={{ margin: 0, fontSize: 26 }}>{trip.name}</h2><div className="muted">{trip.destination}, {fdate(trip.startDate)} a {fdate(trip.endDate)}, {tv} viajante(s)</div></div>
          <div style={{ textAlign: "right" }}><div className="kl" style={{ justifyContent: "flex-end" }}>{m.budget - total >= 0 ? "Economia em relação ao orçamento" : "Estouro do orçamento"}</div><div className="serif" style={{ fontSize: 34, color: m.budget - total >= 0 ? "var(--green)" : "var(--red)" }}>{brl(Math.abs(m.budget - total))}</div></div>
        </div>
      </div>
      <div className="strip" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
        {[["Orçamento inicial", brl(m.budget)], ["Previsto inicialmente", brl(m.estimated)], ["Valor contratado", brl(m.contracted)], ["Total gasto", brl(total)], ["Total pago", brl(m.paid)], ["Obrigações pendentes", brl(m.toPay)], ["Custo por pessoa", brl(total / tv)], ["Custo diário por pessoa", d ? brl(total / tv / d.days) : "—"], ["Economia com benefícios, pontos e descontos", savTotal ? brl(savTotal) : "—"]].map(([l, v]) => <div key={l}><div className="kl">{l}</div><div className="kv" style={{ fontSize: 19 }}>{v}</div></div>)}
      </div>
      <div className="grid g2">
        <div className="card"><h3>Análises</h3>{comments.length ? <div className="grid" style={{ gap: 9 }}>{comments.map((c, i) => <div key={i} className="note" style={{ color: "var(--ink)", fontSize: 13.5 }}><CheckCircle2 size={15} color="#167D9A" />{c}</div>)}</div> : <p className="muted" style={{ margin: 0 }}>Ainda não há dados suficientes. Registre itens previstos, a proposta selecionada e as despesas para gerar análises.</p>}</div>
        <div className="card"><h3>Gastos por categoria</h3>{catRows.some((r) => r.real) ? <div style={{ height: 240 }}><ResponsiveContainer><BarChart data={catRows.map((r) => ({ n: r.c, Previsto: r.est, Realizado: r.real }))} layout="vertical" margin={{ left: 10, right: 10 }}><CartesianGrid horizontal={false} stroke="#EEF3F4" /><XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} /><YAxis type="category" dataKey="n" width={140} tick={{ fontSize: 11.5 }} axisLine={false} tickLine={false} /><Tooltip formatter={(v) => brl(v)} contentStyle={tipStyle} /><Bar dataKey="Previsto" fill="#B8D9E4" radius={[0, 4, 4, 0]} /><Bar dataKey="Realizado" fill="#167D9A" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div> : <ChartEmpty text="Sem gastos realizados ainda." />}</div>
      </div>
      <div className="tblwrap"><table className="tbl"><thead><tr><th>Categoria</th><th className="r">Previsto</th><th className="r">Realizado</th><th className="r">Desvio</th><th className="r">Participação</th></tr></thead>
        <tbody>{catRows.map((r) => { const dv = r2(r.real - r.est); return <tr key={r.c}><td><span className="dot" style={{ background: catColor(r.c), marginRight: 7 }} />{r.c}{!r.est && r.real > 0 && <span className="badge b-orange" style={{ marginLeft: 6 }}>Inesperada</span>}</td><td className="r">{brl(r.est)}</td><td className="r">{brl(r.real)}</td><td className="r" style={{ color: dv > 0 ? "var(--red)" : dv < 0 ? "var(--green)" : undefined }}>{dv > 0 ? "+" : ""}{brl(dv)}{r.est ? ` (${fpct(pct(dv, r.est))})` : ""}</td><td className="r">{total ? fpct(pct(r.real, total)) : "—"}</td></tr>; })}
          {!catRows.length && <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 24 }}>Sem dados.</td></tr>}</tbody>
        {catRows.length > 0 && <tfoot><tr><td>Total</td><td className="r">{brl(m.estimated)}</td><td className="r">{brl(total)}</td><td className="r">{brl(m.deviation)}</td><td className="r">100%</td></tr></tfoot>}</table></div>
      <div className="card"><h3><Gift size={16} />Economia obtida<small>referência: valor sem benefício, preço em dinheiro ou desconto informado</small></h3>
        <div className="minis" style={{ marginTop: 0 }}>
          <div><span>Clubes de benefícios</span><b style={{ color: "var(--green)" }}>{brl(m.savBenefit)}</b><small>{m.savPlanned > 0 ? `mais ${brl(m.savPlanned)} previstos no roteiro` : "despesas com benefício"}</small></div>
          <div><span>Pontos e milhas</span><b style={{ color: "var(--green)" }}>{brl(m.savPoints)}</b><small>economia de caixa em resgates utilizados</small></div>
          <div><span>Descontos na proposta</span><b style={{ color: "var(--green)" }}>{brl(m.savDiscount)}</b><small>informado na cotação selecionada</small></div>
        </div>
        {progRows.length > 0 && <div className="tblwrap" style={{ marginTop: 14 }}><table className="tbl"><thead><tr><th>Programa</th><th className="r">Usos</th><th className="r">Economia realizada</th><th className="r">Prevista</th><th className="r">Custo alocado</th><th className="r">Líquido na viagem</th></tr></thead>
          <tbody>{progRows.map(({ p, st, alloc }) => { const c = num(alloc?.contracted) || 0; const net = r2(st.realized - c); return <tr key={p.id}><td>{p.name}</td><td className="r">{st.uses}</td><td className="r">{brl(st.realized)}</td><td className="r">{brl(st.planned)}</td><td className="r">{alloc ? brl(c) : "não lançado"}</td><td className="r" style={{ color: net >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>{brl(net)}</td></tr>; })}</tbody></table></div>}
      </div>
      <div className="grid g3">
        <div className="card"><h3>Consumo por viajante<small>com a divisão das compartilhadas</small></h3><Bars data={byPerson} /></div>
        <div className="card"><h3>Por forma de pagamento</h3><Bars data={byMethod} /></div>
        <div className="card"><h3>Itens planejados não utilizados</h3>{unused.length ? <div className="grid" style={{ gap: 7 }}>{unused.map((i) => <div key={i.id} className="row between" style={{ fontSize: 13 }}><span>{i.description}</span><b>{brl(i.estimated)}</b></div>)}</div> : <p className="muted" style={{ margin: 0, fontSize: 13 }}>Nenhum item previsto ficou sem uso, ou ainda não há dados.</p>}</div>
      </div>
      {m.realExp.some((e) => e.person) && <SettlementCard exps={m.exps} people={people} />}
      {ranked.length > 0 && <div className="card"><h3>Comparação com as cotações originais</h3><div className="tblwrap"><table className="tbl"><thead><tr><th>Empresa</th><th className="r">Total</th><th className="r">Diferença vs. selecionada</th><th className="r">Pontuação</th></tr></thead><tbody>{ranked.map((r) => <tr key={r.q.id}><td>{r.q.agency}{m.booking?.quoteId === r.q.id && <span className="badge b-green" style={{ marginLeft: 6 }}>Selecionada</span>}</td><td className="r">{brl(r.q.total)}</td><td className="r">{m.booking ? `${num(r.q.total) - m.booking.total > 0 ? "+" : ""}${brl(num(r.q.total) - m.booking.total)}` : "—"}</td><td className="r">{r.score != null ? Math.round(r.score) : "—"}</td></tr>)}</tbody></table></div></div>}
    </div>
  );
}

// ---------- Importação CSV ----------
const normTxt = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/)[0] || "";
  const d = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ";" : ",";
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === d) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const clean = rows.filter((r) => r.some((x) => String(x).trim()));
  return { headers: (clean[0] || []).map((h) => h.trim()), rows: clean.slice(1) };
}
function parseMoney(v) { let x = String(v ?? "").replace(/R\$|\s/g, "").trim(); if (!x || x === "-" || x === "—") return null; if (x.includes(",")) x = x.replace(/\./g, "").replace(",", "."); return num(x); }
function parseDateBR(v) { const x = String(v || "").trim(); let mm = x.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (mm) { const y = mm[3].length === 2 ? `20${mm[3]}` : mm[3]; return `${y}-${pad(mm[2])}-${pad(mm[1])}`; } mm = x.match(/^(\d{4})-(\d{2})-(\d{2})/); return mm ? `${mm[1]}-${mm[2]}-${mm[3]}` : ""; }
const IMPORT_FIELDS = {
  despesas: [["date", "Data", ["data", "date"]], ["description", "Descrição", ["descri", "item", "historico"]], ["category", "Categoria", ["categ"]], ["amount", "Valor", ["valor", "amount", "total"]], ["method", "Forma de pagamento", ["forma", "metodo", "pagamento"]], ["status", "Situação", ["situa", "status"]], ["person", "Quem pagou", ["quem", "pagou", "pessoa"]], ["place", "Local", ["local", "estabelec"]], ["notes", "Observação", ["observ", "nota"]]],
  itens: [["description", "Descrição", ["descri", "item"]], ["category", "Categoria", ["categ"]], ["estimated", "Previsto", ["previsto", "estimado", "valor"]], ["contracted", "Contratado", ["contratado"]], ["dueDate", "Data prevista", ["data prevista", "vencimento", "data"]], ["method", "Forma", ["forma"]], ["responsible", "Responsável", ["respons"]], ["notes", "Observações", ["observ"]]],
};
function ImportCSV({ s, trip, update, toast, guard = () => true, locked }) {
  const [target, setTarget] = useState("despesas"); const [data, setData] = useState(null); const [map, setMap] = useState({}); const ref = useRef(null);
  const guess = (headers, tg) => { const out = {}; const used = new Set(); IMPORT_FIELDS[tg].forEach(([k, , keys]) => { const idx = headers.findIndex((h, i) => !used.has(i) && keys.some((kw) => normTxt(h).includes(kw))); if (idx >= 0) { out[k] = idx; used.add(idx); } }); return out; };
  const onFile = (e) => { const f = e.target.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { const p = parseCSV(String(rd.result)); if (!p.headers.length) { toast("O arquivo está vazio ou não é um CSV", "err"); return; } setData({ ...p, name: f.name }); setMap(guess(p.headers, target)); }; rd.readAsText(f, "utf-8"); e.target.value = ""; };
  const changeTarget = (t) => { setTarget(t); if (data) setMap(guess(data.headers, t)); };
  const get = (row, k) => (map[k] != null && map[k] !== "" ? row[map[k]] : "");
  const matchCat = (v) => CATS.find((c) => normTxt(c) === normTxt(v)) || CATS.find((c) => normTxt(v) && normTxt(c).startsWith(normTxt(v).slice(0, 5))) || "Outras despesas";
  const matchMethod = (v) => METHODS.find((x) => normTxt(x) === normTxt(v)) || METHODS.find((x) => normTxt(v) && normTxt(x).includes(normTxt(v))) || (v ? "Outro" : "Pix");
  const matchStatus = (v) => { const n = normTxt(v); const hit = Object.entries(EXP_LABEL).find(([, l]) => n && normTxt(l).startsWith(n.slice(0, 5))); return hit ? hit[0] : "paga"; };
  const build = () => {
    if (!data) return { ok: [], bad: 0 };
    const ok = []; let bad = 0;
    data.rows.forEach((r) => {
      if (target === "despesas") { const amount = parseMoney(get(r, "amount")); if (!(amount > 0)) { bad++; return; } ok.push({ description: String(get(r, "description") || "").trim() || matchCat(get(r, "category")), category: matchCat(get(r, "category")), amount: r2(amount), date: parseDateBR(get(r, "date")) || todayISO(), method: matchMethod(get(r, "method")), status: matchStatus(get(r, "status")), person: String(get(r, "person") || "").trim(), place: String(get(r, "place") || "").trim(), notes: String(get(r, "notes") || "").trim(), shared: false, splits: [], benefit: null }); }
      else { const desc = String(get(r, "description") || "").trim(); const est = parseMoney(get(r, "estimated")), con = parseMoney(get(r, "contracted")); if (!desc || (est == null && con == null)) { bad++; return; } ok.push({ description: desc, category: matchCat(get(r, "category")), estimated: est ?? "", contracted: con ?? "", dueDate: parseDateBR(get(r, "dueDate")), method: matchMethod(get(r, "method")), responsible: String(get(r, "responsible") || "").trim(), notes: String(get(r, "notes") || "").trim() }); }
    });
    return { ok, bad };
  };
  const preview = build();
  const run = () => {
    const { ok } = preview; let added = 0, dup = 0;
    update((st) => {
      if (target === "despesas") {
        const keys = new Set(st.expenses.filter((e) => e.tripId === trip.id).map((e) => `${e.date}|${normTxt(e.description)}|${r2(e.amount)}`));
        const add = []; ok.forEach((o) => { const k = `${o.date}|${normTxt(o.description)}|${o.amount}`; if (keys.has(k)) { dup++; return; } keys.add(k); add.push({ ...o, id: uid(), tripId: trip.id, createdAt: new Date().toISOString() }); });
        added = add.length; return withLog({ ...st, expenses: [...add, ...st.expenses] }, trip.id, `Importação CSV: ${add.length} despesa(s)`);
      }
      const keys = new Set(st.items.filter((i) => i.tripId === trip.id).map((i) => `${normTxt(i.description)}|${i.category}`));
      const add = []; ok.forEach((o) => { const k = `${normTxt(o.description)}|${o.category}`; if (keys.has(k)) { dup++; return; } keys.add(k); add.push({ ...o, id: uid(), tripId: trip.id, createdAt: new Date().toISOString() }); });
      added = add.length; return withLog({ ...st, items: [...st.items, ...add] }, trip.id, `Importação CSV: ${add.length} item(ns)`);
    });
    setTimeout(() => toast(`${added} registro(s) importado(s)${dup ? `, ${dup} ignorado(s) por já existirem` : ""}${preview.bad ? `, ${preview.bad} linha(s) inválida(s)` : ""}`), 0);
    setData(null);
  };
  return (
    <div className="card"><h3><Upload size={16} />Importar planilha CSV</h3>
      {!trip ? <p className="muted" style={{ margin: 0, fontSize: 13 }}>Crie ou selecione uma viagem para importar.</p> : <>
        <div className="row" style={{ marginBottom: 10 }}>
          <Sel value={target} onChange={changeTarget} style={{ width: 230 }} aria-label="Tipo de importação" opts={[["despesas", "Despesas da viagem"], ["itens", "Itens do planejamento"]]} />
          <button className="btn" onClick={() => guard("import") && ref.current?.click()}>{locked ? <Lock size={15} /> : <Upload size={15} />}Escolher arquivo</button>{locked && <span className="badge b-sand">Viajante e Família</span>}
          <input ref={ref} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={onFile} />
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Aceita ponto e vírgula ou vírgula, valores como 1.250,00 e datas DD/MM/AAAA. Os CSVs exportados pelo próprio app podem ser reimportados. Linhas idênticas às já existentes são ignoradas.</p>
        {data && <div style={{ marginTop: 14 }}>
          <div className="kl" style={{ marginBottom: 8 }}>{data.name}: {data.rows.length} linha(s). Confira as colunas:</div>
          <div className="form" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>{IMPORT_FIELDS[target].map(([k, l]) => <Fld key={k} label={l}><Sel value={map[k] ?? ""} onChange={(v) => setMap({ ...map, [k]: v === "" ? "" : Number(v) })} opts={[["", "Não importar"], ...data.headers.map((h, i) => [String(i), h || `Coluna ${i + 1}`])]} /></Fld>)}</div>
          <div className="tblwrap" style={{ marginTop: 12, maxHeight: 200, overflow: "auto" }}><table className="tbl"><thead><tr>{(target === "despesas" ? ["Data", "Descrição", "Categoria", "Valor", "Situação"] : ["Descrição", "Categoria", "Previsto", "Contratado"]).map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{preview.ok.slice(0, 6).map((o, i) => <tr key={i}>{target === "despesas" ? <><td>{fdate(o.date)}</td><td>{o.description}</td><td>{o.category}</td><td>{brl(o.amount)}</td><td>{EXP_LABEL[o.status]}</td></> : <><td>{o.description}</td><td>{o.category}</td><td>{o.estimated !== "" ? brl(o.estimated) : "—"}</td><td>{o.contracted !== "" ? brl(o.contracted) : "—"}</td></>}</tr>)}</tbody></table></div>
          <div className="row" style={{ marginTop: 12 }}><span className="muted" style={{ fontSize: 13, flex: 1 }}>{preview.ok.length} válida(s){preview.bad ? `, ${preview.bad} sem valor ou descrição` : ""}. Importando em {trip.name}.</span><button className="btn" onClick={() => setData(null)}>Cancelar</button><button className="btn pri" disabled={!preview.ok.length} onClick={run}><Check size={15} />Importar {preview.ok.length}</button></div>
        </div>}
      </>}
    </div>
  );
}

// ---------- Configurações ----------
function ConfigPage({ s, trip, m, update, toast, ask, loadDemo, persist, storeMode, account, onSignOut, plan, guard }) {
  const fileRef = useRef(null);
  const hasDemo = s.trips.some((t) => t.demo);
  const removeDemo = () => ask({ title: "Remover dados de demonstração", danger: true, cta: "Remover demonstração", message: "A viagem de demonstração e tudo o que foi lançado nela serão excluídos. Suas viagens reais e seus programas de benefícios não são afetados.", onConfirm: () => { update((st) => { const ids = new Set(st.trips.filter((t) => t.demo).map((t) => t.id)); const k = (x) => !ids.has(x.tripId); return withLog({ ...st, trips: st.trips.filter((t) => !t.demo), items: st.items.filter(k), quotes: st.quotes.filter(k), bookings: st.bookings.filter(k), payments: st.payments.filter(k), expenses: st.expenses.filter(k), itinerary: st.itinerary.filter(k), redemptions: (st.redemptions || []).filter(k), docs: (st.docs || []).filter(k), log: (st.log || []).filter(k), activeTripId: ids.has(st.activeTripId) ? null : st.activeTripId }, null, "Demonstração removida"); }); toast("Dados de demonstração removidos"); } });
  const backup = () => { const blob = new Blob([JSON.stringify({ app: "ferias-planejadas", version: 2, exportedAt: new Date().toISOString(), data: s }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `ferias-planejadas-backup-${todayISO()}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500); toast("Backup exportado"); };
  const importFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return; const rd = new FileReader();
    rd.onload = () => { try { const j = JSON.parse(rd.result); const d = j.data || j; if (!Array.isArray(d.trips)) throw new Error("arquivo sem a lista de viagens"); ask({ title: "Restaurar backup", danger: true, cta: "Substituir dados", message: `O backup contém ${d.trips.length} viagem(ns) e ${(d.programs || []).length} programa(s). Seus dados atuais serão substituídos. Exporte um backup antes, se precisar.`, onConfirm: () => { update(() => ({ ...EMPTY, ...d })); toast("Backup restaurado"); } }); } catch (err) { toast(`Não foi possível ler o arquivo: ${err.message}`, "err"); } };
    rd.readAsText(f); e.target.value = "";
  };
  const wipe = () => ask({ title: "Excluir todos os dados", danger: true, cta: "Excluir tudo", message: "Todas as viagens, cotações, pagamentos, despesas, programas e o histórico serão apagados. Essa ação não pode ser desfeita.", onConfirm: () => { update(() => ({ ...EMPTY })); toast("Todos os dados foram excluídos"); } });
  const exportAll = () => {
    if (!trip) return;
    downloadCSV(`dados-completos-${slug(trip.name)}.csv`, ["Tipo", "Data", "Descrição", "Categoria", "Valor", "Situação"], [
      ...m.items.map((i) => ["Item previsto", fdate(i.dueDate), i.description, i.category, brlPlain(i.contracted || i.estimated), num(i.contracted) ? "Contratado" : "Previsto"]),
      ...m.pays.map((p) => ["Pagamento", fdate(p.dueDate), p.description, p.category, brlPlain(p.amount), PAY_LABEL[effStatus(p)]]),
      ...m.exps.map((e) => ["Despesa", fdate(e.date), e.description, e.category, brlPlain(e.amount), EXP_LABEL[e.status]]),
    ]);
  };
  const logs = (s.log || []).slice(0, 25);
  const storeText = { cloud: `Sincronizado com o banco de dados na nuvem (Supabase). Cada conta só acessa os próprios registros, garantido por políticas RLS no banco, não por filtros da tela.${account ? ` Conectado como ${account}.` : ""}`, local: "Salvo apenas neste navegador. Para acessar de outros dispositivos, configure o Supabase (veja o README).", claude: "Salvando no armazenamento persistente do Claude." }[storeMode];
  return (
    <div className="grid g2" style={{ alignItems: "start" }}>
      <div className="grid">
        <div className="card"><h3><Database size={16} />Armazenamento e conta</h3><p style={{ margin: "0 0 10px" }}><span className={`badge ${persist === "saved" ? "b-green" : persist === "memory" ? "b-red" : "b-orange"}`}>{persist === "saved" ? (storeMode === "cloud" ? "Sincronizado" : "Salvo") : persist === "memory" ? (storeMode === "cloud" ? "Falha na sincronização" : "Somente sessão") : "Salvando…"}</span></p><p className="muted" style={{ margin: 0, fontSize: 13 }}>{storeText}</p>{onSignOut && <div className="row" style={{ marginTop: 12 }}><button className="btn" onClick={onSignOut}>Sair da conta</button></div>}</div>
        <ImportCSV s={s} trip={trip} update={update} toast={toast} guard={guard} locked={plan?.limits ? !plan.limits.can_import_csv : false} />
        <div className="card"><h3>Backup e exportação</h3>
          <div className="grid" style={{ gap: 8 }}>
            <button className="btn" onClick={backup}><Download size={15} />Exportar backup completo (JSON)</button>
            <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={15} />Restaurar a partir de backup</button>
            <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={importFile} />
            <button className="btn" onClick={exportAll} disabled={!trip}><Download size={15} />Exportar lançamentos da viagem ativa (CSV)</button>
          </div>
          <p className="note" style={{ marginTop: 12 }}><Info size={14} />Os CSVs usam ponto e vírgula e UTF-8 com BOM, abrindo corretamente no Excel em português. Cada tela também exporta sua lista respeitando os filtros.</p>
        </div>
        <div className="card"><h3>Dados de demonstração</h3><p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>Uma viagem fictícia, claramente marcada como demonstração, com três cotações para testar o comparativo.</p>
          <div className="row">{hasDemo ? <button className="btn danger" onClick={removeDemo}><Trash2 size={15} />Remover demonstração</button> : <button className="btn" onClick={loadDemo}><Database size={15} />Carregar demonstração</button>}</div></div>
        <div className="card" style={{ borderColor: "#F3D2D0" }}><h3 style={{ color: "#A9332F" }}>Excluir dados</h3><p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>Remove definitivamente todas as informações salvas.</p><button className="btn dangerfill" onClick={wipe}><Trash2 size={15} />Excluir todos os dados</button></div>
      </div>
      <div className="grid">
        <div className="card"><h3>Histórico de alterações<small>últimas {logs.length}</small></h3>
          {logs.length ? <div className="grid" style={{ gap: 0 }}>{logs.map((l) => <div key={l.id} style={{ display: "grid", gridTemplateColumns: "92px 1fr", gap: 10, fontSize: 13, padding: "8px 0", borderTop: "1px solid #EFF4F5" }}><span className="muted">{fdate(l.at.slice(0, 10))} {l.at.slice(11, 16)}</span><span>{l.text}{l.by && l.by !== account ? <span className="muted"> ({l.by})</span> : null}</span></div>)}</div> : <p className="muted" style={{ margin: 0, fontSize: 13 }}>As alterações financeiras relevantes aparecem aqui.</p>}
        </div>
        <div className="card" style={{ background: "#FAFCFC" }}><h3>Privacidade</h3><p className="muted" style={{ margin: 0, fontSize: 13 }}>O aplicativo não solicita nem armazena números de cartão, senhas bancárias ou credenciais de programas de fidelidade. Registre apenas a forma de pagamento e o saldo de pontos.</p></div>
      </div>
    </div>
  );
}

// ---------- Compartilhamento em família ----------
const ROLE_LABEL = { owner: "Organizador", editor: "Editor", participante: "Participante", leitor: "Leitor" };
const ROLE_DESC = { editor: "Edita orçamento, cotações, pagamentos, roteiro e despesas.", participante: "Lança despesas e atividades. Não mexe em cotações nem pagamentos.", leitor: "Só visualiza." };
const SHARE_ERR = {
  LIMITE_COMPARTILHAR: "O compartilhamento faz parte do plano Família.",
  LIMITE_MEMBROS: "A viagem já tem o máximo de 6 pessoas, contando os convites pendentes.",
  CONVITE_INVALIDO: "Este convite não existe mais ou foi cancelado pelo organizador.",
  CONVITE_USADO: "Este convite já foi usado por outra pessoa. Peça um novo ao organizador.",
  CONVITE_EXPIRADO: "Este convite expirou. Peça um novo ao organizador.",
  CONVITE_PROPRIO: "Este convite é de uma viagem sua.",
  SEM_PERMISSAO: "Você não tem permissão para isso.",
};
const shareErr = (e) => { const m = String(e?.message || ""); const k = Object.keys(SHARE_ERR).find((x) => m.includes(x)); return k ? SHARE_ERR[k] : "Não foi possível concluir. Verifique a conexão e tente de novo."; };

function ShareModal({ trip, s, me, rpc, reload, toast, guard, ask, onClose }) {
  const info = s.shared?.[trip.id]; const owner = trip._owner || me; const isOwner = owner === me;
  const members = (info?.members || []);
  const people = peopleOf(trip);
  const [invites, setInvites] = useState([]); const [role, setRole] = useState("participante"); const [traveler, setTraveler] = useState(""); const [busy, setBusy] = useState(false);
  const loadInv = async () => { if (!isOwner) return; try { setInvites(await rpc.invites(trip.id)); } catch (e) { /* sem convites */ } };
  useEffect(() => { loadInv(); }, []); // eslint-disable-line
  const link = (t) => `${window.location.origin}/?convite=${t}`;
  const msg = (t) => `Oi! Te convidei para a viagem "${trip.name}" no Férias Planejadas. Entre por este link (vale 7 dias): ${link(t)}`;
  const copy = async (t) => { try { await navigator.clipboard.writeText(link(t)); toast("Link do convite copiado"); } catch (e) { toast(link(t), "info"); } };
  const run = async (fn, ok) => { setBusy(true); try { await fn(); if (ok) toast(ok); await reload(); await loadInv(); } catch (e) { if (String(e?.message).includes("LIMITE_COMPARTILHAR")) guard("share"); else toast(shareErr(e), "err"); } setBusy(false); };
  const create = () => { if (!guard("share")) return; run(async () => { const tok = await rpc.call("create_invite", { p_trip: trip.id, p_role: role, p_traveler: traveler || null }); setTraveler(""); await copy(tok); }); };
  const usedNames = new Set(members.map((x) => x.traveler_name).filter(Boolean));
  return (
    <Modal wide title={isOwner ? `Compartilhar “${trip.name}”` : `Pessoas em “${trip.name}”`} onClose={onClose}>
      <div className="grid" style={{ gap: 18 }}>
        <div>
          <div className="kl" style={{ marginBottom: 8 }}>Quem participa</div>
          {members.length <= 1 && isOwner ? <p className="muted" style={{ margin: 0, fontSize: 13 }}>Ainda só você. Convide a família abaixo: cada pessoa usa a própria conta, no próprio celular.</p> : (
            <div className="tblwrap"><table className="tbl"><thead><tr><th>Pessoa</th><th>Papel</th><th>Nome na viagem</th><th></th></tr></thead>
              <tbody>{members.map((x) => {
                const self = x.member_id === me; const isOwnerRow = x.role === "owner";
                return <tr key={x.member_id}>
                  <td>{x.email}{self && <span className="badge" style={{ marginLeft: 6 }}>você</span>}</td>
                  <td>{isOwner && !isOwnerRow ? <select className="sel" style={{ width: 150, padding: "5px 8px" }} value={x.role} disabled={busy} onChange={(e) => run(() => rpc.call("update_member", { p_trip: trip.id, p_member: x.member_id, p_role: e.target.value, p_traveler: x.traveler_name }), "Papel atualizado")}>{["editor", "participante", "leitor"].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select> : <span className={`badge ${isOwnerRow ? "b-green" : "b-blue"}`}>{ROLE_LABEL[x.role]}</span>}</td>
                  <td>{isOwner ? <select className="sel" style={{ width: 160, padding: "5px 8px" }} value={x.traveler_name || ""} disabled={busy} onChange={(e) => run(() => rpc.call("update_member", { p_trip: trip.id, p_member: x.member_id, p_role: isOwnerRow ? null : x.role, p_traveler: e.target.value }), "Nome vinculado")}><option value="">Não vinculado</option>{people.map((p) => <option key={p} value={p}>{p}</option>)}</select> : (x.traveler_name || "—")}</td>
                  <td className="r">{(isOwner && !isOwnerRow) || (self && !isOwnerRow) ? <button className="btn sm danger" disabled={busy} onClick={() => ask({ title: self ? "Sair da viagem" : "Remover da viagem", danger: true, cta: self ? "Sair" : "Remover", message: self ? `Você deixará de ver “${trip.name}”. As despesas que você lançou continuam na viagem; as privadas seguem invisíveis para os outros.` : `${x.email} deixará de ver a viagem. O que essa pessoa lançou continua registrado.`, onConfirm: () => run(async () => { await rpc.call("remove_member", { p_owner: owner, p_trip: trip.id, p_member: x.member_id }); if (self) onClose(); }, self ? "Você saiu da viagem" : "Pessoa removida") })}>{self ? "Sair" : "Remover"}</button> : null}</td>
                </tr>;
              })}</tbody></table></div>
          )}
          {isOwner && people.length > 0 && <p className="note" style={{ marginTop: 8 }}><Info size={14} />O “nome na viagem” liga a conta a um viajante: as despesas dessa pessoa já saem com “quem pagou” preenchido, e o acerto de contas fica automático.</p>}
        </div>
        {isOwner && <div className="benefit" style={{ background: "#F3F9FB", borderColor: "#D6EAF1" }}>
          <div className="kl" style={{ marginBottom: 10 }}>Convidar alguém</div>
          <div className="form form3">
            <Fld label="Papel"><Sel value={role} onChange={setRole} opts={["editor", "participante", "leitor"].map((r) => [r, ROLE_LABEL[r]])} /></Fld>
            <Fld label="Nome na viagem (opcional)"><Sel value={traveler} onChange={setTraveler} opts={[["", "Escolher depois"], ...people.filter((p) => !usedNames.has(p)).map((p) => [p, p])]} /></Fld>
            <div className="fld" style={{ alignSelf: "end" }}><button className="btn pri" disabled={busy} style={{ width: "100%", justifyContent: "center" }} onClick={create}><Plus size={15} />{busy ? "Gerando…" : "Gerar link de convite"}</button></div>
          </div>
          <p className="note" style={{ marginTop: 8 }}><Info size={14} />{ROLE_DESC[role]} O link vale 7 dias e serve para uma pessoa. Quem não tiver conta cria uma gratuita ao abrir.</p>
          {invites.length > 0 && <div className="grid" style={{ gap: 8, marginTop: 12 }}>{invites.map((v) => (
            <div key={v.token} className="row" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px", fontSize: 13 }}>
              <span className="badge b-blue">{ROLE_LABEL[v.role]}</span><span>{v.traveler_name || "Convite pendente"}</span><span className="muted" style={{ fontSize: 12 }}>vale até {fdate(String(v.expires_at).slice(0, 10))}</span><span style={{ flex: 1 }} />
              <button className="btn sm" onClick={() => copy(v.token)}><Copy size={13} />Copiar link</button>
              <a className="btn sm" href={`https://wa.me/?text=${encodeURIComponent(msg(v.token))}`} target="_blank" rel="noreferrer">WhatsApp</a>
              <button className="btn sm ghost danger" disabled={busy} onClick={() => run(() => rpc.call("revoke_invite", { p_token: v.token }), "Convite cancelado")}>Cancelar</button>
            </div>))}</div>}
        </div>}
        <div className="note"><Lock size={14} /><span>Despesas privadas (por padrão, <b>Compras e lembranças</b> e <b>Emergências</b>) só aparecem para quem as cadastrou, inclusive para o organizador. Os demais veem apenas o total em “Gastos pessoais”, sem descrição, local ou autor. Clubes de benefícios e pontos continuam pessoais.</span></div>
      </div>
    </Modal>
  );
}

// ---------- Planos e assinaturas ----------
const LIMITS = {
  trips: { key: "max_active_trips", title: "Mais de uma viagem ativa", text: (n) => `O plano Gratuito mantém ${n} viagem ativa por vez. Para planejar outra, arquive uma viagem concluída ou assine o Viajante ou o Família.` },
  quotes: { key: "max_quotes_per_trip", title: "Mais cotações nesta viagem", text: (n) => `O plano Gratuito compara até ${n} cotações por viagem. Nos planos pagos você cadastra quantas propostas quiser.` },
  programs: { key: "max_programs", title: "Mais clubes e programas", text: (n) => `O plano Gratuito inclui ${n} clube ou programa de benefícios. Assine para acompanhar todos os seus clubes, pontos e milhas.` },
  memberships: { key: "max_memberships_per_program", title: "Mais adesões no mesmo clube", text: (n) => `O plano Gratuito permite ${n} adesão por clube. Para registrar os cartões de outros viajantes, como várias adesões do Prime Gourmet na mesma mesa, assine o Viajante ou o Família.` },
  weights: { flag: "can_edit_weights", title: "Comparativo personalizado", text: () => "No plano Gratuito o ranking usa os pesos padrão. Assine para ajustar o peso de preço, hospedagem, voo e serviços conforme o que importa para você." },
  share: { flag: "max_members_per_trip", title: "Viagem compartilhada", text: () => "Compartilhar a viagem com a família faz parte do plano Família: cada pessoa lança os próprios gastos no celular e o acerto de contas sai automático." },
  import: { flag: "can_import_csv", title: "Importação de planilhas", text: () => "A importação de CSV está disponível nos planos Viajante e Família. A exportação e o backup continuam livres em todos os planos." },
};
const LIMIT_CODES = { LIMITE_VIAGENS: "trips", LIMITE_COTACOES: "quotes", LIMITE_PROGRAMAS: "programs", LIMITE_ADESOES: "memberships" };
const PLAN_COPY = {
  free: { name: "Gratuito", tag: "Para conhecer", desc: "Uma viagem completa, do orçamento ao balanço final." },
  viajante: { name: "Viajante", tag: "Para quem viaja sempre", desc: "Viagens e cotações sem limite, com o comparativo do seu jeito." },
  familia: { name: "Família", tag: "Mais completo", desc: "Tudo do Viajante, com a viagem compartilhada com quem vai junto." },
};
const REF_PRICES = { viajante_mensal: 7.9, viajante_anual: 79, familia_mensal: 12.9, familia_anual: 129 };
const trialDaysLeft = (p) => (p?.trial_ends_at ? Math.max(0, Math.ceil((new Date(p.trial_ends_at).getTime() - Date.now()) / 86400000)) : 0);
const isoDay = (ts) => (ts ? String(ts).slice(0, 10) : "");
function planChip(p) {
  const d = trialDaysLeft(p);
  if (p.status === "past_due") return "Pagamento pendente";
  if (d > 0 && !["active", "pago_unico"].includes(p.status)) return `Teste Família: ${d} dia${d === 1 ? "" : "s"}`;
  return `Plano ${PLAN_COPY[p.plan]?.name || p.plan}`;
}
function planFeatures(l) {
  return [
    [l.max_active_trips == null ? "Viagens ativas ilimitadas" : `${l.max_active_trips} viagem ativa por vez`, true],
    ["Histórico de viagens arquivadas", true],
    [l.max_quotes_per_trip == null ? "Cotações ilimitadas por viagem" : `Até ${l.max_quotes_per_trip} cotações por viagem`, true],
    ["Comparativo com pesos personalizados", !!l.can_edit_weights],
    [l.max_programs == null ? "Clubes, pontos e milhas ilimitados" : `${l.max_programs} clube ou programa de benefícios`, true],
    [l.max_memberships_per_program == null ? "Várias adesões por clube" : `${l.max_memberships_per_program} adesão por clube`, true],
    ["Importação de planilhas CSV", !!l.can_import_csv],
    [l.max_members_per_trip ? `Viagem compartilhada com até ${l.max_members_per_trip} pessoas` : "Viagem compartilhada em família", !!l.max_members_per_trip],
    ["Exportação CSV e backup completo", true],
  ];
}

function UpgradeModal({ kind, plan, onClose, go }) {
  const info = LIMITS[kind] || {}; const n = plan?.limits?.[info.key];
  const d = trialDaysLeft(plan);
  return (
    <Modal title={info.title || "Recurso dos planos pagos"} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Agora não</button><button className="btn pri" onClick={() => { onClose(); go("planos"); }}><Crown size={16} />Ver planos</button></>}>
      <p style={{ marginTop: 0 }}>{info.text ? info.text(n) : ""}</p>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Nada do que você já cadastrou é apagado ou bloqueado para leitura.{d > 0 ? "" : " Todas as contas novas começam com 14 dias do plano Família, sem cartão."}</p>
    </Modal>
  );
}

function PlansPage({ plan, refreshPlan, storeMode, toast }) {
  const [cycle, setCycle] = useState("year");
  const [prices, setPrices] = useState(null); const [priceErr, setPriceErr] = useState(false);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    if (storeMode !== "cloud") return;
    api("prices").then((r) => setPrices(r.prices || {})).catch(() => setPriceErr(true));
  }, [storeMode]);
  if (storeMode !== "cloud") return <div className="card"><Empty icon={Crown} title="Planos disponíveis na versão em nuvem" text="Esta instalação salva apenas no navegador. Configure o Supabase e o Stripe (veja o README) para ativar contas, planos e o teste grátis." /></div>;
  if (!plan) return <div className="card"><Empty icon={Crown} title="Carregando seu plano…" text="Se demorar, confira se o script supabase/002_planos_stripe.sql foi executado no Supabase."><button className="btn" onClick={refreshPlan}>Tentar de novo</button></Empty></div>;

  const catalog = (plan.catalog || []).reduce((a, l) => ({ ...a, [l.plan]: l }), {});
  const d = trialDaysLeft(plan);
  const sub = ["active", "trialing", "past_due"].includes(plan.status);
  const pago = plan.status === "pago_unico";
  const priceOf = (k) => (prices?.[k]?.amount != null ? prices[k].amount : REF_PRICES[k]);
  const go = async (body, key) => {
    setBusy(key);
    try { const r = await api(body.portal ? "portal" : "checkout", body.portal ? {} : body); window.location.href = r.url; }
    catch (e) { toast(e.message || "Não foi possível abrir o pagamento.", "err"); setBusy(""); }
  };
  let status = null;
  if (plan.status === "past_due") status = ["red", `O último pagamento não foi aprovado. Atualize a forma de pagamento até ${fdate(isoDay(new Date(new Date(plan.current_period_end || Date.now()).getTime() + 7 * 86400000).toISOString()))} para não voltar ao plano Gratuito.`];
  else if (sub && plan.cancel_at_period_end) status = ["orange", `Assinatura cancelada. O plano ${PLAN_COPY[plan.paid_plan]?.name} continua ativo até ${fdate(isoDay(plan.current_period_end))} e depois sua conta passa para o Gratuito, sem perder dados.`];
  else if (sub) status = ["blue", `Plano ${PLAN_COPY[plan.paid_plan]?.name} ${plan.interval === "year" ? "anual" : "mensal"}${plan.status === "trialing" && d > 0 ? `. A primeira cobrança será em ${fdate(isoDay(plan.trial_ends_at))}, quando seu teste terminar.` : plan.current_period_end ? `, renova em ${fdate(isoDay(plan.current_period_end))}.` : "."}`];
  else if (pago) status = ["blue", `Plano ${PLAN_COPY[plan.paid_plan]?.name} pago com Pix, válido até ${fdate(isoDay(plan.current_period_end))}. Não há renovação automática: renove quando quiser.`];
  else if (d > 0) status = ["blue", `Você está no teste gratuito do plano Família: ${d} dia${d === 1 ? "" : "s"} restante${d === 1 ? "" : "s"}, até ${fdate(isoDay(plan.trial_ends_at))}. Sem cartão, sem cobrança automática.`];
  else status = ["", "Você está no plano Gratuito. Assine quando quiser: seus dados continuam todos aqui."];

  return (
    <div className="grid">
      <div className={`alert ${status[0]}`} style={{ alignItems: "center" }}>
        <Crown size={16} color="#167D9A" /><span style={{ flex: 1 }}>{status[1]}</span>
        {plan.has_customer && (sub || pago) && <button className="btn sm" disabled={!!busy} onClick={() => go({ portal: true }, "portal")}>{busy === "portal" ? "Abrindo…" : "Gerenciar assinatura"}</button>}
      </div>
      <div className="row" style={{ justifyContent: "center" }}>
        <div className="tabs"><button className={cycle === "month" ? "on" : ""} onClick={() => setCycle("month")}>Mensal</button><button className={cycle === "year" ? "on" : ""} onClick={() => setCycle("year")}>Anual <span className="badge b-green" style={{ marginLeft: 4 }}>2 meses grátis</span></button></div>
      </div>
      <div className="grid g3 plans">
        {["free", "viajante", "familia"].map((k) => {
          const l = catalog[k] || {}; const copy = PLAN_COPY[k];
          const key = k === "free" ? null : `${k}_${cycle === "year" ? "anual" : "mensal"}`;
          const price = key ? priceOf(key) : 0;
          const current = plan.plan === k && (k === "free" ? !sub && !pago && d === 0 : true);
          const paidCurrent = (sub || pago) && plan.paid_plan === k;
          const featured = k === "familia";
          let cta = null;
          if (k === "free") cta = <button className="btn" disabled style={{ width: "100%", justifyContent: "center" }}>{current ? "Plano atual" : "Incluído para todos"}</button>;
          else if (paidCurrent && (pago || plan.interval === cycle)) cta = <button className="btn" disabled style={{ width: "100%", justifyContent: "center" }}><Check size={15} />Seu plano</button>;
          else if (sub) cta = <button className={`btn ${featured ? "pri" : ""}`} disabled={!!busy} style={{ width: "100%", justifyContent: "center" }} onClick={() => go({ portal: true }, k)}>{busy === k ? "Abrindo…" : paidCurrent ? `Mudar para ${cycle === "year" ? "anual" : "mensal"}` : `Mudar para ${copy.name}`}</button>;
          else cta = <button className={`btn ${featured ? "pri" : ""}`} disabled={!!busy} style={{ width: "100%", justifyContent: "center", padding: "11px 14px" }} onClick={() => go({ lookupKey: key }, k)}>{busy === k ? "Abrindo pagamento…" : d > 0 ? `Assinar ${copy.name}` : `Assinar ${copy.name}`}</button>;
          return (
            <div key={k} className={`card plan ${featured ? "featured" : ""} ${current || paidCurrent ? "current" : ""}`}>
              <div className="row between"><span className={`badge ${featured ? "b-green" : "b-sand"}`}>{copy.tag}</span>{(current || paidCurrent) && <span className="badge b-blue">Atual</span>}</div>
              <h3 className="serif" style={{ fontSize: 24, fontWeight: 400, margin: "14px 0 4px" }}>{copy.name}</h3>
              <p className="muted" style={{ margin: 0, fontSize: 13, minHeight: 38 }}>{copy.desc}</p>
              <div className="price">
                {k === "free" ? <><b className="serif">R$ 0</b><span>para sempre</span></> : <><b className="serif">{brl(price)}</b><span>/{cycle === "year" ? "ano" : "mês"}</span></>}
              </div>
              <div className="muted" style={{ fontSize: 12.5, minHeight: 18 }}>{k !== "free" && cycle === "year" ? `Equivale a ${brl(price / 12)} por mês` : k !== "free" ? `${brl(priceOf(`${k}_anual`))} no plano anual` : ""}</div>
              <div style={{ margin: "16px 0" }}>{cta}</div>
              {k !== "free" && cycle === "year" && !sub && !paidCurrent && <button className="pixlink" disabled={!!busy} onClick={() => go({ lookupKey: key, pix: true }, `${k}-pix`)}>{busy === `${k}-pix` ? "Abrindo…" : "Prefere Pix? Pague 12 meses de uma vez"}</button>}
              <ul className="feat">{planFeatures(l).map(([t, ok]) => <li key={t} className={ok ? "" : "off"}>{ok ? <Check size={15} /> : <X size={15} />}<span>{t}</span></li>)}</ul>
            </div>
          );
        })}
      </div>
      {priceErr && <p className="note" style={{ justifyContent: "center" }}><Info size={14} />Não foi possível consultar os preços no Stripe agora. Os valores exibidos são de referência; o valor cobrado aparece na página de pagamento.</p>}
      <div className="card faq">
        <h3>Perguntas frequentes</h3>
        <div className="grid g2" style={{ gap: 18 }}>
          <div><b>Como funciona o teste grátis?</b><p>Toda conta nova tem 14 dias do plano Família, sem cartão. Ao fim, a conta passa para o Gratuito, sem cobrança. Se assinar durante o teste, a primeira cobrança só acontece quando ele terminar.</p></div>
          <div><b>Posso cancelar quando quiser?</b><p>Sim, em “Gerenciar assinatura”. O plano continua até o fim do período já pago e depois a conta volta para o Gratuito.</p></div>
          <div><b>O que acontece com meus dados se eu cancelar?</b><p>Nada é apagado. O que passar do limite do Gratuito fica disponível para consulta, e você pode exportar tudo a qualquer momento.</p></div>
          <div><b>Quais formas de pagamento?</b><p>Cartão de crédito Visa ou Mastercard e boleto, com renovação automática. No plano anual também há Pix, pago de uma vez e sem renovação automática.</p></div>
        </div>
        <p className="note" style={{ marginTop: 14 }}><Lock size={14} />O pagamento acontece na página segura do Stripe. O Férias Planejadas não recebe nem armazena dados de cartão.</p>
      </div>
    </div>
  );
}

// ---------- Raiz: autenticação e escolha do armazenamento ----------
export default function App() {
  useState(() => {
    try { const t = new URLSearchParams(window.location.search).get("convite"); if (t) { localStorage.setItem("fp-convite", t); window.history.replaceState({}, "", window.location.pathname); } } catch (e) { /* ignore */ }
    return null;
  });
  const [session, setSession] = useState(cloudEnabled ? undefined : null);
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    if (!cloudEnabled) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data } = supabase.auth.onAuthStateChange((ev, sess) => { if (ev === "PASSWORD_RECOVERY") setRecovery(true); setSession(sess || null); });
    return () => data.subscription.unsubscribe();
  }, []);
  const uidKey = session?.user?.id || "";
  const store = useMemo(() => (cloudEnabled ? (uidKey ? createCloudStore(supabase, uidKey) : null) : createLocalStore()), [uidKey]);
  if (cloudEnabled && session === undefined) return <div className="fp auth-wrap"><p className="muted">Carregando…</p></div>;
  if (cloudEnabled && (!session || recovery)) return <Auth supabase={supabase} recovery={recovery} onRecovered={() => setRecovery(false)} />;
  return <AppInner key={uidKey || "local"} store={store} me={uidKey || "local"} account={session?.user?.email || ""} onSignOut={cloudEnabled ? () => supabase.auth.signOut() : null} />;
}
