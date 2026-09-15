# CORRIDA 26

Aplicação de corrida por pontos simbólicos: Next.js, React, TypeScript, Framer Motion e PostgreSQL. O confronto principal vem sempre das duas primeiras posições calculadas pelo servidor. O projeto inclui interface, rotas de API, autenticação, administração, banco persistente, ledger imutável, adapter Pix e testes de integração.

**Estado da entrega:** funciona localmente em sandbox com banco PostgreSQL embarcado persistente (PGlite). A confirmação de pagamento nesse ambiente é explicitamente simulada pelo servidor, sem cobrança. Antes das credenciais de produção serem conectadas, o deploy público exibe o placar completo em modo de apresentação somente para leitura e mantém participações bloqueadas. Produção transacional exige configurar Supabase/PostgreSQL, Google/e-mail, credenciais DePix, domínio HTTPS e realizar a homologação externa; essas contas e credenciais não acompanham o projeto.

## Executar localmente

Requisitos: Node.js 22 ou superior e npm.

```powershell
npm install
Copy-Item .env.example .env.local
# Preencha SESSION_SECRET com um segredo aleatório de pelo menos 32 caracteres.
npm run dev
```

Abra `http://127.0.0.1:3000`. `.env.local` deve conter `APP_MODE=sandbox` e `APP_ORIGIN=http://127.0.0.1:3000`. Se mudar a porta ou hostname, ajuste a origem. A demo permite participar anonimamente e testar perfis comuns ou administrador pelo modal de entrada. A rota de login de demonstração e a confirmação manual retornam 404 quando `APP_MODE=production`.

O banco local fica em `.local/db`. Para preservar o histórico, mantenha essa pasta e o segredo da sessão. `LOCAL_DATABASE_PATH` permite escolher outra pasta. PGlite admite um processo servidor por banco; para múltiplas instâncias use PostgreSQL. Nunca execute a demo em filesystem efêmero da Vercel. Os seis saldos iniciais são registros identificados como `seed` no ledger, exclusivamente no sandbox. O histórico inicia na criação do banco, sem dados temporais fictícios.

## Regras executadas pelo servidor

- R$ 1 inteiro equivale a 1 ponto. O valor mínimo e os atalhos são configuráveis. Frações, valores menores que o mínimo e valores acima de R$ 10.000 são recusados.
- Adicionar gera delta positivo; retirar gera delta negativo. Pontuações podem ficar abaixo de zero, para preservar integralmente as retiradas pagas. Percentuais são calculados sobre os saldos positivos; saldo negativo equivale a 0%.
- Empates são ordenados pela data de cadastro e, depois, pelo identificador. O empate continua explícito no placar. É necessário ultrapassar em pelo menos um ponto para garantir a posição seguinte.
- Candidatos ocultos saem do ranking público. Pagamentos pendentes já emitidos ainda podem ser confirmados e ficam registrados para o candidato original.
- Nenhuma API pública permite definir a pontuação. A confirmação validada e o lançamento no ledger acontecem na mesma transação SQL que atualiza o saldo e registra mudanças de liderança.
- Anulação administrativa adiciona um registro compensatório e log com autor e justificativa; não apaga a movimentação original e **não realiza estorno financeiro**. Estornos devem ser feitos no provedor; o webhook de reembolso confirmado concilia o registro quando aplicável.

## Ativar produção

1. Crie o PostgreSQL/Supabase e obtenha uma conexão de servidor com permissão para executar as migrações. A integração oficial Supabase/Vercel fornece `POSTGRES_URL`; fora dela, use `DATABASE_URL`. Guarde as duas somente no backend. TLS verifica o certificado; configure `DATABASE_SSL_CA` se o provedor exigir uma CA específica. Nunca use `rejectUnauthorized: false`.
2. Configure as variáveis do servidor: `APP_MODE=production`, `APP_ORIGIN=https://seu-dominio`, `SESSION_SECRET`, `POSTGRES_URL` (ou `DATABASE_URL`), `DATA_ENCRYPTION_KEY`, `CRON_SECRET`, `DEPIX_API_KEY` e `DEPIX_WEBHOOK_SECRET`. Configure também `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (ou `NEXT_PUBLIC_SUPABASE_ANON_KEY`) para o cliente. Não exponha service-role, segredo de webhook ou token de pagamento.
3. Execute `npm run db:migrate` em um terminal com as variáveis exportadas. Scripts `tsx` não carregam `.env.local` automaticamente. A migração cria as tabelas, cadastra os seis participantes iniciais com pontuação zero e inicia os pagamentos pausados. Nenhum saldo fictício entra em produção. Faça backup antes de migrações futuras.
4. No Supabase Auth, configure Google e e-mail/OTP, domínio, SMTP e a URL de retorno usada pelo site. Habilite os redirects da origem publicada. Faça login no site com o futuro administrador; a API materializa o usuário após validar o token em `auth.getUser()`.
5. No SQL Editor privado, conceda a permissão administrativa ao UUID já autenticado: `INSERT INTO public.admin_users(user_id) VALUES ('UUID_DO_USUARIO');`. Não atribua essa permissão por metadados do navegador. Os seis participantes iniciais começam em zero; use `/admin` para editar, ocultar ou cadastrar outros.
6. No DePix, crie uma chave live com os escopos necessários e configure o webhook `https://seu-dominio/api/webhooks/depix`. A aplicação valida a assinatura HMAC, deduplica o identificador do evento, consulta novamente o checkout e só credita pontos no status final `completed`.
7. Publique na Vercel como projeto Next.js, com as mesmas variáveis. Execute `npm run build` antes. Defina o domínio HTTPS e mantenha o endpoint do webhook acessível ao provedor. Nenhum diretório `.local`, `.env.local` ou credencial deve ser publicado.
8. Ative pagamentos em `/admin` quando as integrações estiverem configuradas. Homologue uma cobrança, confirme o webhook, confira idempotência/estorno, login Google/e-mail, autorização administrativa e atualização em duas sessões no domínio final. A integração externa não foi validada sem suas credenciais.

