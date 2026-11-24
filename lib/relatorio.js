// HS Gestão · relatórios finais (RDO, checklist do veículo, manutenção da frota): página A4 com a marca da empresa,
// pronta para imprimir ou salvar em PDF. Usada na gestão (/api/gestao/relatorio) e pela planilha, que grava o PDF no servidor
// (/api/fotos/relatorio, com as fotos embutidas).
import { lista, objeto, brData } from "./rdo.js";

// mesmos dados do canhoto (autorizacao/canhoto.js)
export const EMPRESAS = {
  HS: { razao: "HS ELETRICIDADE LTDA", cnpj: "09.647.420/0001-39", ie: "710.068.884.115", crea: "1921026", fone: "(18) 3401-7542", whats: "(18) 98104-5844",
    emails: "projetos@hseletricidade.com.br", endereco: "Rua José Dias Nunes, 11 - Pq Industrial - Valparaíso - SP", logo: "/icons/logo-hs-rel.png" },
  MC: { razao: "MC MANUTENÇÕES E SERVIÇOS VALPARAÍSO LTDA", cnpj: "28.019.324/0001-90", ie: "710.025.698.115", crea: "2446403", fone: "(18) 3401-7542", whats: "(18) 99822-9787",
    emails: "mc.manutencoes.orcamentos@gmail.com", endereco: "Rua Francisco de Carvalho, 391 - Centro - Valparaíso - SP", logo: "/icons/logo-mc-rel.png" }
};
export const TITULOS = { rdo: "Relatório Diário de Obra", checklist: "Checklist do Veículo", frota: "Relatório de Manutenção da Frota", autorizacao: "Autorização de Compra", "frota-docs": "Documentos da Frota", "frota-pend": "Pendências da Frota", "despesas-obra": "Despesas da Obra", "obras-geral": "Relatório Geral das Obras", "despesas-geral": "Relatório Geral das Despesas", pedido: "Pedido de Compra" };

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
  return h + assinaturas([{ t: "Responsável pela execução", img: r.assinatura_resp, nome: r.responsavel, quando: r.assinado_resp_em },
    { t: "Gestão · aprovação do RDO", img: r.assinatura_gestao, nome: r.assinado_gestao_por, quando: r.assinado_gestao_em, falta: r._jotform ? "" : "Aguardando assinatura da gestão" }]);
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
  return h + assinaturas([{ t: "Condutor · quem fez o checklist", img: c.assinatura, nome: c.condutor, quando: c.assinado_em }]);
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
  else if (tipo === "pedido") {   // HS Compras: pedido de compra (PDF guardado no servidor a cada mudança de situação)
    reg = await db.prepare("SELECT * FROM compras_pc WHERE numero = ?1").bind(numero).first();
    if (reg) { reg._itens = (await db.prepare("SELECT * FROM compras_pc_itens WHERE numero = ?1 ORDER BY item").bind(numero).all()).results || []; reg.data = String(reg.criado_em || "").slice(0, 10); }
    return reg ? { reg: reg, fotos: [] } : null;
  }
  else if (tipo === "autorizacao") {
    reg = await db.prepare("SELECT * FROM autorizacoes WHERE numero = ?1").bind(numero).first();
    if (reg) {
      reg._itens = (await db.prepare("SELECT * FROM autorizacao_itens WHERE numero = ?1 ORDER BY item").bind(numero).all()).results || [];
      reg._atend = (await db.prepare("SELECT * FROM atendimentos WHERE numero = ?1 ORDER BY id").bind(numero).all()).results || [];
      reg._hist = (await db.prepare("SELECT * FROM historico WHERE numero = ?1").bind(numero).all()).results || [];
    }
    return reg ? { reg: reg, fotos: [] } : null;
  } else if (tipo === "frota-docs" || tipo === "frota-pend") {
    const sql = tipo === "frota-docs" ? "SELECT * FROM frota_docs WHERE ativo = 1 ORDER BY frota, documento" : "SELECT * FROM frota_pend ORDER BY frota, aberta_em";
    return { reg: { numero: tipo, empresa: "HS", lista: (await db.prepare(sql).all()).results || [] }, fotos: [] };
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

function tabela(cab, linhas) {
  return '<table class="tb"><thead><tr>' + cab.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
    linhas.map(function (l) { return "<tr>" + l.map(function (v) { return "<td>" + (v && v.html ? v.html : esc(v == null ? "" : v)) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
}
function corpoAutorizacao(a) {
  const ab = /abastec/i.test(a.tipo || "");
  let h = secao("Identificação", campos([["Situação", a.status], ["Tipo", a.tipo], ["Empresa", a.empresa], ["Colaborador", a.colaborador, "l2"], ["Obra", a.obra],
    ["Estabelecimento", a.estabelecimento, "l2"], ["Pedido em", brData(String(new Date(Date.parse(a.solicitado_em) - 3 * 3600e3).toISOString()).slice(0, 16))]]));
  if (ab) h += secao("Veículo", campos([["Veículo", a.veiculo, "l2"], ["Marca / modelo", a.marca_modelo], ["Km", a.km], ["Combustível", a.combustivel], ["Litros (máx.)", a.litros_max]]));
  if ((a._itens || []).length) h += secao("Itens", tabela(["Qtd", "Un.", "Descrição"], a._itens.map(function (i) { return [i.qtd == null ? "" : String(i.qtd).replace(".", ","), i.unidade || "", i.descricao]; })));
  h += secao(ab ? "Destino da viagem" : "Justificativa", texto(a.justificativa));
  h += secao("Decisão do escritório", campos([["Decidido por", a.decidido_por, "l2"], ["Em", a.decidido_em ? brData(String(new Date(Date.parse(a.decidido_em) - 3 * 3600e3).toISOString()).slice(0, 16)) : ""],
    ["Válida até", dia(a.validade)], ["Motivo", a.motivo, "l2"]]));
  if ((a._atend || []).length) h += secao("Atendimentos (cupons)", tabela(["Data", "Estabelecimento", "CNPJ", "Valor"], a._atend.map(function (x) {
    const v = Object.keys(x).filter(function (k) { return /valor/.test(k) && x[k] != null; })[0];
    return [dia(x.data_cupom) || dia(x.registrado_em), x.estabelecimento || "", x.cnpj || "", v ? dinheiro(x[v]) : ""]; })));
  if ((a._hist || []).length) h += secao("Histórico", '<ul class="eq" style="columns:1">' + a._hist.map(function (x) {
    return "<li>" + esc(Object.keys(x).filter(function (k) { return !/^(id|numero)$/.test(k) && x[k] != null && x[k] !== ""; }).map(function (k) { return /_em$|^quando$/.test(k) ? brData(String(x[k]).slice(0, 16)) || x[k] : x[k]; }).join(" · ")) + "</li>"; }).join("") + "</ul>");
  return h + assinaturas([{ t: "Liberado por", img: a.assinatura, nome: a.assinado_por_nome || a.decidido_por, quando: a.decidido_em, falta: a.status === "Pendente" ? "Aguardando aprovação" : "" }]);
}
// ===== dados que vêm da planilha (histórico do Jotform, despesas, obras) =====
function isoBr(s) { const m = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/.exec(String(s || "")); return m ? m[3] + "-" + m[2] + "-" + m[1] + "T" + (m[4] || "00") + ":" + (m[5] || "00") : String(s || ""); }
function cortar(s, n) { return String(s == null ? "" : s).slice(0, n); }
export function regRdoJotform(c) {
  const lst = function (s) { return JSON.stringify(String(s || "").split(/\s*[,;]\s*/).map(function (x) { return x.trim(); }).filter(Boolean)); };
  const km = function (v) { const n = parseInt(String(v == null ? "" : v).replace(/\D/g, ""), 10); return isFinite(n) ? n : null; };
  return { _jotform: true, numero: cortar(c.numero || "RDO Jotform", 60), data_inicio: isoBr(c.inicio), data_fim: isoBr(c.fim), cliente: cortar(c.cliente, 160), obra: cortar(c.obra, 60), frota: cortar(c.frota, 80),
    descricao: cortar(c.descricao, 6000), km_inicial: km(c.km_inicial), km_final: km(c.km_final), mesma_frota: 1, colaboradores: lst(c.colaboradores), responsavel: cortar(c.responsavel, 120),
    materiais: "[]", seguranca: "{}", ocorrencias: /^s/i.test(String(c.houve_material || "")) ? "Houve material aplicado (detalhes no Jotform)." : "" };
}
function corpoDespesasObra(o) {
  const it = o.itens || [], tot = it.reduce(function (s, x) { return s + (Number(x.valor) || 0); }, 0), cat = {};
  it.forEach(function (x) { const k = x.categoria || "Outros"; cat[k] = (cat[k] || 0) + (Number(x.valor) || 0); });
  const ds = it.map(function (x) { return String(x.data || "").slice(0, 10); }).filter(Boolean).sort();
  return secao("Obra", campos([["Obra", o.obra], ["Cliente", o.cliente], ["Situação", o.situacao], ["Descrição", o.descricao, "l2"]])) +
    secao("Resumo", campos([["Total de despesas", dinheiro(tot), "tot"], ["Lançamentos", it.length], ["Período", ds.length ? dia(ds[0]) + " a " + dia(ds[ds.length - 1]) : ""]])) +
    secao("Por categoria", tabela(["Categoria", "Valor"], Object.keys(cat).sort().map(function (k) { return [k, dinheiro(cat[k])]; }))) +
    secao("Lançamentos", '<div class="mini">' + tabela(["Data", "Fornecedor", "Categoria", "Descrição", "Qtd", "Valor", "NF", "Frota"], it.map(function (x) {
      return [dia(x.data) || x.data, x.fornecedor, x.categoria, x.descricao, x.qtd, dinheiro(x.valor), x.nf, x.frota]; })) + "</div>");
}
function corpoDespesasGeral(it, obras) {
  const v = function (x) { return Number(x.valor) || 0; }, tot = it.reduce(function (s, x) { return s + v(x); }, 0);
  const agrupa = function (k) { const m = {}; it.forEach(function (x) { const c = k(x) || "—"; m[c] = m[c] || { n: 0, t: 0 }; m[c].n++; m[c].t += v(x); }); return Object.keys(m).map(function (c) { return [c, m[c].n, m[c].t]; }).sort(function (a, b) { return b[2] - a[2]; }); };
  const barra = function (t) { const p = tot ? Math.round(t / tot * 100) : 0; return { html: '<div class="barra"><i style="width:' + p + '%"></i><span>' + p + "%</span></div>" }; };
  const ds = it.map(function (x) { return String(x.data || "").slice(0, 10); }).filter(Boolean).sort(), mesN = ["", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const porObra = agrupa(function (x) { return x.obra; }), porCat = agrupa(function (x) { return x.categoria; }), porForn = agrupa(function (x) { return x.fornecedor; }).slice(0, 10);
  const porMes = agrupa(function (x) { return String(x.data || "").slice(0, 7); }).sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
  return '<div class="kpi"><div><small>Total lançado</small><b>' + esc(dinheiro(tot)) + "</b></div><div><small>Lançamentos</small><b>" + it.length + "</b></div><div><small>Obras com custo</small><b>" + porObra.length +
    "</b></div><div><small>Período</small><b>" + (ds.length ? esc(dia(ds[0]) + " a " + dia(ds[ds.length - 1])) : "—") + "</b></div></div>" +
    secao("Custo por obra", tabela(["Obra", "Cliente / descrição", "Lanç.", "Total", "Participação"], porObra.map(function (o) {
      const ob = obras[o[0]] || {}; return [o[0], [ob.cliente, ob.descricao].filter(Boolean).join(" · "), o[1], dinheiro(o[2]), barra(o[2])]; }))) +
    secao("Custo por categoria", tabela(["Categoria", "Lanç.", "Total", "Participação"], porCat.map(function (c) { return [c[0], c[1], dinheiro(c[2]), barra(c[2])]; }))) +
    secao("Custo por mês", tabela(["Mês", "Lanç.", "Total", "Participação"], porMes.map(function (m) { const p = /^(\d{4})-(\d{2})$/.exec(m[0]); return [p ? mesN[Number(p[2])] + "/" + p[1] : m[0], m[1], dinheiro(m[2]), barra(m[2])]; }))) +
    secao("Principais fornecedores", tabela(["Fornecedor", "Lanç.", "Total", "Participação"], porForn.map(function (f) { return [f[0], f[1], dinheiro(f[2]), barra(f[2])]; }))) +
    secao("Lançamentos (" + it.length + ")", '<div class="mini">' + tabela(["Data", "Obra", "Fornecedor", "Categoria", "Descrição", "Valor", "NF"], it.slice().sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); })
      .map(function (x) { return [dia(x.data) || x.data, x.obra, x.fornecedor, x.categoria, x.descricao, dinheiro(x.valor), x.nf]; })) + "</div>");
}
function corpoObrasGeral(l) {
  const ab = l.filter(function (o) { return /andamento/i.test(o.situacao || ""); }), fe = l.filter(function (o) { return !/andamento/i.test(o.situacao || ""); });
  const soma = function (x, k) { return x.reduce(function (s, o) { return s + (Number(o[k]) || 0); }, 0); };
  const cab = ["Obra", "Emp.", "Cliente", "Descrição", "Valor", "Medido", "%", "Saldo", "Despesas"];
  const ln = function (x) { return x.map(function (o) { return [o.obra, o.empresa, o.cliente, o.descricao, dinheiro(o.contratado || o.proposta), dinheiro(o.medido),
    o.pct !== "" && o.pct != null && isFinite(Number(o.pct)) ? Math.round(Number(o.pct) * 100) + "%" : "", dinheiro(o.saldo), dinheiro(o.despesas)]; }); };
  return secao("Resumo", campos([["Obras", l.length], ["Em andamento", ab.length], ["Fechadas", fe.length], ["Valor em andamento", dinheiro(soma(ab, "contratado") || soma(ab, "proposta"))],
    ["Medido em andamento", dinheiro(soma(ab, "medido"))], ["Despesas lançadas", dinheiro(soma(l, "despesas"))]])) +
    secao("Em andamento (" + ab.length + ")", ab.length ? '<div class="mini">' + tabela(cab, ln(ab)) + "</div>" : "") +
    secao("Fechadas (" + fe.length + ")", fe.length ? '<div class="mini">' + tabela(cab, ln(fe)) + "</div>" : "");
}
function situacaoDoc(venc, hoje) {
  if (!venc) return "Sem data";
  const d = String(venc).slice(0, 10), lim = new Date(Date.parse(hoje) + 30 * 864e5).toISOString().slice(0, 10);
  return d < hoje ? "VENCIDO" : d <= lim ? "Vence em 30 dias" : "Em dia";
}
function corpoDocs(l, hoje) {
  const s = l.map(function (d) { return Object.assign({ sit: situacaoDoc(d.vencimento, hoje) }, d); });
  const cont = function (x) { return s.filter(function (d) { return d.sit === x; }).length; };
  return secao("Resumo", campos([["Documentos", s.length], ["Vencidos", cont("VENCIDO")], ["Vencem em 30 dias", cont("Vence em 30 dias")], ["Em dia", cont("Em dia")], ["Sem data", cont("Sem data")]])) +
    secao("Documentos por veículo", tabela(["Veículo", "Documento", "Nº", "Emissão", "Vencimento", "Situação", "Responsável"], s.map(function (d) {
      return [[d.frota, d.veiculo].filter(Boolean).join(" · "), d.documento, d.numero || "", dia(d.emissao), dia(d.vencimento),
        { html: d.sit === "VENCIDO" ? '<b class="pb">VENCIDO</b>' : d.sit === "Em dia" ? '<span class="ok">Em dia</span>' : esc(d.sit) }, d.responsavel || ""]; })));
}
function corpoPend(l) {
  const ab = l.filter(function (p) { return p.status !== "Resolvida"; }), rs = l.filter(function (p) { return p.status === "Resolvida"; });
  const linhas = function (x) { return x.map(function (p) { return [dia(p.aberta_em), [p.frota, p.veiculo].filter(Boolean).join(" · "), p.pendencia, p.prioridade || "", p.status, p.resolvida_em ? dia(p.resolvida_em) : "", p.os_obs || ""]; }); };
  const cab = ["Aberta em", "Veículo", "Pendência", "Prioridade", "Status", "Resolvida em", "OS / observação"];
  return secao("Resumo", campos([["Pendências", l.length], ["Em aberto", ab.length], ["Resolvidas", rs.length]])) +
    secao("Em aberto", ab.length ? tabela(cab, linhas(ab)) : '<p class="tx">Nenhuma pendência em aberto.</p>') + (rs.length ? secao("Resolvidas", tabela(cab, linhas(rs))) : "");
}

// HS Compras C3 · pedido de compra (p: compras_pc + _itens)
function corpoPedido(p) {
  const it = p._itens || [], soma = it.reduce(function (s, x) { return s + Number(x.total || 0); }, 0), frete = p.frete_tipo === "FOB" ? Number(p.frete_valor || 0) : 0;
  const cnpj = String(p.cnpj || "").replace(/\D/g, "").length === 14 ? String(p.cnpj).replace(/\D/g, "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : p.cnpj;
  let h = secao("Fornecedor", campos([["Fornecedor", p.fornecedor, "l2"], ["CNPJ", cnpj], ["Contato", p.contato], ["Telefone", p.telefone], ["E-mail", p.email]]));
  h += secao("Condições", campos([["Pagamento", p.cond_pagto], ["Entrega", p.data_prometida ? dia(p.data_prometida) : p.prazo_dias != null ? p.prazo_dias + " dia(s) após o pedido" : ""], ["Frete", p.frete_tipo ? p.frete_tipo + (frete ? " · " + dinheiro(frete) : "") : ""],
    ["Destino", p.destino === "Obra" ? "Obra " + (p.obra || "") : p.destino === "Frota" ? p.frota : p.destino], ["Local de entrega", p.local_entrega, "l2"], ["Requisição", p.req]]));
  h += secao("Itens", tabela(["Item", "Código", "Descrição", "Qtd", "Un.", "Valor unit.", "Impostos/un", "Total"], it.map(function (x) {
    return [x.item, x.codigo_fx || "", x.descricao, String(x.qtd).replace(".", ","), x.unidade || "", dinheiro(x.preco), x.impostos ? dinheiro(x.impostos) : "", dinheiro(x.total)]; })));
  h += secao("Totais", campos([["Itens", dinheiro(soma)], ["Frete", frete ? dinheiro(frete) : (p.frete_tipo === "CIF" ? "CIF (incluso)" : "")], ["Total do pedido", dinheiro(soma + frete), "tot"]]));
  if (p.obs) h += secao("Observação", texto(p.obs));
  h += assinaturas([{ t: p.aprovado_em ? "Aprovado por" : "Aguardando aprovação", img: p.assinatura || null, nome: p.aprovador_nome || "", quando: p.aprovado_em || "", falta: p.aprovado_em ? "" : "pedido ainda não aprovado" }]);
  return h;
}

function assinaturas(l) {
  return '<div class="ass' + (l.length === 1 ? " um" : "") + '">' + l.map(function (a) {
    if (typeof a === "string") a = { t: a };
    return "<div>" + (a.img ? '<img class="sig" src="' + esc(a.img) + '" alt="">' : '<div class="sig vazio">' + esc(a.falta || "") + "</div>") + "<span></span><p>" + esc(a.t) +
      (a.nome ? "<br><b>" + esc(a.nome) + "</b>" : "") + (a.quando && isFinite(Date.parse(a.quando)) ? "<br>" + esc(brData(String(new Date(Date.parse(a.quando) - 3 * 3600e3).toISOString()).slice(0, 16))) : "") + "</p></div>";
  }).join("") + "</div>";
}

// tipo: rdo | checklist | frota; reg: linha do banco; op: { base, fotos:[{src,titulo,arquivo,tipo}], barra, itens }
export function relatorioHtml(tipo, reg, op) {
  op = op || {};
  const emp = EMPRESAS[reg.empresa] || EMPRESAS.HS, base = op.base || "", fotos = op.fotos || [];
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10), lista_ = tipo === "frota-docs" || tipo === "frota-pend" || tipo === "obras-geral" || tipo === "despesas-geral";
  const num = lista_ ? "Situação em " + dia(hoje) : tipo === "despesas-obra" ? "Obra " + reg.obra : reg.numero, quando = tipo === "rdo" ? dia(reg.data_inicio) : tipo === "checklist" ? dia(reg.data_check) : tipo === "autorizacao" ? dia(reg.solicitado_em) : lista_ ? "" : dia(reg.data);
  const corpo = tipo === "rdo" ? corpoRdo(reg, fotos) : tipo === "checklist" ? corpoChecklist(reg, fotos, op.itens) : tipo === "autorizacao" ? corpoAutorizacao(reg)
    : tipo === "despesas-obra" ? corpoDespesasObra(reg) : tipo === "obras-geral" ? corpoObrasGeral(reg.lista || []) : tipo === "despesas-geral" ? corpoDespesasGeral(reg.itens || [], reg.obras || {})
    : tipo === "frota-docs" ? corpoDocs(reg.lista || [], hoje) : tipo === "frota-pend" ? corpoPend(reg.lista || []) : tipo === "pedido" ? corpoPedido(reg) : corpoFrota(reg, fotos);
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
    ".ass{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin:24px 0 6px;break-inside:avoid}.ass.um{grid-template-columns:minmax(0,320px);justify-content:center}.sig{display:block;height:64px;max-width:100%;margin:0 auto 2px;object-fit:contain}.sig.vazio{display:grid;place-items:end center;font-size:10.5px;color:#B45309}.ass span{display:block;border-top:1px solid #0E1217;margin-bottom:4px}.ass p{margin:0;text-align:center;font-size:11px;color:#5A6472}" +
    ".barra{position:relative;background:#EEF2F6;border-radius:4px;height:14px;min-width:110px}.barra i{position:absolute;left:0;top:0;bottom:0;background:#00A0E7;border-radius:4px}.barra span{position:relative;font-size:9.5px;padding-left:5px;font-weight:600}" + ".kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 0 12px}.kpi div{border:1px solid #D5DCE3;border-radius:8px;padding:8px 10px}.kpi small{display:block;font-size:9.5px;color:#5A6472;text-transform:uppercase;letter-spacing:.05em}.kpi b{font-size:16px}" + ".mini .tb th,.mini .tb td{font-size:9.5px;padding:3px 4px}.por{font-size:10.5px;color:#5A6472;margin:4px 0 0}footer{margin-top:14px;padding-top:6px;border-top:1px solid #E2E6EB;font-size:9.5px;color:#8A95A3;display:flex;justify-content:space-between}" +
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
