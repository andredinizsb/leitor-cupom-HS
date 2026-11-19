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

// true = guardar as fotos novas no R2
export async function guardarNoR2(env) {
  if (!env.FOTOS) return false;
  const r = await env.DB.prepare(
    "SELECT (SELECT count(*) FROM rdo_fotos WHERE dados IS NOT NULL) + (SELECT count(*) FROM checklist_fotos WHERE dados IS NOT NULL) AS n, " +
    "(SELECT coalesce(sum(tamanho), 0) FROM rdo_fotos WHERE dados IS NOT NULL) + (SELECT coalesce(sum(tamanho), 0) FROM checklist_fotos WHERE dados IS NOT NULL) AS b").first();
  return !!r && (r.n >= LIMITE_FOTOS_D1 || r.b * 4 / 3 >= LIMITE_MB_D1 * 1048576);
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
