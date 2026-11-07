export const PERMISSIONS = ["LANCAR", "APROVAR", "PAGAR", "CAIXA", "ADMIN"] as const;
export type PermissionName = (typeof PERMISSIONS)[number];

export const PERMISSION_LABEL: Record<PermissionName, string> = {
  LANCAR: "Lançar contas",
  APROVAR: "Validar e autorizar",
  PAGAR: "Pagar e dar baixa no caixa",
  CAIXA: "Gerir caixa (entradas/saídas)",
  ADMIN: "Administrador (usuários)",
};
