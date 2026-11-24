// /api/gestao/compras-pedido — pedidos de compra (IT 1.6 etapas 6 a 8). Login do Access.
//   GET  ?req=REQ-2026-0001            -> pedidos da requisição
//   GET  ?situacao=abertos|todos       -> fila de pedidos (+ parâmetros: limite de aprovação e aprovadores)
//   GET  ?numero=231126901&formato=pdf -> pedido em A4 para imprimir / salvar PDF / mandar ao fornecedor
//   POST {acao, ...}
//     gerar     {req}                              um pedido por fornecedor escolhido na cotação
//     aprovar   {numero, nome, assinatura}         nome da lista de aprovadores (aba Parametros) + assinatura desenhada
//     recusar   {numero, motivo}                   volta a requisição para Em cotação
//     enviado   {numero}                           o comprador mandou o PDF ao fornecedor
//     confirmar {numero, data_prometida}           fornecedor confirmou: a data vira a previsão da requisição
//     cancelar  {numero, motivo}
import { resp, origemOk, semBanco, ERRO_BANCO, txt, agora, assinaturaValida } from "../../../lib/aut.js";
import { garantir, evento, carregarReq, dia, proximoPedido, config, STATUS_PC, receber } from "../../../lib/compras.js";
import { relatorioHtml } from "../../../lib/relatorio.js";

const ABERTOS = ["Aguardando aprovação", "Aprovado", "Enviado", "Confirmado", "Recebido parcial"];
async function pedidos(db, where, bind) {
  const rs = await db.prepare("SELECT * FROM compras_pc " + where + " ORDER BY criado_em DESC LIMIT 300").bind(...bind).all(), L = rs.results || [];
  if (!L.length) return L;
  const it = await db.prepare("SELECT * FROM compras_pc_itens WHERE numero IN (" + L.map(function (_, i) { return "?" + (i + 1); }).join(",") + ") ORDER BY numero, item").bind(...L.map(function (p) { return p.numero; })).all();
  const rc = await db.prepare("SELECT * FROM compras_receb WHERE pc IN (" + L.map(function (_, i) { return "?" + (i + 1); }).join(",") + ") ORDER BY id").bind(...L.map(function (p) { return p.numero; })).all();
  const I = {}, R = {}; (rc.results || []).forEach(function (x) { (R[x.pc] = R[x.pc] || []).push(x); });
  (it.results || []).forEach(function (x) { x.recebido = (R[x.numero] || []).filter(function (r) { return r.item === x.item; }).reduce(function (s, r) { return s + Number(r.qtd); }, 0); (I[x.numero] = I[x.numero] || []).push(x); });
  return L.map(function (p) { p.itens = I[p.numero] || []; p.recebimentos = R[p.numero] || []; p.tem_assinatura = !!p.assinatura; delete p.assinatura; return p; });
}

