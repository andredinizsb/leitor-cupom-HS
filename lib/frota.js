// HS Gestão · Frota (escritório): manutenções com a NF, pendências da oficina e documentos com vencimento.
// Banco: D1 (DB). Arquivos (foto/PDF): R2 (vínculo FOTOS) quando ligado; até lá ficam no próprio D1 (frota_arquivos, base64).
import { txt, num, agora } from "./aut.js";
import { inteiro, lista, criadoLocal, b64ParaBytes } from "./rdo.js";
import { NADA } from "./checklist.js";
import { ondeGuardar, comR2Contado, bytesB64 } from "./fotos.js";

export const TIPOS_MANUT = ["Preventiva", "Corretiva"];
// itens da tabela tPlanoManut (aba PlanoFrota) — a consulta StatusManutencao casa pelo nome do item
export const ITENS_PLANO = ["Troca de Óleo", "Inspeção mensal", "Revisão trimestral", "Revisão semestral", "Revisão anual",
  "Revisão de Freios", "Rodízio de Pneus", "Alinhamento/Balanc.", "Revisão da empilhadeira", "Manutenção em Tacógrafo"];
export const STATUS_PEND = ["Aberta", "Em andamento", "Aguardando peça", "Resolvida", "Ciente - não corrigir"];   // mesma lista da tPendFrota
export const MAX_ARQ_D1 = 1400000;     // base64 (~1 MB): a linha do D1 aceita até 2 MB
export const MAX_ARQ_R2 = 14000000;    // base64 (~10 MB) com o R2 ligado

export function dia(v) { const s = String(v || "").trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; }
export function brDia(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? m[3] + "/" + m[2] + "/" + m[1] : ""; }

// "81000 BNK8D82 Munck" (lista de placas do /api/opcoes) -> { frota: "81000", placa: "BNK8D82" }
export function frotaDe(v) {
  const t = String(v || "").toUpperCase().split(/\s+/);
  // nº de frota da HS: 81000, 81001...
  return { frota: t.find(function (x) { return /^8\d{4}$/.test(x); }) || "", placa: t.find(function (x) { return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(x); }) || "" };
}