Para recuperar notificações perdidas ou uma criação de cobrança interrompida, execute `npx tsx scripts/reconcile.ts` em um agendador confiável, com as variáveis do servidor. Ele consulta o provedor novamente, processa até 100 registros por execução e só aplica estados confirmados. O webhook é o caminho principal; a consulta individual da cobrança também reconcilia o estado. Monitore falhas do job e ajuste a frequência/limite ao volume. O job também remove janelas vencidas do rate limit.


## Programa de criadores

Cada conta autenticada pode abrir `/creator` para gerar um link `/r/[codigo]`. A atribuição usa último clique válido por 30 dias e é fixada no primeiro cadastro; não existe segundo nível. Comissões de compras DePix live ficam pendentes por 14 dias, passam a disponíveis pelo job de reconciliação e são estornadas por lançamentos compensatórios quando a compra é devolvida. Os níveis mensais padrão são Iniciante 20%, Creator 25%, Pro 30% e Elite 35%. O cliente indicado recebe crédito interno de 10% na primeira compra, limitado a R$ 20.

A carteira é derivada de `wallet_ledger`, que é append-only. Saques exigem KYC aprovado, saldo disponível, mínimo configurável de R$ 50 e chave de idempotência. CPF/CNPJ e chave Pix são armazenados com AES-256-GCM. O painel `/admin/creators` controla KYC, suspensão, comissões bloqueadas e sinais antifraude, sempre com motivo no `admin_audit`. A API de saque DePix é não custodial: a resposta cria a cotação/endereço de depósito; a liquidação depende de a carteira operacional financiar essa retirada e o sistema acompanha o estado pelo provedor.
## Segurança e consistência

O frontend gera uma chave de idempotência por intenção de participação. O backend vincula essa chave ao proprietário e rejeita reutilização com valores diferentes. A primeira requisição anônima também é idempotente antes de o cookie chegar ao navegador. A identidade anônima usa um cookie assinado, `HttpOnly`, `SameSite=Lax` e `Secure` sob HTTPS; não contém autorização administrativa.

O identificador interno da transação é a chave de idempotência do gateway. Webhooks exigem HMAC-SHA256 válido, comparação em tempo constante, timestamp recente e registro de recebimento. A aplicação consulta novamente o pagamento no provedor e valida identificador, referência externa, valor, moeda BRL, método Pix e modo de produção. Locks SQL, restrição única e confirmação atômica impedem pontos duplicados. Um timeout na geração preserva a transação e a sessão anônima para repetição segura.

As tabelas têm RLS ativado e nenhuma permissão para escrita de `anon`/`authenticated` do Supabase. Todo acesso passa pelo backend com verificações de sessão e permissão. Triggers impedem UPDATE/DELETE no ledger, histórico, eventos e auditoria. Limites compartilhados no banco protegem login de demonstração, cobrança, consulta e administração; origem obrigatória protege mutações da interface. Configure o proxy confiável para substituir `x-forwarded-for` e use proteção de tráfego da hospedagem conforme volume.

O placar consulta a API a cada dois segundos, sem cache, refletindo o mesmo PostgreSQL em qualquer aba ou instância. A consulta preserva a simplicidade operacional; não depende de memória local para sincronização. Evoluções, liderança, diferenças e posições são derivadas do banco. O cliente anima os novos valores e respeita preferência por movimento reduzido.

## Organização

```text
src/app/              páginas e API Next.js
src/components/       componentes visuais reutilizáveis
src/lib/types.ts      contrato compartilhado
src/server/db.ts      PostgreSQL/PGlite e inicialização
src/server/game.ts    ranking, ledger, confirmações e administração
src/server/payments.ts adapter DePix, webhook e saques
src/server/security.ts sessão, origem, limites e erros
supabase/migrations/  schema SQL e proteção dos registros
scripts/              migração, seed restrito e reconciliação
tests/                integração do backend e testes de navegador
```

Entidades: `users`, `admin_users`, `candidates`, `candidate_scores`, `transactions`, `score_movements`, `rankings` (view), `ranking_history`, `ranking_events`, `site_settings`, `admin_audit`, `webhook_receipts` e `rate_limits`.

## Verificação

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Os testes do backend usam um PostgreSQL PGlite isolado em memória e cobrem confirmação, falha, concorrência, idempotência, mudança do Top 2, ultrapassagem, empate, retirada, imutabilidade, reversão, configuração, autenticação, autorização, propriedade anônima, assinatura/replay de webhook e bloqueio do sandbox em produção. Não substituem homologação com Supabase, gateway real e domínio final. Consulte os testes de navegador para os fluxos visuais exercitados.

## Documentação do provedor

- [Documentação da API DePix](https://depixapp.com/docs)
- [Painel DePix](https://depixapp.com/app/home)

Os pontos exibidos são participações simbólicas nesta paródia e o placar inclui movimentações realizadas dentro do jogo. Não representam voto eleitoral, pesquisa oficial, intenção de voto, doação ou vínculo com candidato ou campanha.
