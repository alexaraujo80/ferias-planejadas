/* Camada de persistência.
   A interface trabalha com um estado único em memória ({ trips, items, quotes, ... }).
   Esta camada traduz esse estado para o armazenamento escolhido:

   - Nuvem (Supabase): uma tabela por entidade, chave (user_id, id), vínculo com a viagem por
     chave estrangeira e políticas RLS. A cada alteração, só os registros que mudaram são
     enviados (upsert) e só os removidos são apagados — nada é regravado em massa.
   - Navegador: localStorage, quando o Supabase não está configurado (uso pessoal em um aparelho).
*/

const KEY = "ferias-planejadas-v1";

// coleção do app -> tabela no banco, e se o registro pertence a uma viagem
export const TABLES = {
  trips: { table: "trips", trip: false },
  programs: { table: "loyalty_programs", trip: false },
  items: { table: "budget_items", trip: true },
  quotes: { table: "quotes", trip: true },
  bookings: { table: "bookings", trip: true },
  payments: { table: "payments", trip: true },
  expenses: { table: "expenses", trip: true },
  itinerary: { table: "itinerary_items", trip: true },
  redemptions: { table: "redemptions", trip: true },
  docs: { table: "attachments", trip: true },
  log: { table: "audit_logs", trip: "optional" },
};

// Sem nuvem não há contas nem cobrança: tudo liberado para uso pessoal.
const LOCAL_PLAN = { plan: "local", limits: { max_active_trips: null, max_quotes_per_trip: null, max_programs: null, max_memberships_per_program: null, can_edit_weights: true, can_import_csv: true, max_members_per_trip: 0 }, catalog: [] };

export function readBrowserBackup() {
  try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; }
}

export function createLocalStore() {
  const hasClaude = typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
  if (hasClaude) {
    return {
      mode: "claude",
      async load() { try { const r = await window.storage.get(KEY, false); return { data: r ? JSON.parse(r.value) : null, ok: true }; } catch (e) { return { data: null, ok: true }; } },
      async save(s) { try { return !!(await window.storage.set(KEY, JSON.stringify(s), false)); } catch (e) { return false; } },
      async plan() { return LOCAL_PLAN; },
    };
  }
  return {
    mode: "local",
    async load() { try { const v = localStorage.getItem(KEY); return { data: v ? JSON.parse(v) : null, ok: true }; } catch (e) { return { data: null, ok: false }; } },
    async save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; } },
    async plan() { return LOCAL_PLAN; },
  };
}

const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
const must = async (p) => { const { error } = await p; if (error) throw error; };

export function createCloudStore(supabase, userId) {
  let snap = {}; // coleção -> Map(id -> JSON do registro) do último estado confirmado no banco
  let snapSettings = "";

  const toRow = (col, r) => {
    const { id, tripId, ...data } = r;
    const row = { user_id: userId, id: String(id), data };
    if (TABLES[col].trip) row.trip_id = tripId ?? null;
    return row;
  };
  const fromRow = (col, row) => (TABLES[col].trip ? { ...row.data, id: row.id, tripId: row.trip_id } : { ...row.data, id: row.id });

  async function fetchAll(table) {
    const out = []; const size = 1000;
    for (let from = 0; ; from += size) {
      const { data, error } = await supabase.from(table).select("*").eq("user_id", userId).order("created_at", { ascending: true }).range(from, from + size - 1);
      if (error) throw error;
      out.push(...data);
      if (data.length < size) break;
    }
    return out;
  }

  return {
    mode: "cloud",
    async plan() {
      const { data, error } = await supabase.rpc("get_my_plan");
      if (error) { console.error("Falha ao consultar o plano", error); return null; }
      return data;
    },
    async load() {
      try {
        const state = {};
        const results = await Promise.all(Object.entries(TABLES).map(([col, t]) => fetchAll(t.table).then((rows) => [col, rows])));
        results.forEach(([col, rows]) => { state[col] = rows.map((r) => fromRow(col, r)); });
        state.log = (state.log || []).sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
        const { data: prof } = await supabase.from("profiles").select("settings").eq("id", userId).maybeSingle();
        state.activeTripId = prof?.settings?.activeTripId ?? null;
        snap = {};
        Object.keys(TABLES).forEach((col) => { snap[col] = new Map((state[col] || []).map((r) => [String(r.id), JSON.stringify(r)])); });
        snapSettings = JSON.stringify({ activeTripId: state.activeTripId });
        return { data: state, ok: true };
      } catch (e) {
        console.error("Falha ao carregar da nuvem", e);
        return { data: null, ok: false };
      }
    },
    async save(s) {
      try {
        const next = {}, up = {}, del = {};
        const tripIds = new Set((s.trips || []).map((t) => String(t.id)));
        for (const col of Object.keys(TABLES)) {
          let list = s[col] || [];
          // Registro de viagem inexistente violaria a chave estrangeira: não é enviado.
          if (TABLES[col].trip === true) list = list.filter((r) => tripIds.has(String(r.tripId)));
          const m = new Map(list.map((r) => [String(r.id), JSON.stringify(r)]));
          const prev = snap[col] || new Map();
          next[col] = m;
          up[col] = list.filter((r) => prev.get(String(r.id)) !== m.get(String(r.id))).map((r) => toRow(col, r));
          del[col] = [...prev.keys()].filter((id) => !m.has(id));
        }
        const children = Object.keys(TABLES).filter((c) => c !== "trips");
        for (const part of chunk(up.trips, 500)) await must(supabase.from("trips").upsert(part, { onConflict: "user_id,id" }));
        for (const col of children) for (const part of chunk(up[col], 500)) await must(supabase.from(TABLES[col].table).upsert(part, { onConflict: "user_id,id" }));
        for (const col of children) for (const part of chunk(del[col], 200)) await must(supabase.from(TABLES[col].table).delete().eq("user_id", userId).in("id", part));
        for (const part of chunk(del.trips, 200)) await must(supabase.from("trips").delete().eq("user_id", userId).in("id", part));
        const settings = JSON.stringify({ activeTripId: s.activeTripId ?? null });
        if (settings !== snapSettings) { await must(supabase.from("profiles").update({ settings: JSON.parse(settings) }).eq("id", userId)); snapSettings = settings; }
        snap = next;
        return true;
      } catch (e) {
        const msg = String(e?.message || "");
        // Recusa por limite do plano (gatilhos do banco): não adianta repetir; o app recarrega e avisa.
        if (msg.startsWith("LIMITE_")) return { limit: msg.split(/\s/)[0] };
        console.error("Falha ao sincronizar", e);
        return false; // o snapshot não muda: tudo que faltou é reenviado na próxima tentativa
      }
    },
  };
}
