"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { salvarFornecedor } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import {
  documentoValido,
  maskCep,
  maskDocumento,
  maskTelefone,
  soDigitos,
  telefoneValido,
  UFS,
  type DadosCep,
  type DadosCnpj,
  type TipoPessoa,
} from "@/lib/documentos";

export type Fornecedor = {
  id: string;
  personType: TipoPessoa;
  document: string;
  name: string;
  active: boolean;
  zipCode: string;
  state: string;
  city: string;
  address: string;
  number: string;
  district: string;
  phoneCompany: string;
  phoneFinance: string;
  phoneCommercial: string;
};

const vazio: Fornecedor = {
  id: "", personType: "CNPJ", document: "", name: "", active: true, zipCode: "", state: "", city: "",
  address: "", number: "", district: "", phoneCompany: "", phoneFinance: "", phoneCommercial: "",
};

type Aviso = { tipo: "info" | "ok" | "erro"; texto: string } | null;

/** GET numa das rotas /api/... devolvendo os dados ou a mensagem de erro. */
async function consultar<T>(url: string): Promise<{ dados?: T; erro?: string }> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const json = await res.json().catch(() => null);
    if (res.ok && json) return { dados: json as T };
    return { erro: json?.erro ?? "Não foi possível consultar agora." };
  } catch {
    return { erro: "Sem conexão para consultar agora." };
  }
}

function AvisoLinha({ aviso }: { aviso: Aviso }) {
  if (!aviso) return null;
  const cor = aviso.tipo === "erro" ? "text-red-700" : aviso.tipo === "ok" ? "text-brand-700" : "text-muted";
  return <p className={`mt-1 text-xs ${cor}`} role={aviso.tipo === "erro" ? "alert" : "status"}>{aviso.texto}</p>;
}

