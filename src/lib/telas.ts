import { STATUS } from "./format";
import type { PermissionName } from "./permissions";

/**
 * Controle de acesso por tela (botões do menu do topo) e por aba da tela Contas.
 * Gravado em User.telas. Para ver uma tela, o usuário precisa da tela marcada E da permissão
 * de ação que ela já exigia (ex.: "Categorias" também exige LANCAR). ADMIN vê tudo.
 */
type Usuario = { permissions: string[]; telas: string[] };

const admin = (u: Usuario) => u.permissions.includes("ADMIN");
const tem = (u: Usuario, p: PermissionName) => admin(u) || u.permissions.includes(p);

export const TELAS = [
  { key: "PAINEL", href: "/", label: "Painel", requisito: () => true },
  { key: "CONTAS", href: "/contas", label: "Contas", requisito: () => true },
  { key: "ORDENS_COMPRA", href: "/ordens", label: "Ordens de compra", requisito: (u: Usuario) => tem(u, "LANCAR") || tem(u, "APROVAR") },
  { key: "PAGAMENTOS", href: "/pagamentos", label: "Pagamentos", requisito: (u: Usuario) => tem(u, "PAGAR") },
  { key: "CAIXA", href: "/caixa", label: "Caixa", requisito: (u: Usuario) => tem(u, "CAIXA") || tem(u, "PAGAR") },
  { key: "USUARIOS", href: "/usuarios", label: "Usuários", requisito: (u: Usuario) => admin(u) },
  { key: "FORNECEDORES", href: "/fornecedores", label: "Fornecedores", requisito: (u: Usuario) => tem(u, "LANCAR") },
  { key: "CATEGORIAS", href: "/categorias", label: "Categorias", requisito: (u: Usuario) => tem(u, "LANCAR") },
  { key: "FORMAS_PAGAMENTO", href: "/formas-pagamento", label: "Formas de pagamento", requisito: (u: Usuario) => tem(u, "LANCAR") },
] as const;
export type TelaKey = (typeof TELAS)[number]["key"];

/** Abas da tela Contas: TODAS, um status cada e VENCIDAS. A chave gravada é "ABA_" + aba. */
export const ABAS_CONTAS = [
  { aba: "TODAS", label: "Todas" },
  ...Object.entries(STATUS).map(([k, v]) => ({ aba: k, label: "tab" in v ? v.tab : v.label })),
  { aba: "VENCIDAS", label: "Vencidas" },
];
export const abaKey = (aba: string) => `ABA_${aba}`;

/** Todas as chaves válidas (usado para validar o formulário e liberar tudo por padrão). */
export const TODAS_TELAS: string[] = [...TELAS.map((t) => t.key), ...ABAS_CONTAS.map((a) => abaKey(a.aba))];

export function podeVerTela(u: Usuario, key: TelaKey) {
  const tela = TELAS.find((t) => t.key === key)!;
  return tela.requisito(u) && (admin(u) || u.telas.includes(key));
}

export function podeVerAba(u: Usuario, aba: string) {
  return podeVerTela(u, "CONTAS") && (admin(u) || u.telas.includes(abaKey(aba)));
}

/** Telas do menu que o usuário pode ver, na ordem do menu. */
export const telasVisiveis = (u: Usuario) => TELAS.filter((t) => podeVerTela(u, t.key));

/** Primeira tela liberada (para onde mandar quem cai numa tela sem acesso); null = nenhuma. */
export const telaInicial = (u: Usuario) => telasVisiveis(u)[0]?.href ?? null;
