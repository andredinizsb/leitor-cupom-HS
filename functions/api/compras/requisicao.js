// /api/compras/requisicao — lado do campo (sem login, como o pedido de autorização)
//   POST {solicitante, empresa, destino, obra, obra_desc, frota, prioridade, data_necessaria, justificativa, local_entrega, itens[], anexo?} -> {numero, chave}
//   GET  ?l=REQ-2026-0001:chave,REQ-2026-0002:chave  -> situação das requisições guardadas neste celular
import { resp, origemOk, semBanco, ERRO_BANCO, agora, aleatorio } from "../../../lib/aut.js";
import { garantir, proximaReq, evento, lerRequisicao, carregarReq, publicoReq, receber, pedidosComReceb } from "../../../lib/compras.js";
import { conferirCampo } from "../../../lib/acessos.js";

export async function onRequestPost({ request, env }) {
  if (!origemOk(request)) return resp({ ok: false, erro: "origem_nao_permitida" }, 403);
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  let d;
  try { d = await request.json(); } catch (e) { return resp({ ok: false, erro: "json_invalido" }, 400); }
  if (d && d.acao === "receber") {   // C4: quem pediu confirma o recebimento na obra (chave da requisição)
    await garantir(env.DB);
    const r = await carregarReq(env.DB, String(d.n || ""), true);
    if (!r || r.chave !== d.k) return resp({ ok: false, erro: "nao_autorizado" }, 403);
    const pc = await env.DB.prepare("SELECT numero FROM compras_pc WHERE numero = ?1 AND req = ?2").bind(String(d.pc || ""), r.numero).first();
    if (!pc) return resp({ ok: false, erro: "pedido", msg: "Pedido não é desta requisição." }, 404);
    const x = await receber(env.DB, pc.numero, d, r.solicitante, "obra");
    return x.ok ? resp({ ok: true, status: x.status }) : resp({ ok: false, erro: x.erro, msg: x.msg }, x.st);
  }
  const v = lerRequisicao(d);
  if (v.erro) return resp({ ok: false, erro: v.erro, msg: v.msg }, 400);
  const cp = await conferirCampo(request, env, "compras");   // PIN / limite de envios / registro (lib/acessos.js)
  if (cp.bloqueio) return cp.bloqueio;
  const db = env.DB;
  await garantir(db);
  const numero = await proximaReq(db, new Date().getFullYear()), chave = aleatorio(18), r = v.req, quando = agora();
  const ops = [
    db.prepare("INSERT INTO compras_req (numero, criado_em, solicitante, empresa, obra, obra_desc, frota, destino, prioridade, data_necessaria, justificativa, local_entrega, status, atualizado_em, chave, orcamento) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'Nova', ?2, ?13, ?14)")
      .bind(numero, quando, r.solicitante, r.empresa, r.obra, r.obra_desc, r.frota, r.destino, r.prioridade, r.data_necessaria, r.justificativa, r.local_entrega, chave, r.orcamento),
    evento(db, numero, r.solicitante, null, "Nova", "enviada pelo app")
  ];
  v.itens.forEach(function (x, i) {
    ops.push(db.prepare("INSERT INTO compras_req_itens (numero, item, descricao, qtd, unidade, obs) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(numero, i + 1, x.descricao, x.qtd, x.unidade, x.obs));
  });
  if (v.anexo) ops.push(db.prepare("INSERT INTO compras_anexos (numero, nome, tipo, dados, criado_em) VALUES (?1, ?2, ?3, ?4, ?5)").bind(numero, v.anexo.nome, v.anexo.tipo, v.anexo.dados, quando));
  await db.batch(ops);
  await cp.feito(numero);
  return resp({ ok: true, numero: numero, chave: chave, status: "Nova" });
}

export async function onRequestGet({ request, env }) {
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  const db = env.DB;
  await garantir(db);
  if (new URL(request.url).searchParams.get("config") === "1") {   // WhatsApp do Suprimentos (parâmetro WhatsSuprimentos da planilha)
    const w = await db.prepare("SELECT valor FROM compras_config WHERE chave = 'WhatsSuprimentos'").first();
    return resp({ ok: true, whats: w && w.valor ? String(w.valor).replace(/\D/g, "") : "" });
  }
  const pares = String(new URL(request.url).searchParams.get("l") || "").split(",").slice(0, 40)
    .map(function (p) { const i = p.lastIndexOf(":"); return i > 0 ? [p.slice(0, i).trim(), p.slice(i + 1).trim()] : null; }).filter(Boolean);
  const out = [];
  for (const p of pares) {
    const r = await carregarReq(db, p[0], true);
    if (r && r.chave === p[1]) {
      const pub = publicoReq(r);
      pub.pedidos = (await pedidosComReceb(db, "WHERE req = ?1 AND status IN ('Aprovado', 'Enviado', 'Confirmado', 'Recebido parcial', 'Recebido')", [r.numero]))
        .map(function (x) { return { numero: x.numero, fornecedor: x.fornecedor, status: x.status, data_prometida: x.data_prometida, itens: x.itens.map(function (i) { return { item: i.item, descricao: i.descricao, qtd: i.qtd, unidade: i.unidade, recebido: i.recebido }; }) }; });
      out.push(pub);
    } else out.push({ numero: p[0], nao_encontrada: true });
  }
  return resp({ ok: true, requisicoes: out });
}