/** Cadastro/edição de fornecedor. CNPJ busca os dados na Receita automaticamente; o CEP busca o endereço ao teclar Enter ou sair do campo. */
export function FornecedorForm({ inicial, refOrigem }: { inicial?: Fornecedor; /** Aberto em outra aba pelo lançamento de contas. */ refOrigem?: string }) {
  const [f, setF] = useState<Fornecedor>(() => {
    const i = inicial ?? vazio;
    return {
      ...i,
      document: maskDocumento(i.personType, i.document),
      zipCode: maskCep(i.zipCode),
      phoneCompany: maskTelefone(i.phoneCompany),
      phoneFinance: maskTelefone(i.phoneFinance),
      phoneCommercial: maskTelefone(i.phoneCommercial),
    };
  });
  const [avisoDoc, setAvisoDoc] = useState<Aviso>(null);
  const [avisoCep, setAvisoCep] = useState<Aviso>(null);
  const [buscandoDoc, setBuscandoDoc] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [tentouSalvar, setTentouSalvar] = useState(false);
  // Último CNPJ/CEP consultado, para não repetir a mesma consulta (ex.: ao sair do campo depois do Enter).
  const ultimoCnpj = useRef(inicial?.personType === "CNPJ" ? soDigitos(inicial.document) : "");
  const ultimoCep = useRef(soDigitos(inicial?.zipCode));
  const numeroRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Fornecedor>(k: K, v: Fornecedor[K]) => setF((x) => ({ ...x, [k]: v }));
  const cnpj = f.personType === "CNPJ";
  const docDigitos = soDigitos(f.document);
  const docCompleto = docDigitos.length === (cnpj ? 14 : 11);
  const docOk = documentoValido(f.personType, f.document);

  async function buscarCnpj(valor: string, forcar = false) {
    const d = soDigitos(valor);
    if (d.length !== 14 || (!forcar && d === ultimoCnpj.current)) return;
    if (!documentoValido("CNPJ", d)) return setAvisoDoc({ tipo: "erro", texto: "CNPJ inválido (dígitos verificadores não conferem)." });
    ultimoCnpj.current = d;
    setBuscandoDoc(true);
    setAvisoDoc({ tipo: "info", texto: "Consultando CNPJ na Receita Federal…" });
    const { dados, erro } = await consultar<DadosCnpj>(`/api/cnpj/${d}`);
    setBuscandoDoc(false);
    if (!dados) {
      ultimoCnpj.current = "";
      return setAvisoDoc({ tipo: "erro", texto: erro! });
    }
    setF((x) => ({
      ...x,
      name: dados.razaoSocial || x.name,
      zipCode: dados.cep ? maskCep(dados.cep) : x.zipCode,
      state: dados.uf || x.state,
      city: dados.cidade || x.city,
      address: dados.endereco || x.address,
      number: dados.numero || x.number,
      district: dados.bairro || x.district,
      phoneCompany: x.phoneCompany || maskTelefone(dados.telefone),
    }));
    if (dados.cep) ultimoCep.current = dados.cep;
    setAvisoCep(null);
    const situacao = dados.situacao.toUpperCase();
    setAvisoDoc(
      situacao && situacao !== "ATIVA"
        ? { tipo: "erro", texto: `Atenção: situação cadastral na Receita: ${situacao}.` }
        : { tipo: "ok", texto: `Dados preenchidos pela Receita Federal${dados.nomeFantasia ? ` · Nome fantasia: ${dados.nomeFantasia}` : ""}.` },
    );
  }

  async function buscarCep(forcar = false) {
    const d = soDigitos(f.zipCode);
    if (!d) return setAvisoCep(null);
    if (d.length !== 8) return setAvisoCep({ tipo: "erro", texto: "CEP incompleto." });
    if (!forcar && d === ultimoCep.current) return;
    ultimoCep.current = d;
    setBuscandoCep(true);
    setAvisoCep({ tipo: "info", texto: "Buscando CEP…" });
    const { dados, erro } = await consultar<DadosCep>(`/api/cep/${d}`);
    setBuscandoCep(false);
    if (!dados) {
      ultimoCep.current = "";
      return setAvisoCep({ tipo: "erro", texto: erro! });
    }
    setF((x) => ({
      ...x,
      state: dados.uf || x.state,
      city: dados.cidade || x.city,
      address: dados.endereco || x.address,
      district: dados.bairro || x.district,
    }));
    setAvisoCep(null);
    numeroRef.current?.focus();
  }

  function trocarTipo(t: TipoPessoa) {
    if (t === f.personType) return;
    setF((x) => ({ ...x, personType: t, document: maskDocumento(t, x.document) }));
    setAvisoDoc(null);
    ultimoCnpj.current = "";
  }

  const telefoneCampo = (k: "phoneCompany" | "phoneFinance" | "phoneCommercial", label: string) => {
    const invalido = tentouSalvar && !telefoneValido(f[k]);
    return (
      <div>
        <label className="label" htmlFor={k}>{label}</label>
        <input
          id={k}
          name={k}
          className={`input ${invalido ? "border-red-400" : ""}`}
          inputMode="tel"
          placeholder="(00) 00000-0000"
          value={f[k]}
          onChange={(e) => set(k, maskTelefone(e.target.value))}
        />
        {invalido && <p className="mt-1 text-xs text-red-700">Informe DDD + número.</p>}
      </div>
    );
  };

  const erroDoc = tentouSalvar && !docOk ? `Informe um ${f.personType} válido.` : docCompleto && !docOk ? `${f.personType} inválido.` : null;

  return (
    <form
      action={salvarFornecedor}
      className="space-y-5"
      onSubmit={(e) => {
        const telefonesOk = [f.phoneCompany, f.phoneFinance, f.phoneCommercial].every(telefoneValido);
        if (!docOk || f.name.trim().length < 2 || !telefonesOk || buscandoDoc || buscandoCep) {
          e.preventDefault();
          setTentouSalvar(true);
        }
      }}
    >
      <input type="hidden" name="id" value={f.id} />
      {refOrigem && <input type="hidden" name="ref" value={refOrigem} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <fieldset className="flex items-center gap-4 text-sm">
          <legend className="sr-only">Tipo de documento</legend>
          {(["CNPJ", "CPF"] as const).map((t) => (
            <label key={t} className="flex items-center gap-1.5">
              <input type="radio" name="personType" value={t} checked={f.personType === t} onChange={() => trocarTipo(t)} />
              {t === "CNPJ" ? "CNPJ (pessoa jurídica)" : "CPF (pessoa física)"}
            </label>
          ))}
        </fieldset>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="active" checked={f.active} onChange={(e) => set("active", e.target.checked)} />
          Ativo
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
        <div>
          <label className="label" htmlFor="document">{f.personType} *</label>
          <div className="flex gap-2">
            <input
              id="document"
              name="document"
              className={`input ${erroDoc ? "border-red-400" : ""}`}
              inputMode="numeric"
              autoFocus={!inicial}
              placeholder={cnpj ? "00.000.000/0000-00" : "000.000.000-00"}
              value={f.document}
              onChange={(e) => {
                const v = maskDocumento(f.personType, e.target.value);
                set("document", v);
                setAvisoDoc(null);
                if (cnpj) void buscarCnpj(v);
              }}
              onBlur={() => cnpj && void buscarCnpj(f.document)}
            />
            {cnpj && (
              <button
                type="button"
                className="btn"
                title="Consultar novamente na Receita Federal"
                disabled={buscandoDoc || docDigitos.length !== 14}
                onClick={() => void buscarCnpj(f.document, true)}
              >
                {buscandoDoc ? "…" : "Buscar"}
              </button>
            )}
          </div>
          {erroDoc ? <p className="mt-1 text-xs text-red-700">{erroDoc}</p> : <AvisoLinha aviso={avisoDoc} />}
        </div>
        <div>
          <label className="label" htmlFor="name">{cnpj ? "Empresa (razão social)" : "Nome"} *</label>
          <input
            id="name"
            name="name"
            className={`input ${tentouSalvar && f.name.trim().length < 2 ? "border-red-400" : ""}`}
            value={f.name}
            onChange={(e) => set("name", e.target.value)}
            maxLength={200}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[9rem_6rem_1fr]">
        <div>
          <label className="label" htmlFor="zipCode">CEP</label>
          <input
            id="zipCode"
            name="zipCode"
            className="input"
            inputMode="numeric"
            placeholder="00000-000"
            value={f.zipCode}
            onChange={(e) => {
              set("zipCode", maskCep(e.target.value));
              setAvisoCep(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void buscarCep(true);
              }
            }}
            onBlur={() => void buscarCep()}
          />
          <AvisoLinha aviso={avisoCep} />
        </div>
        <div>
          <label className="label" htmlFor="state">UF</label>
          <select id="state" name="state" className="input" value={f.state} onChange={(e) => set("state", e.target.value)}>
            <option value="">—</option>
            {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="city">Cidade</label>
          <input id="city" name="city" className="input" value={f.city} onChange={(e) => set("city", e.target.value)} maxLength={100} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_7rem_14rem]">
        <div>
          <label className="label" htmlFor="address">Endereço</label>
          <input id="address" name="address" className="input" value={f.address} onChange={(e) => set("address", e.target.value)} maxLength={200} />
        </div>
        <div>
          <label className="label" htmlFor="number">Número</label>
          <input id="number" name="number" ref={numeroRef} className="input" placeholder="S/N" value={f.number} onChange={(e) => set("number", e.target.value)} maxLength={20} />
        </div>
        <div>
          <label className="label" htmlFor="district">Bairro</label>
          <input id="district" name="district" className="input" value={f.district} onChange={(e) => set("district", e.target.value)} maxLength={100} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {telefoneCampo("phoneCompany", "Contato empresa")}
        {telefoneCampo("phoneFinance", "Contato financeiro")}
        {telefoneCampo("phoneCommercial", "Contato comercial")}
      </div>

      <div className="flex gap-2">
        <SubmitButton pendingText="Salvando…" disabled={buscandoDoc || buscandoCep}>Salvar</SubmitButton>
        {refOrigem ? (
          <button type="button" className="btn" onClick={() => window.close()}>Cancelar</button>
        ) : (
          <Link href="/fornecedores" className="btn">Cancelar</Link>
        )}
      </div>
    </form>
  );
}
