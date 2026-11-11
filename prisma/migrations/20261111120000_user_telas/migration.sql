-- Controle de acesso por tela (menu do topo) e por aba da tela Contas.
ALTER TABLE "User" ADD COLUMN "telas" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Usuários existentes continuam vendo tudo o que já viam (todas as telas e abas liberadas).
UPDATE "User" SET "telas" = ARRAY[
  'PAINEL', 'CONTAS', 'LANCAR_CONTAS', 'PAGAMENTOS', 'CAIXA', 'USUARIOS', 'FORNECEDORES', 'CATEGORIAS', 'FORMAS_PAGAMENTO',
  'ABA_TODAS', 'ABA_PENDENTE', 'ABA_APROVADA', 'ABA_REJEITADA', 'ABA_PAGA', 'ABA_CANCELADA', 'ABA_VENCIDAS'
]::TEXT[];
