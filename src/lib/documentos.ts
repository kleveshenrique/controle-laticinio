/** Máscaras e validações de CNPJ, CPF, CEP e telefone (usadas no navegador e no servidor). */

export const soDigitos = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "");

export type TipoPessoa = "CNPJ" | "CPF";

export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
  "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

/** 00.000.000/0000-00 */
export function maskCnpj(v: string) {
  const d = soDigitos(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

/** 000.000.000-00 */
export function maskCpf(v: string) {
  const d = soDigitos(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export const maskDocumento = (tipo: TipoPessoa, v: string) => (tipo === "CPF" ? maskCpf(v) : maskCnpj(v));

/** 00000-000 */
export function maskCep(v: string) {
  return soDigitos(v).slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
}

/** (00) 0000-0000 ou (00) 00000-0000 */
export function maskTelefone(v: string) {
  const d = soDigitos(v).slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  const corte = d.length === 11 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

export function cnpjValido(v: string) {
  const d = soDigitos(v);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv = (base: string) => {
    let peso = base.length - 7;
    let soma = 0;
    for (const c of base) {
      soma += Number(c) * peso--;
      if (peso < 2) peso = 9;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(d.slice(0, 12));
  const d2 = dv(d.slice(0, 12) + d1);
  return d.endsWith(`${d1}${d2}`);
}

export function cpfValido(v: string) {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (base: string) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(d.slice(0, 9));
  const d2 = dv(d.slice(0, 9) + d1);
  return d.endsWith(`${d1}${d2}`);
}

export const documentoValido = (tipo: TipoPessoa, v: string) => (tipo === "CPF" ? cpfValido(v) : cnpjValido(v));

/** Telefone vazio ou com DDD + 8/9 dígitos. */
export const telefoneValido = (v: string) => {
  const d = soDigitos(v);
  return d.length === 0 || d.length === 10 || d.length === 11;
};

/** Endereço devolvido pela consulta de CEP. */
export type DadosCep = { cep: string; uf: string; cidade: string; endereco: string; bairro: string };

/** Dados devolvidos pela consulta de CNPJ. */
export type DadosCnpj = {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacao: string;
  cep: string;
  uf: string;
  cidade: string;
  endereco: string;
  numero: string;
  bairro: string;
  telefone: string;
};
