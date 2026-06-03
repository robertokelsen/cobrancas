# Régua de cobrança + Classificação — telas no dashboard

Estas telas editam as **tabelas que o seu n8n já usa** para decidir quando
cobrar. Nenhuma tabela nova é criada — o disparo de cobrança continua sendo o
seu fluxo atual no n8n, agora **configurável pelo dashboard**.

## Tabelas usadas (schema krv_cobrancas)
- `configuracoes` — avisos no/antes do vencimento, por classificação:
  `classificacao, dias_uteis (offset; -3, -1, 0…), notificacao (rótulo),
  email (bool), whatsapp (bool), ativo (bool)`.
- `regua_atraso` — cadência depois do vencimento, por classificação:
  `classificacao, inicio_dias_uteis, cadencia_dias, ativo`.
- `cobrancas.classificacao` — classificação efetiva de cada cliente
  (valores: `Novo Pagador`, `Bom Pagador`, `Mau pagador`).

## Telas
- **/dashboard/regua** — abas por tipo de cliente. Edita os avisos
  (`configuracoes`) e a cadência de atraso (`regua_atraso`). Botão "Salvar régua".
- **/dashboard/clientes** — lista clientes (agrupados por CPF) com a
  classificação e histórico; permite alterar a classificação de um cliente.
  Botões "Régua" e "Clientes" foram adicionados no topo do dashboard.

## APIs
- `GET/PUT /api/regua` — lê/grava `configuracoes` + `regua_atraso`.
- `GET/POST /api/classificacao` — lista clientes / altera `cobrancas.classificacao`.

## Importante
- Alterar a classificação aqui escreve em `cobrancas.classificacao`. Se o seu
  workflow **"Classificar cobrancas"** rodar depois, ele pode recalcular e
  sobrescrever o ajuste manual. Se quiser que o override "trave", dá para
  adicionar uma coluna de bloqueio depois — me avise.
- O envio em si (WhatsApp via Evolution / e-mail via Zoho SMTP) continua no
  n8n, lendo essas tabelas. As telas só mudam **a configuração**.
