# Férias Planejadas

Aplicação web para planejar viagens de férias: orçamento, cotações de agências com comparativo de custo-benefício, proposta selecionada com cronograma de parcelas, roteiro, despesas durante a viagem, clubes de benefícios (Prime Gourmet, Clube do Rolê), pontos e milhas, e balanço final.

## Arquitetura

| Camada | Tecnologia | Onde |
| --- | --- | --- |
| Interface | React 18 + Vite, Recharts, Lucide | `src/App.jsx`, `src/styles.css` |
| Regras de negócio | Funções puras (cálculos, pontuação, parcelas, acerto) | topo de `src/App.jsx` |
| Persistência | Supabase (Postgres + Auth + RLS) ou navegador | `src/lib/storage.js` |
| Banco | Uma tabela por entidade, chave `(user_id, id)`, FK para a viagem | `supabase/schema.sql` |
| Hospedagem | Vercel, a partir do GitHub | `vercel.json` |

**Como os dados são gravados.** A interface mantém o estado em memória. A cada alteração, `storage.js` compara com o último estado confirmado no banco e envia apenas os registros alterados (upsert) e as exclusões. Se a conexão falhar, nada se perde: a sincronização é repetida automaticamente. Ao voltar para a aba, os dados são recarregados para refletir alterações feitas em outro aparelho.

**Isolamento de dados.** Cada tabela tem RLS forçada: um usuário só lê, cria, altera e exclui linhas com o próprio `user_id`. Isso é garantido pelo banco, não por filtros da tela. O campo `plan` do perfil não pode ser alterado pelo navegador.

**Sem Supabase configurado**, o app funciona salvando apenas no navegador (`localStorage`), útil para testar. Os dados não passam para outros aparelhos.

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha com os dados do Supabase (opcional)
npm run dev
```

## Configurar o Supabase (uma vez)

1. Crie um projeto em <https://supabase.com> (o plano gratuito atende ao uso pessoal).
2. Em **SQL Editor → New query**, cole o conteúdo de `supabase/schema.sql` e clique em **Run**. O script pode ser executado de novo sem perder dados.
3. Em **Authentication → URL Configuration**:
   - **Site URL**: o endereço da Vercel, por exemplo `https://ferias-planejadas.vercel.app`.
   - **Redirect URLs**: o mesmo endereço e `http://localhost:5173` para desenvolvimento.
4. Em **Authentication → Providers → Email**, mantenha a confirmação de e-mail ativada (recomendado).
5. Em **Project Settings → API**, copie a **Project URL** e a chave **anon / publishable**.

> A chave `service_role` nunca deve ir para o frontend nem para variáveis `VITE_*`.

## Publicar (GitHub + Vercel)

```bash
git init
git add .
git commit -m "Férias Planejadas: MVP"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/ferias-planejadas.git
git push -u origin main
```