// "data:application/pdf;base64,..." ou imagem -> { tipo, b64 }
export function separarArquivo(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  return m ? { tipo: m[1], b64: m[2] } : null;
}
export function conferirArquivo(env, a) {
  if (!a || !a.dados) return { ok: true, arq: null };
  const p = separarArquivo(a.dados);
  if (!p) return { ok: false, msg: "O arquivo precisa ser foto (JPG/PNG) ou PDF." };
  if (p.b64.length > (env.FOTOS ? MAX_ARQ_R2 : MAX_ARQ_D1)) return { ok: false, msg: env.FOTOS ? "Arquivo maior que 10 MB." : "Arquivo maior que 1 MB. Mande foto (o app reduz) ou um PDF menor." };
  return { ok: true, arq: { tipo: p.tipo, b64: p.b64, nome: txt(a.nome, 120) || "arquivo" } };
}
export async function gravarArquivo(env, ref, a) {
  const ext = a.tipo === "application/pdf" ? "pdf" : a.tipo === "image/png" ? "png" : a.tipo === "image/webp" ? "webp" : "jpg";
  let r2 = null, dados = a.b64;
  // tetos do plano grátis (lib/fotos.js): sem espaço (ou grande demais para o D1) = registro salvo sem o arquivo
  env = comR2Contado(env);
  const onde = await ondeGuardar(env, bytesB64(a.b64));
  if (!onde || (onde === "d1" && a.b64.length > MAX_ARQ_D1)) return null;
  if (onde === "r2") { r2 = "frota/" + ref.replace(/[^A-Za-z0-9_-]/g, "_") + "-" + Date.now() + "." + ext; await env.FOTOS.put(r2, b64ParaBytes(a.b64), { httpMetadata: { contentType: a.tipo } }); dados = null; }
  const r = await env.DB.prepare("INSERT INTO frota_arquivos (ref, nome, tipo, tamanho, r2_key, dados, criado_em) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
    .bind(ref, a.nome, a.tipo, Math.round(a.b64.length * 3 / 4), r2, dados, agora()).run();
  return r && r.meta ? r.meta.last_row_id : null;
}
// último arquivo de cada ref ("MAN:MAN-2026-000001", "DOC:12")
export async function arquivosPorRef(db, prefixo) {
  const rs = await db.prepare("SELECT id, ref, nome, tipo FROM frota_arquivos WHERE ref LIKE ?1 ORDER BY id").bind(prefixo + "%").all();
  const m = {}; (rs.results || []).forEach(function (x) { m[x.ref] = { id: x.id, nome: x.nome, tipo: x.tipo }; });
  return m;
}
export const URL_ARQ = "https://hsgestao.app/api/gestao/frota-arquivo?id=";

export async function proximoNumeroMan(db, ano) {
  const r = await db.prepare("SELECT numero FROM frota_manut WHERE numero LIKE ?1 ORDER BY numero DESC LIMIT 1").bind("MAN-" + ano + "-%").first();
  const n = r && r.numero ? parseInt(String(r.numero).slice(9), 10) + 1 : 1;
  return "MAN-" + ano + "-" + String(n).padStart(6, "0");
}

export function lerManut(d) {
  const v = frotaDe(d.veiculo);
  const m = { data: dia(d.data), veiculo: txt(d.veiculo, 80), frota: v.frota, placa: v.placa, km: inteiro(d.km), tipo: TIPOS_MANUT.includes(d.tipo) ? d.tipo : null,
    item: txt(d.item, 80), servico: txt(d.servico, 1000), oficina: txt(d.oficina, 120), nf: txt(d.nf, 40),
    valor_pecas: num(d.valor_pecas), valor_servico: num(d.valor_servico), valor_total: num(d.valor_total), obs: txt(d.obs, 1000) };
  if (m.valor_total == null && (m.valor_pecas != null || m.valor_servico != null)) m.valor_total = Math.round(((m.valor_pecas || 0) + (m.valor_servico || 0)) * 100) / 100;
  if (!m.data) return { erro: "Informe a data." };
  if (!m.frota) return { erro: "Escolha o veículo da lista." };
  if (!m.tipo) return { erro: "Escolha o tipo (Preventiva ou Corretiva)." };
  if (!m.item) return { erro: "Informe o item." };
  return { m: m };
}

// mesmas colunas da tabela tManutencoes (aba OficinaFrota) + extras do app
export function linhaManut(m, arq) {
  return { Data: m.data, Frota: m.frota, Placa: m.placa, Km: m.km, Tipo: m.tipo, Item: m.item, "Serviço realizado": m.servico || "",
    "Oficina / Fornecedor": m.oficina || "", "Nº NF": m.nf || "", "Valor Peças": m.valor_pecas, "Valor Serviço": m.valor_servico,
    "Valor Total": m.valor_total, "Observação": m.obs || "", Numero: m.numero, Arquivo: arq ? URL_ARQ + arq.id : "", Criado: criadoLocal(m.criado_em), Origem: "App" };
}
export function linhaPend(p) {
  return { "Aberta em": p.aberta_em ? p.aberta_em.replace("T", " ") : "", Frota: p.frota, "Veículo": p.veiculo || "", Condutor: p.condutor || "", Km: p.km,
    Tipo: p.tipo || "", "Pendência": p.pendencia, Prioridade: p.prioridade || "", Status: p.status, "Resolvida em": p.resolvida_em || "",
    "OS / observação da oficina": p.os_obs || "", Origem: p.origem || "", Atualizado: p.atualizado_em ? criadoLocal(p.atualizado_em) : "", AtualizadoPor: p.atualizado_por || "" };
}
export function linhaDoc(d, arq) {
  return { Frota: d.frota || "", "Veículo": d.veiculo || "", Documento: d.documento, "Número / Apólice": d.numero || "", "Emissão": d.emissao || "",
    Vencimento: d.vencimento || "", "Responsável": d.responsavel || "", "Observação": d.obs || "",
    Arquivo: arq ? URL_ARQ + arq.id : "", Ativo: d.ativo ? 1 : 0, Id: d.id, Atualizado: d.atualizado_em ? criadoLocal(d.atualizado_em) : "", AtualizadoPor: d.atualizado_por || "" };
}

// ===== Pendências nascidas do checklist do app — mesmas regras do ModFrota (planilha), com o mesmo texto,
// para a macro casar a pendência do app com a linha da tPendFrota (chave = Frota | texto em minúsculas).
const PADRAO = ["Nível de Óleo do motor", "Freio de mão", "Freio de pé", "Cintos de segurança", "Buzina", "Farol Alto", "Farol baixo",
  "Pisca-alerta", "Setas dianteiras e traseiras", "Luz de óleo, motor, freio e bateria", "Medidor de combustível", "Limpador de para-brisa",
  "Pneus sem desgaste", "Portas abrem e fecham", "Vidros sobem e descem", "Retrovisores intactos", "Dirigibilidade", "Documento do veículo (CRLV)"];
const LADOS = [["Frente", "avaria_frente"], ["Lat.Esq", "avaria_lat_esq"], ["Traseira", "avaria_traseira"], ["Lat.Dir", "avaria_lat_dir"]];
function semProblema(t) {
  const x = t.toLowerCase().trim();
  return /^(nada|ok|nenhum|tudo ok|tudo certo|sem problema|sem avaria|sem pend|sem altera|-)/.test(x) || x === "n/a";
}
export function pendenciasDoChecklist(c) {
  const out = [];
  LADOS.forEach(function (l) { const v = lista(c[l[1]]).filter(function (x) { return x !== NADA; }); if (v.length) out.push({ tipo: "Avaria", texto: "Avaria - " + l[0] + ": " + v.join(", "), prio: "Baixa" }); });
  const ok = lista(c.itens_ok), marc = ok.join(", ").toLowerCase(), prob = lista(c.itens_problema);
  const item = function (i) { out.push({ tipo: "Item de segurança", texto: "Item não conforme: " + i, prio: "Alta" }); };
  const doPadrao = function (i) { return PADRAO.find(function (p) { return i.toLowerCase().indexOf(p.toLowerCase()) >= 0; }); };
  if (ok.length) {
    const falta = PADRAO.filter(function (i) { return marc.indexOf(i.toLowerCase()) < 0; });
    if (falta.length >= 6) out.push({ tipo: "Checklist", texto: "Checklist incompleto: " + falta.length + " itens de segurança não marcados - conferir com o condutor", prio: "Média" });
    else falta.forEach(item);
    prob.forEach(function (i) { if (!doPadrao(i)) item(i); });
  } else prob.forEach(function (i) { item(doPadrao(i) || i); });   // tudo marcado como problema (a planilha não vê esse caso)
  String(c.obs || "").replace(/\r/g, "\n").split("\n").forEach(function (k) { k = k.trim(); if (k.length > 3 && !semProblema(k)) out.push({ tipo: "Relato do condutor", texto: k.slice(0, 250), prio: "Média" }); });
  return out;
}
// Lê os checklists dos últimos dias e abre as pendências que faltam. Não duplica pendência em aberto;
// reabre só se um checklist de dia posterior à resolução repetir o defeito; "Ciente - não corrigir" nunca volta.
export async function sincronizarPendencias(db, dias) {
  const desde = new Date(Date.now() - (dias || 45) * 864e5).toISOString().slice(0, 10);
  const cs = (await db.prepare("SELECT * FROM checklist WHERE data_check >= ?1 ORDER BY data_check").bind(desde).all()).results || [];
  if (!cs.length) return 0;
  const bloq = {};
  ((await db.prepare("SELECT chave, status, resolvida_em FROM frota_pend").all()).results || []).forEach(function (p) {
    const b = p.status === "Resolvida" ? (p.resolvida_em || new Date().toISOString().slice(0, 10)) : "9999";
    if (!bloq[p.chave] || b > bloq[p.chave]) bloq[p.chave] = b;
  });
  let novas = 0;
  for (const c of cs) {
    const fr = frotaDe(c.frota).frota || String(c.frota || "");
    for (const p of pendenciasDoChecklist(c)) {
      const chave = fr + "|" + p.texto.toLowerCase(), d = String(c.data_check).slice(0, 10);
      if (bloq[chave] && d <= bloq[chave]) continue;
      const r = await db.prepare("INSERT OR IGNORE INTO frota_pend (chave, origem, aberta_em, frota, veiculo, condutor, km, tipo, pendencia, prioridade, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'Aberta')")
        .bind(chave, c.numero, c.data_check, fr, c.frota, c.condutor, c.hodometro, p.tipo, p.texto, p.prio).run();
      bloq[chave] = "9999";
      if (r && r.meta && r.meta.changes) novas++;
    }
  }
  return novas;
}
