// HS Gestão · fotos do RDO e do checklist: onde guardar (D1 ou R2) e arquivamento no servidor da empresa.
// Regra do R2: as fotos ficam no D1 até ele guardar ~1.500 fotos (ou ~350 MB, o que vier antes; o D1 grátis vai até 500 MB).
// Depois disso as novas vão para o R2 (vínculo FOTOS). O arquivamento (macro da planilha) apaga as fotos já salvas no servidor.
import { lista, objeto, brData } from "./rdo.js";

export const LIMITE_FOTOS_D1 = 1500;
export const LIMITE_MB_D1 = 350;
export const DIAS_CHECKLIST = 90;            // fotos de checklist com mais de 90 dias vão para o servidor

export const TABELAS = {
  rdo: { fotos: "rdo_fotos", pai: "rdo", grupo: "etapa", data: "data_inicio" },
  checklist: { fotos: "checklist_fotos", pai: "checklist", grupo: "secao", data: "data_check" }
};

// tamanho exato (bytes) de um base64
export function bytesB64(b64) {
  const s = String(b64 || ""), pad = s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0;
  return Math.floor(s.length * 3 / 4) - pad;
}
export const SQL_BYTES = "CASE WHEN dados IS NULL THEN tamanho ELSE length(dados) * 3 / 4 - (CASE WHEN substr(dados, -2) = '==' THEN 2 WHEN substr(dados, -1) = '=' THEN 1 ELSE 0 END) END";

// ===== Tetos para ficar no plano grátis (US$ 0). O código bloqueia ANTES do limite da Cloudflare e avisa a partir de 80%. =====
// D1 grátis: 500 MB por banco (passou disso dá erro, não cobra). R2 grátis: 10 GB, 1 milhão de operações classe A (gravar)
// e 10 milhões classe B (ler) por mês — acima disso o R2 COBRA, por isso os tetos abaixo ficam com folga.
export const LIMITES = { D1_TROCA_FOTOS: LIMITE_FOTOS_D1, D1_TROCA_MB: LIMITE_MB_D1, D1_TETO_MB: 450, R2_TETO_GB: 9, R2_A_MES: 900000, R2_B_MES: 9000000, AVISO: 0.8 };
const MB = 1048576, GB = 1073741824;
export function mesAtual() { return new Date().toISOString().slice(0, 7); }
const SOMA = (t, c) => "(SELECT coalesce(sum(tamanho), 0) FROM " + t + " WHERE " + c + ")";

export async function uso(env) {
  const base = "SELECT (SELECT count(*) FROM rdo_fotos WHERE dados IS NOT NULL) + (SELECT count(*) FROM checklist_fotos WHERE dados IS NOT NULL) AS d1_fotos, " +
    SOMA("rdo_fotos", "dados IS NOT NULL") + " + " + SOMA("checklist_fotos", "dados IS NOT NULL") + " + " + SOMA("frota_arquivos", "dados IS NOT NULL") + " AS d1_arq, " +
    SOMA("rdo_fotos", "r2_key IS NOT NULL") + " + " + SOMA("checklist_fotos", "r2_key IS NOT NULL") + " + " + SOMA("frota_arquivos", "r2_key IS NOT NULL") + " AS r2_bytes";
  let rs;
  try { rs = await env.DB.prepare(base + ", (SELECT classe_a FROM uso_r2 WHERE mes = ?1) AS r2_a, (SELECT classe_b FROM uso_r2 WHERE mes = ?1) AS r2_b").bind(mesAtual()).all(); }
  catch (e) { rs = await env.DB.prepare(base).all(); }          // tabela uso_r2 ainda não criada
  const x = (rs.results || [])[0] || {};
  const estimado = Math.round((x.d1_arq || 0) * 4 / 3) + 5 * MB;  // base64 ocupa 4/3 + ~5 MB das demais tabelas
  return { mes: mesAtual(), d1_bytes: rs.meta && rs.meta.size_after ? rs.meta.size_after : estimado, d1_fotos: x.d1_fotos || 0,
    r2_bytes: x.r2_bytes || 0, r2_a: x.r2_a || 0, r2_b: x.r2_b || 0, r2_ligado: !!env.FOTOS };
}

