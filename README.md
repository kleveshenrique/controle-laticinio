# Controle Laticínio — Contas a pagar

Next.js 14 (App Router) · TypeScript · Tailwind · PostgreSQL · Prisma.

## Fluxo

1. **Lançar** (permissão `LANCAR`): lança várias contas de uma vez (fornecedor, categoria, valor, vencimento).
2. **Validar e autorizar** (`APROVAR`): na tela *Contas*, aba *Aguardando aprovação*, cada linha tem os botões Aprovar e Rejeitar (com motivo).
3. **Pagar** (`PAGAR`): marca as contas aprovadas como pagas escolhendo o **caixa**; o sistema debita o saldo e grava a movimentação de saída.
4. **Controlar**: telas *Painel*, *Contas* (filtros por situação, vencimento, busca; histórico de quem lançou/aprovou/pagou) e *Caixa* (saldo e extrato).

**Fornecedores** (`LANCAR`): cadastro com CNPJ (padrão) ou CPF, ativo/inativo, empresa, CEP, UF, cidade, endereço, número, bairro e contatos (empresa, financeiro, comercial). Com CNPJ os dados são buscados automaticamente na Receita Federal (BrasilAPI, com CNPJ.ws de reserva); o CEP preenche o endereço ao teclar Enter ou sair do campo (ViaCEP/BrasilAPI). Fornecedores inativos não aparecem nem podem ser usados no lançamento.

**Categorias** (`LANCAR`): cadastro com nome e ativa/inativa; categorias inativas não aparecem nem podem ser usadas no lançamento.
No lançamento de contas, o botão **+** ao lado de fornecedor e de categoria abre o cadastro em outra aba (sem perder o que já foi digitado); ao salvar, a aba se fecha e o item já aparece preenchido na linha.

Outras permissões: `CAIXA` (suprimento/saída avulsa, criar caixas) e `ADMIN` (usuários e permissões; também vale como todas as outras).

**Acesso por tela** (tela *Usuários*): para cada usuário, marque quais botões do menu do topo (Painel, Contas, Lançar contas, Pagamentos, Caixa, Usuários, Fornecedores, Categorias, Formas de pagamento) e quais abas da tela *Contas* (Todas, Aprovar, Aprovada, Rejeitada, Paga, Cancelada, Vencidas) ele vê. A tela também exige a permissão correspondente (ex.: *Categorias* exige `LANCAR`); `ADMIN` vê tudo. Abrir pela URL uma tela sem acesso leva à primeira tela liberada. As telas de cadastro rápido (*nova categoria*, *novo fornecedor*, botão **+** do lançamento) dependem só da permissão `LANCAR`.

### Regras de segurança
- Quem lançou a conta **não** aprova a própria conta; quem aprovou **não** paga a mesma conta.
- Pagamento só ocorre se a conta estiver *aprovada* e o caixa tiver saldo; tudo numa transação (sem pagamento em duplicidade nem saldo negativo).
- Permissões são lidas do banco a cada requisição: mudanças valem na hora.

## Rodando

```bash
npm install
cp .env.example .env          # preencha DATABASE_URL (Neon) e AUTH_SECRET (openssl rand -base64 32)
npx prisma migrate dev --name init
npm run db:seed               # cria admin, categorias e "Caixa Principal"
npm run dev                   # http://localhost:3000
```

### PDFs no AWS S3
Os PDFs anexados (pedido, boletos, nota fiscal) ficam num bucket S3 **privado**; o banco guarda só a chave de cada arquivo e o sistema entrega o PDF pela rota `/anexos/[id]` (exige login).
Preencha no `.env`: `AWS_REGION`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (opcional: `S3_PREFIX`, padrão `anexos`).
O usuário IAM precisa de `s3:PutObject`, `s3:GetObject` e `s3:DeleteObject` em `arn:aws:s3:::SEU-BUCKET/anexos/*`.
Para mover para o S3 os PDFs que já estavam no banco: `npx tsx --env-file=.env scripts/migrar-anexos-s3.ts`.

Login inicial: usuário `Administrador` com a senha de `SEED_ADMIN_PASSWORD` — troque a senha na tela *Usuários*.
Crie então usuários separados para lançar, aprovar e pagar.

## Próximos passos sugeridos
parcelamento/recorrência, aviso por e-mail aos aprovadores, exportação para Excel.
