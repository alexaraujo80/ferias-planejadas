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

## Fase 3: evolução para SaaS (planejado, não implementado)

Conforme a especificação, esta fase é de planejamento. A base já está preparada:

| Tema | Já existe | Próximo passo |
| --- | --- | --- |
| Autenticação | E-mail e senha, confirmação, recuperação de senha | Login com Google, MFA |
| Multiusuários | Dados isolados por `user_id` com RLS | Tabela `organizations` + `memberships`, para viagens compartilhadas em família |
| Planos e limites | `profiles.plan` protegido e tabela `plan_limits` | Aplicar limites via gatilho no banco (ex.: número de viagens) |
| Assinaturas | — | Mercado Pago, Asaas ou Stripe com webhooks em Edge Functions que atualizam `profiles.plan` |
| Recursos premium | Regras de negócio separadas da interface | Anexos em arquivo, compartilhamento de roteiro, alertas por e-mail |
| Área administrativa | — | Painel separado usando `service_role` só no servidor |
| Monitoramento | Logs no console | Sentry e Vercel Analytics |
| Privacidade (LGPD) | Exportação JSON/CSV e exclusão de dados | Política de privacidade, termos e exclusão de conta pelo app |