// onde guardar um envio de `bytes`: "d1", "r2" ou null (sem espaço no plano grátis)
export async function ondeGuardar(env, bytes, u) {
  u = u || await uso(env);
  const L = LIMITES, d1Cabe = u.d1_bytes + bytes * 4 / 3 <= L.D1_TETO_MB * MB;
  const d1Troca = u.d1_fotos >= L.D1_TROCA_FOTOS || u.d1_bytes >= L.D1_TROCA_MB * MB;
  const r2Cabe = !!env.FOTOS && u.r2_bytes + bytes <= L.R2_TETO_GB * GB && u.r2_a < L.R2_A_MES;
  if (!d1Troca && d1Cabe) return "d1";
  if (r2Cabe) return "r2";
  return d1Cabe ? "d1" : null;
}
// compatibilidade
export async function guardarNoR2(env) { return (await ondeGuardar(env, 0)) === "r2"; }

// situação de cada teto (para a faixa da gestão, a macro e o app)
export function situacao(u) {
  const L = LIMITES, itens = [
    ["Banco D1 (fotos e arquivos)", u.d1_bytes, L.D1_TETO_MB * MB, "MB"],
    ["Fotos no D1 antes de passar para o R2", u.d1_fotos, L.D1_TROCA_FOTOS, "fotos"],
    ["R2 · espaço", u.r2_bytes, L.R2_TETO_GB * GB, "GB"],
    ["R2 · gravações no mês (classe A)", u.r2_a, L.R2_A_MES, "op"],
    ["R2 · leituras no mês (classe B)", u.r2_b, L.R2_B_MES, "op"]];
  const fmt = (v, un) => un === "MB" ? (v / MB).toFixed(0) + " MB" : un === "GB" ? (v / GB).toFixed(2) + " GB" : String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (un === "fotos" ? " fotos" : "");
  const lista = itens.map(function (i) { const p = i[2] ? i[1] / i[2] : 0; return { nome: i[0], usado: fmt(i[1], i[3]), teto: fmt(i[2], i[3]), pct: Math.round(p * 100), aviso: p >= L.AVISO, cheio: p >= 1 }; });
  const avisos = lista.filter(function (i) { return i.aviso; }).map(function (i) {
    return i.nome + ": " + i.usado + " de " + i.teto + " (" + i.pct + "%)" + (i.cheio ? " — TETO ATINGIDO" : "");
  });
  return { itens: lista, avisos: avisos, cheio: lista.some(function (i) { return i.cheio && !/antes de passar/.test(i.nome); }) };
}

// R2 com contador: cada gravação (classe A) e leitura (classe B) soma na tabela uso_r2 e é recusada acima do teto do mês
export function comR2Contado(env) {
  if (!env || !env.FOTOS || env.FOTOS.__contado) return env;
  const b = env.FOTOS, L = LIMITES;
  async function conta(a, bb, teto) {
    try {
      const r = await env.DB.prepare("INSERT INTO uso_r2 (mes, classe_a, classe_b) VALUES (?1, ?2, ?3) ON CONFLICT(mes) DO UPDATE SET classe_a = classe_a + ?2, classe_b = classe_b + ?3 RETURNING classe_a, classe_b")
        .bind(mesAtual(), a, bb).first();
      return !r || (a ? r.classe_a : r.classe_b) <= teto;
    } catch (e) { return true; }
  }
  const p = {
    __contado: true,
    put: async function (k, v, o) { if (!(await conta(1, 0, L.R2_A_MES))) throw new Error("limite_r2_mes"); return b.put(k, v, o); },
    get: async function (k) { return (await conta(0, 1, L.R2_B_MES)) ? b.get(k) : null; },
    head: async function (k) { return (await conta(0, 1, L.R2_B_MES)) ? b.head(k) : null; },
    delete: function (k) { return b.delete(k); }          // apagar é grátis no R2
  };
  return Object.assign({}, env, { FOTOS: p });
}

export function extensao(tipo) { return tipo === "image/png" ? "png" : tipo === "image/webp" ? "webp" : "jpg"; }
export function limpo(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 _.-]/g, "").trim().slice(0, 60); }
// nome do arquivo da foto dentro da pasta do RDO/checklist: 01-Antes.jpg, 02-Frente.jpg ...
export function nomeFoto(f, grupo) { return String(f.ordem || 0).padStart(2, "0") + (f[grupo] ? "-" + limpo(f[grupo]).replace(/ /g, "_") : "") + "." + extensao(f.tipo); }

