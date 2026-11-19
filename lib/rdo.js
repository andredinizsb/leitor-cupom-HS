// HS Gestão · RDO digital — substitui o formulário Jotform "HS | RDO - Campo" (mesma estrutura + fotos, clima, ocorrências, segurança e localização).
// Banco: D1 (DB). Fotos: R2 (vínculo FOTOS) quando ligado; até lá ficam no próprio D1 (tabela rdo_fotos, base64).
import { soDigitos } from "./aut.js";

export const CLIMAS = ["Bom", "Nublado", "Chuva fraca", "Chuva forte (parou o serviço)"];
export const ETAPAS = ["Antes", "Durante", "Depois"];
export const MAX_FOTOS = 10;
export const MAX_FOTO_B64 = 1100000;          // ~800 KB por foto (o app já comprime para ~300 KB)
export const SEM_VEICULO = "Sem veículo";

export function inteiro(v) { const d = soDigitos(v); return d ? parseInt(d.slice(0, 9), 10) : null; }
export function dataHora(v) { const s = String(v || "").trim(); return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? s : null; }
export function bool(v) { return v === true || v === 1 || v === "1" || v === "SIM" || v === "sim" || v === "true"; }

export async function proximoNumeroRdo(db, ano) {
  const r = await db.prepare("SELECT numero FROM rdo WHERE numero LIKE ?1 ORDER BY numero DESC LIMIT 1").bind("RDO-" + ano + "-%").first();
  const n = r && r.numero ? parseInt(String(r.numero).slice(9), 10) + 1 : 1;
  return "RDO-" + ano + "-" + String(n).padStart(6, "0");
}

// "data:image/jpeg;base64,...." -> { tipo, b64 }
export function separarFoto(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  return m ? { tipo: m[1], b64: m[2] } : null;
}
export function b64ParaBytes(b64) {
  const s = atob(b64), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

// formatos iguais aos do Jotform (a planilha junta os dois na mesma tabela tRDO)
export function brData(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || ""); return m ? m[3] + "/" + m[2] + "/" + m[1] + " " + m[4] + ":" + m[5] : ""; }
export function criadoLocal(iso) { const t = Date.parse(iso || ""); return isFinite(t) ? new Date(t - 3 * 3600e3).toISOString().slice(0, 19).replace("T", " ") : ""; }
export function lista(json) { try { const v = JSON.parse(json || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
export function objeto(json) { try { const v = JSON.parse(json || "{}"); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; } }

export function linhaPlanilha(r) {
  return {
    Criado: criadoLocal(r.criado_em), DataInicio: brData(r.data_inicio), DataFim: brData(r.data_fim),
    Cliente: r.cliente || "", Obra: r.obra || "", Frota: r.frota || "", Descricao: r.descricao || "",
    KmInicial: r.km_inicial == null ? "" : String(r.km_inicial), KmFinal: r.km_final == null ? "" : String(r.km_final),
    HouveMaterial: r.houve_material ? "SIM" : "NÃO", Colaboradores: lista(r.colaboradores).join(", "), Responsavel: r.responsavel || "",
    // extras do RDO digital (a planilha ignora o que não usa)
    Numero: r.numero, Empresa: r.empresa || "", ObraDescricao: r.obra_desc || "", FrotaExecucao: r.mesma_frota ? r.frota : (r.frota_exec || ""),
    KmExecInicial: r.mesma_frota ? r.km_inicial : r.km_exec_inicial, KmExecFinal: r.mesma_frota ? r.km_final : r.km_exec_final,
    Materiais: lista(r.materiais).map(function (m) { return [m.qtd, m.unidade, m.descricao].filter(function (x) { return x != null && x !== ""; }).join(" "); }).join("; "),
    ClimaManha: r.clima_manha || "", ClimaTarde: r.clima_tarde || "", Ocorrencias: r.ocorrencias || "", Fotos: r.qtd_fotos || 0,
    Origem: "App"
  };
}

// comparação em tempo constante (token da planilha)
export function tokenOk(recebido, esperado) {
  const a = String(recebido || ""), b = String(esperado || "");
  if (!a || !b || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
