import { soDigitos, type DadosCep, type DadosCnpj } from "./documentos";

/** Resultado de uma consulta externa: dados, "não encontrado" ou falha do serviço. */
export type Consulta<T> = { ok: true; dados: T } | { ok: false; status: 404 | 502; erro: string };

const TIMEOUT_MS = 8000;

/** GET com timeout. Devolve null se o recurso não existe (404) e lança erro em falha de rede/serviço. */
async function getJson(url: string): Promise<unknown | null> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "controle-laticinio" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`${url} respondeu ${res.status}`);
  return res.json();
}

const txt = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

/** Tenta cada fonte em ordem; a primeira que responder (com dados ou "não encontrado") decide. */
async function primeiraQueResponder<T>(fontes: (() => Promise<T | null>)[], naoEncontrado: string, falha: string): Promise<Consulta<T>> {
  for (const fonte of fontes) {
    try {
      const dados = await fonte();
      if (dados) return { ok: true, dados };
      return { ok: false, status: 404, erro: naoEncontrado };
    } catch (e) {
      console.warn("Consulta externa falhou:", e instanceof Error ? e.message : e);
    }
  }
  return { ok: false, status: 502, erro: falha };
}

/* ---------- CNPJ (cadastro da Receita Federal) ---------- */

type BrasilApiCnpj = {
  cnpj: string; razao_social: string; nome_fantasia: string | null; descricao_situacao_cadastral: string;
  cep: string; uf: string; municipio: string; descricao_tipo_de_logradouro: string | null; logradouro: string;
  numero: string; bairro: string; ddd_telefone_1: string | null;
};

type CnpjWs = {
  razao_social: string;
  estabelecimento: {
    cnpj: string; nome_fantasia: string | null; situacao_cadastral: string; cep: string; tipo_logradouro: string | null;
    logradouro: string; numero: string; bairro: string; ddd1: string | null; telefone1: string | null;
    estado: { sigla: string }; cidade: { nome: string };
  };
};

const juntar = (...partes: unknown[]) => partes.map(txt).filter(Boolean).join(" ");

async function cnpjBrasilApi(cnpj: string): Promise<DadosCnpj | null> {
  const r = (await getJson(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`)) as BrasilApiCnpj | null;
  if (!r) return null;
  return {
    cnpj,
    razaoSocial: txt(r.razao_social),
    nomeFantasia: txt(r.nome_fantasia),
    situacao: txt(r.descricao_situacao_cadastral),
    cep: soDigitos(r.cep),
    uf: txt(r.uf).toUpperCase(),
    cidade: txt(r.municipio),
    endereco: juntar(r.descricao_tipo_de_logradouro, r.logradouro),
    numero: txt(r.numero),
    bairro: txt(r.bairro),
    telefone: soDigitos(r.ddd_telefone_1),
  };
}

async function cnpjWs(cnpj: string): Promise<DadosCnpj | null> {
  const r = (await getJson(`https://publica.cnpj.ws/cnpj/${cnpj}`)) as CnpjWs | null;
  if (!r) return null;
  const e = r.estabelecimento;
  return {
    cnpj,
    razaoSocial: txt(r.razao_social),
    nomeFantasia: txt(e.nome_fantasia),
    situacao: txt(e.situacao_cadastral),
    cep: soDigitos(e.cep),
    uf: txt(e.estado?.sigla).toUpperCase(),
    cidade: txt(e.cidade?.nome),
    endereco: juntar(e.tipo_logradouro, e.logradouro),
    numero: txt(e.numero),
    bairro: txt(e.bairro),
    telefone: soDigitos(`${e.ddd1 ?? ""}${e.telefone1 ?? ""}`),
  };
}

export function consultarCnpj(cnpj: string) {
  return primeiraQueResponder(
    [() => cnpjBrasilApi(cnpj), () => cnpjWs(cnpj)],
    "CNPJ não encontrado na Receita Federal.",
    "Não foi possível consultar o CNPJ agora. Preencha os dados manualmente ou tente de novo.",
  );
}

/* ---------- CEP ---------- */

async function cepViaCep(cep: string): Promise<DadosCep | null> {
  const r = (await getJson(`https://viacep.com.br/ws/${cep}/json/`)) as
    | { erro?: boolean | string; uf: string; localidade: string; logradouro: string; bairro: string }
    | null;
  if (!r || r.erro) return null;
  return { cep, uf: txt(r.uf).toUpperCase(), cidade: txt(r.localidade), endereco: txt(r.logradouro), bairro: txt(r.bairro) };
}

async function cepBrasilApi(cep: string): Promise<DadosCep | null> {
  const r = (await getJson(`https://brasilapi.com.br/api/cep/v1/${cep}`)) as
    | { state: string; city: string; street: string; neighborhood: string }
    | null;
  if (!r) return null;
  return { cep, uf: txt(r.state).toUpperCase(), cidade: txt(r.city), endereco: txt(r.street), bairro: txt(r.neighborhood) };
}

export function consultarCep(cep: string) {
  return primeiraQueResponder(
    [() => cepViaCep(cep), () => cepBrasilApi(cep)],
    "CEP não encontrado.",
    "Não foi possível consultar o CEP agora. Preencha o endereço manualmente.",
  );
}