export function tsv(linhas) {
  return new Response(linhas.map(function (l) { return l.map(function (c) { return String(c == null ? "" : c).replace(/[\t\r\n]+/g, " "); }).join("\t"); }).join("\n") + "\n",
    { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function linha(rot, val) { return val === "" || val == null ? "" : "<tr><th>" + esc(rot) + "</th><td>" + esc(val).replace(/\n/g, "<br>") + "</td></tr>"; }

// página HTML que fica na pasta, junto das fotos (abre sem internet)
export function resumoHtml(tipo, r, fotos) {
  const t = TABELAS[tipo];
  let corpo = "";
  if (tipo === "rdo") {
    const seg = objeto(r.seguranca);
    corpo = linha("Empresa", r.empresa) + linha("Obra", [r.obra, r.obra_desc].filter(Boolean).join(" — ")) + linha("Cliente", r.cliente) +
      linha("Início", brData(r.data_inicio)) + linha("Fim", brData(r.data_fim)) + linha("Colaboradores", lista(r.colaboradores).join(", ")) +
      linha("Atividades", r.descricao) + linha("Veículo (deslocamento)", r.frota + (r.km_inicial != null ? " · km " + r.km_inicial + " → " + r.km_final : "")) +
      (r.mesma_frota ? "" : linha("Veículo (execução)", (r.frota_exec || "") + (r.km_exec_inicial != null ? " · km " + r.km_exec_inicial + " → " + r.km_exec_final : ""))) +
      linha("Materiais", lista(r.materiais).map(function (m) { return [m.qtd, m.unidade, m.descricao].filter(function (x) { return x != null && x !== ""; }).join(" "); }).join("\n")) +
      linha("Clima", [r.clima_manha && "Manhã: " + r.clima_manha, r.clima_tarde && "Tarde: " + r.clima_tarde].filter(Boolean).join(" · ")) +
      linha("Ocorrências", r.ocorrencias) + linha("Segurança", ["DDS", "APR", "PT"].filter(function (k) { return seg[k.toLowerCase()]; }).join(", ") || "—") +
      linha("Responsável", r.responsavel);
  } else {
    corpo = linha("Data", brData(r.data_check)) + linha("Veículo", r.frota) + linha("Condutor", r.condutor) + linha("Hodômetro", r.hodometro) +
      linha("Próxima troca de óleo", r.km_troca_oleo) + linha("Itens OK", lista(r.itens_ok).join(", ")) + linha("Itens com problema", lista(r.itens_problema).join(", ")) +
      linha("Avarias frente", lista(r.avaria_frente).join(", ")) + linha("Avarias lateral esq.", lista(r.avaria_lat_esq).join(", ")) +
      linha("Avarias traseira", lista(r.avaria_traseira).join(", ")) + linha("Avarias lateral dir.", lista(r.avaria_lat_dir).join(", ")) + linha("Observações", r.obs);
  }
  if (r.lat != null && r.lon != null) corpo += "<tr><th>Localização</th><td><a href=\"https://maps.google.com/?q=" + r.lat + "," + r.lon + "\">" + r.lat + ", " + r.lon + "</a></td></tr>";
  const imgs = fotos.map(function (f) {
    const n = nomeFoto(f, t.grupo);
    return "<figure><a href=\"" + esc(n) + "\"><img src=\"" + esc(n) + "\" alt=\"\"></a><figcaption>" + esc([f[t.grupo], f.legenda].filter(Boolean).join(" · ")) + "</figcaption></figure>";
  }).join("");
  return "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><title>" + esc(r.numero) + "</title><style>" +
    "body{font:15px/1.45 Segoe UI,Arial,sans-serif;margin:24px;color:#0E1217}h1{margin:0 0 4px;font-size:22px}p{color:#5A6472;margin:0 0 16px}" +
    "table{border-collapse:collapse;width:100%;max-width:900px}th,td{border-bottom:1px solid #E2E6EB;padding:6px 8px;text-align:left;vertical-align:top}th{width:200px;color:#5A6472;font-weight:600}" +
    ".fotos{display:flex;flex-wrap:wrap;gap:12px;margin-top:18px}figure{margin:0;width:260px}img{width:260px;height:200px;object-fit:cover;border-radius:8px;border:1px solid #E2E6EB}figcaption{font-size:13px;color:#5A6472}" +
    "</style></head><body><h1>" + esc(r.numero) + "</h1><p>" + (tipo === "rdo" ? "Relatório Diário de Obra" : "Checklist do veículo") + " · app HS Gestão · arquivado em " +
    new Date().toISOString().slice(0, 10).split("-").reverse().join("/") + "</p><table>" + corpo + "</table><div class=\"fotos\">" + imgs + "</div></body></html>";
}