export async function onRequestGet({ request, env, data }) {
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  const db = env.DB, q = new URL(request.url).searchParams;
  await garantir(db);
  if (q.get("formato") === "pdf") {
    const p = await db.prepare("SELECT * FROM compras_pc WHERE numero = ?1").bind(txt(q.get("numero"), 20) || "").first();
    if (!p) return resp({ ok: false, erro: "nao_encontrado" }, 404);
    p._itens = (await db.prepare("SELECT * FROM compras_pc_itens WHERE numero = ?1 ORDER BY item").bind(p.numero).all()).results || [];
    p.data = (p.criado_em || "").slice(0, 10);
    return new Response(relatorioHtml("pedido", p, { barra: true }), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const cfg = await config(db);
  if (q.get("req")) return resp({ ok: true, quem: data && data.quem, pedidos: await pedidos(db, "WHERE req = ?1", [txt(q.get("req"), 30)]), config: cfg });
  const todos = await pedidos(db, "", []);
  const L = q.get("situacao") === "todos" ? todos : todos.filter(function (p) { return ABERTOS.includes(p.status); });
  const contagem = {}; todos.forEach(function (p) { contagem[p.status] = (contagem[p.status] || 0) + 1; });
  return resp({ ok: true, quem: data && data.quem, pedidos: L, contagem: contagem, status: STATUS_PC, config: cfg, hoje: agora().slice(0, 10) });
}

export async function onRequestPost({ request, env, data }) {
  if (!origemOk(request)) return resp({ ok: false, erro: "origem_nao_permitida" }, 403);
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  let d;
  try { d = await request.json(); } catch (e) { return resp({ ok: false, erro: "json_invalido" }, 400); }
  const db = env.DB, quem = (data && data.quem) || "gestao", acao = String(d.acao || ""), quando = agora();
  await garantir(db);

  if (acao === "gerar") {
    const r = await carregarReq(db, txt(d.req, 30) || "", false);
    if (!r) return resp({ ok: false, erro: "nao_encontrada", msg: "Requisição não encontrada." }, 404);
    if (["Cancelada", "Entregue"].includes(r.status)) return resp({ ok: false, erro: "fechada", msg: "Requisição " + r.status.toLowerCase() + "." }, 409);
    const ativos = await db.prepare("SELECT numero FROM compras_pc WHERE req = ?1 AND status NOT IN ('Recusado', 'Cancelado')").bind(r.numero).all();
    if ((ativos.results || []).length) return resp({ ok: false, erro: "ja_tem", msg: "Esta requisição já tem pedido: " + ativos.results.map(function (x) { return x.numero; }).join(", ") + ". Recuse ou cancele antes de gerar outro." }, 409);
    const its = (await db.prepare("SELECT i.*, x.preco AS preco_cot, x.impostos FROM compras_req_itens i LEFT JOIN compras_cot_itens x ON x.cot_id = i.escolha_cot AND x.item = i.item WHERE i.numero = ?1 ORDER BY i.item").bind(r.numero).all()).results || [];
    const esc = its.filter(function (x) { return x.escolha_cot && x.preco_cot != null; });
    if (!esc.length) return resp({ ok: false, erro: "sem_escolha", msg: "Registre a escolha dos fornecedores no comparativo antes de gerar o pedido." }, 400);
    const cfg = await config(db), grupos = {};
    esc.forEach(function (x) { (grupos[x.escolha_cot] = grupos[x.escolha_cot] || []).push(x); });
    const ops = [], gerados = [];
    for (const cid of Object.keys(grupos)) {
      const c = await db.prepare("SELECT * FROM compras_cot WHERE id = ?1").bind(parseInt(cid, 10)).first();
      if (!c) continue;
      const numero = await proximoPedido(db), linhas = grupos[cid].map(function (x, i) {
        const preco = x.preco_negociado != null ? Number(x.preco_negociado) : Number(x.preco_cot), imp = Number(x.impostos || 0);
        return { item: i + 1, req_item: x.item, codigo_fx: x.codigo_fx, descricao: x.descricao, qtd: x.qtd, unidade: x.unidade, preco: preco, impostos: imp || null, total: Math.round((preco + imp) * Number(x.qtd || 0) * 100) / 100 };
      });
      const total = Math.round((linhas.reduce(function (s, x) { return s + x.total; }, 0) + (c.frete_tipo === "FOB" ? Number(c.frete_valor || 0) : 0)) * 100) / 100;
      const dispensa = cfg.limite > 0 && total <= cfg.limite, st = dispensa ? "Aprovado" : "Aguardando aprovação";
      ops.push(db.prepare("INSERT INTO compras_pc (numero, req, cot_id, empresa, cnpj, fornecedor, contato, telefone, email, cond_pagto, prazo_dias, frete_tipo, frete_valor, destino, obra, frota, local_entrega, obs, total, status, criado_em, criado_por, aprovador_nome, aprovado_em, atualizado_em) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?21)")
        .bind(numero, r.numero, c.id, r.empresa, c.cnpj, c.fornecedor, c.contato, c.telefone, c.email, c.cond_pagto, c.prazo_dias, c.frete_tipo, c.frete_valor, r.destino, r.obra, r.frota, r.local_entrega,
          txt(d.obs, 500) || (r.excecao ? "Exceção à 2ª cotação: " + r.excecao : null), total, st, quando, quem, dispensa ? "Dispensado (até R$ " + cfg.limite.toFixed(2).replace(".", ",") + ")" : null, dispensa ? quando : null));
      linhas.forEach(function (x) {
        ops.push(db.prepare("INSERT INTO compras_pc_itens (numero, item, req_item, codigo_fx, descricao, qtd, unidade, preco, impostos, total) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)")
          .bind(numero, x.item, x.req_item, x.codigo_fx, x.descricao, x.qtd, x.unidade, x.preco, x.impostos, x.total));
      });
      gerados.push({ numero: numero, fornecedor: c.fornecedor, total: total, status: st });
    }
    const todosAprov = gerados.every(function (g) { return g.status === "Aprovado"; }), novo = todosAprov ? "Pedido emitido" : "Aguardando aprovação";
    ops.push(db.prepare("UPDATE compras_req SET status = ?2, pedido = ?3, atualizado_em = ?4, atualizado_por = ?5, comprador = coalesce(comprador, ?5) WHERE numero = ?1").bind(r.numero, novo, gerados.map(function (g) { return g.numero; }).join(", "), quando, quem));
    ops.push(evento(db, r.numero, quem, r.status !== novo ? r.status : null, r.status !== novo ? novo : null, "pedido(s) " + gerados.map(function (g) { return g.numero + " " + g.fornecedor; }).join("; ")));
    await db.batch(ops);
    return resp({ ok: true, pedidos: gerados });
  }

  if (acao === "receber") {   // C4: recebimento no escritório / almoxarifado
    const x = await receber(db, txt(d.numero, 20), d, quem, "escritório");
    return x.ok ? resp({ ok: true, status: x.status }) : resp({ ok: false, erro: x.erro, msg: x.msg }, x.st);
  }
  const p = await db.prepare("SELECT * FROM compras_pc WHERE numero = ?1").bind(txt(d.numero, 20) || "").first();
  if (!p) return resp({ ok: false, erro: "nao_encontrado", msg: "Pedido não encontrado." }, 404);
  const ops = [];
  // situação da requisição a partir dos pedidos dela (depois desta mudança)
  async function reqDepois(novoStatusPc) {
    const outros = ((await db.prepare("SELECT numero, status FROM compras_pc WHERE req = ?1 AND numero <> ?2").bind(p.req, p.numero).all()).results || []).map(function (x) { return x.status; });
    const st = outros.concat([novoStatusPc]).filter(function (s) { return s !== "Cancelado" && s !== "Recusado"; });
    if (!st.length) return "Em cotação";
    if (st.some(function (s) { return s === "Aguardando aprovação"; })) return "Aguardando aprovação";
    return "Pedido emitido";
  }
  if (acao === "aprovar") {
    if (p.status !== "Aguardando aprovação") return resp({ ok: false, erro: "status", msg: "Este pedido está " + p.status.toLowerCase() + "." }, 409);
    const cfg = await config(db), nome = txt(d.nome, 80);
    if (!nome) return resp({ ok: false, erro: "sem_nome", msg: "Escolha quem está aprovando." }, 400);
    if (cfg.aprovadores.length && !cfg.aprovadores.includes(nome)) return resp({ ok: false, erro: "nao_aprovador", msg: "Só aprovam: " + cfg.aprovadores.join(", ") + " (aba Parametros da planilha)." }, 403);
    if (!assinaturaValida(d.assinatura)) return resp({ ok: false, erro: "sem_assinatura", msg: "Assine para aprovar." }, 400);
    ops.push(db.prepare("UPDATE compras_pc SET status = 'Aprovado', aprovador_nome = ?2, aprovado_por = ?3, aprovado_em = ?4, assinatura = ?5, atualizado_em = ?4 WHERE numero = ?1").bind(p.numero, nome, quem, quando, d.assinatura));
    ops.push(evento(db, p.req, quem, null, null, "pedido " + p.numero + " aprovado por " + nome));
  } else if (acao === "recusar" || acao === "cancelar") {
    const motivo = txt(d.motivo, 300);
    if (!motivo) return resp({ ok: false, erro: "sem_motivo", msg: "Informe o motivo." }, 400);
    if (acao === "recusar" && p.status !== "Aguardando aprovação") return resp({ ok: false, erro: "status", msg: "Só dá para recusar pedido aguardando aprovação." }, 409);
    if (acao === "cancelar" && ["Cancelado", "Recusado"].includes(p.status)) return resp({ ok: false, erro: "status", msg: "Pedido já " + p.status.toLowerCase() + "." }, 409);
    const novo = acao === "recusar" ? "Recusado" : "Cancelado";
    ops.push(db.prepare("UPDATE compras_pc SET status = ?2, motivo = ?3, atualizado_em = ?4 WHERE numero = ?1").bind(p.numero, novo, motivo, quando));
    ops.push(evento(db, p.req, quem, null, null, "pedido " + p.numero + " " + novo.toLowerCase() + ": " + motivo));
  } else if (acao === "enviado") {
    if (!["Aprovado", "Enviado"].includes(p.status)) return resp({ ok: false, erro: "status", msg: "O pedido precisa estar aprovado para ir ao fornecedor." }, 409);
    ops.push(db.prepare("UPDATE compras_pc SET status = 'Enviado', enviado_em = coalesce(enviado_em, ?2), atualizado_em = ?2 WHERE numero = ?1").bind(p.numero, quando));
    ops.push(evento(db, p.req, quem, null, null, "pedido " + p.numero + " enviado a " + p.fornecedor));
  } else if (acao === "confirmar") {
    const dt = dia(d.data_prometida);
    if (!dt) return resp({ ok: false, erro: "sem_data", msg: "Informe a data prometida pelo fornecedor." }, 400);
    if (!["Aprovado", "Enviado", "Confirmado"].includes(p.status)) return resp({ ok: false, erro: "status", msg: "Pedido " + p.status.toLowerCase() + "." }, 409);
    ops.push(db.prepare("UPDATE compras_pc SET status = 'Confirmado', data_prometida = ?2, confirmado_em = ?3, enviado_em = coalesce(enviado_em, ?3), atualizado_em = ?3 WHERE numero = ?1").bind(p.numero, dt, quando));
    const prev = await db.prepare("SELECT max(coalesce(CASE WHEN numero = ?2 THEN ?3 ELSE data_prometida END, '')) AS m FROM compras_pc WHERE req = ?1 AND status NOT IN ('Recusado', 'Cancelado')").bind(p.req, p.numero, dt).first();
    ops.push(db.prepare("UPDATE compras_req SET previsao = ?2, atualizado_em = ?3 WHERE numero = ?1").bind(p.req, prev && prev.m ? prev.m : dt, quando));
    ops.push(evento(db, p.req, quem, null, null, "pedido " + p.numero + ": " + p.fornecedor + " confirmou entrega para " + dt.split("-").reverse().join("/")));
  } else return resp({ ok: false, erro: "acao_invalida" }, 400);

  const pcNovo = { aprovar: "Aprovado", recusar: "Recusado", cancelar: "Cancelado", enviado: "Enviado", confirmar: "Confirmado" }[acao];
  const r = await carregarReq(db, p.req, false);
  if (r && !["Cancelada", "Entregue", "Entregue parcial"].includes(r.status) && !(acao === "cancelar" && p.status.indexOf("Recebido") === 0)) {
    const rn = await reqDepois(pcNovo);
    if (rn !== r.status) {
      ops.push(db.prepare("UPDATE compras_req SET status = ?2, atualizado_em = ?3 WHERE numero = ?1").bind(r.numero, rn, quando));
      ops.push(evento(db, r.numero, quem, r.status, rn, null));
    }
  }
  await db.batch(ops);
  return resp({ ok: true });
}
