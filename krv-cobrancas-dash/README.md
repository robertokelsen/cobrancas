# KRV — Dashboard de Cobranças (standalone)

App Next.js independente para listar, filtrar, buscar boletos, ver métricas e
cancelar. Lê o Postgres de cobranças (EasyPanel). Login por senha única.

## Variáveis de ambiente (no EasyPanel, aba Environment)

- `COBRANCAS_DATABASE_URL` — ex.: `postgresql://postgres:SENHA@krv_krv_postgres:5432/krv`
  (rodando no MESMO EasyPanel, use o host interno `krv_krv_postgres`)
- `DASHBOARD_PASSWORD` — senha de acesso da equipe
- `SESSION_SECRET` — string aleatória longa (assina o cookie). Gere com:
  `openssl rand -base64 48`

## Deploy no EasyPanel

1. Crie um novo serviço do tipo "App" apontando para este repositório (ou suba
   os arquivos). O EasyPanel detecta o Dockerfile.
2. Defina as 3 variáveis acima em Environment.
3. Garanta que o serviço está na MESMA rede/projeto do Postgres `krv_krv_postgres`.
4. Exponha a porta 3000 e configure o domínio.
5. Deploy. Acesse o domínio → tela de login.

## Rodar local (opcional)

```bash
npm install
cp .env.example .env.local   # edite os valores
npm run dev                  # http://localhost:3000
```
Local: o host `krv_krv_postgres` NÃO resolve fora do EasyPanel — use o host
público do Postgres no .env.local (e SSL se necessário, em lib/cobrancasDb.ts).

## Funções

- Métricas por situação (qtd + R$).
- Filtros: conta, situação, busca (nome/CPF/código, com debounce).
- Tabela paginada, atrasados primeiro.
- Cancelar: só A_RECEBER/ATRASADO; abre a página de confirmação do n8n
  (`/krv-boletos/<conta>/cancelar?id=...`), que tem a trava de não cancelar pago.

## 4 contas

Descomente as contas em `app/dashboard/page.tsx` (array `CONTAS`) conforme
replicar os workflows de cancelamento. O botão já usa `b.conta` dinamicamente.

## Segurança

- Login por senha única (cookie httpOnly assinado com HMAC, expira em 12h).
- Middleware protege todas as rotas (exceto /login).
- Queries 100% parametrizadas; situação por allow-list.
- O cancelamento é delegado ao n8n (regra de negócio num lugar só).
