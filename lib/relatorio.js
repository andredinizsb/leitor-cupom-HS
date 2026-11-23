// HS Gestão · relatórios finais (RDO, checklist do veículo, manutenção da frota): página A4 com a marca da empresa,
// pronta para imprimir ou salvar em PDF. Usada na gestão (/api/gestao/relatorio) e pela planilha, que grava o PDF no servidor
// (/api/fotos/relatorio, com as fotos embutidas).
import { lista, objeto, brData } from "./rdo.js";

// mesmos dados do canhoto (autorizacao/canhoto.js)
export const EMPRESAS = {
  HS: { razao: "HS ELETRICIDADE LTDA", cnpj: "09.647.420/0001-39", ie: "710.068.884.115", crea: "1921026", fone: "(18) 3401-7542", whats: "(18) 98104-5844",
    emails: "projetos@hseletricidade.com.br", endereco: "Rua José Dias Nunes, 11 - Pq Industrial - Valparaíso - SP", logo: "/autorizacao/logo-hs.png" },
  MC: { razao: "MC MANUTENÇÕES E SERVIÇOS VALPARAÍSO LTDA", cnpj: "28.019.324/0001-90", ie: "710.025.698.115", crea: "2446403", fone: "(18) 3401-7542", whats: "(18) 99822-9787",
    emails: "mc.manutencoes.orcamentos@gmail.com", endereco: "Rua Francisco de Carvalho, 391 - Centro - Valparaíso - SP", logo: "/autorizacao/logo-mc.png" }
};
export const TITULOS = { rdo: "Relatório Diário de Obra", checklist: "Checklist do Veículo", frota: "Relatório de Manutenção da Frota" };

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function dia(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? m[3] + "/" + m[2] + "/" + m[1] : ""; }
function dinheiro(v) { return v == null || v === "" ? "" : "R$ " + Number(v).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
function campos(l) {
  const v = l.filter(function (x) { return x && x[1] != null && String(x[1]).trim() !== ""; });
  return v.length ? '<dl class="cp">' + v.map(function (x) { return '<div class="' + (x[2] || "") + '"><dt>' + esc(x[0]) + "</dt><dd>" + esc(x[1]).replace(/\n/g, "<br>") + "</dd></div>"; }).join("") + "</dl>" : "";
}
function secao(t, corpo) { return corpo ? '<section><h2>' + esc(t) + "</h2>" + corpo + "</section>" : ""; }
function texto(t) { return t ? '<p class="tx">' + esc(t).replace(/\n/g, "<br>") + "</p>" : ""; }
function marca(b) { return b ? "✔" : "—"; }

// fotos: [{ src (url/data URI ou null se arquivada), titulo, arquivo }]
function galeria(fotos) {
  if (!fotos || !fotos.length) return "";
  return '<div class="gal">' + fotos.map(function (f) {
    return "<figure>" + (f.src ? '<img src="' + esc(f.src) + '" alt="">' : '<div class="sem">Foto guardada no servidor da empresa' + (f.arquivo ? "<br><small>" + esc(f.arquivo) + "</small>" : "") + "</div>") +
      "<figcaption>" + esc(f.titulo || "") + "</figcaption></figure>";
  }).join("") + "</div>";
}

function corpoRdo(r, fotos) {
  const seg = objeto(r.seguranca), mats = lista(r.materiais), colabs = lista(r.colaboradores);
  let h = secao("Identificação", campos([["Obra", [r.obra, r.obra_desc].filter(Boolean).join(" — "), "l2"], ["Cliente", r.cliente], ["Empresa", r.empresa],
    ["Início", brData(r.data_inicio)], ["Fim", brData(r.data_fim)], ["Responsável pelo lançamento", r.responsavel]]));
  h += secao("Equipe (" + colabs.length + ")", colabs.length ? '<ul class="eq">' + colabs.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ul>" : "");
  h += secao("Atividades executadas", texto(r.descricao));
  h += secao("Condições e segurança", campos([["Clima — manhã", r.clima_manha], ["Clima — tarde", r.clima_tarde],
    ["DDS", marca(seg.dds)], ["APR", marca(seg.apr)], ["PT", marca(seg.pt)]]));
  const exec = r.mesma_frota ? "" : (r.frota_exec || "") + (r.km_exec_inicial != null ? " · km " + r.km_exec_inicial + " → " + r.km_exec_final : "");
  h += secao("Veículos", campos([["Deslocamento", (r.frota || "") + (r.km_inicial != null ? " · km " + r.km_inicial + " → " + r.km_final + " (" + (r.km_final - r.km_inicial) + " km)" : ""), "l2"],
    ["Execução", r.mesma_frota ? "O mesmo do deslocamento" : exec, "l2"]]));
  if (mats.length) h += secao("Materiais aplicados", '<table class="tb"><thead><tr><th>Qtd</th><th>Un.</th><th>Descrição</th></tr></thead><tbody>' +
    mats.map(function (m) { return "<tr><td>" + esc(m.qtd == null ? "" : String(m.qtd).replace(".", ",")) + "</td><td>" + esc(m.unidade || "") + "</td><td>" + esc(m.descricao) + "</td></tr>"; }).join("") + "</tbody></table>");
  h += secao("Ocorrências", texto(r.ocorrencias));
  if (r.lat != null && r.lon != null) h += secao("Localização do lançamento", '<p class="tx">' + esc(r.lat) + ", " + esc(r.lon) + (r.precisao ? " (±" + Math.round(r.precisao) + " m)" : "") +
    ' · <a href="https://maps.google.com/?q=' + esc(r.lat) + "," + esc(r.lon) + '">ver no mapa</a></p>');
  h += secao("Registro fotográfico (" + fotos.length + ")", galeria(fotos));
  return h + assinaturas(["Responsável pela execução", "Fiscal / representante do cliente"]);
}

function corpoChecklist(c, fotos, itensTodos) {
  const ok = lista(c.itens_ok), pb = lista(c.itens_problema);
  let h = secao("Identificação", campos([["Veículo", c.frota, "l2"], ["Condutor", c.condutor], ["Data e hora", brData(c.data_check)],
    ["Hodômetro", c.hodometro != null ? c.hodometro + " km" : ""], ["Próxima troca de óleo", c.km_troca_oleo]]));
  const itens = (itensTodos || []).length ? itensTodos : ok.concat(pb);
  h += secao("Itens de segurança e funcionamento", '<table class="tb"><thead><tr><th>Item</th><th class="st">Situação</th></tr></thead><tbody>' +
    itens.map(function (i) { const s = pb.includes(i) ? '<b class="pb">PROBLEMA</b>' : ok.includes(i) ? '<b class="ok">OK</b>' : "Não verificado"; return "<tr><td>" + esc(i) + '</td><td class="st">' + s + "</td></tr>"; }).join("") + "</tbody></table>");
  h += secao("Avarias", campos([["Frente", lista(c.avaria_frente).join(", ")], ["Lateral esquerda", lista(c.avaria_lat_esq).join(", ")],
    ["Traseira", lista(c.avaria_traseira).join(", ")], ["Lateral direita", lista(c.avaria_lat_dir).join(", ")]]));
  h += secao("Observações", texto(c.obs));
  h += secao("Fotos (" + fotos.length + ")", galeria(fotos));
  return h + assinaturas(["Condutor", "Responsável pela frota"]);
}

function corpoFrota(m, arquivos) {
  let h = secao("Identificação", campos([["Veículo", [m.frota, m.veiculo].filter(Boolean).join(" · "), "l2"], ["Placa", m.placa], ["Data", dia(m.data)],
    ["Km", m.km != null ? m.km + " km" : ""], ["Tipo", m.tipo], ["Item", m.item]]));
  h += secao("Serviço executado", texto(m.servico));
  h += secao("Fornecedor e valores", campos([["Oficina / fornecedor", m.oficina, "l2"], ["Nota fiscal", m.nf], ["Peças", dinheiro(m.valor_pecas)],
    ["Serviço", dinheiro(m.valor_servico)], ["Total", dinheiro(m.valor_total), "tot"]]));
  h += secao("Observações", texto(m.obs));
  const imgs = (arquivos || []).filter(function (a) { return /^image\//.test(a.tipo); });
  const pdfs = (arquivos || []).filter(function (a) { return !/^image\//.test(a.tipo); });
  h += secao("Nota fiscal / anexos", (arquivos || []).length ? galeria(imgs) + (pdfs.length ? '<ul class="eq">' + pdfs.map(function (a) {
    return "<li>PDF: " + (a.link ? '<a href="' + esc(a.link) + '">' + esc(a.titulo) + "</a>" : esc(a.titulo) + (a.src ? " (anexo no app)" : " (guardado no servidor da empresa)")) + "</li>";
  }).join("") + "</ul>" : "") : '<p class="tx">Sem NF anexada.</p>');
  return h + assinaturas(["Responsável pela frota", "Conferido por"]) + (m.criado_por ? '<p class="por">Lançado por ' + esc(m.criado_por) + " em " + esc(brData(m.criado_em) || dia(m.criado_em)) + "</p>" : "");
}

// registro + lista das fotos/arquivos (sem o conteúdo) de um RDO, checklist ou manutenção
export async function dadosRelatorio(env, tipo, numero) {
  const db = env.DB, TEM = "CASE WHEN dados IS NULL THEN 0 ELSE 1 END AS tem";
  let reg, rs, rota, tabela;
  if (tipo === "rdo") {
    reg = await db.prepare("SELECT * FROM rdo WHERE numero = ?1").bind(numero).first();
    rs = reg && await db.prepare("SELECT id, etapa AS g, legenda, tipo, r2_key, arquivo, " + TEM + " FROM rdo_fotos WHERE numero = ?1 ORDER BY ordem").bind(numero).all();
    rota = "rdo-foto"; tabela = "rdo_fotos";
  } else if (tipo === "checklist") {
    reg = await db.prepare("SELECT * FROM checklist WHERE numero = ?1").bind(numero).first();
    rs = reg && await db.prepare("SELECT id, secao AS g, legenda, tipo, r2_key, arquivo, " + TEM + " FROM checklist_fotos WHERE numero = ?1 ORDER BY ordem").bind(numero).all();
    rota = "checklist-foto"; tabela = "checklist_fotos";
  } else if (tipo === "frota") {
    reg = await db.prepare("SELECT * FROM frota_manut WHERE numero = ?1 AND excluido = 0").bind(numero).first();
    rs = reg && await db.prepare("SELECT id, nome AS g, NULL AS legenda, tipo, r2_key, arquivo, " + TEM + " FROM frota_arquivos WHERE ref = ?1 ORDER BY id").bind("MAN:" + numero).all();
    rota = "frota-arquivo"; tabela = "frota_arquivos";
  }
  if (!reg) return null;
  return { reg: reg, fotos: (rs.results || []).map(function (x) {
    return { id: x.id, tipo: x.tipo, r2_key: x.r2_key, tem: !!(x.tem || x.r2_key), arquivo: x.arquivo, titulo: [x.g, x.legenda].filter(Boolean).join(" · "), rota: rota, tabela: tabela };
  }) };
}

// conteúdo da foto como data URI (para o relatório salvo no servidor abrir sem internet/login)
export async function dataUri(env, f) {
  if (f.r2_key) {
    const o = env.FOTOS ? await env.FOTOS.get(f.r2_key) : null;
    if (!o) return null;
    const u = new Uint8Array(await new Response(o.body).arrayBuffer());
    let s = ""; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768));
    return "data:" + f.tipo + ";base64," + btoa(s);
  }
  const r = await env.DB.prepare("SELECT dados FROM " + f.tabela + " WHERE id = ?1").bind(f.id).first();
  return r && r.dados ? "data:" + f.tipo + ";base64," + r.dados : null;
}

function assinaturas(l) { return '<div class="ass">' + l.map(function (t) { return '<div><span></span><p>' + esc(t) + "</p></div>"; }).join("") + "</div>"; }

// tipo: rdo | checklist | frota; reg: linha do banco; op: { base, fotos:[{src,titulo,arquivo,tipo}], barra, itens }
export function relatorioHtml(tipo, reg, op) {
  op = op || {};
  const emp = EMPRESAS[reg.empresa] || EMPRESAS.HS, base = op.base || "", fotos = op.fotos || [];
  const num = reg.numero, quando = tipo === "rdo" ? dia(reg.data_inicio) : tipo === "checklist" ? dia(reg.data_check) : dia(reg.data);
  const corpo = tipo === "rdo" ? corpoRdo(reg, fotos) : tipo === "checklist" ? corpoChecklist(reg, fotos, op.itens) : corpoFrota(reg, fotos);
  const agora = new Date(Date.now() - 3 * 3600e3).toISOString();
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<title>" + esc(num + " · " + TITULOS[tipo]) + "</title><style>" +
    "@page{size:A4;margin:12mm 11mm}*{box-sizing:border-box}body{margin:0;background:#E9EDF1;color:#0E1217;font:12.5px/1.45 'Segoe UI',Inter,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
    ".barra{position:sticky;top:0;z-index:2;display:flex;gap:8px;justify-content:center;padding:10px;background:#0E1217}.barra button,.barra a{font:600 14px system-ui;padding:10px 16px;border-radius:8px;border:0;cursor:pointer;text-decoration:none}" +
    ".barra button{background:#0071A3;color:#fff}.barra a{background:#263040;color:#fff}" +
    ".folha{max-width:210mm;margin:12px auto;background:#fff;padding:12mm 11mm;box-shadow:0 2px 12px rgba(0,0,0,.12)}" +
    "header{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;padding-bottom:10px}header img{height:58px;max-width:150px;object-fit:contain}" +
    ".emp b{display:block;font-size:13.5px}.emp span{display:block;color:#5A6472;font-size:10.5px;line-height:1.35}" +
    ".doc{border:2px solid #0E1217;border-radius:8px;padding:6px 10px;text-align:center;min-width:150px}.doc small{display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#5A6472}.doc b{display:block;font-size:15px}" +
    ".faixa{height:5px;background:linear-gradient(90deg,#00A0E7 0 70%,#FE0000 70% 85%,#FFE500 85%);margin-bottom:12px}" +
    "h1{font-size:18px;margin:0 0 10px;text-transform:uppercase;letter-spacing:.02em}" +
    "section{margin:0 0 12px;break-inside:avoid-page}h2{font-size:11.5px;text-transform:uppercase;letter-spacing:.07em;color:#0071A3;margin:0 0 6px;padding-bottom:3px;border-bottom:1px solid #D5DCE3}" +
    ".cp{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 14px;margin:0}.cp div{min-width:0}.cp .l2{grid-column:span 2}.cp .tot dd{font-size:14px}.cp dt{font-size:10px;color:#5A6472;text-transform:uppercase;letter-spacing:.04em}.cp dd{margin:0;font-weight:600;overflow-wrap:anywhere}" +
    ".tx{margin:0;white-space:normal}.eq{margin:0;padding-left:18px;columns:2}.tb{width:100%;border-collapse:collapse}.tb th,.tb td{border-bottom:1px solid #E2E6EB;padding:4px 6px;text-align:left;vertical-align:top}" +
    ".tb th{font-size:10px;text-transform:uppercase;color:#5A6472}.tb .st{width:120px}.ok{color:#12805C}.pb{color:#C81E1E}" +
    ".gal{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}figure{margin:0;break-inside:avoid}figure img,.sem{width:100%;height:62mm;object-fit:cover;border-radius:6px;border:1px solid #D5DCE3;display:block}" +
    ".sem{display:grid;place-items:center;text-align:center;color:#5A6472;background:#F4F6F8;font-size:11px;padding:8px}figcaption{font-size:10.5px;color:#5A6472;margin-top:3px}" +
    ".ass{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin:34px 0 6px;break-inside:avoid}.ass span{display:block;border-top:1px solid #0E1217;margin-bottom:4px}.ass p{margin:0;text-align:center;font-size:11px;color:#5A6472}" +
    ".por{font-size:10.5px;color:#5A6472;margin:4px 0 0}footer{margin-top:14px;padding-top:6px;border-top:1px solid #E2E6EB;font-size:9.5px;color:#8A95A3;display:flex;justify-content:space-between}" +
    "a{color:#0071A3}@media (max-width:640px){.folha{padding:14px}header{grid-template-columns:1fr}.cp{grid-template-columns:1fr 1fr}.gal{grid-template-columns:1fr}.eq{columns:1}}" +
    "@media print{body{background:#fff}.barra{display:none}.folha{margin:0;padding:0;box-shadow:none;max-width:none}}" +
    "</style></head><body>" +
    (op.barra ? '<div class="barra"><button type="button" onclick="window.print()">Imprimir / Salvar PDF</button><a href="javascript:history.back()">Voltar</a></div>' : "") +
    '<div class="folha"><header><img src="' + esc(base + emp.logo) + '" alt="' + esc(emp.razao) + '"><div class="emp"><b>' + esc(emp.razao) + "</b><span>CNPJ " + esc(emp.cnpj) + " · IE " + esc(emp.ie) + " · CREA " + esc(emp.crea) + "</span>" +
    "<span>" + esc(emp.endereco) + "</span><span>Fone " + esc(emp.fone) + " · WhatsApp " + esc(emp.whats) + " · " + esc(emp.emails) + "</span></div>" +
    '<div class="doc"><small>' + esc(TITULOS[tipo]) + "</small><b>" + esc(num) + "</b><small>" + esc(quando) + "</small></div></header>" +
    '<div class="faixa"></div><h1>' + esc(TITULOS[tipo]) + "</h1>" + corpo +
    "<footer><span>" + esc(num) + " · app HS Gestão</span><span>Gerado em " + esc(brData(agora.slice(0, 16))) + "</span></footer></div></body></html>";
}