Na Vercel: **Add New → Project → Import** o repositório. O framework Vite é detectado. Em **Environment Variables**, cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` e clique em **Deploy**. Cada `git push` na `main` publica uma nova versão.

## Primeiro acesso

Crie a conta na tela de entrada e confirme o e-mail. Se você já usava o app salvando no navegador, ele oferece enviar esses dados para a sua conta. Também é possível restaurar um backup JSON em **Configurações**.

## Critérios de aceitação do MVP

| # | Critério | Status |
| --- | --- | --- |
| 1 | Criar viagem com datas, destino, viajantes e orçamento | Atendido |
| 2 | Cadastrar três ou mais cotações | Atendido |
| 3 | Comparar totais, parcelas e serviços | Atendido |
| 4 | Alterar pesos e ver o ranking recalculado | Atendido |
| 5 | Selecionar proposta e gerar cronograma sem duplicidade | Atendido |
| 6 | Registrar despesas antes e durante a viagem | Atendido |
| 7 | Ver saldo restante e pagamentos pendentes | Atendido |
| 8 | Consultar o balanço final | Atendido |
| 9 | Exportar para CSV | Atendido |
| 10 | Atualizar a página sem perder registros | Atendido (nuvem ou navegador) |
| 11 | Usar no celular e no desktop | Atendido |
| 12 | Publicar na Vercel a partir do GitHub | Pronto para publicar (passos acima) |
| 13 | Credenciais e dados protegidos | Chave pública + RLS forçada; sem segredos no código |

## Limitações desta versão

- Anexos são links. Envio de arquivos exige Supabase Storage com bucket privado (planejado).
- Excluir a **conta** (não só os dados) exige uma Edge Function com `service_role`. Hoje: **Configurações → Excluir todos os dados** apaga os registros; a conta pode ser removida pelo painel do Supabase.
- Edição simultânea do mesmo registro em dois aparelhos: vale a última gravação.
- O pacote JavaScript tem cerca de 280 kB compactado; dividir por tela é uma melhoria futura.

## Planos, teste grátis e Stripe

| | Gratuito | Viajante | Família |
| --- | --- | --- | --- |
| Preço | R$ 0 | R$ 7,90/mês ou R$ 79/ano | R$ 12,90/mês ou R$ 129/ano |
| Viagens ativas | 1 | Ilimitadas | Ilimitadas |
| Cotações por viagem | 3 | Ilimitadas | Ilimitadas |
| Pesos do comparativo | Padrão | Personalizados | Personalizados |
| Clubes e programas | 1 (1 adesão) | Ilimitados | Ilimitados |
| Importação CSV | — | Sim | Sim |
| Viagem compartilhada | — | — | Até 6 pessoas (próxima etapa) |

O plano anual equivale a 10 meses (2 meses grátis). Toda conta nova recebe **14 dias do Família, sem cartão**. Ao fim, a conta volta para o Gratuito, sem cobrança. Quem assina durante o teste só é cobrado quando ele termina.

**Onde cada coisa é configurada:** os limites ficam na tabela `plan_limits` do Supabase e podem ser editados no Table Editor, sem deploy. Preços, cupons, métodos de pagamento e o portal do cliente ficam no Stripe. O plano de uma conta só muda pelo webhook do Stripe; o navegador não consegue alterá-lo.

**Ao cair de plano, nada é apagado.** Os limites só impedem criar itens acima do permitido. Viagens, cotações e clubes que já existem continuam editáveis.

### Passo a passo

1. **Banco:** no SQL Editor do Supabase, execute `supabase/002_planos_stripe.sql` (depois do `schema.sql`).
2. **Produtos no Stripe** (comece em modo de teste): em **Catálogo de produtos**, crie os produtos *Viajante* e *Família*, cada um com dois preços recorrentes em BRL. Em cada preço, abra "Opções avançadas" e preencha a **lookup key** exatamente assim:

   | Produto | Preço | Lookup key |
   | --- | --- | --- |
   | Viajante | R$ 7,90 mensal | `viajante_mensal` |
   | Viajante | R$ 79,00 anual | `viajante_anual` |
   | Família | R$ 12,90 mensal | `familia_mensal` |
   | Família | R$ 129,00 anual | `familia_anual` |

   Para mudar um preço depois, crie o novo preço e **transfira a lookup key** para ele. A página de planos atualiza sozinha.
3. **Métodos de pagamento:** em **Configurações → Pagamentos → Métodos de pagamento**, ative Cartões, Boleto e Pix.
4. **Portal do cliente:** em **Configurações → Billing → Portal do cliente**, ative cancelamento de assinatura, atualização da forma de pagamento, histórico de faturas e **troca de plano** entre os quatro preços acima.
5. **Webhook:** em **Desenvolvedores → Webhooks → Adicionar destino**, use `https://SEU-APP.vercel.app/api/webhook` e selecione os eventos:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`.
6. **Variáveis na Vercel** (Settings → Environment Variables), **sem** o prefixo `VITE_`:

   | Nome | Onde encontrar |
   | --- | --- |
   | `STRIPE_SECRET_KEY` | Stripe → Desenvolvedores → Chaves de API (`sk_test_...` no modo de teste) |
   | `STRIPE_WEBHOOK_SECRET` | Na tela do webhook criado (`whsec_...`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Criada pela integração Supabase ↔ Vercel; confira se existe |
   | `SUPABASE_URL` | Criada pela integração; ou use o mesmo valor de `VITE_SUPABASE_URL` |

7. Faça **Redeploy**. Teste com o cartão `4242 4242 4242 4242`, qualquer data futura e qualquer CVC.
8. Quando estiver tudo certo, repita os passos 2 a 6 no **modo de produção** do Stripe e troque as chaves na Vercel.

### Formas de pagamento no Brasil

Cartão de crédito Visa e Mastercard e boleto funcionam na assinatura com renovação automática. O Pix fica disponível no plano anual como **pagamento único de 12 meses**, sem renovação automática, porque o Pix recorrente (Pix Automático) não está disponível para contas Stripe no Brasil. Amex, Elo e Hipercard não são aceitos pelo Stripe no Brasil.

## Próximos passos (Fase 3)

| Tema | Situação |
| --- | --- |
| Planos, limites, teste grátis e Stripe | Implementado |
| Várias adesões por clube e conta da mesa com vários pares | Implementado |
| Viagens compartilhadas (convites, papéis, atualização ao vivo) | Próxima etapa |
| Anexos em arquivo (Supabase Storage privado) | Planejado |
| Login com Google, MFA | Planejado |
| Área administrativa, Sentry, Vercel Analytics | Planejado |
| Política de privacidade, termos e exclusão de conta pelo app | Planejado |
