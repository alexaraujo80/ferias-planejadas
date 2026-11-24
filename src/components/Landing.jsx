import React, { useEffect, useState } from "react";
import {
  Sun, Scale, CalendarClock, Users, Lock, Gift, Waves, Calculator, Smartphone, ShieldCheck, Check, ArrowRight, FileText, Receipt, CloudSun, Navigation,
} from "lucide-react";

// Página de apresentação: o que o visitante vê antes de criar a conta (destino dos anúncios).
const REF = { viajante: { month: 7.9, year: 79 }, familia: { month: 12.9, year: 129 } };
const brl = (n) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Landing({ onStart, onLogin }) {
  const [cycle, setCycle] = useState("year");
  const [prices, setPrices] = useState(null);
  useEffect(() => { fetch("/api/prices").then((r) => (r.ok ? r.json() : null)).then((j) => j?.prices && setPrices(j.prices)).catch(() => {}); }, []);
  const price = (plan) => { const k = `${plan}_${cycle === "year" ? "anual" : "mensal"}`; return prices?.[k]?.amount ?? REF[plan][cycle]; };
  const Cta = ({ big }) => <button className={`lp-cta ${big ? "big" : ""}`} onClick={onStart}>Começar grátis por 14 dias<ArrowRight size={big ? 20 : 17} /></button>;

  return (
    <div className="lp">
      <header className="lp-top">
        <div className="lp-wrap lp-row">
          <div className="lp-logo"><span className="lp-mark"><Sun size={20} /></span><b>Férias Planejadas</b></div>
          <nav className="lp-nav"><a href="#como-funciona">Como funciona</a><a href="#recursos">Recursos</a><a href="#planos">Planos</a></nav>
          <div className="lp-row" style={{ gap: 8 }}><button className="lp-ghost" onClick={onLogin}>Entrar</button><button className="lp-cta sm" onClick={onStart}>Começar grátis</button></div>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-sun" />
        <div className="lp-wrap lp-hero-grid">
          <div>
            <span className="lp-pill">Planejamento de viagens para famílias</span>
            <h1>Suas férias organizadas, do orçamento ao acerto de contas.</h1>
            <p className="lp-lead">Compare cotações de agências pelo custo-benefício, não só pelo preço. Acompanhe cada parcela, monte o roteiro e divida os gastos com quem viaja junto.</p>
            <div className="lp-row" style={{ gap: 14, marginTop: 28, flexWrap: "wrap" }}><Cta big /><span className="lp-muted">Sem cartão de crédito. Cancele quando quiser.</span></div>
          </div>
          <div className="lp-mock" aria-label="Exemplo do ranking de cotações">
            <div className="lp-mock-h">Ranking de custo-benefício <span>segundo os seus critérios</span></div>
            {[["1", "Agência Coral", "R$ 14.600, voo direto, all inclusive", 86, true], ["2", "Agência Maré", "R$ 12.900, 1 conexão, café da manhã", 74], ["3", "Agência Sol", "R$ 11.800, 2 conexões, sem bagagem", 58]].map(([p, n, d, sc, lead]) => (
              <div key={p} className={`lp-rank ${lead ? "lead" : ""}`}>
                <span className="lp-pos">{p}</span>
                <div className="lp-rank-t"><b>{n}</b>{lead && <em>Maior pontuação</em>}<small>{d}</small></div>
                <div className="lp-score"><b>{sc}</b><small>/100</small><i style={{ width: `${sc}%` }} /></div>
              </div>))}
            <div className="lp-mock-f">Exemplo ilustrativo: a mais cara lidera por voo direto, all inclusive e cancelamento flexível.</div>
          </div>
        </div>
        <svg className="lp-wave" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true"><path d="M0 60 C 240 20 480 100 720 60 S 1200 20 1440 60 L1440 120 L0 120 Z" fill="#F8FBFB" /></svg>
      </section>

      <section className="lp-sec" id="como-funciona">
        <div className="lp-wrap">
          <h2>Como funciona</h2>
          <div className="lp-steps">
            {[[FileText, "1. Cadastre a viagem e as cotações", "Destino, datas, orçamento e as propostas que as agências enviaram, com valores, parcelas, voo, hotel e serviços."],
              [Scale, "2. Compare e escolha com segurança", "O ranking pesa preço, hospedagem, voo, serviços e cancelamento do jeito que importa para você. Ao escolher, as parcelas entram no calendário."],
              [Receipt, "3. Viaje e acerte as contas", "Cada um lança os gastos no próprio celular, até sem internet. No fim, o app mostra quem paga a quem e o balanço completo."]].map(([I, t, d]) => (
              <div key={t} className="lp-step"><span className="lp-ic"><I size={22} /></span><h3>{t}</h3><p>{d}</p></div>))}
          </div>
        </div>
      </section>

      <section className="lp-sec alt" id="recursos">
        <div className="lp-wrap">
          <h2>Tudo o que a viagem exige, em um só lugar</h2>
          <div className="lp-grid">
            {[[Scale, "Custo-benefício de verdade", "Notas por critério e a conta à mostra. Quando falta informação, o app avisa em vez de inventar."],
              [CalendarClock, "Pagamentos sob controle", "Entrada, parcelas e vencimentos em lista e calendário, com alertas antes de vencer."],
              [Calculator, "Estimativas prontas", "Alimentação, viagem de carro e cruzeiro, considerando idades das crianças e descontos."],
              [Gift, "Clubes de desconto e pontos", "Economia do 2x1 com várias adesões, se a anuidade se paga e quanto valem seus pontos."],
              [Waves, "Roteiro com marés e tempo", "Previsão do tempo e o melhor horário de maré para as piscinas naturais, dia a dia."],
              [Navigation, "Rotas do dia", "Abra a rota no Google Maps e veja a distância e o tempo entre as atividades."],
              [Smartphone, "Funciona sem internet", "Instale no celular direto pelo navegador e lance gastos mesmo na praia, sem sinal."],
              [ShieldCheck, "Seguro por padrão", "Pagamento pelo Stripe, sem dados de cartão no app, e seus dados exportáveis quando quiser."]].map(([I, t, d]) => (
              <div key={t} className="lp-card"><span className="lp-ic sm"><I size={18} /></span><h3>{t}</h3><p>{d}</p></div>))}
          </div>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-wrap lp-split">
          <div>
            <span className="lp-pill">Plano Família</span>
            <h2 style={{ textAlign: "left" }}>A viagem é de todos. As contas também.</h2>
            <p className="lp-lead" style={{ fontSize: 18 }}>Convide até 5 pessoas por um link no WhatsApp. Cada uma usa a própria conta, no próprio celular, e o que um lança aparece para os outros em segundos.</p>
            <ul className="lp-list">
              <li><Check size={18} />Acerto de contas automático: quem pagou, quem consumiu e quem deve a quem.</li>
              <li><Lock size={18} />Compras pessoais ficam privadas: os outros veem só o total, sem detalhes.</li>
              <li><Users size={18} />Papéis de editor, participante ou leitor para cada pessoa.</li>
            </ul>
          </div>
          <div className="lp-mock">
            <div className="lp-mock-h">Acerto entre viajantes <span>exemplo</span></div>
            {[["A", "Ana", "R$ 1.240", "R$ 980", "+R$ 260", "up"], ["P", "Pedro", "R$ 620", "R$ 800", "−R$ 180", "down"], ["L", "Lia", "R$ 400", "R$ 480", "−R$ 80", "down"]].map(([i, n, pg, cs, sd, c]) => (
              <div key={n} className="lp-person"><span className="lp-av">{i}</span><b>{n}</b><span>pagou {pg}</span><span>consumiu {cs}</span><em className={c}>{sd}</em></div>))}
            <div className="lp-transfer"><b>Pedro</b><ArrowRight size={15} /><b>Ana</b><span>R$ 180</span></div>
            <div className="lp-transfer"><b>Lia</b><ArrowRight size={15} /><b>Ana</b><span>R$ 80</span></div>
          </div>
        </div>
      </section>

      <section className="lp-sec alt" id="planos">
        <div className="lp-wrap">
          <h2>Planos simples, sem surpresa</h2>
          <p className="lp-center lp-muted">Toda conta nova começa com 14 dias do plano Família, sem cartão. Depois, você escolhe.</p>
          <div className="lp-center" style={{ margin: "18px 0 26px" }}>
            <div className="lp-toggle"><button className={cycle === "month" ? "on" : ""} onClick={() => setCycle("month")}>Mensal</button><button className={cycle === "year" ? "on" : ""} onClick={() => setCycle("year")}>Anual <em>2 meses grátis</em></button></div>
          </div>
          <div className="lp-plans">
            {[["Gratuito", null, "Para conhecer", ["1 viagem ativa por vez", "Até 3 cotações por viagem", "Exportação e backup"]],
              ["Viajante", "viajante", "Para quem viaja sempre", ["Viagens e cotações ilimitadas", "Comparativo com seus pesos", "Clubes, pontos e rotas do dia"]],
              ["Família", "familia", "Mais completo", ["Tudo do Viajante", "Viagem compartilhada com até 6 pessoas", "Acerto automático e despesas privadas"]]].map(([n, k, tag, feats]) => (
              <div key={n} className={`lp-plan ${k === "familia" ? "feat" : ""}`}>
                <span className="lp-tag">{tag}</span>
                <h3>{n}</h3>
                <div className="lp-price">{k ? <><b>{brl(price(k))}</b><span>/{cycle === "year" ? "ano" : "mês"}</span></> : <><b>R$ 0</b><span>para sempre</span></>}</div>
                <ul>{feats.map((f) => <li key={f}><Check size={16} />{f}</li>)}</ul>
                <button className={k === "familia" ? "lp-cta" : "lp-ghost wide"} onClick={onStart}>{k ? "Começar grátis" : "Criar conta"}</button>
              </div>))}
          </div>
          <p className="lp-center lp-muted" style={{ fontSize: 14, marginTop: 18 }}>Cartão de crédito ou boleto. No plano anual, também Pix.</p>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-wrap lp-faq">
          <h2>Perguntas frequentes</h2>
          {[["Preciso instalar algo?", "Não. O Férias Planejadas funciona no navegador do celular e do computador. Se quiser, instale na tela inicial direto pelo navegador, sem loja de aplicativos."],
            ["O app contrata a viagem por mim?", "Não. Você continua negociando com as agências. O app organiza as propostas, ajuda a comparar e registra a sua decisão e os pagamentos."],
            ["Como funciona o teste grátis?", "Ao criar a conta você ganha 14 dias do plano Família, sem cartão. Ao fim, a conta passa para o Gratuito, sem nenhuma cobrança."],
            ["Meus dados ficam seguros?", "Cada conta só acessa os próprios dados, garantido no banco de dados. O pagamento é feito pelo Stripe, e o app não guarda dados de cartão."]].map(([q, a]) => (
            <details key={q}><summary>{q}</summary><p>{a}</p></details>))}
        </div>
      </section>

      <section className="lp-final">
        <div className="lp-wrap lp-center">
          <h2>Sua próxima viagem começa organizada.</h2>
          <p className="lp-lead" style={{ margin: "10px auto 28px" }}>Crie a conta em menos de um minuto e cadastre as cotações que você já recebeu.</p>
          <Cta big />
        </div>
      </section>

      <footer className="lp-foot"><div className="lp-wrap lp-row"><span>© {new Date().getFullYear()} Férias Planejadas</span><button className="lp-link" onClick={onLogin}>Já tenho conta</button></div></footer>
    </div>
  );
}
